import { getHostProjectionDecision } from "./capabilities.js"
import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, type BuiltInPhase } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

export const PHASE_TO_COPILOT_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

export type CopilotAgentArtifact = {
  kind: "agent"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type RenderCopilotAgentFileInput = {
  name: string
  phase: BuiltInPhase
  profileId: string
  model: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName: string
}

function renderCopilotRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${input.source}; route=${input.route}; projection=agent; rendered-name=${input.renderedName} -->`
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function formatCopilotWorkflowGuidance(input: { sourceEntry: WorkflowSourceEntry; workflowEntryName: string }) {
  if (input.sourceEntry.source === "gstack") {
    return `Use the gstack workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`
  }
  return `Use the workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`
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

export function renderCopilotAgentFile(input: RenderCopilotAgentFileInput) {
  return [
    `# ${MARKER_TEXT}`,
    renderCopilotRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      renderedName: input.name,
    }),
    "",
    `# Agent: ${input.name}`,
    "",
    "## Description",
    `Routes the \`${input.phase}\` phase through OMS profile \`${input.profileId}\`.`,
    "",
    "## Instructions",
    formatCopilotWorkflowGuidance({
      sourceEntry: input.sourceEntry,
      workflowEntryName: input.workflowEntryName,
    }),
    `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.`,
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- profile: \`${input.profileId}\``,
    `- model: \`${input.model}\``,
    "",
  ].join("\n")
}

export function buildCopilotArtifacts(config: RouterConfig) {
  if (config.workflow?.kind === "direct") {
    const firstIntent = Object.keys(config.workflow.intents)[0] ?? "direct"
    const sourceEntry = {
      canonicalRoute: toDirectCanonicalRouteId(firstIntent),
      source: "direct",
    } as const
    throw new Error("Copilot direct workflow projection is not implemented")
  }

  const agents = BUILT_IN_PHASES.map<CopilotAgentArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_COPILOT_AGENT[phase]
    assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)
    return {
      kind: "agent",
      directory: `.github/agents/${agentName}`,
      fileName: `${agentName}.agent.md`,
      ownerPrefix: "oms-",
      content: renderCopilotAgentFile({
        name: agentName,
        phase,
        profileId: resolved.profileId,
        model: resolved.selection.model,
        sourceEntry: resolved.sourceEntry,
        workflowEntryName: formatWorkflowEntryName(resolved.sourceEntry),
      }),
    }
  })
  return { agents }
}
