import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"
import { resolvePhase, type BuiltInPhase } from "./router.js"
import { MARKER_TEXT, type GeneratedArtifact } from "./opencode.js"

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
    input.developerInstructions,
    '"""',
    "",
  ].join("\n")
}

export function explainCodexPhase(config: RouterConfig, phase: BuiltInPhase) {
  const resolved = resolvePhase(config, phase)
  const codexEffort = getCodexEffortConfig(resolved.selection)

  return {
    phase,
    profileId: resolved.profileId,
    model: resolved.selection.model,
    variant: undefined,
    routeSource: resolved.routeSource,
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

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const codexEffort = getCodexEffortConfig(resolved.selection)
    const agentName = PHASE_TO_CODEX_AGENT[phase]
    const skillName = PHASE_TO_SKILL[phase]

    agents.push({
      kind: "agent",
      directory: ".codex/agents",
      fileName: `${agentName}.toml`,
      ownerPrefix: "oms-",
      content: renderCodexAgentFile({
        name: agentName,
        description: `${phase} phase agent for oh-my-superagents`,
        developerInstructions: [
          `You are the ${agentName} phase agent for oh-my-superagents.`,
          `Use the superpowers skill \`${skillName}\` as the workflow source for this task whenever it is relevant.`,
          `If the skill is unavailable, say that superpowers is not installed for Codex and stop instead of improvising a replacement workflow.`,
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
