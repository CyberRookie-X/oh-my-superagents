import { getHostProjectionDecision } from "./capabilities.js"
import { BUILT_IN_PHASES, SAFE_NAME_PATTERN, type RouterConfig } from "./config.js"
import { MARKER_TEXT, renderRouteOwnershipMetadata, type GeneratedArtifact } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"

const PHASE_TO_COPILOT_AGENT = {
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

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function formatCopilotWorkflowGuidance(sourceEntry: WorkflowSourceEntry, workflowEntryName: string) {
  if (sourceEntry.source === "gstack") {
    return `Use the gstack developer instructions from \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
  }

  return `Use the workflow entry \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
}

function yamlFrontmatterScalar(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function renderCopilotRouteMetadata(input: {
  host: "copilot"
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  projection: "agent" | "skill"
  renderedName: string
}) {
  return `<!-- oms-route: stage=1; host=${input.host}; source=${input.source}; route=${input.route}; projection=${input.projection}; rendered-name=${input.renderedName} -->`
}

function renderCopilotControlPlaneMetadata(input: {
  host: "copilot"
  artifact: "skill"
  logicalCommand: string
  renderedName: string
}) {
  return `<!-- oms-control-plane: stage=1; host=${input.host}; artifact=${input.artifact}; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

function assertCopilotProjectionSupport(workflowKind: RouterConfig["workflow"]["kind"], sourceEntry: WorkflowSourceEntry) {
  const decision = getHostProjectionDecision({
    host: "copilot",
    workflowKind,
    sourceEntry,
  })

  if (decision.supported) {
    return
  }

  throw new Error(
    `Copilot projection blocked by capability policy (${decision.reasonCode}) for ${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`,
  )
}

export function renderCopilotAgentFile(input: {
  name: string
  description: string
  model: string
  tools: string[]
  developerInstructions: string
}) {
  return [
    "---",
    `name: ${yamlFrontmatterScalar(input.name)}`,
    `description: ${yamlFrontmatterScalar(input.description)}`,
    "tools:",
    "  use:",
    ...input.tools.map((tool) => `    - ${tool}`),
    "---",
    "",
    input.developerInstructions,
    "",
  ].join("\n")
}

export function renderCopilotSkillFile(input: {
  name: string
  description: string
  logicalCommand: string
}) {
  return [
    "---",
    `name: ${yamlFrontmatterScalar(input.name)}`,
    `description: ${yamlFrontmatterScalar(input.description)}`,
    "---",
    "",
    renderCopilotControlPlaneMetadata({
      host: "copilot",
      artifact: "skill",
      logicalCommand: input.logicalCommand,
      renderedName: input.name,
    }),
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host copilot $ARGUMENTS\` from the repository root.`,
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

export function buildCopilotArtifacts(config: RouterConfig) {
  const agents: CopilotAgentArtifact[] = []
  const skills: CopilotSkillArtifact[] = []

  if (config.workflow?.kind === "direct") {
    const firstIntent = Object.keys(config.workflow.intents)[0] ?? "direct"
    const sourceEntry = {
      canonicalRoute: toDirectCanonicalRouteId(firstIntent),
      source: "direct",
    } as const

    assertCopilotProjectionSupport(config.workflow.kind, sourceEntry)

    for (const [intent, intentConfig] of Object.entries(config.workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const agentName = `rt-${intent}`
      const intentDescription = intentConfig.description
        ? `${intentConfig.label}: ${intentConfig.description}`
        : intentConfig.label

      agents.push({
        kind: "agent",
        directory: ".copilot/agents",
        fileName: `${agentName}.agent.md`,
        ownerPrefix: "rt-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
          model: resolved.selection.model,
          tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
          developerInstructions: [
            renderRouteOwnershipMetadata({
              host: "copilot",
              source: resolved.sourceEntry.source,
              route: resolved.sourceEntry.canonicalRoute,
              projection: "agent",
              renderedName: agentName,
            }),
            "",
            `You are the ${agentName} direct-mode agent for the \`${intent}\` intent.`,
            `Handle requests that match this intent: ${intentDescription}.`,
            `Treat \`${resolved.sourceEntry.canonicalRoute}\` from the ${resolved.sourceEntry.source} workflow source as the routing contract for this agent.`,
            "Stay focused on this intent and do not switch to another workflow intent unless the user explicitly asks.",
          ].join("\n"),
        }),
      })
    }

    return { agents, skills }
  }

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_COPILOT_AGENT[phase]
    const skillName = PHASE_TO_SKILL[phase]
    const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

    assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)

    agents.push({
      kind: "agent",
      directory: ".copilot/agents",
      fileName: `${agentName}.agent.md`,
      ownerPrefix: "oms-",
      content: renderCopilotAgentFile({
        name: agentName,
        description: `OMS ${phase} phase agent`,
        model: resolved.selection.model,
        tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        developerInstructions: [
          `You are the ${agentName} phase agent for oh-my-superagents.`,
          formatCopilotWorkflowGuidance(resolved.sourceEntry, workflowEntryName),
          `If that ${resolved.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
          "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
          "",
          renderCopilotRouteMetadata({
            host: "copilot",
            source: resolved.sourceEntry.source,
            route: resolved.sourceEntry.canonicalRoute,
            projection: "agent",
            renderedName: agentName,
          }),
        ].join("\n"),
      }),
    })

    skills.push({
      kind: "skill",
      directory: `plugins/oh-my-superagents-copilot/skills/${skillName}`,
      fileName: "SKILL.md",
      ownerPrefix: "oms-",
      content: renderCopilotSkillFile({
        name: skillName,
        description: `OMS ${phase} phase skill for Copilot CLI`,
        logicalCommand: `phase-${phase}`,
      }),
    })
  }

  return { agents, skills }
}
