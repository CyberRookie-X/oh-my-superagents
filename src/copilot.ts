import {
  BUILT_IN_PHASES,
  CONTROL_PLANE_COMMAND_KEYS,
  SAFE_NAME_PATTERN,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type RouterConfig,
} from "./config.js"
import { listLaneExecutionUnits, renderLaneSplitGuidance } from "./lane-execution.js"
import { MARKER, ROUTE_MARKER_PREFIX, CONTROL_PLANE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import type { CanonicalRouteId, WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import { toSuperpowersCanonicalRouteId } from "./workflow-superpowers.js"

export const COPILOT_BASE_DIR = ".github/copilot"

export type CopilotAgentArtifact = {
  kind: "agent"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotSkillArtifact = {
  kind: "skill"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotCommandArtifact = {
  kind: "command"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotPluginManifestArtifact = {
  kind: "plugin-manifest"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotHooksConfigArtifact = {
  kind: "hooks-config"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotArtifact =
  | CopilotAgentArtifact
  | CopilotSkillArtifact
  | CopilotCommandArtifact
  | CopilotPluginManifestArtifact
  | CopilotHooksConfigArtifact

export type BuildCopilotArtifactsResult = {
  agents: CopilotAgentArtifact[]
  commands: CopilotCommandArtifact[]
  skills: CopilotSkillArtifact[]
  pluginManifest: CopilotPluginManifestArtifact
  hooksConfig: CopilotHooksConfigArtifact
}

const PHASE_TO_COPILOT_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

const PHASE_TO_COPILOT_COMMAND = {
  brainstorming: "sp-brainstorm",
  "writing-plans": "sp-plan",
  "subagent-driven-development": "sp-execute",
  "requesting-code-review": "sp-review",
  "verification-before-completion": "sp-verify",
  "frontend-design": "sp-visual",
  "webapp-testing": "sp-web-test",
} as const satisfies Record<BuiltInPhase, string>

const PHASE_TO_COPILOT_SKILL = {
  brainstorming: "brainstorming",
  "writing-plans": "writing-plans",
  "subagent-driven-development": "subagent-driven-development",
  "requesting-code-review": "requesting-code-review",
  "verification-before-completion": "verification-before-completion",
  "frontend-design": "frontend-design",
  "webapp-testing": "webapp-testing",
} as const satisfies Record<BuiltInPhase, string>

const DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "sync", "doctor"])

type CopilotControlPlaneSettings = Pick<ControlPlaneConfig["settings"], "commandPrefix" | "commands">

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot CLI.",
  use: "Switch OMS to the selected preset for Copilot CLI.",
  disable: "Disable OMS for Copilot CLI.",
  sync: "Sync OMS artifacts for Copilot CLI.",
  doctor: "Inspect OMS diagnostics for Copilot CLI.",
}

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

function copilotToolsList() {
  return "['bash', 'edit', 'view', 'glob', 'rg']"
}

export function renderCopilotAgentFile(input: {
  agentName: string
  description: string
  model: string
  sourceEntry?: WorkflowSourceEntry
  workflowEntryName?: string
}) {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: "phase.unknown" as CanonicalRouteId,
    source: "superpowers",
  })

  return [
    "---",
    `name: ${input.agentName}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    `tools: ${copilotToolsList()}`,
    "---",
    "",
    MARKER,
    `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${sourceEntry.source}; route=${sourceEntry.canonicalRoute}; projection=agent; rendered-name=${input.agentName} -->`,
    "",
    `You are the ${input.agentName} helper agent.`,
    ...(input.workflowEntryName
      ? [`Load and follow the upstream workflow entry \`${input.workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` exactly.`]
      : ["Load and follow the upstream workflow entry named in the invoking command exactly."]),
    "Use the user prompt as the task context.",
    "",
  ].join("\n")
}

export function renderCopilotSkillFile(input: {
  skillName: string
  description: string
  model: string
  phase: BuiltInPhase
  profileId: string
  sourceEntry: WorkflowSourceEntry
}) {
  const workflowEntryName = formatWorkflowEntryName(input.sourceEntry)

  return [
    "---",
    `name: ${input.skillName}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    "---",
    "",
    MARKER,
    `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${input.sourceEntry.source}; route=${input.sourceEntry.canonicalRoute}; projection=skill; rendered-name=${input.skillName} -->`,
    "",
    `## Purpose`,
    `This skill routes the \`${input.phase}\` phase through OMS profile \`${input.profileId}\`.`,
    "",
    `## Instructions`,
    `Use the workflow entry \`${workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`,
    `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
    `Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.`,
    "",
    `## Route Metadata`,
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- profile: \`${input.profileId}\``,
    `- model: \`${input.model}\``,
    "",
  ].join("\n")
}

export function renderCopilotCommandFile(input: {
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
    "---",
    "",
    MARKER,
    `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${sourceEntry.source}; route=${sourceEntry.canonicalRoute}; projection=command; rendered-name=${input.renderedName} -->`,
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

export function explainCopilotPhase(config: RouterConfig, phase: BuiltInPhase) {
  const resolved = resolvePhase(config, phase)
  return {
    phase,
    canonicalRoute: resolved.canonicalRoute,
    profileId: resolved.profileId,
    model: resolved.selection.model,
    variant: resolved.selection.variant,
    routeSource: resolved.routeSource,
    resolvedSource: resolved.resolvedSource,
    commandName: undefined,
    agentName: PHASE_TO_COPILOT_AGENT[phase],
  }
}

export function explainAllCopilot(config: RouterConfig) {
  return BUILT_IN_PHASES.map((phase) => explainCopilotPhase(config, phase))
}

function renderCopilotDirectAgentFile(input: {
  agentName: string
  description: string
  model: string
  intent: string
  sourceEntry?: WorkflowSourceEntry
}) {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: toDirectCanonicalRouteId(input.intent),
    source: "direct",
  })

  return [
    "---",
    `name: ${input.agentName}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    `tools: ${copilotToolsList()}`,
    "---",
    "",
    MARKER,
    `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${sourceEntry.source}; route=${sourceEntry.canonicalRoute}; projection=agent; rendered-name=${input.agentName} -->`,
    "",
    `You are the ${input.agentName} routing agent for the ${input.intent} intent.`,
    "Use the user prompt as the task context.",
    "Follow the requested intent directly without any upstream skill handoff.",
    "",
  ].join("\n")
}

function renderCopilotDirectCommandFile(input: {
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
    "---",
    "",
    MARKER,
    `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${sourceEntry.source}; route=${sourceEntry.canonicalRoute}; projection=command; rendered-name=${input.renderedName} -->`,
    "",
    "## Router Context",
    `- intent: ${input.intent}`,
    "- arguments: $ARGUMENTS",
    "",
  ].join("\n")
}

function renderCopilotControlPlaneCommandFile(input: {
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
    `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=1; host=copilot; artifact=command; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`,
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host copilot $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

function renderCopilotPluginManifest() {
  return JSON.stringify(
    {
      name: "oh-my-superagents",
      description: "AI coding assistant routing and control plane for Copilot CLI",
      version: "1.0.0",
      license: "MIT",
      agents: "agents/",
      skills: ["skills/"],
      commands: "commands/",
      hooks: "hooks.json",
    },
    null,
    2,
  ) + "\n"
}

function renderCopilotHooksConfig() {
  return JSON.stringify(
    {
      version: 1,
      hooks: {
        sessionStart: [
          {
            type: "command",
            bash: "echo 'OMS: Copilot CLI session started'",
            timeoutSec: 5,
          },
        ],
      },
    },
    null,
    2,
  ) + "\n"
}

function buildCopilotControlPlaneCommandArtifacts(
  settings: CopilotControlPlaneSettings,
  supportedCommands: ReadonlySet<ControlPlaneCommandKey> = new Set(CONTROL_PLANE_COMMAND_KEYS),
): CopilotCommandArtifact[] {
  const ownerPrefix = `${settings.commandPrefix}-`
  const seenFileNames = new Map<string, string>()

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
    if (!supportedCommands.has(commandKey)) {
      return []
    }

    const command = settings.commands[commandKey]
    const renderedNames = [command.name, ...command.aliases]

    return renderedNames.map((renderedName) => {
      const fileName = `${settings.commandPrefix}-${renderedName}.md`
      const existingCommand = seenFileNames.get(fileName)

      if (existingCommand) {
        throw new Error(`Duplicate OMS command file rendering: ${fileName} (${existingCommand}, ${commandKey})`)
      }

      seenFileNames.set(fileName, commandKey)

      return {
        kind: "command" as const,
        directory: `${COPILOT_BASE_DIR}/commands`,
        fileName,
        ownerPrefix,
        content: renderCopilotControlPlaneCommandFile({
          description: CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
          logicalCommand: commandKey,
          renderedName: fileName.replace(/\.md$/, ""),
        }),
      }
    })
  })
}

export function buildCopilotArtifacts(config: RouterConfig, controlPlaneSettings?: CopilotControlPlaneSettings): BuildCopilotArtifactsResult {
  const commands: CopilotCommandArtifact[] = []
  const agents: CopilotAgentArtifact[] = []
  const skills: CopilotSkillArtifact[] = []

  const laneExecutionUnits =
    config.workflow?.kind === "superpowers" && controlPlaneSettings && config.lanes && Object.keys(config.lanes).length > 0
      ? listLaneExecutionUnits({
          activePresetKey: controlPlaneSettings.commandPrefix,
          activePreset: { usesLanes: config.availableLanes ?? Object.keys(config.lanes) },
        })
      : []

  const supportedCommands =
    config.workflow?.kind === "direct"
      ? DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS
      : new Set(CONTROL_PLANE_COMMAND_KEYS)

  const controlPlaneCommandArtifacts = controlPlaneSettings
    ? buildCopilotControlPlaneCommandArtifacts(controlPlaneSettings, supportedCommands)
    : []

  if (config.workflow?.kind === "direct") {
    for (const intent of Object.keys(config.workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const agentName = `rt-${intent}`
      const commandName = `ai-${intent}`

      agents.push({
        kind: "agent",
        directory: `${COPILOT_BASE_DIR}/agents`,
        fileName: `${agentName}.md`,
        ownerPrefix: "rt-",
        content: renderCopilotDirectAgentFile({
          agentName,
          description: `${agentName} routing agent for ${intent}`,
          model: resolved.selection.model,
          intent,
          sourceEntry: resolved.sourceEntry,
        }),
      })

      commands.push({
        kind: "command",
        directory: `${COPILOT_BASE_DIR}/commands`,
        fileName: `${commandName}.md`,
        ownerPrefix: "ai-",
        content: renderCopilotDirectCommandFile({
          description: `Route ${intent} through ${agentName}`,
          agentName,
          renderedName: commandName,
          intent,
          sourceEntry: resolved.sourceEntry,
        }),
      })
    }
  } else {
    for (const phase of BUILT_IN_PHASES) {
      const resolved = resolvePhase(config, phase)
      const agentName = PHASE_TO_COPILOT_AGENT[phase]
      const commandName = PHASE_TO_COPILOT_COMMAND[phase]
      const skillName = PHASE_TO_COPILOT_SKILL[phase]
      const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

      agents.push({
        kind: "agent",
        directory: `${COPILOT_BASE_DIR}/agents`,
        fileName: `${agentName}.md`,
        ownerPrefix: "oms-",
        content: renderCopilotAgentFile({
          agentName,
          description: `${agentName} helper for ${phase}`,
          model: resolved.selection.model,
          sourceEntry: resolved.sourceEntry,
          workflowEntryName,
        }),
      })

      skills.push({
        kind: "skill",
        directory: `${COPILOT_BASE_DIR}/skills/${skillName}`,
        fileName: "SKILL.md",
        ownerPrefix: "oms-",
        content: renderCopilotSkillFile({
          skillName: agentName,
          description: `${agentName} routing skill`,
          model: resolved.selection.model,
          phase,
          profileId: resolved.profileId,
          sourceEntry: resolved.sourceEntry,
        }),
      })

      commands.push({
        kind: "command",
        directory: `${COPILOT_BASE_DIR}/commands`,
        fileName: `${commandName}.md`,
        ownerPrefix: "sp-",
        content: renderCopilotCommandFile({
          description: `Route ${phase} through ${agentName}`,
          agentName,
          renderedName: commandName,
          skillName: workflowEntryName,
          phase,
          sourceEntry: resolved.sourceEntry,
          splitGuidance:
            phase === "subagent-driven-development" && laneExecutionUnits.length > 0
              ? `If the task spans multiple lanes, ${renderLaneSplitGuidance({
                  mode: controlPlaneSettings?.commands ? "suggest" : "suggest",
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

        agents.push({
          kind: "agent",
          directory: `${COPILOT_BASE_DIR}/agents`,
          fileName: unit.agentFileName,
          ownerPrefix: "spr-build--",
          content: renderCopilotAgentFile({
            agentName: laneAgentName,
            description: `${laneAgentName} helper for ${phase}`,
            model: laneResolved.selection.model,
            sourceEntry: laneResolved.sourceEntry,
            workflowEntryName: laneWorkflowEntryName,
          }),
        })

        commands.push({
          kind: "command",
          directory: `${COPILOT_BASE_DIR}/commands`,
          fileName: unit.commandFileName,
          ownerPrefix: "sp-execute-",
          content: renderCopilotCommandFile({
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

  const pluginManifest: CopilotPluginManifestArtifact = {
    kind: "plugin-manifest",
    directory: COPILOT_BASE_DIR,
    fileName: "plugin.json",
    ownerPrefix: "oms-",
    content: renderCopilotPluginManifest(),
  }

  const hooksConfig: CopilotHooksConfigArtifact = {
    kind: "hooks-config",
    directory: COPILOT_BASE_DIR,
    fileName: "hooks.json",
    ownerPrefix: "oms-",
    content: renderCopilotHooksConfig(),
  }

  return {
    agents,
    commands: [...commands, ...controlPlaneCommandArtifacts],
    skills,
    pluginManifest,
    hooksConfig,
  }
}
