import { readFile as readOwnFile } from "node:fs/promises"
import path from "node:path"
import {
  CONTROL_PLANE_COMMAND_KEYS,
  createDefaultControlPlaneConfig,
  discoverConfigPath,
  loadControlPlaneConfig,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type RouterConfig,
  type loadRouterConfig,
} from "./config.js"
import { buildCodexArtifacts } from "./codex.js"
import type { GeneratedArtifact } from "./opencode.js"
import type { MaterializeArtifactsResult, materializeArtifacts } from "./materialize.js"
import { renderAuxiliaryOwnershipMetadata, renderControlPlaneOwnershipMetadata } from "./opencode.js"
import type {
  SuperpowersCompatibilityMode,
  SuperpowersCompatibilityResult,
} from "./superpowers-compatibility.js"

type BootstrapFs = {
  mkdir: (filePath: string, options?: { recursive?: boolean }) => Promise<void>
  writeFile: (filePath: string, content: string) => Promise<void>
}

export type CodexBootstrapFile = {
  path: string
  content: string
}

export type CodexBootstrapBuildResult = {
  files: CodexBootstrapFile[]
}

export type CodexBootstrapResult = {
  configPath: string
  createdConfig: boolean
  bootstrapFiles: string[]
  syncResult: MaterializeArtifactsResult
  nextSteps: string[]
  compatibility: SuperpowersCompatibilityResult
}

type CodexBootstrapControlPlaneSettings = Pick<ControlPlaneConfig["settings"], "commandPrefix" | "commands">

const SAFE_CODEX_SKILL_SEGMENT_PATTERN = /^[a-z0-9-]+$/
const CODEX_DIRECT_SKILL_MARKER_PREFIX = "oms-direct:"

const CODEX_CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Codex in this project.",
  use: "Switch OMS to the selected preset for Codex in this project.",
  disable: "Disable OMS for Codex in this project.",
  sync: "Sync OMS artifacts for Codex in this project.",
  doctor: "Inspect OMS diagnostics for Codex in this project.",
}

export function buildStarterCodexConfig() {
  const config = {
    workflow: { kind: "superpowers" as const },
    profiles: {
      strategy: {
        model: "gpt-5.4",
        effort: "deep",
      },
      build: {
        model: "gpt-5.3-codex-spark",
        effort: "balanced",
        codexFast: true,
      },
    },
    routes: {
      brainstorming: "strategy",
    },
    defaultRoute: "build",
  } satisfies RouterConfig

  const document = {
    workflow: { kind: "superpowers" as const },
    presets: {
      default: {
        label: "Default",
        short: "def",
        profiles: config.profiles,
        routes: config.routes,
        defaultRoute: config.defaultRoute,
      },
    },
  }

  return {
    path: "oh-my-superagents.config.jsonc",
    config,
    content: JSON.stringify(document, null, 2),
  }
}

function buildMarketplaceJson() {
  const plugin = {
    name: "oh-my-superagents-codex",
    source: {
      source: "local",
      path: "./plugins/oh-my-superagents-codex",
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category: "Developer Tools",
  }

  return {
    name: "oh-my-superagents-local",
    interface: {
      displayName: "Oh My Superpowers (Local)",
    },
    plugins: [plugin],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mergeMarketplaceJson(existingContent?: string) {
  const defaults = buildMarketplaceJson()

  if (!existingContent) {
    return JSON.stringify(defaults, null, 2)
  }

  const parsed = JSON.parse(existingContent) as unknown

  if (!isRecord(parsed)) {
    throw new Error("Codex marketplace.json must contain a JSON object")
  }

  if ("plugins" in parsed && parsed.plugins !== undefined && !Array.isArray(parsed.plugins)) {
    throw new Error("Codex marketplace.json plugins must be an array")
  }

  const existingPlugins = (parsed.plugins ?? []) as unknown[]
  if (existingPlugins.some((plugin) => !isRecord(plugin))) {
    throw new Error("Codex marketplace.json plugins must contain only objects")
  }
  const validatedPlugins = existingPlugins as Record<string, unknown>[]

  const nextPlugin = defaults.plugins[0]
  const mergedPlugins = validatedPlugins.filter((plugin) => plugin.name !== nextPlugin.name)
  mergedPlugins.push(nextPlugin)

  return JSON.stringify(
    {
      ...parsed,
      name: parsed.name ?? defaults.name,
      interface: parsed.interface ?? defaults.interface,
      plugins: mergedPlugins,
    },
    null,
    2,
  )
}

function renderCodexControlPlaneSkillName(
  settings: CodexBootstrapControlPlaneSettings,
  renderedName: string,
) {
  return `${settings.commandPrefix}-${renderedName}`
}

function assertSafeCodexSkillSegment(value: string, label: string) {
  if (!SAFE_CODEX_SKILL_SEGMENT_PATTERN.test(value)) {
    throw new Error(`Invalid Codex skill path segment for ${label}: ${value}`)
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function buildPluginManifest(
  packageVersion: string,
  controlPlaneSettings: CodexBootstrapControlPlaneSettings,
) {
  const syncSkillName = renderCodexControlPlaneSkillName(
    controlPlaneSettings,
    controlPlaneSettings.commands.sync.name,
  )
  const doctorSkillName = renderCodexControlPlaneSkillName(
    controlPlaneSettings,
    controlPlaneSettings.commands.doctor.name,
  )

  return JSON.stringify(
    {
      name: "oh-my-superagents-codex",
      version: packageVersion,
      description: "Local Codex convenience layer for oh-my-superagents sync and diagnostics.",
      skills: "./skills/",
      interface: {
        displayName: "Oh My Superpowers Codex",
        shortDescription: "Sync and inspect Codex routing for superpowers phases.",
        category: "Developer Tools",
        developerName: "oh-my-superagents",
        defaultPrompt: [
          `Use $${syncSkillName} to refresh Codex routing for this project.`,
          `Use $${doctorSkillName} to inspect the current Codex routing map.`,
        ],
      },
    },
    null,
    2,
  )
}

function buildControlPlaneSkill(input: {
  skillName: string
  description: string
  logicalCommand: ControlPlaneCommandKey
  configArtifactPath: string
}) {
  const quotedConfigPath = shellQuote(input.configArtifactPath)

  return `---
name: ${input.skillName}
description: ${input.description}
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
${renderControlPlaneOwnershipMetadata({
  host: "codex",
  artifact: "skill",
  logicalCommand: input.logicalCommand,
  renderedName: input.skillName,
})}
Run \`oh-my-superagents ${input.logicalCommand} --host codex --config ${quotedConfigPath} $ARGUMENTS\` from the repository root.
If the binary is not on PATH, run \`npx oh-my-superagents ${input.logicalCommand} --host codex --config ${quotedConfigPath} $ARGUMENTS\` instead.
Forward any command arguments as-is.
Treat this skill as the Codex host entry for the logical \`${input.logicalCommand}\` command key.
`
}

function buildControlPlaneSkillFiles(
  controlPlaneSettings: CodexBootstrapControlPlaneSettings,
  configArtifactPath: string,
  seenSkillNames: Map<string, string>,
) {
  assertSafeCodexSkillSegment(controlPlaneSettings.commandPrefix, "commandPrefix")

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
    const command = controlPlaneSettings.commands[commandKey]
    const renderedNames = [command.name, ...command.aliases]

    return renderedNames.map((renderedName) => {
      assertSafeCodexSkillSegment(renderedName, commandKey)

      const skillName = renderCodexControlPlaneSkillName(controlPlaneSettings, renderedName)
      if (skillName === "oms-no-superpowers") {
        throw new Error(`Codex skill collides with fixed helper skill: ${skillName}`)
      }

      const existingSource = seenSkillNames.get(skillName)
      if (existingSource) {
        throw new Error(`Duplicate Codex skill rendering: ${skillName} (${existingSource}, ${commandKey})`)
      }

      seenSkillNames.set(skillName, commandKey)

      return {
        path: `plugins/oh-my-superagents-codex/skills/${skillName}/SKILL.md`,
        content: buildControlPlaneSkill({
          skillName,
          description: CODEX_CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
          logicalCommand: commandKey,
          configArtifactPath,
        }),
      }
    })
  })
}

function buildDirectModeSkill(input: {
  skillName: string
  agentName: string
  intent: string
  label: string
  description?: string
}) {
  const intentDescription = input.description ? `${input.label}: ${input.description}` : input.label

  return `---
name: ${input.skillName}
description: Route ${input.intent} requests through ${input.agentName}.
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- ${CODEX_DIRECT_SKILL_MARKER_PREFIX} stage=1; host=codex; artifact=skill; intent=${input.intent}; rendered-name=${input.skillName} -->
Use the Codex direct-mode agent \`${input.agentName}\` for the \`${input.intent}\` intent.
Handle requests that match this intent: ${intentDescription}.
Forward any extra user instructions in $ARGUMENTS.
Stay focused on this intent unless the user explicitly asks to switch.
`
}

function buildDirectModeSkillFiles(routerConfig: RouterConfig | undefined, seenSkillNames: Map<string, string>) {
  if (routerConfig?.workflow.kind !== "direct") {
    return []
  }

  return Object.entries(routerConfig.workflow.intents).map(([intent, intentConfig]) => {
    assertSafeCodexSkillSegment(intent, `direct intent ${intent}`)
    const skillName = `ai-${intent}`

    const existingSource = seenSkillNames.get(skillName)
    if (existingSource) {
      throw new Error(`Duplicate Codex skill rendering: ${skillName} (${existingSource}, direct:${intent})`)
    }

    seenSkillNames.set(skillName, `direct:${intent}`)

    return {
      path: `plugins/oh-my-superagents-codex/skills/${skillName}/SKILL.md`,
      content: buildDirectModeSkill({
        skillName,
        agentName: `rt-${intent}`,
        intent,
        label: intentConfig.label,
        description: intentConfig.description,
      }),
    }
  })
}

function buildTemporaryDisableSkill(): CodexBootstrapFile {
  return {
    path: "plugins/oh-my-superagents-codex/skills/oms-no-superpowers/SKILL.md",
    content: `---
name: oms-no-superpowers
description: Temporarily disable superpowers for this conversation.
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
${renderAuxiliaryOwnershipMetadata({
  host: "codex",
  artifact: "skill",
  helper: "temporary-disable",
  renderedName: "oms-no-superpowers",
})}
Tell the assistant:
- do not use superpowers in this conversation
- do not proactively load superpowers skills, workflows, or phase agents
- only use superpowers again if I explicitly ask

Extra instruction: $ARGUMENTS
`,
  }
}

export function buildCodexBootstrapFiles(input: {
  packageVersion: string
  includeConfig: boolean
  configArtifactPath?: string
  existingMarketplaceContent?: string
  routerConfig?: RouterConfig
  controlPlaneSettings?: CodexBootstrapControlPlaneSettings
}): CodexBootstrapBuildResult {
  const configArtifactPath = input.configArtifactPath ?? buildStarterCodexConfig().path
  const controlPlaneSettings = input.controlPlaneSettings ?? createDefaultControlPlaneConfig().settings
  const seenSkillNames = new Map<string, string>()
  const controlPlaneSkillFiles = buildControlPlaneSkillFiles(controlPlaneSettings, configArtifactPath, seenSkillNames)
  const directModeSkillFiles = buildDirectModeSkillFiles(input.routerConfig, seenSkillNames)
  const files: CodexBootstrapFile[] = [
    {
      path: ".agents/plugins/marketplace.json",
      content: mergeMarketplaceJson(input.existingMarketplaceContent),
    },
    {
      path: "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      content: buildPluginManifest(input.packageVersion, controlPlaneSettings),
    },
    ...controlPlaneSkillFiles,
    ...directModeSkillFiles,
    buildTemporaryDisableSkill(),
  ]

  if (input.includeConfig) {
    files.push({
      path: configArtifactPath,
      content: buildStarterCodexConfig().content,
    })
  }

  return { files }
}

function toGeneratedArtifact(codexFile: CodexBootstrapFile): GeneratedArtifact {
  return {
    kind: "command",
    directory: path.dirname(codexFile.path),
    fileName: path.basename(codexFile.path),
    ownerPrefix: "unused-for-stage1-metadata",
    content: codexFile.content,
  }
}

function assertProjectRelativePath(cwd: string, targetPath: string) {
  const absolute = path.resolve(cwd, targetPath)
  const relative = path.relative(cwd, absolute)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Bootstrap can only write inside the current project: ${targetPath}`)
  }
  return absolute
}

export async function writeCodexBootstrapFiles(input: {
  cwd: string
  files: CodexBootstrapFile[]
  fs: BootstrapFs
}) {
  const written: string[] = []

  for (const file of input.files) {
    const absolutePath = assertProjectRelativePath(input.cwd, file.path)
    await input.fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await input.fs.writeFile(absolutePath, file.content)
    written.push(absolutePath)
  }

  return written
}

export async function readOwnPackageVersion() {
  const raw = await readOwnFile(new URL("../package.json", import.meta.url), "utf8")
  const parsed = JSON.parse(raw) as { version?: string }
  if (!parsed.version) {
    throw new Error("Could not determine oh-my-superagents package version")
  }
  return parsed.version
}

export async function runCodexBootstrap(input: {
  cwd: string
  explicitPath?: string
  discoverConfigPath: typeof discoverConfigPath
  loadConfig: typeof loadRouterConfig
  materializeArtifacts: typeof materializeArtifacts
  buildCodexArtifacts: typeof buildCodexArtifacts
  resolveCompatibility: (policyMode: SuperpowersCompatibilityMode) => Promise<SuperpowersCompatibilityResult>
  fs: BootstrapFs & {
    readFile: (filePath: string) => Promise<string>
    readdir: (directory: string) => Promise<string[]>
    stat: (filePath: string) => Promise<{ isFile: () => boolean }>
    rename: (from: string, to: string) => Promise<void>
    unlink: (filePath: string) => Promise<void>
  }
}) {
  const explicitConfigPath = input.explicitPath ? path.resolve(input.cwd, input.explicitPath) : undefined
  const explicitConfigExists = explicitConfigPath
    ? await input.fs.readFile(explicitConfigPath).then(() => true).catch(() => false)
    : false
  const discoveredConfigPath = explicitConfigPath
    ? undefined
    : await input.discoverConfigPath({ cwd: input.cwd, explicitPath: undefined })
  const existingConfigPath = explicitConfigExists ? explicitConfigPath : discoveredConfigPath
  const starter = buildStarterCodexConfig()
  const configPath = explicitConfigPath ?? existingConfigPath ?? starter.path

  const loaded = existingConfigPath
    ? await input.loadConfig({ cwd: input.cwd, explicitPath: existingConfigPath })
    : { path: path.resolve(input.cwd, configPath), config: starter.config }
  const controlPlaneSettings = existingConfigPath
    ? (
        await loadControlPlaneConfig({
          cwd: input.cwd,
          explicitPath: existingConfigPath,
          exists: async (filePath) => input.fs.readFile(filePath).then(() => true).catch(() => false),
          readFile: input.fs.readFile,
        })
      ).config.settings
    : createDefaultControlPlaneConfig().settings

  const compatibility = await input.resolveCompatibility(
    "superpowersCompatibility" in loaded.config && loaded.config.superpowersCompatibility
      ? loaded.config.superpowersCompatibility.mode
      : "warn",
  )

  if (compatibility.shouldBlock) {
    return {
      configPath: loaded.path,
      createdConfig: false,
      bootstrapFiles: [],
      syncResult: { exitCode: 1, warnings: [], written: [], removed: [] },
      nextSteps: [],
      compatibility,
    } satisfies CodexBootstrapResult
  }

  const packageVersion = await readOwnPackageVersion()

  const existingMarketplaceContent = await input.fs
    .readFile(path.join(input.cwd, ".agents/plugins/marketplace.json"))
    .catch(() => undefined)

  const bootstrapFiles = buildCodexBootstrapFiles({
    packageVersion,
    includeConfig: !existingConfigPath,
    configArtifactPath: configPath,
    existingMarketplaceContent,
    routerConfig: loaded.config,
    controlPlaneSettings,
  })

  const controlPlaneSkillFiles = bootstrapFiles.files.filter((file) => file.path.endsWith("/SKILL.md"))
  const scaffoldFiles = bootstrapFiles.files.filter((file) => !file.path.endsWith("/SKILL.md"))

  const syncArtifacts = [
    ...input.buildCodexArtifacts(loaded.config).agents,
    ...controlPlaneSkillFiles.map(toGeneratedArtifact),
  ]
  const syncResult = await input.materializeArtifacts({
    cwd: input.cwd,
    artifacts: syncArtifacts,
    fs: input.fs,
  })

  const writtenBootstrapFiles = await writeCodexBootstrapFiles({
    cwd: input.cwd,
    files: scaffoldFiles,
    fs: input.fs,
  })

  const writtenControlPlaneSkillFiles = controlPlaneSkillFiles.map((file) => path.resolve(input.cwd, file.path))

  return {
    configPath: loaded.path,
    createdConfig: !existingConfigPath,
    bootstrapFiles: [...writtenBootstrapFiles, ...writtenControlPlaneSkillFiles],
    syncResult,
    nextSteps: [
      "Restart Codex.",
      "Open the plugin directory and install oh-my-superagents-codex from the local marketplace.",
      "Use the generated OMS Codex skills inside Codex for host-native convenience.",
    ],
    compatibility,
  } satisfies CodexBootstrapResult
}
