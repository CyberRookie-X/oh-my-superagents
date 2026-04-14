import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, type BuiltInPhase } from "./router.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

const PHASE_TO_CLAUDE_SKILL = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

export type ClaudeSkillArtifact = {
  kind: "skill"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type RenderClaudeSkillFileInput = {
  name: string
  phase: BuiltInPhase
  profileId: string
  model: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName: string
}

function renderClaudeRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=claude; source=${input.source}; route=${input.route}; projection=skill; rendered-name=${input.renderedName} -->`
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry, fallbackEntryName: string) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? fallbackEntryName}`
}

function formatClaudeWorkflowGuidance(input: { sourceEntry: WorkflowSourceEntry; workflowEntryName: string }) {
  if (input.sourceEntry.source === "gstack") {
    return `Use the gstack workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`
  }

  return `Use the workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`
}

export function renderClaudeSkillFile(input: RenderClaudeSkillFileInput) {
  return [
    `# ${MARKER_TEXT}`,
    renderClaudeRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      renderedName: input.name,
    }),
    "",
    `# Skill: ${input.name}`,
    "",
    "## Purpose",
    `This project-scoped Claude wrapper routes the \`${input.phase}\` phase through OMS profile \`${input.profileId}\`.`,
    "",
    "## Instructions",
    formatClaudeWorkflowGuidance({
      sourceEntry: input.sourceEntry,
      workflowEntryName: input.workflowEntryName,
    }),
    `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Claude and stop instead of improvising a replacement workflow.`,
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

export function buildClaudeArtifacts(config: RouterConfig) {
  if (config.workflow?.kind === "direct") {
    throw new Error("Claude direct workflow projection is not supported yet")
  }

  const skills = BUILT_IN_PHASES.map<ClaudeSkillArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const skillName = PHASE_TO_CLAUDE_SKILL[phase]

    return {
      kind: "skill",
      directory: `.claude/skills/${skillName}`,
      fileName: "SKILL.md",
      ownerPrefix: "oms-",
      content: renderClaudeSkillFile({
        name: skillName,
        phase,
        profileId: resolved.profileId,
        model: resolved.selection.model,
        sourceEntry: resolved.sourceEntry,
        workflowEntryName: formatWorkflowEntryName(resolved.sourceEntry, phase),
      }),
    }
  })

  return { skills }
}
