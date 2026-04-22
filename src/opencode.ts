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
import type { CanonicalRouteId, WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import { toSuperpowersCanonicalRouteId } from "./workflow-superpowers.js"

export const MARKER_TEXT = "generated-by: oh-my-superagents; do-not-edit: true"
export const MARKER = `<!-- ${MARKER_TEXT} -->`
export const CONTROL_PLANE_MARKER_PREFIX = "oms-control-plane:"
export const AUXILIARY_MARKER_PREFIX = "oms-auxiliary:"
export const ROUTE_MARKER_PREFIX = "oms-route:"

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
const DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "sync", "doctor"])
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

function getRouteSourceEntry(
  sourceEntry: WorkflowSourceEntry | undefined,
  fallback: WorkflowSourceEntry,
) {
  return sourceEntry ?? fallback
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

const SHARED_OPENCODE_AGENT_NAMES = new Set(
  Object.values(PHASE_TO_AGENT).filter((agentName, index, values) => values.indexOf(agentName) !== index),
)

export function renderControlPlaneOwnershipMetadata(input: {
  host: "opencode" | "codex" | "qwen" | "copilot"
  artifact: "command" | "skill"
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=${input.host === "qwen" || input.host === "copilot" ? "2" : "1"}; host=${input.host}; artifact=${input.artifact}; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

export function renderAuxiliaryOwnershipMetadata(input: {
  host: "codex"
  artifact: "skill"
  helper: "temporary-disable"
  renderedName: string
}) {
  return `<!-- ${AUXILIARY_MARKER_PREFIX} stage=1; host=${input.host}; artifact=${input.artifact}; helper=${input.helper}; rendered-name=${input.renderedName} -->`
}

export function renderRouteOwnershipMetadata(input: {
  host: "opencode" | "codex" | "qwen" | "claude" | "copilot"
  source: WorkflowSourceKind
  route: CanonicalRouteId
  projection: "agent" | "command" | "skill"
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=${input.host === "qwen" || input.host === "copilot" ? "2" : "1"}; host=${input.host}; source=${input.source}; route=${input.route}; projection=${input.projection}; rendered-name=${input.renderedName} -->`
}

export function renderAgentFile(input: {
  agentName: string
  description: string
  model: string
  variant?: string
  temperature?: number
  permissionTask?: PermissionTask
  sourceEntry?: WorkflowSourceEntry
  workflowEntryName?: string
}) {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: "phase.unknown" as CanonicalRouteId,
    source: "superpowers",
  })
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
    renderRouteOwnershipMetadata({
      host: "opencode",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.agentName,
    }),
    "",
    `You are the ${input.agentName} helper agent.`,
    ...(input.workflowEntryName
      ? [`Load and follow the upstream workflow entry \`${input.workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` exactly.`]
      : ["Load and follow the upstream workflow entry named in the invoking command exactly."]),
    "Use the forwarded router context arguments as the task context.",
    "",
  ].join("\n")
}

export function renderCommandFile(input: {
  description: string
  agentName: string
  renderedName: string
  skillName: string
  phase: BuiltInPhase
  effectiveLane?: string
  splitGuidance?: string
  sourceEntry?: WorkflowSourceEntry
}) {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: toSuperpowersCanonicalRouteId(input.phase),
    source: "superpowers",
  })
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    `agent: ${yamlScalar(input.agentName)}`,
    "subtask: true",
    "---",
    "",
    MARKER,
    renderRouteOwnershipMetadata({
      host: "opencode",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "command",
      renderedName: input.renderedName,
    }),
    "",
    `Load and follow the upstream workflow entry \`${input.skillName}\` for \`${sourceEntry.canonicalRoute}\` exactly.`,
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
  sourceEntry?: WorkflowSourceEntry
}) {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: toDirectCanonicalRouteId(input.intent),
    source: "direct",
  })
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
    renderRouteOwnershipMetadata({
      host: "opencode",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.agentName,
    }),
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
  renderedName: string
  sourceEntry?: WorkflowSourceEntry
}) {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: toDirectCanonicalRouteId(input.intent),
    source: "direct",
  })
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    `agent: ${yamlScalar(input.agentName)}`,
    "subtask: true",
    "---",
    "",
    MARKER,
    renderRouteOwnershipMetadata({
      host: "opencode",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "command",
      renderedName: input.renderedName,
    }),
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
  agents: Map<string, { profile: string; profiles: string[]; codexFast: boolean }>,
): GeneratedArtifact {
  return {
    kind: "command",
    directory: RUNTIME_AGENT_METADATA_DIRECTORY,
    fileName: RUNTIME_AGENT_METADATA_FILE,
    ownerPrefix: RUNTIME_AGENT_METADATA_OWNER_PREFIX,
    content: `${JSON.stringify({ agents: Object.fromEntries(agents) }, null, 2)}\n`,
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

function buildControlPlaneCommandArtifacts(
  settings: OpenCodeControlPlaneSettings,
  supportedCommands: ReadonlySet<ControlPlaneCommandKey> = new Set(CONTROL_PLANE_COMMAND_KEYS),
): GeneratedArtifact[] {
  const ownerPrefix = `${settings.commandPrefix}-`
  const seenFileNames = new Map<string, string>()

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
    if (!supportedCommands.has(commandKey)) {
      return []
    }

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
  const runtimeAgentMetadata = new Map<string, { profile: string; profiles: string[]; codexFast: boolean }>()
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
      profile,
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
            sourceEntry: resolved.sourceEntry,
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
          renderedName: `ai-${intent}`,
          intent,
          sourceEntry: resolved.sourceEntry,
        }),
      })
    }
  } else {
    for (const phase of BUILT_IN_PHASES) {
      const resolved = resolvePhase(config, phase)
      const agentName = PHASE_TO_AGENT[phase]
      const commandName = PHASE_TO_COMMAND[phase].slice(1)
      const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)
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
        const sharedAgentSourceEntry = resolved.sourceEntry

        agentSelections.set(
          agentName,
          JSON.stringify({
            model: resolved.selection.model,
            variant: resolved.selection.variant,
            temperature: resolved.selection.temperature,
            resolvedSource: resolved.sourceEntry.source,
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
            sourceEntry: sharedAgentSourceEntry,
            workflowEntryName: SHARED_OPENCODE_AGENT_NAMES.has(agentName) ? undefined : workflowEntryName,
          }),
        })
      } else {
        const nextSelection = JSON.stringify({
          model: resolved.selection.model,
          variant: resolved.selection.variant,
          temperature: resolved.selection.temperature,
          resolvedSource: resolved.sourceEntry.source,
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
            renderedName: commandName,
            skillName: workflowEntryName,
            phase,
            sourceEntry: resolved.sourceEntry,
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
        const laneWorkflowEntryName = formatWorkflowEntryName(laneResolved.sourceEntry)

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
            sourceEntry: laneResolved.sourceEntry,
            workflowEntryName: laneWorkflowEntryName,
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
            renderedName: unit.commandFileName.replace(/\.md$/, ""),
            skillName: laneWorkflowEntryName,
            phase,
            effectiveLane: unit.lane,
            sourceEntry: laneResolved.sourceEntry,
          }),
        })
      }
    }
  }

  commands.push(buildRuntimeAgentMetadataArtifact(runtimeAgentMetadata))

  if (controlPlaneSettings) {
    const controlPlaneArtifacts = buildControlPlaneCommandArtifacts(
      controlPlaneSettings,
      workflow?.kind === "direct"
        ? DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS
        : new Set(CONTROL_PLANE_COMMAND_KEYS),
    )
    assertNoOpenCodeCommandCollisions(commands, controlPlaneArtifacts)
    commands.push(...controlPlaneArtifacts)
    commands.push(buildTemporaryDisableHelperArtifact())
  }

  return {
    agents: Array.from(agents.values()),
    commands,
  }
}
