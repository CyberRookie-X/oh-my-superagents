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
import { buildCopilotArtifacts } from "./copilot.js"
import type { GeneratedArtifact } from "./opencode.js"
import type { MaterializeArtifactsResult, materializeArtifacts } from "./materialize.js"
import { CONTROL_PLANE_MARKER_PREFIX, AUXILIARY_MARKER_PREFIX } from "./opencode.js"
import type {
  SuperpowersCompatibilityMode,
  SuperpowersCompatibilityResult,
} from "./superpowers-compatibility.js"

type BootstrapFs = {
  mkdir: (filePath: string, options?: { recursive?: boolean }) => Promise<void>
  writeFile: (filePath: string, content: string) => Promise<void>
}

export type CopilotBootstrapFile = {
  directory: string
  fileName: string
  content: string
}

export type CopilotBootstrapBuildResult = {
  files: CopilotBootstrapFile[]
}

export type CopilotBootstrapResult = {
  files: CopilotBootstrapFile[]
  written: string[]
}

type CopilotBootstrapControlPlaneSettings = Pick<ControlPlaneConfig["settings"], "commandPrefix" | "commands">

const SAFE_COPILOT_SKILL_SEGMENT_PATTERN = /^[a-z0-9-]+$/
const COPILOT_DIRECT_SKILL_MARKER_PREFIX = "oms-direct:"
const DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "sync", "doctor"])

const COPILOT_CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot in this project.",
  use: "Switch OMS to the selected preset for Copilot in this project.",
  disable: "Disable OMS for Copilot in this project.",
  sync: "Sync OMS artifacts for Copilot in this project.",
  doctor: "Inspect OMS diagnostics for Copilot in this project.",
}

function renderCopilotControlPlaneOwnershipMetadata(input: {
  artifact: "skill"
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=1; host=copilot; artifact=${input.artifact}; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

function renderCopilotAuxiliaryOwnershipMetadata(input: {
  artifact: "skill"
  helper: "temporary-disable"
  renderedName: string
}) {
  return `<!-- ${AUXILIARY_MARKER_PREFIX} stage=1; host=copilot; artifact=${input.artifact}; helper=${input.helper}; rendered-name=${input.renderedName} -->`
}

export function buildStarterCopilotConfig(_input?: { workflow?: { kind: string } }) {
  const config = {
    workflow: { kind: "superpowers" as const },
    profiles: {
      strategy: {
        model: "gpt-4.1",
        effort: "deep",
      },
      build: {
        model: "gpt-4.1-mini",
        effort: "balanced",
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

function renderCopilotControlPlaneSkillName(
  settings: CopilotBootstrapControlPlaneSettings,
  renderedName: string,
) {
  return `${settings.commandPrefix}-${renderedName}`
}

function assertSafeCopilotSkillSegment(value: string, label: string) {
  if (!SAFE_COPILOT_SKILL_SEGMENT_PATTERN.test(value)) {
    throw new Error(`Invalid Copilot skill path segment for ${label}: ${value}`)
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function buildPluginManifest(
  packageVersion: string,
  controlPlaneSettings: CopilotBootstrapControlPlaneSettings,
) {
  const syncSkillName = renderCopilotControlPlaneSkillName(
    controlPlaneSettings,
    controlPlaneSettings.commands.sync.name,
  )
  const doctorSkillName = renderCopilotControlPlaneSkillName(
    controlPlaneSettings,
    controlPlaneSettings.commands.doctor.name,
  )

  return JSON.stringify(
    {
      name: "oh-my-superagents-copilot",
      version: packageVersion,
      description: "Copilot CLI convenience layer for oh-my-superagents sync and diagnostics.",
      skills: "./skills/",
      agents: "./agents/",
      hooks: "./hooks.json",
      interface: {
        displayName: "Oh My Superagents Copilot",
        shortDescription: "Sync and inspect Copilot routing for superpowers phases.",
        category: "Developer Tools",
        developerName: "oh-my-superagents",
        defaultPrompt: [
          `Use $${syncSkillName} to refresh Copilot routing for this project.`,
          `Use $${doctorSkillName} to inspect the current Copilot routing map.`,
        ],
      },
    },
    null,
    2,
  )
}

function buildHooksJson(
  controlPlaneSettings: CopilotBootstrapControlPlaneSettings,
  configArtifactPath: string,
) {
  const quotedConfigPath = shellQuote(configArtifactPath)

  return JSON.stringify(
    {
      sessionStart: {
        command: `oh-my-superagents sync --host copilot --config ${quotedConfigPath}`,
        description: "Sync OMS artifacts for Copilot on session start.",
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
${renderCopilotControlPlaneOwnershipMetadata({
  artifact: "skill",
  logicalCommand: input.logicalCommand,
  renderedName: input.skillName,
})}
Run \`oh-my-superagents ${input.logicalCommand} --host copilot --config ${quotedConfigPath} $ARGUMENTS\` from the repository root.
If the binary is not on PATH, run \`npx oh-my-superagents ${input.logicalCommand} --host copilot --config ${quotedConfigPath} $ARGUMENTS\` instead.
Forward any command arguments as-is.
Treat this skill as the Copilot host entry for the logical \`${input.logicalCommand}\` command key.
`
}

function buildControlPlaneSkillFiles(
  controlPlaneSettings: CopilotBootstrapControlPlaneSettings,
  configArtifactPath: string,
  seenSkillNames: Map<string, string>,
  supportedCommands: ReadonlySet<ControlPlaneCommandKey> = new Set(CONTROL_PLANE_COMMAND_KEYS),
) {
  assertSafeCopilotSkillSegment(controlPlaneSettings.commandPrefix, "commandPrefix")

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
    if (!supportedCommands.has(commandKey)) {
      return []
    }

    const command = controlPlaneSettings.commands[commandKey]
    const renderedNames = [command.name, ...command.aliases]

    return renderedNames.map((renderedName) => {
      assertSafeCopilotSkillSegment(renderedName, commandKey)

      const skillName = renderCopilotControlPlaneSkillName(controlPlaneSettings, renderedName)
      if (skillName === "oms-no-superpowers") {
        throw new Error(`Copilot skill collides with fixed helper skill: ${skillName}`)
      }

      const existingSource = seenSkillNames.get(skillName)
      if (existingSource) {
        throw new Error(`Duplicate Copilot skill rendering: ${skillName} (${existingSource}, ${commandKey})`)
      }

      seenSkillNames.set(skillName, commandKey)

      return {
        directory: `plugins/oh-my-superagents-copilot/skills/${skillName}`,
        fileName: "SKILL.md",
        content: buildControlPlaneSkill({
          skillName,
          description: COPILOT_CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
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
<!-- ${COPILOT_DIRECT_SKILL_MARKER_PREFIX} stage=1; host=copilot; artifact=skill; intent=${input.intent}; rendered-name=${input.skillName} -->
Use the Copilot direct-mode agent \`${input.agentName}\` for the \`${input.intent}\` intent.
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
    assertSafeCopilotSkillSegment(intent, `direct intent ${intent}`)
    const skillName = `ai-${intent}`

    const existingSource = seenSkillNames.get(skillName)
    if (existingSource) {
      throw new Error(`Duplicate Copilot skill rendering: ${skillName} (${existingSource}, direct:${intent})`)
    }

    seenSkillNames.set(skillName, `direct:${intent}`)

    return {
      directory: `plugins/oh-my-superagents-copilot/skills/${skillName}`,
      fileName: "SKILL.md",
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

function buildTemporaryDisableSkill(): CopilotBootstrapFile {
  return {
    directory: "plugins/oh-my-superagents-copilot/skills/oms-no-superpowers",
    fileName: "SKILL.md",
    content: `---
name: oms-no-superpowers
description: Temporarily disable superpowers for this conversation.
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
${renderCopilotAuxiliaryOwnershipMetadata({
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

export function buildCopilotBootstrapFiles(input: {
  packageVersion: string
  includeConfig: boolean
  configArtifactPath?: string
  routerConfig?: RouterConfig
  controlPlaneSettings?: CopilotBootstrapControlPlaneSettings
}): CopilotBootstrapBuildResult {
  const configArtifactPath = input.configArtifactPath ?? buildStarterCopilotConfig().path
  const controlPlaneSettings = input.controlPlaneSettings ?? createDefaultControlPlaneConfig().settings
  const seenSkillNames = new Map<string, string>()
  const supportedCommands = input.routerConfig?.workflow.kind === "direct"
    ? DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS
    : new Set(CONTROL_PLANE_COMMAND_KEYS)
  const controlPlaneSkillFiles = buildControlPlaneSkillFiles(
    controlPlaneSettings,
    configArtifactPath,
    seenSkillNames,
    supportedCommands,
  )
  const directModeSkillFiles = buildDirectModeSkillFiles(input.routerConfig, seenSkillNames)
  const files: CopilotBootstrapFile[] = [
    {
      directory: "plugins/oh-my-superagents-copilot",
      fileName: "plugin.json",
      content: buildPluginManifest(input.packageVersion, controlPlaneSettings),
    },
    {
      directory: "plugins/oh-my-superagents-copilot",
      fileName: "hooks.json",
      content: buildHooksJson(controlPlaneSettings, configArtifactPath),
    },
    ...controlPlaneSkillFiles,
    ...directModeSkillFiles,
    buildTemporaryDisableSkill(),
  ]

  if (input.includeConfig) {
    files.push({
      directory: ".",
      fileName: buildStarterCopilotConfig().path,
      content: buildStarterCopilotConfig().content,
    })
  }

  return { files }
}

function toGeneratedArtifact(copilotFile: CopilotBootstrapFile): GeneratedArtifact {
  return {
    kind: "command",
    directory: copilotFile.directory,
    fileName: copilotFile.fileName,
    ownerPrefix: "unused-for-stage1-metadata",
    content: copilotFile.content,
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

export async function writeCopilotBootstrapFiles(input: {
  cwd: string
  files: CopilotBootstrapFile[]
  fs: BootstrapFs
}) {
  const written: string[] = []

  for (const file of input.files) {
    const relativePath = path.join(file.directory, file.fileName)
    const absolutePath = assertProjectRelativePath(input.cwd, relativePath)
    await input.fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await input.fs.writeFile(absolutePath, file.content)
    written.push(absolutePath)
  }

  return written
}

async function readOwnPackageVersion() {
  const raw = await readOwnFile(new URL("../package.json", import.meta.url), "utf8")
  const parsed = JSON.parse(raw) as { version?: string }
  if (!parsed.version) {
    throw new Error("Could not determine oh-my-superagents package version")
  }
  return parsed.version
}

export async function runCopilotBootstrap(input: {
  cwd: string
  explicitPath?: string
  discoverConfigPath: typeof discoverConfigPath
  loadConfig: typeof loadRouterConfig
  materializeArtifacts: typeof materializeArtifacts
  buildCopilotArtifacts: typeof buildCopilotArtifacts
  resolveCompatibility: (policyMode: SuperpowersCompatibilityMode) => Promise<SuperpowersCompatibilityResult>
  fs: BootstrapFs & {
    readFile: (filePath: string) => Promise<string>
    readdir: (directory: string) => Promise<string[]>
    stat: (filePath: string) => Promise<{ isFile: () => boolean }>
    rename: (from: string, to: string) => Promise<void>
    unlink: (filePath: string) => Promise<void>
  }
}): Promise<CopilotBootstrapResult> {
  const explicitConfigPath = input.explicitPath ? path.resolve(input.cwd, input.explicitPath) : undefined
  const explicitConfigExists = explicitConfigPath
    ? await input.fs.readFile(explicitConfigPath).then(() => true).catch(() => false)
    : false
  const discoveredConfigPath = explicitConfigPath
    ? undefined
    : await input.discoverConfigPath({ cwd: input.cwd, explicitPath: undefined })
  const existingConfigPath = explicitConfigExists ? explicitConfigPath : discoveredConfigPath
  const starter = buildStarterCopilotConfig()
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

  const compatibility = loaded.config.workflow.kind === "direct"
    ? null
    : await input.resolveCompatibility(
        "superpowersCompatibility" in loaded.config && loaded.config.superpowersCompatibility
          ? loaded.config.superpowersCompatibility.mode
          : "warn",
      )

  if (compatibility?.shouldBlock) {
    return {
      files: [],
      written: [],
    } satisfies CopilotBootstrapResult
  }

  const packageVersion = await readOwnPackageVersion()

  const bootstrapFiles = buildCopilotBootstrapFiles({
    packageVersion,
    includeConfig: !existingConfigPath,
    configArtifactPath: configPath,
    routerConfig: loaded.config,
    controlPlaneSettings,
  })

  const controlPlaneSkillFiles = bootstrapFiles.files.filter((file) => file.fileName === "SKILL.md")
  const scaffoldFiles = bootstrapFiles.files.filter((file) => file.fileName !== "SKILL.md")

  const syncArtifacts = [
    ...input.buildCopilotArtifacts({ config: loaded.config }).agents,
    ...controlPlaneSkillFiles.map(toGeneratedArtifact),
  ]
  await input.materializeArtifacts({
    cwd: input.cwd,
    artifacts: syncArtifacts,
    fs: input.fs,
  })

  const writtenScaffoldFiles = await writeCopilotBootstrapFiles({
    cwd: input.cwd,
    files: scaffoldFiles,
    fs: input.fs,
  })

  const writtenSkillFiles = controlPlaneSkillFiles.map(
    (file) => path.resolve(input.cwd, path.join(file.directory, file.fileName)),
  )

  return {
    files: bootstrapFiles.files,
    written: [...writtenScaffoldFiles, ...writtenSkillFiles],
  }
}
