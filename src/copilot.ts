import { getHostProjectionDecision } from "./capabilities.js"
import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"
import { MARKER_TEXT } from "./opencode.js"
import { resolvePhase, type BuiltInPhase } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

const PHASE_TO_COPILOT_INSTRUCTION = {
  brainstorming: "copilot-brainstorm",
  "writing-plans": "copilot-plan",
  "subagent-driven-development": "copilot-execute",
  "requesting-code-review": "copilot-review",
  "verification-before-completion": "copilot-verify",
  "frontend-design": "copilot-visual",
  "webapp-testing": "copilot-web-test",
} as const satisfies Record<BuiltInPhase, string>

export type CopilotInstructionArtifact = {
  kind: "instruction"
  name: string
  filePath: string
  content: string
}

export type CopilotSettingsArtifact = {
  kind: "settings"
  filePath: string
  content: string
}

export type CopilotAgentManifestArtifact = {
  kind: "agent-manifest"
  filePath: string
  content: string
}

export type CopilotArtifacts = {
  instructions: CopilotInstructionArtifact[]
  settings: CopilotSettingsArtifact
  agentManifest: CopilotAgentManifestArtifact
}

export type RenderCopilotInstructionsInput = {
  name: string
  phase: BuiltInPhase
  profileId: string
  model: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName: string
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

export function renderCopilotInstructions(input: RenderCopilotInstructionsInput): string {
  return [
    `# ${MARKER_TEXT}`,
    "",
    `# Copilot Instructions: ${input.name}`,
    "",
    "## Purpose",
    `This Copilot instruction routes the \`${input.phase}\` phase through OMS profile \`${input.profileId}\`.`,
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
    `- phase: \`${input.phase}\``,
    `- route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- profile: \`${input.profileId}\``,
    `- model: \`${input.model}\``,
    "",
  ].join("\n")
}

export function renderCopilotSettings(config: RouterConfig): string {
  const settings = {
    oms: {
      version: "0.1.0",
      activePreset: config.settings?.activePreset ?? "default",
      enabled: config.settings?.enabled ?? true,
      commands: {
        status: "oms-status",
        use: "oms-use",
        disable: "oms-disable",
        sync: "oms-sync",
        doctor: "oms-doctor",
      },
    },
  }

  return JSON.stringify(settings, null, 2)
}

export function renderCopilotAgentManifest(config: RouterConfig): string {
  const capabilities = BUILT_IN_PHASES.map((phase) => ({
    phase,
    instruction: PHASE_TO_COPILOT_INSTRUCTION[phase],
    route: `phase.${phase.replace(/-/g, "")}`,
  }))

  const manifest = {
    name: "oms-agent",
    version: "0.1.0",
    host: "copilot",
    capabilities,
    presets: Object.keys(config.presets ?? {}),
    config: {
      activePreset: config.settings?.activePreset ?? "default",
      enabled: config.settings?.enabled ?? true,
    },
  }

  return JSON.stringify(manifest, null, 2)
}

export function buildCopilotArtifacts(config: RouterConfig): CopilotArtifacts {
  if (config.workflow?.kind === "direct") {
    const firstIntent = Object.keys(config.workflow.intents)[0] ?? "direct"
    const sourceEntry = {
      canonicalRoute: toDirectCanonicalRouteId(firstIntent),
      source: "direct",
    } as const

    assertCopilotProjectionSupport(config.workflow.kind, sourceEntry)

    throw new Error("Copilot direct workflow projection is not implemented")
  }

  const instructions = BUILT_IN_PHASES.map<CopilotInstructionArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const instructionName = PHASE_TO_COPILOT_INSTRUCTION[phase]

    assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)

    return {
      kind: "instruction",
      name: instructionName,
      filePath: `.github/copilot/instructions/${instructionName}.md`,
      content: renderCopilotInstructions({
        name: instructionName,
        phase,
        profileId: resolved.profileId,
        model: resolved.selection.model,
        sourceEntry: resolved.sourceEntry,
        workflowEntryName: formatWorkflowEntryName(resolved.sourceEntry),
      }),
    }
  })

  const settings: CopilotSettingsArtifact = {
    kind: "settings",
    filePath: ".github/copilot/settings.json",
    content: renderCopilotSettings(config),
  }

  const agentManifest: CopilotAgentManifestArtifact = {
    kind: "agent-manifest",
    filePath: ".github/copilot/oms-agent.json",
    content: renderCopilotAgentManifest(config),
  }

  return { instructions, settings, agentManifest }
}
