import { getHostProjectionDecision } from "./capabilities.js"
import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, type BuiltInPhase } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

const PHASE_TO_COPILOT_AGENT = {
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

export type CopilotSkillArtifact = {
  kind: "skill"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotPluginArtifact = {
  kind: "plugin"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotHooksArtifact = {
  kind: "hooks"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type RenderCopilotAgentFileInput = {
  agentName: string
  description: string
  model: string
  sourceEntry?: WorkflowSourceEntry
  workflowEntryName?: string
}

export type RenderCopilotSkillFileInput = {
  skillName: string
  description: string
  model: string
  phase: BuiltInPhase
  profileId: string
  sourceEntry: WorkflowSourceEntry
}

function renderCopilotRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${input.source}; route=${input.route}; projection=agent; rendered-name=${input.renderedName} -->`
}

function renderCopilotSkillRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${input.source}; route=${input.route}; projection=skill; rendered-name=${input.renderedName} -->`
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
  const sourceEntry = input.sourceEntry ?? {
    canonicalRoute: "phase.brainstorm",
    source: "superpowers",
  } as WorkflowSourceEntry

  const workflowEntryName = input.workflowEntryName ?? formatWorkflowEntryName(sourceEntry)

  return [
    `# ${MARKER_TEXT}`,
    renderCopilotRouteMetadata({
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      renderedName: input.agentName,
    }),
    "",
    `# Agent: ${input.agentName}`,
    "",
    "## Purpose",
    `This agent routes workflow tasks through OMS.`,
    "",
    "## Instructions",
    formatCopilotWorkflowGuidance({
      sourceEntry,
      workflowEntryName,
    }),
    `If that ${sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.`,
    "",
    "## Route Metadata",
    `- canonical route: \`${sourceEntry.canonicalRoute}\``,
    `- source: \`${sourceEntry.source}\``,
    `- model: \`${input.model}\``,
    "",
  ].join("\n")
}

export function renderCopilotSkillFile(input: RenderCopilotSkillFileInput) {
  return [
    `# ${MARKER_TEXT}`,
    renderCopilotSkillRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      renderedName: input.skillName,
    }),
    "",
    `# Skill: ${input.skillName}`,
    "",
    "## Purpose",
    `This skill routes the \`${input.phase}\` phase through OMS profile \`${input.profileId}\`.`,
    "",
    "## Instructions",
    formatCopilotWorkflowGuidance({
      sourceEntry: input.sourceEntry,
      workflowEntryName: formatWorkflowEntryName(input.sourceEntry),
    }),
    `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.`,
    "Stay focused on the current phase and do not switch to a different phase unless the user explicitly asks.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- profile: \`${input.profileId}\``,
    `- model: \`${input.model}\``,
    "",
  ].join("\n")
}

export function renderCopilotPluginManifest(): string {
  const manifest = {
    name: "oh-my-superagents",
    description: "AI coding assistant routing and control plane for Copilot CLI",
    version: "1.0.0",
    license: "MIT",
    agents: "agents/",
    skills: ["skills/"],
    commands: "commands/",
    hooks: "hooks.json",
  }

  return JSON.stringify(manifest, null, 2)
}

export function renderCopilotHooksConfig(): string {
  const hooks = {
    version: 1,
    hooks: {
      sessionStart: [
        {
          type: "command",
          bash: "oh-my-superagents status --host=copilot",
          timeoutSec: 10,
        },
      ],
    },
  }

  return JSON.stringify(hooks, null, 2)
}

export function buildCopilotArtifacts(config: RouterConfig) {
  if (config.workflow?.kind === "direct") {
    const firstIntent = Object.keys(config.workflow.intents)[0] ?? "direct"
    const sourceEntry = {
      canonicalRoute: toDirectCanonicalRouteId(firstIntent),
      source: "direct",
    } as const

    assertCopilotProjectionSupport(config.workflow.kind, sourceEntry)

    throw new Error("Copilot direct workflow projection is not implemented")
  }

  const agents: CopilotAgentArtifact[] = BUILT_IN_PHASES.map<CopilotAgentArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_COPILOT_AGENT[phase]

    assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)

    return {
      kind: "agent",
      directory: `.github/copilot/agents`,
      fileName: `${agentName}.md`,
      ownerPrefix: "oms-",
      content: renderCopilotAgentFile({
        agentName,
        description: `Copilot wrapper agent for the ${phase} phase`,
        model: resolved.selection.model,
        sourceEntry: resolved.sourceEntry,
        workflowEntryName: formatWorkflowEntryName(resolved.sourceEntry),
      }),
    }
  })

  const skills: CopilotSkillArtifact[] = BUILT_IN_PHASES.map<CopilotSkillArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const skillName = PHASE_TO_COPILOT_AGENT[phase]

    assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)

    return {
      kind: "skill",
      directory: `.github/copilot/skills/${skillName}`,
      fileName: "SKILL.md",
      ownerPrefix: "oms-",
      content: renderCopilotSkillFile({
        skillName,
        description: `Copilot skill for the ${phase} phase`,
        model: resolved.selection.model,
        phase,
        profileId: resolved.profileId,
        sourceEntry: resolved.sourceEntry,
      }),
    }
  })

  const plugin: CopilotPluginArtifact = {
    kind: "plugin",
    directory: `.github/copilot`,
    fileName: "plugin.json",
    ownerPrefix: "oms-",
    content: renderCopilotPluginManifest(),
  }

  const hooks: CopilotHooksArtifact = {
    kind: "hooks",
    directory: `.github/copilot`,
    fileName: "hooks.json",
    ownerPrefix: "oms-",
    content: renderCopilotHooksConfig(),
  }

  return { agents, skills, plugin, hooks }
}
