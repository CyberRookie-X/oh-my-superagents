import { BUILT_IN_PHASES, SAFE_NAME_PATTERN, type ControlPlaneConfig, type RouterConfig } from "./config.js"
import { listLaneExecutionUnits, renderLaneSplitGuidance } from "./lane-execution.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { MARKER_TEXT, renderRouteOwnershipMetadata, type GeneratedArtifact } from "./opencode.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

const PHASE_TO_CODEX_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

export const CODEX_RUNTIME_AGENT_METADATA_DIRECTORY = ".codex/oh-my-superagents"
export const CODEX_RUNTIME_AGENT_METADATA_FILE = "runtime-agent-metadata.json"
export const CODEX_RUNTIME_AGENT_METADATA_OWNER_PREFIX = "oms-runtime-agent-metadata"
export const CODEX_HOOKS_METADATA_DIRECTORY = CODEX_RUNTIME_AGENT_METADATA_DIRECTORY
export const CODEX_HOOKS_METADATA_FILE = "hooks-metadata.json"
export const CODEX_HOOKS_METADATA_OWNER_PREFIX = "oms-hooks-metadata"

type CodexControlPlaneSettings = Pick<
  ControlPlaneConfig["settings"],
  "activePreset" | "subagentExecution"
>

const PHASE_TO_SKILL = {
  brainstorming: "brainstorming",
  "writing-plans": "writing-plans",
  "subagent-driven-development": "subagent-driven-development",
  "requesting-code-review": "requesting-code-review",
  "verification-before-completion": "verification-before-completion",
  "frontend-design": "frontend-design",
  "webapp-testing": "webapp-testing",
} as const satisfies Record<BuiltInPhase, string>

const EFFORT_TO_CODEX = {
  fast: { reasoningEffort: "low" },
  balanced: { reasoningEffort: "medium" },
  deep: { reasoningEffort: "high" },
  max: { reasoningEffort: "xhigh" },
} as const

function getCodexEffortConfig(selection: {
  effort?: "fast" | "balanced" | "deep" | "max"
  codexFast?: boolean
}): {
  reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  serviceTier?: "fast"
} {
  const reasoningEffort = selection.effort
    ? EFFORT_TO_CODEX[selection.effort].reasoningEffort
    : undefined

  return {
    reasoningEffort,
    serviceTier: selection.codexFast || selection.effort === "fast" ? "fast" : undefined,
  }
}

function tomlString(value: string) {
  return JSON.stringify(value)
}

function sanitizeTomlMultilineString(value: string) {
  return value.replace(/"""/g, '\\"\\"\\"')
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function formatCodexWorkflowGuidance(sourceEntry: WorkflowSourceEntry, workflowEntryName: string) {
  if (sourceEntry.source === "gstack") {
    return `Use the gstack developer instructions from \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
  }

  return `Use the workflow entry \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
}

export function renderCodexAgentFile(input: {
  name: string
  description: string
  developerInstructions: string
  model: string
  profileId?: string
  reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  serviceTier?: "fast"
}) {
  const instructions = input.profileId
    ? `Routed to profile: ${input.profileId}\n\n${input.developerInstructions}`
    : input.developerInstructions

  return [
    `# ${MARKER_TEXT}`,
    `name = ${tomlString(input.name)}`,
    `description = ${tomlString(input.description)}`,
    `model = ${tomlString(input.model)}`,
    ...(input.reasoningEffort ? [`model_reasoning_effort = ${tomlString(input.reasoningEffort)}`] : []),
    ...(input.serviceTier ? [`service_tier = ${tomlString(input.serviceTier)}`] : []),
    "developer_instructions = \"\"\"",
    sanitizeTomlMultilineString(instructions),
    '"""',
    "",
  ].join("\n")
}

export function explainCodexPhase(config: RouterConfig, phase: BuiltInPhase) {
  const resolved = resolvePhase(config, phase)
  const codexEffort = getCodexEffortConfig(resolved.selection)

  return {
    phase,
    canonicalRoute: resolved.canonicalRoute,
    profileId: resolved.profileId,
    model: resolved.selection.model,
    variant: undefined,
    routeSource: resolved.routeSource,
    resolvedSource: resolved.resolvedSource,
    commandName: undefined,
    agentName: PHASE_TO_CODEX_AGENT[phase],
    reasoningEffort: codexEffort?.reasoningEffort,
    serviceTier: codexEffort?.serviceTier,
  }
}

export function explainAllCodex(config: RouterConfig) {
  return BUILT_IN_PHASES.map((phase) => explainCodexPhase(config, phase))
}

function buildCodexRuntimeAgentMetadataArtifact(
  agents: Map<string, { profile: string; profiles: string[]; codexFast: boolean }>,
): GeneratedArtifact {
  return {
    kind: "command",
    directory: CODEX_RUNTIME_AGENT_METADATA_DIRECTORY,
    fileName: CODEX_RUNTIME_AGENT_METADATA_FILE,
    ownerPrefix: CODEX_RUNTIME_AGENT_METADATA_OWNER_PREFIX,
    content: `${JSON.stringify({ agents: Object.fromEntries(agents) }, null, 2)}\n`,
  }
}

function buildCodexHooksMetadataArtifact(): GeneratedArtifact {
  return {
    kind: "command",
    directory: CODEX_HOOKS_METADATA_DIRECTORY,
    fileName: CODEX_HOOKS_METADATA_FILE,
    ownerPrefix: CODEX_HOOKS_METADATA_OWNER_PREFIX,
    content: JSON.stringify([
      { name: "chat.params", description: "Modifies chat parameters for Codex agents (service tier, lane)." },
      { name: "command.execute.before", description: "Runs before command execution in Codex." },
      { name: "tool.execute.before", description: "Runs before tool execution in Codex." },
    ], null, 2) + "\n",
  }
}

export function buildCodexArtifacts(
  config: RouterConfig,
  controlPlaneSettings?: CodexControlPlaneSettings,
) {
  const agents: GeneratedArtifact[] = []
  const commands: GeneratedArtifact[] = []
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

  if (config.workflow?.kind === "direct") {
    for (const [intent, intentConfig] of Object.entries(config.workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const codexEffort = getCodexEffortConfig(resolved.selection)
      const agentName = `rt-${intent}`
      const intentDescription = intentConfig.description
        ? `${intentConfig.label}: ${intentConfig.description}`
        : intentConfig.label

      registerRuntimeAgentMetadata(agentName, resolved.profileId, resolved.selection.codexFast)

      agents.push({
        kind: "agent",
        directory: ".codex/agents",
        fileName: `${agentName}.toml`,
        ownerPrefix: "rt-",
        content: renderCodexAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
          profileId: resolved.profileId,
          developerInstructions: [
            renderRouteOwnershipMetadata({
              host: "codex",
              source: resolved.sourceEntry.source,
              route: resolved.sourceEntry.canonicalRoute,
              projection: "agent",
              renderedName: agentName,
            }),
            `You are the ${agentName} direct-mode agent for the \`${intent}\` intent.`,
            `Handle requests that match this intent: ${intentDescription}.`,
            `Treat \`${resolved.sourceEntry.canonicalRoute}\` from the ${resolved.sourceEntry.source} workflow source as the routing contract for this agent.`,
            "Stay focused on this intent and do not switch to another workflow intent unless the user explicitly asks.",
          ].join("\n"),
          model: resolved.selection.model,
          reasoningEffort: codexEffort?.reasoningEffort,
          serviceTier: codexEffort?.serviceTier,
        }),
      })
    }

    commands.push(buildCodexRuntimeAgentMetadataArtifact(runtimeAgentMetadata))
    commands.push(buildCodexHooksMetadataArtifact())
    return { agents, commands }
  }

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const codexEffort = getCodexEffortConfig(resolved.selection)
    const agentName = PHASE_TO_CODEX_AGENT[phase]
    const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

    registerRuntimeAgentMetadata(agentName, resolved.profileId, resolved.selection.codexFast)

    agents.push({
      kind: "agent",
      directory: ".codex/agents",
      fileName: `${agentName}.toml`,
      ownerPrefix: "oms-",
      content: renderCodexAgentFile({
        name: agentName,
        description: `${phase} phase agent for oh-my-superagents`,
        profileId: resolved.profileId,
        developerInstructions: [
          renderRouteOwnershipMetadata({
            host: "codex",
            source: resolved.sourceEntry.source,
            route: resolved.sourceEntry.canonicalRoute,
            projection: "agent",
            renderedName: agentName,
          }),
          `You are the ${agentName} phase agent for oh-my-superagents.`,
          formatCodexWorkflowGuidance(resolved.sourceEntry, workflowEntryName),
          `If that ${resolved.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Codex and stop instead of improvising a replacement workflow.`,
          "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
          ...(phase === "subagent-driven-development" && laneExecutionUnits.length > 0
            ? [
                "",
                "## Lane Split Guidance",
                `If the task spans multiple lanes, ${renderLaneSplitGuidance({
                  mode: controlPlaneSettings?.subagentExecution.mode ?? "suggest",
                  units: laneExecutionUnits,
                }).replace(/^./, (value) => value.toLowerCase())}`,
              ]
            : []),
        ].join("\n"),
        model: resolved.selection.model,
        reasoningEffort: codexEffort?.reasoningEffort,
        serviceTier: codexEffort?.serviceTier,
      }),
    })

    if (phase !== "subagent-driven-development") {
      continue
    }

    for (const unit of laneExecutionUnits) {
      const laneResolved = resolvePhase(config, phase, { effectiveLane: unit.lane })
      const laneAgentName = `oms-execute-${unit.laneSlug}`
      const laneCodexEffort = getCodexEffortConfig(laneResolved.selection)
      const laneWorkflowEntryName = formatWorkflowEntryName(laneResolved.sourceEntry)

      registerRuntimeAgentMetadata(laneAgentName, laneResolved.profileId, laneResolved.selection.codexFast)

      agents.push({
        kind: "agent",
        directory: ".codex/agents",
        fileName: `${laneAgentName}.toml`,
        ownerPrefix: "oms-",
        content: renderCodexAgentFile({
          name: laneAgentName,
          description: `${laneAgentName} lane agent for ${phase} (lane: ${unit.lane})`,
          profileId: laneResolved.profileId,
          developerInstructions: [
            renderRouteOwnershipMetadata({
              host: "codex",
              source: laneResolved.sourceEntry.source,
              route: laneResolved.sourceEntry.canonicalRoute,
              projection: "agent",
              renderedName: laneAgentName,
            }),
            `You are the ${laneAgentName} lane agent for oh-my-superagents, handling lane: ${unit.lane}.`,
            formatCodexWorkflowGuidance(laneResolved.sourceEntry, laneWorkflowEntryName),
            `If that ${laneResolved.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Codex and stop instead of improvising a replacement workflow.`,
            `This agent is scoped to the "${unit.lane}" lane. Stay focused on this lane and do not switch to a different lane unless the user explicitly asks.`,
          ].join("\n"),
          model: laneResolved.selection.model,
          reasoningEffort: laneCodexEffort?.reasoningEffort,
          serviceTier: laneCodexEffort?.serviceTier,
        }),
      })
    }
  }

  commands.push(buildCodexRuntimeAgentMetadataArtifact(runtimeAgentMetadata))
  commands.push(buildCodexHooksMetadataArtifact())

  return { agents, commands }
}
