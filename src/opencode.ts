import {
  BUILT_IN_PHASES,
  CONTROL_PLANE_COMMAND_KEYS,
  SAFE_NAME_PATTERN,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type RouterConfig,
} from "./config.js"
import { listLaneExecutionUnits, renderLaneSplitGuidance } from "./lane-execution.js"
import { PHASE_TO_AGENT, PHASE_TO_COMMAND, resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"

export const MARKER_TEXT = "generated-by: oh-my-superagents; do-not-edit: true"
export const MARKER = `<!-- ${MARKER_TEXT} -->`
export const CONTROL_PLANE_MARKER_PREFIX = "oms-control-plane:"
export const AUXILIARY_MARKER_PREFIX = "oms-auxiliary:"
const JSONC_MARKER = `// ${MARKER_TEXT}`

type PermissionTask = Record<string, "allow" | "deny" | "ask">

export type GeneratedArtifact = {
  kind: "agent" | "command"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

type OpenCodeControlPlaneSettings = Pick<
  ControlPlaneConfig["settings"],
  "activePreset" | "commandPrefix" | "commands" | "subagentExecution"
>

const SUBAGENT_EXECUTION_BASE_PERMISSION_TASK: PermissionTask = {
  "*": "deny",
  "spr-review": "allow",
  "spr-verify": "allow",
}

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for OpenCode.",
  use: "Switch OMS to the selected preset for OpenCode.",
  disable: "Disable OMS for OpenCode.",
  sync: "Sync OMS artifacts for OpenCode.",
  doctor: "Inspect OMS diagnostics for OpenCode.",
}
const TEMPORARY_DISABLE_COMMAND_FILE = "oms-no-superpowers.md"
const TEMPORARY_DISABLE_COMMAND_OWNER_PREFIX = TEMPORARY_DISABLE_COMMAND_FILE
export const RUNTIME_AGENT_METADATA_DIRECTORY = ".opencode/oh-my-superagents"
export const RUNTIME_AGENT_METADATA_FILE = "runtime-agent-metadata.json"
export const RUNTIME_AGENT_METADATA_OWNER_PREFIX = "oms-runtime-agent-metadata"

const RESERVED_PHASE_COMMAND_FILES = new Set(
  Object.values(PHASE_TO_COMMAND).map((commandName) => `${commandName.slice(1)}.md`),
)

function yamlScalar(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

export function renderControlPlaneOwnershipMetadata(input: {
  host: "opencode" | "codex"
  artifact: "command" | "skill"
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=1; host=${input.host}; artifact=${input.artifact}; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

export function renderAuxiliaryOwnershipMetadata(input: {
  host: "codex"
  artifact: "skill"
  helper: "temporary-disable"
  renderedName: string
}) {
  return `<!-- ${AUXILIARY_MARKER_PREFIX} stage=1; host=${input.host}; artifact=${input.artifact}; helper=${input.helper}; rendered-name=${input.renderedName} -->`
}

export function renderAgentFile(input: {
  agentName: string
  description: string
  model: string
  variant?: string
  temperature?: number
  permissionTask?: PermissionTask
}) {
  const permissionBlock = input.permissionTask
    ? [
        "permission:",
        "  task:",
        ...Object.entries(input.permissionTask).map(([name, value]) => `    \"${name}\": ${value}`),
      ].join("\n") + "\n"
    : ""

  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    "mode: subagent",
    "hidden: true",
    `model: ${yamlScalar(input.model)}`,
    ...(input.variant ? [`variant: ${yamlScalar(input.variant)}`] : []),
    ...(input.temperature !== undefined ? [`temperature: ${input.temperature}`] : []),
    ...(permissionBlock ? [permissionBlock.trimEnd()] : []),
    "---",
    "",
    MARKER,
    "",
    `You are the ${input.agentName} helper agent.`,
    "Load the upstream superpowers skill named in the invoking command and follow it exactly.",
    "Use the forwarded router context arguments as the task context.",
    "",
  ].join("\n")
}

export function renderCommandFile(input: {
  description: string
  agentName: string
  skillName: string
  phase: BuiltInPhase
  effectiveLane?: string
  splitGuidance?: string
}) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    `agent: ${yamlScalar(input.agentName)}`,
    "subtask: true",
    "---",
    "",
    MARKER,
    "",
    `Load and follow the upstream skill \`${input.skillName}\` exactly.`,
    "",
    ...(input.splitGuidance ? ["## Lane Split Guidance", input.splitGuidance, ""] : []),
    "## Router Context",
    `- phase: ${input.phase}`,
    ...(input.effectiveLane ? [`- lane: ${input.effectiveLane}`] : []),
    "- arguments: $ARGUMENTS",
    "",
  ].join("\n")
}

function renderDirectAgentFile(input: {
  agentName: string
  description: string
  model: string
  variant?: string
  temperature?: number
  intent: string
}) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    "mode: subagent",
    "hidden: true",
    `model: ${yamlScalar(input.model)}`,
    ...(input.variant ? [`variant: ${yamlScalar(input.variant)}`] : []),
    ...(input.temperature !== undefined ? [`temperature: ${input.temperature}`] : []),
    "---",
    "",
    MARKER,
    "",
    `You are the ${input.agentName} routing agent for the ${input.intent} intent.`,
    "Use the forwarded router context arguments as the task context.",
    "Follow the requested intent directly without any upstream skill handoff.",
    "",
  ].join("\n")
}

function renderDirectCommandFile(input: {
  description: string
  agentName: string
  intent: string
}) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    `agent: ${yamlScalar(input.agentName)}`,
    "subtask: true",
    "---",
    "",
    MARKER,
    "",
    "## Router Context",
    `- intent: ${input.intent}`,
    "- arguments: $ARGUMENTS",
    "",
  ].join("\n")
}

export function renderControlPlaneCommandFile(input: {
  description: string
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    "---",
    "",
    MARKER,
    renderControlPlaneOwnershipMetadata({
      host: "opencode",
      artifact: "command",
      logicalCommand: input.logicalCommand,
      renderedName: input.renderedName,
    }),
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host opencode $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

function renderTemporaryDisableHelperFile() {
  return [
    "---",
    `description: ${yamlScalar("Temporarily disable superpowers for this conversation.")}`,
    "---",
    "",
    MARKER,
    "",
    "Tell the assistant:",
    "- do not use superpowers in this conversation",
    "- do not proactively load superpowers skills, workflows, or phase agents",
    "- only use superpowers again if I explicitly ask",
    "",
    "You can add extra freeform arguments via $ARGUMENTS.",
    "",
  ].join("\n")
}

function buildTemporaryDisableHelperArtifact(): GeneratedArtifact {
  return {
    kind: "command",
    directory: ".opencode/commands",
    fileName: TEMPORARY_DISABLE_COMMAND_FILE,
    ownerPrefix: TEMPORARY_DISABLE_COMMAND_OWNER_PREFIX,
    content: renderTemporaryDisableHelperFile(),
  }
}

function buildRuntimeAgentMetadataArtifact(
  agents: Map<string, { profiles: string[]; codexFast: boolean }>,
): GeneratedArtifact {
  return {
    kind: "command",
    directory: RUNTIME_AGENT_METADATA_DIRECTORY,
    fileName: RUNTIME_AGENT_METADATA_FILE,
    ownerPrefix: RUNTIME_AGENT_METADATA_OWNER_PREFIX,
    content: `${JSONC_MARKER}\n${JSON.stringify({ agents: Object.fromEntries(agents) }, null, 2)}\n`,
  }
}

export function listRenderedOpenCodeControlPlaneCommands(settings: OpenCodeControlPlaneSettings) {
  return Object.fromEntries(
    CONTROL_PLANE_COMMAND_KEYS.map((key) => {
      const command = settings.commands[key]

      return [
        key,
        [command.name, ...command.aliases].map((name) => `${settings.commandPrefix}-${name}`),
      ]
    }),
  ) as Record<ControlPlaneCommandKey, string[]>
}

function buildControlPlaneCommandArtifacts(settings: OpenCodeControlPlaneSettings): GeneratedArtifact[] {
  const ownerPrefix = `${settings.commandPrefix}-`
  const seenFileNames = new Map<string, string>()

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
    const renderedNames = listRenderedOpenCodeControlPlaneCommands(settings)[commandKey]

    return renderedNames.map((renderedName) => {
      const fileName = `${renderedName}.md`

      if (RESERVED_PHASE_COMMAND_FILES.has(fileName)) {
        throw new Error(`OMS command file collides with reserved OpenCode phase command: ${fileName}`)
      }

      if (fileName === TEMPORARY_DISABLE_COMMAND_FILE) {
        throw new Error(`OMS command file collides with fixed OpenCode helper command: ${fileName}`)
      }

      const existingCommand = seenFileNames.get(fileName)
      if (existingCommand) {
        throw new Error(`Duplicate OMS command file rendering: ${fileName} (${existingCommand}, ${commandKey})`)
      }

      seenFileNames.set(fileName, commandKey)

      return {
        kind: "command" as const,
        directory: ".opencode/commands",
        fileName,
        ownerPrefix,
        content: renderControlPlaneCommandFile({
          description: CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
          logicalCommand: commandKey,
          renderedName: fileName.replace(/\.md$/, ""),
        }),
      }
    })
  })
}

function assertNoOpenCodeCommandCollisions(existing: GeneratedArtifact[], next: GeneratedArtifact[]) {
  const reservedPaths = new Set(
    existing
      .filter((artifact) => artifact.directory === ".opencode/commands")
      .map((artifact) => `${artifact.directory}/${artifact.fileName}`),
  )

  for (const artifact of next) {
    const artifactPath = `${artifact.directory}/${artifact.fileName}`
    if (reservedPaths.has(artifactPath)) {
      throw new Error(`OMS command file collides with existing OpenCode command: ${artifact.fileName}`)
    }
  }
}

export function buildArtifacts(config: RouterConfig, controlPlaneSettings?: OpenCodeControlPlaneSettings) {
  const commands: GeneratedArtifact[] = []
  const agents = new Map<string, GeneratedArtifact>()
  const agentSelections = new Map<string, string>()
  const runtimeAgentMetadata = new Map<string, { profiles: string[]; codexFast: boolean }>()
  const workflow = config.workflow
  const laneExecutionUnits =
    workflow?.kind === "superpowers" && controlPlaneSettings && config.lanes && Object.keys(config.lanes).length > 0
      ? listLaneExecutionUnits({
          activePresetKey: controlPlaneSettings.activePreset,
          activePreset: { usesLanes: config.availableLanes ?? Object.keys(config.lanes) },
        })
      : []

  function registerRuntimeAgentMetadata(agentName: string, profile: string, codexFast?: boolean) {
    const current = runtimeAgentMetadata.get(agentName)
    const nextCodexFast = codexFast === true

    if (current && current.codexFast !== nextCodexFast) {
      throw new Error(`Shared agent conflict for ${agentName}`)
    }

    if (current) {
      if (!current.profiles.includes(profile)) {
        current.profiles.push(profile)
      }
      return
    }

    runtimeAgentMetadata.set(agentName, {
      profiles: [profile],
      codexFast: nextCodexFast,
    })
  }

  if (workflow?.kind === "direct") {
    for (const intent of Object.keys(workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const agentName = `rt-${intent}`

      registerRuntimeAgentMetadata(agentName, resolved.profileId, resolved.selection.codexFast)

      agents.set(agentName, {
        kind: "agent",
        directory: ".opencode/agents",
        fileName: `${agentName}.md`,
        ownerPrefix: "rt-",
        content: renderDirectAgentFile({
          agentName,
          description: `${agentName} routing agent for ${intent}`,
          model: resolved.selection.model,
          variant: resolved.selection.variant,
          temperature: resolved.selection.temperature,
          intent,
        }),
      })

      commands.push({
        kind: "command",
        directory: ".opencode/commands",
        fileName: `ai-${intent}.md`,
        ownerPrefix: "ai-",
        content: renderDirectCommandFile({
          description: `Route ${intent} through ${agentName}`,
          agentName,
          intent,
        }),
      })
    }
  } else {
    for (const phase of BUILT_IN_PHASES) {
      const resolved = resolvePhase(config, phase)
      const agentName = PHASE_TO_AGENT[phase]
      const commandName = PHASE_TO_COMMAND[phase].slice(1)
      const skillName = `superpowers/${phase}`
      const permissionTask: PermissionTask | undefined =
        phase === "subagent-driven-development"
          ? {
              ...SUBAGENT_EXECUTION_BASE_PERMISSION_TASK,
              ...Object.fromEntries(
                laneExecutionUnits.map((unit) => [unit.agentFileName.replace(/\.md$/, ""), "allow" as const]),
              ),
            }
          : undefined

      registerRuntimeAgentMetadata(agentName, resolved.profileId, resolved.selection.codexFast)

      if (!agents.has(agentName)) {
        agentSelections.set(
          agentName,
          JSON.stringify({
            model: resolved.selection.model,
            variant: resolved.selection.variant,
            temperature: resolved.selection.temperature,
          }),
        )

        agents.set(agentName, {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: `${agentName}.md`,
          ownerPrefix: "spr-",
          content: renderAgentFile({
            agentName,
            description: `${agentName} helper for ${phase}`,
            model: resolved.selection.model,
            variant: resolved.selection.variant,
            temperature: resolved.selection.temperature,
            permissionTask,
          }),
        })
      } else {
        const nextSelection = JSON.stringify({
          model: resolved.selection.model,
          variant: resolved.selection.variant,
          temperature: resolved.selection.temperature,
        })
        if (agentSelections.get(agentName) !== nextSelection) {
          throw new Error(`Shared agent conflict for ${agentName}`)
        }
      }

      commands.push({
        kind: "command",
        directory: ".opencode/commands",
        fileName: `${commandName}.md`,
        ownerPrefix: "sp-",
        content: renderCommandFile({
          description: `Route ${phase} through ${agentName}`,
          agentName,
          skillName,
          phase,
          splitGuidance:
            phase === "subagent-driven-development" && laneExecutionUnits.length > 0
              ? `If the task spans multiple lanes, ${renderLaneSplitGuidance({
                  mode: controlPlaneSettings?.subagentExecution.mode ?? "suggest",
                  units: laneExecutionUnits,
                }).replace(/^./, (value) => value.toLowerCase())}`
              : undefined,
        }),
      })

      if (phase !== "subagent-driven-development") {
        continue
      }

      for (const unit of laneExecutionUnits) {
        const laneResolved = resolvePhase(config, phase, { effectiveLane: unit.lane })
        const laneAgentName = unit.agentFileName.replace(/\.md$/, "")

        registerRuntimeAgentMetadata(laneAgentName, laneResolved.profileId, laneResolved.selection.codexFast)

        agents.set(laneAgentName, {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: unit.agentFileName,
          ownerPrefix: "spr-build--",
          content: renderAgentFile({
            agentName: laneAgentName,
            description: `${laneAgentName} helper for ${phase}`,
            model: laneResolved.selection.model,
            variant: laneResolved.selection.variant,
            temperature: laneResolved.selection.temperature,
            permissionTask: SUBAGENT_EXECUTION_BASE_PERMISSION_TASK,
          }),
        })

        commands.push({
          kind: "command",
          directory: ".opencode/commands",
          fileName: unit.commandFileName,
          ownerPrefix: "sp-execute-",
          content: renderCommandFile({
            description: `Route ${phase} through ${laneAgentName}`,
            agentName: laneAgentName,
            skillName,
            phase,
            effectiveLane: unit.lane,
          }),
        })
      }
    }
  }

  commands.push(buildRuntimeAgentMetadataArtifact(runtimeAgentMetadata))

  if (controlPlaneSettings) {
    const controlPlaneArtifacts = buildControlPlaneCommandArtifacts(controlPlaneSettings)
    assertNoOpenCodeCommandCollisions(commands, controlPlaneArtifacts)
    commands.push(...controlPlaneArtifacts)
    commands.push(buildTemporaryDisableHelperArtifact())
  }

  return {
    agents: Array.from(agents.values()),
    commands,
  }
}
