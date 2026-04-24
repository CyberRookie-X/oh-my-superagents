import path from "node:path"
import { isOmsOwnedArtifactFile, isOmsOwnedSkillFile, isOpenCodeRuntimeMetadataContent } from "../materialize.js"
import { buildClaudeArtifacts } from "../claude.js"
import { buildCodexBootstrapFiles, readOwnPackageVersion } from "../codex-bootstrap.js"
import { RUNTIME_AGENT_METADATA_DIRECTORY, RUNTIME_AGENT_METADATA_FILE } from "../opencode.js"
import { safeJsonParse } from "../utils/json.js"
import { assertQwenProjectionSupport, isMissingFsError, isRecord, toProjectRelativePath, toRouterConfig } from "./shared.js"
import type { CliDeps, CliHost } from "./types.js"
import type { ResolvedControlPlane } from "../control-plane/index.js"
import { loadRouterConfig } from "../config.js"
import { nodeFs } from "./types.js"

export const CODEX_MARKETPLACE_PATH = ".agents/plugins/marketplace.json"
export const CODEX_PLUGIN_MANIFEST_PATH = "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json"
export const CODEX_SKILLS_ROOT = "plugins/oh-my-superagents-codex/skills"
export const CLAUDE_SKILLS_ROOT = ".claude/skills"
export const QWEN_MANAGED_AGENT_FILE_NAMES = [
  "oms-brainstorm.md",
  "oms-plan.md",
  "oms-execute.md",
  "oms-review.md",
  "oms-verify.md",
  "oms-visual.md",
  "oms-web-test.md",
]

export const OWNED_ARTIFACT_RULES: Record<CliHost, Array<{ directory: string; extension: string }>> = {
  opencode: [
    { directory: ".opencode/agents", extension: ".md" },
    { directory: ".opencode/commands", extension: ".md" },
    { directory: RUNTIME_AGENT_METADATA_DIRECTORY, extension: ".json" },
  ],
  codex: [
    { directory: ".codex/agents", extension: ".toml" },
  ],
  qwen: [
    { directory: ".qwen/agents", extension: ".md" },
    { directory: ".qwen/commands", extension: ".md" },
  ],
  claude: [],
}

export function hasCodexMarketplaceEntry(content: string) {
  const { value: parsed, warning } = safeJsonParse<Record<string, unknown>>(content, {})
  if (warning) {
    return false
  }
  if (!isRecord(parsed)) {
    return false
  }

  const plugins = parsed.plugins
  return Array.isArray(plugins)
    && plugins.some((plugin) => isRecord(plugin) && plugin.name === "oh-my-superagents-codex")
}

export function removeCodexMarketplaceEntry(content: string) {
  const { value: parsed, warning } = safeJsonParse<Record<string, unknown>>(content, {})
  if (warning) {
    return
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.plugins)) {
    throw new Error("Codex marketplace.json plugins must be an array")
  }

  return JSON.stringify(
    {
      ...parsed,
      plugins: parsed.plugins.filter((plugin) => !isRecord(plugin) || plugin.name !== "oh-my-superagents-codex"),
    },
    null,
    2,
  )
}

export async function buildCodexLifecycleFiles(
  cwd: string,
  configPath: string,
  routerConfig: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  controlPlaneSettings: ResolvedControlPlane["config"]["settings"],
  deps: CliDeps,
) {
  const packageVersion = await readOwnPackageVersion()
  const marketplacePath = path.join(cwd, CODEX_MARKETPLACE_PATH)
  const existingMarketplaceContent = await deps.readArtifactFile(marketplacePath).catch(() => undefined)

  return buildCodexBootstrapFiles({
    packageVersion,
    includeConfig: false,
    configArtifactPath: toProjectRelativePath(cwd, configPath),
    existingMarketplaceContent,
    routerConfig,
    controlPlaneSettings,
  }).files
}

export async function writeLifecycleFiles(cwd: string, files: Array<{ path: string; content: string }>, deps: CliDeps) {
  const written: string[] = []

  for (const file of files) {
    const absolutePath = path.join(cwd, file.path)
    await deps.mkdir(path.dirname(absolutePath), { recursive: true })
    await deps.writeFile(absolutePath, file.content)
    written.push(absolutePath)
  }

  return written
}

export async function inspectCodexMarketplaceEntry(cwd: string, deps: CliDeps) {
  const filePath = path.join(cwd, CODEX_MARKETPLACE_PATH)

  try {
    return hasCodexMarketplaceEntry(await deps.readArtifactFile(filePath))
  } catch (error) {
    if (isMissingFsError(error)) {
      return false
    }

    throw error
  }
}

export async function removeCodexMarketplaceEntryFile(cwd: string, deps: CliDeps) {
  const filePath = path.join(cwd, CODEX_MARKETPLACE_PATH)

  try {
    const nextContent = removeCodexMarketplaceEntry(await deps.readArtifactFile(filePath))
    if (nextContent === undefined) {
      return undefined
    }
    await deps.mkdir(path.dirname(filePath), { recursive: true })
    await deps.writeFile(filePath, nextContent)
    return filePath
  } catch (error) {
    if (isMissingFsError(error)) {
      return undefined
    }

    throw error
  }
}

export async function discoverOwnedSkillFiles(cwd: string, skillsRoot: string, deps: CliDeps) {
  const discovered = new Set<string>()
  const warnings: string[] = []
  const root = path.join(cwd, skillsRoot)

  let entries: string[] = []
  try {
    entries = (await deps.readdir(root)).sort()
  } catch (error) {
    if (!isMissingFsError(error)) {
      warnings.push(`Failed to scan OMS-owned artifact directory ${root}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return { paths: [], warnings: warnings.sort() }
  }

  for (const entry of entries) {
    const filePath = path.join(root, entry, "SKILL.md")

    try {
      const stats = await deps.artifactStat(filePath)
      if (!stats.isFile()) {
        continue
      }

      const content = await deps.readArtifactFile(filePath)
      if (!isOmsOwnedSkillFile(filePath, content)) {
        continue
      }

      discovered.add(filePath)
    } catch (error) {
      if (!isMissingFsError(error)) {
        warnings.push(`Failed to inspect OMS-owned artifact ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return { paths: [...discovered].sort(), warnings: warnings.sort() }
}

export async function discoverOwnedArtifacts(
  cwd: string,
  host: CliHost,
  deps: CliDeps,
): Promise<{
  paths: string[]
  warnings: string[]
  specialPresent: string[]
  unverifiedDirectories: string[]
  unverifiedFiles: string[]
}> {
  const discovered = new Set<string>()
  const warnings: string[] = []
  const specialPresent = new Set<string>()
  const unverifiedDirectories = new Set<string>()
  const unverifiedFiles = new Set<string>()

  for (const rule of OWNED_ARTIFACT_RULES[host]) {
    const directory = path.join(cwd, rule.directory)
    let entries: string[] = []

    try {
      entries = (await deps.readdir(directory)).sort()
    } catch (error) {
      if (!isMissingFsError(error)) {
        warnings.push(`Failed to scan OMS-owned artifact directory ${directory}: ${error instanceof Error ? error.message : String(error)}`)
        unverifiedDirectories.add(directory)
      }
      continue
    }

    for (const entry of entries) {
      if (!entry.endsWith(rule.extension)) {
        continue
      }

      const filePath = path.join(directory, entry)
      const isOpenCodeRuntimeMetadata =
        host === "opencode"
        && rule.directory === RUNTIME_AGENT_METADATA_DIRECTORY
        && entry === RUNTIME_AGENT_METADATA_FILE

      try {
        const stats = await deps.artifactStat(filePath)
        if (!stats.isFile()) {
          continue
        }

        const content = await deps.readArtifactFile(filePath)

        if (isOpenCodeRuntimeMetadata) {
          if (!isOpenCodeRuntimeMetadataContent(content)) {
            continue
          }
        } else {
          if (!isOmsOwnedArtifactFile(filePath, content)) {
            continue
          }
        }

        discovered.add(filePath)
      } catch (error) {
        if (!isMissingFsError(error)) {
          warnings.push(`Failed to inspect OMS-owned artifact ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
          unverifiedFiles.add(filePath)
        }
        continue
      }
    }
  }

  if (host === "codex") {
    try {
      if (await inspectCodexMarketplaceEntry(cwd, deps)) {
        specialPresent.add(path.join(cwd, CODEX_MARKETPLACE_PATH))
      }
    } catch (error) {
      warnings.push(`Failed to inspect OMS-owned artifact ${path.join(cwd, CODEX_MARKETPLACE_PATH)}: ${error instanceof Error ? error.message : String(error)}`)
    }

    const pluginManifestPath = path.join(cwd, CODEX_PLUGIN_MANIFEST_PATH)
    try {
      if (await deps.artifactExists(pluginManifestPath)) {
        specialPresent.add(pluginManifestPath)
        discovered.add(pluginManifestPath)
      }
    } catch (error) {
      warnings.push(`Failed to inspect OMS-owned artifact ${pluginManifestPath}: ${error instanceof Error ? error.message : String(error)}`)
    }

    const codexSkills = await discoverOwnedSkillFiles(cwd, CODEX_SKILLS_ROOT, deps)
    for (const filePath of codexSkills.paths) {
      discovered.add(filePath)
    }
    warnings.push(...codexSkills.warnings)
  }

  if (host === "claude") {
    const claudeSkills = await discoverOwnedSkillFiles(cwd, CLAUDE_SKILLS_ROOT, deps)
    for (const filePath of claudeSkills.paths) {
      discovered.add(filePath)
    }
    warnings.push(...claudeSkills.warnings)
  }

  return {
    paths: [...discovered].sort(),
    warnings: warnings.sort(),
    specialPresent: [...specialPresent].sort(),
    unverifiedDirectories: [...unverifiedDirectories].sort(),
    unverifiedFiles: [...unverifiedFiles].sort(),
  }
}

export async function inspectArtifacts(cwd: string, filePaths: string[], host: CliHost, deps: CliDeps) {
  const states = await Promise.all(filePaths.map(async (filePath) => ({ filePath, present: await deps.artifactExists(filePath) })))
  const discovered = await discoverOwnedArtifacts(cwd, host, deps)
  const specialPaths = new Set(host === "codex" ? [path.join(cwd, CODEX_MARKETPLACE_PATH)] : [])
  const expectedSet = new Set(filePaths)
  const ownedPresent = new Set([...discovered.paths, ...discovered.specialPresent])
  const unverifiedDirectories = new Set(discovered.unverifiedDirectories)
  const unverifiedFiles = new Set(discovered.unverifiedFiles)
  const expectedPresent = states
    .filter((state) => {
      if (specialPaths.has(state.filePath)) {
        return discovered.specialPresent.includes(state.filePath)
      }

      if (host === "opencode") {
        return state.present && (
          ownedPresent.has(state.filePath)
          || unverifiedDirectories.has(path.dirname(state.filePath))
          || unverifiedFiles.has(state.filePath)
        )
      }

      return state.present && (
        ownedPresent.has(state.filePath)
        || unverifiedDirectories.has(path.dirname(state.filePath))
        || unverifiedFiles.has(state.filePath)
      )
    })
    .map((state) => state.filePath)
  const present = new Set(expectedPresent)

  for (const filePath of discovered.paths) {
    present.add(filePath)
  }

  for (const filePath of discovered.specialPresent) {
    present.add(filePath)
  }

  const stale = [...present]
    .filter((filePath) => !expectedSet.has(filePath))
    .sort()

  return {
    present: [...present].sort(),
    missing: states
      .filter((state) => !expectedPresent.includes(state.filePath))
      .map((state) => state.filePath),
    expectedPresent: expectedPresent.sort(),
    stale,
    ...(discovered.warnings.length > 0 ? { discoveryWarnings: discovered.warnings } : {}),
  }
}

export function formatArtifactInspection(artifacts: Awaited<ReturnType<typeof inspectArtifacts>>) {
  return {
    present: artifacts.present,
    missing: artifacts.missing,
    stale: artifacts.stale,
    ...(artifacts.discoveryWarnings ? { discoveryWarnings: artifacts.discoveryWarnings } : {}),
  }
}

export async function getArtifactsForHost(
  cwd: string,
  config: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  host: CliHost,
  deps: CliDeps,
  controlPlaneSettings?: ResolvedControlPlane["config"]["settings"],
) {
  if (host === "opencode") {
    const built = deps.buildArtifacts(config, controlPlaneSettings)
    return [...built.agents, ...built.commands]
  }

  if (host === "codex") {
    return deps.buildCodexArtifacts(config).agents
  }

  if (host === "claude") {
    return buildClaudeArtifacts(config).skills
  }

  assertQwenProjectionSupport(config)

  const built = await deps.buildQwenArtifacts(config, {
    cwd,
    controlPlaneSettings,
  })
  return [...built.agents, ...built.commands]
}

export async function getExpectedArtifacts(
  cwd: string,
  config: ResolvedControlPlane["config"],
  laneState: ResolvedControlPlane["laneState"] | undefined,
  host: CliHost,
  deps: CliDeps,
) {
  const routerConfig = toRouterConfig(config, laneState)

  if (host === "codex") {
    const built = deps.buildCodexArtifacts(routerConfig).agents
    const bootstrapFiles = buildCodexBootstrapFiles({
      packageVersion: "0.0.0",
      includeConfig: false,
      configArtifactPath: toProjectRelativePath(cwd, path.join(cwd, "oh-my-superagents.config.jsonc")),
      routerConfig,
      controlPlaneSettings: config.settings,
    }).files

    return [
      ...built.map((artifact) => path.join(cwd, artifact.directory, artifact.fileName)),
      ...bootstrapFiles.map((file) => path.join(cwd, file.path)),
    ].sort()
  }

  if (host === "qwen") {
    assertQwenProjectionSupport(routerConfig)

    if (routerConfig.workflow.kind === "direct") {
      const built = await deps.buildQwenArtifacts(routerConfig, {
        cwd,
        controlPlaneSettings: config.settings,
      })

      return [...built.agents, ...built.commands]
        .map((artifact) => path.join(cwd, artifact.directory, artifact.fileName))
        .sort()
    }

    const built = await deps.buildQwenArtifacts(routerConfig, {
      cwd,
      controlPlaneSettings: config.settings,
      includeAgents: false,
    })

    return [
      ...QWEN_MANAGED_AGENT_FILE_NAMES.map((fileName) => path.join(cwd, ".qwen/agents", fileName)),
      ...built.commands.map((artifact) => path.join(cwd, artifact.directory, artifact.fileName)),
    ].sort()
  }

  return (await getArtifactsForHost(cwd, routerConfig, host, deps, config.settings))
    .map((artifact) => path.join(cwd, artifact.directory, artifact.fileName))
    .sort()
}

export async function removeOwnedArtifacts(
  filePaths: string[],
  deps: CliDeps,
): Promise<{ exitCode: 0 | 2; warnings: string[]; written: string[]; removed: string[] }> {
  const warnings: string[] = []
  const removed: string[] = []

  for (const filePath of filePaths) {
    if (!(await deps.artifactExists(filePath))) {
      continue
    }

    try {
      await deps.unlink(filePath)
      removed.push(filePath)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    exitCode: warnings.length > 0 ? 2 : 0,
    warnings,
    written: [] as string[],
    removed,
  }
}

export async function materializeCodexLifecycle(
  cwd: string,
  configPath: string,
  routerConfig: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  controlPlaneSettings: ResolvedControlPlane["config"]["settings"],
  deps: CliDeps,
) {
  const lifecycleFiles = await buildCodexLifecycleFiles(cwd, configPath, routerConfig, controlPlaneSettings, deps)
  const controlPlaneSkillFiles = lifecycleFiles.filter((file) => file.path.endsWith("/SKILL.md"))
  const scaffoldFiles = lifecycleFiles.filter((file) => !file.path.endsWith("/SKILL.md"))
  const scaffoldWrites = await writeLifecycleFiles(cwd, scaffoldFiles, deps)
  const result = await deps.materializeArtifacts({
    cwd,
    artifacts: [
      ...deps.buildCodexArtifacts(routerConfig).agents,
      ...controlPlaneSkillFiles.map((file) => ({
        kind: "command" as const,
        directory: path.dirname(file.path),
        fileName: path.basename(file.path),
        ownerPrefix: "unused-for-stage1-metadata",
        content: file.content,
      })),
    ],
    fs: nodeFs,
  })

  return {
    exitCode: result.exitCode,
    warnings: result.warnings,
    written: [...scaffoldWrites, ...result.written],
    removed: result.removed,
  }
}

export async function cleanupCodexLifecycle(cwd: string, deps: CliDeps) {
  const discovery = await discoverOwnedArtifacts(cwd, "codex", deps)
  if (discovery.warnings.length > 0) {
    return {
      exitCode: 2 as const,
      warnings: discovery.warnings,
      written: [] as string[],
      removed: [] as string[],
    }
  }

  const cleanup = await removeOwnedArtifacts(discovery.paths, deps)
  const written = [...cleanup.written]

  try {
    const rewrittenMarketplace = await removeCodexMarketplaceEntryFile(cwd, deps)
    if (rewrittenMarketplace) {
      written.push(rewrittenMarketplace)
    }
  } catch (error) {
    cleanup.warnings.push(error instanceof Error ? error.message : String(error))
  }

  return {
    exitCode: cleanup.warnings.length > 0 ? 2 as const : cleanup.exitCode,
    warnings: cleanup.warnings,
    written,
    removed: cleanup.removed,
  }
}
