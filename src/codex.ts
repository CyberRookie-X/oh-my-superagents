import { BUILT_IN_PHASES, SAFE_NAME_PATTERN, type RouterConfig } from "./config.js"
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

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry, fallbackEntryName: string) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? fallbackEntryName}`
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
  reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  serviceTier?: "fast"
}) {
  return [
    `# ${MARKER_TEXT}`,
    `name = ${tomlString(input.name)}`,
    `description = ${tomlString(input.description)}`,
    `model = ${tomlString(input.model)}`,
    ...(input.reasoningEffort ? [`model_reasoning_effort = ${tomlString(input.reasoningEffort)}`] : []),
    ...(input.serviceTier ? [`service_tier = ${tomlString(input.serviceTier)}`] : []),
    "developer_instructions = \"\"\"",
    sanitizeTomlMultilineString(input.developerInstructions),
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

export function buildCodexArtifacts(config: RouterConfig) {
  const agents: GeneratedArtifact[] = []

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

      agents.push({
        kind: "agent",
        directory: ".codex/agents",
        fileName: `${agentName}.toml`,
        ownerPrefix: "rt-",
        content: renderCodexAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
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

    return { agents }
  }

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const codexEffort = getCodexEffortConfig(resolved.selection)
    const agentName = PHASE_TO_CODEX_AGENT[phase]
    const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry, PHASE_TO_SKILL[phase])

    agents.push({
      kind: "agent",
      directory: ".codex/agents",
      fileName: `${agentName}.toml`,
      ownerPrefix: "oms-",
      content: renderCodexAgentFile({
        name: agentName,
        description: `${phase} phase agent for oh-my-superagents`,
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
        ].join("\n"),
        model: resolved.selection.model,
        reasoningEffort: codexEffort?.reasoningEffort,
        serviceTier: codexEffort?.serviceTier,
      }),
    })
  }

  return { agents }
}
