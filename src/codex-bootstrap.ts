import { readFile as readOwnFile } from "node:fs/promises"
import path from "node:path"
import { discoverConfigPath, type RouterConfig, type loadRouterConfig } from "./config.js"
import { buildCodexArtifacts } from "./codex.js"
import type { MaterializeArtifactsResult, materializeArtifacts } from "./materialize.js"
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

export function buildStarterCodexConfig() {
  const config = {
    profiles: {
      strategy: {
        model: "gpt-5.4",
        effort: "deep",
      },
      build: {
        model: "gpt-5.3-codex-spark",
        effort: "fast",
      },
    },
    routes: {
      brainstorming: "strategy",
    },
    defaultRoute: "build",
  } satisfies RouterConfig

  return {
    path: "oh-my-superagents.config.jsonc",
    config,
    content: JSON.stringify(config, null, 2),
  }
}

function buildMarketplaceJson() {
  return {
    name: "oh-my-superagents-local",
    interface: {
      displayName: "Oh My Superpowers (Local)",
    },
    plugins: [
      {
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
      },
    ],
  }
}

function mergeMarketplaceJson(existingContent?: string) {
  if (!existingContent) {
    return JSON.stringify(buildMarketplaceJson(), null, 2)
  }

  const parsed = JSON.parse(existingContent) as {
    name?: string
    interface?: { displayName?: string }
    plugins?: Array<Record<string, unknown>>
  }

  const existingPlugins = Array.isArray(parsed.plugins) ? parsed.plugins : []
  const nextPlugin = buildMarketplaceJson().plugins[0]
  const mergedPlugins = existingPlugins.filter((plugin) => plugin.name !== nextPlugin.name)
  mergedPlugins.push(nextPlugin)

  return JSON.stringify(
    {
      name: parsed.name ?? "oh-my-superagents-local",
      interface: parsed.interface ?? { displayName: "Oh My Superpowers (Local)" },
      plugins: mergedPlugins,
    },
    null,
    2,
  )
}

function buildPluginManifest(packageVersion: string) {
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
          "Use $oh-my-superagents-sync to refresh Codex routing for this project.",
          "Use $oh-my-superagents-doctor to inspect the current Codex routing map.",
        ],
      },
    },
    null,
    2,
  )
}

function buildSyncSkill(configArtifactPath: string) {
  return `---
name: oh-my-superagents-sync
description: Rebuild Codex phase agents for this project after config or package changes.
---

From the repository root, prefer:

- \`oh-my-superagents sync --host codex --config ${configArtifactPath}\`
- if the binary is not on PATH, fall back to \`npx oh-my-superagents sync --host codex --config ${configArtifactPath}\`

After the command completes:

- summarize what was written
- mention any warnings
- remind the user to restart Codex or reopen the plugin directory if they just updated the package
`
}

function buildDoctorSkill(configArtifactPath: string) {
  return `---
name: oh-my-superagents-doctor
description: Inspect the current Codex routing map and generated agents for this project.
---

From the repository root, prefer:

- \`oh-my-superagents explain --host codex --all --config ${configArtifactPath}\`
- if the binary is not on PATH, fall back to \`npx oh-my-superagents explain --host codex --all --config ${configArtifactPath}\`

Then inspect \`.codex/agents\` and summarize:

- which superpowers phases map to which Codex agents
- which models and reasoning levels are configured
- whether the generated agents are present on disk
`
}

export function buildCodexBootstrapFiles(input: {
  packageVersion: string
  includeConfig: boolean
  configArtifactPath?: string
  existingMarketplaceContent?: string
}): CodexBootstrapBuildResult {
  const configArtifactPath = input.configArtifactPath ?? buildStarterCodexConfig().path
  const files: CodexBootstrapFile[] = [
    {
      path: ".agents/plugins/marketplace.json",
      content: mergeMarketplaceJson(input.existingMarketplaceContent),
    },
    {
      path: "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      content: buildPluginManifest(input.packageVersion),
    },
    {
      path: "plugins/oh-my-superagents-codex/skills/oh-my-superagents-sync/SKILL.md",
      content: buildSyncSkill(configArtifactPath),
    },
    {
      path: "plugins/oh-my-superagents-codex/skills/oh-my-superagents-doctor/SKILL.md",
      content: buildDoctorSkill(configArtifactPath),
    },
  ]

  if (input.includeConfig) {
    files.push({
      path: configArtifactPath,
      content: buildStarterCodexConfig().content,
    })
  }

  return { files }
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

  const syncArtifacts = input.buildCodexArtifacts(loaded.config).agents
  const syncResult = await input.materializeArtifacts({
    cwd: input.cwd,
    artifacts: syncArtifacts,
    fs: input.fs,
  })

  const bootstrapFiles = buildCodexBootstrapFiles({
    packageVersion,
    includeConfig: !existingConfigPath,
    configArtifactPath: configPath,
    existingMarketplaceContent,
  })

  const writtenBootstrapFiles = await writeCodexBootstrapFiles({
    cwd: input.cwd,
    files: bootstrapFiles.files,
    fs: input.fs,
  })

  return {
    configPath: loaded.path,
    createdConfig: !existingConfigPath,
    bootstrapFiles: writtenBootstrapFiles,
    syncResult,
    nextSteps: [
      "Restart Codex.",
      "Open the plugin directory and install oh-my-superagents-codex from the local marketplace.",
      "Use $oh-my-superagents-sync or $oh-my-superagents-doctor inside Codex for host-native convenience.",
    ],
    compatibility,
  } satisfies CodexBootstrapResult
}
