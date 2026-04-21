import { getHostProjectionDecision } from "./capabilities.js"
import {
  BUILT_IN_PHASES,
  CONTROL_PLANE_COMMAND_KEYS,
  SAFE_NAME_PATTERN,
  type ControlPlaneCommandKey,
  type RouterConfig,
} from "./config.js"
import {
  MARKER,
  MARKER_TEXT,
  renderControlPlaneOwnershipMetadata,
  renderRouteOwnershipMetadata,
  type GeneratedArtifact,
} from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
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

const PHASE_TO_SKILL = {
  brainstorming: "brainstorming",
  "writing-plans": "writing-plans",
  "subagent-driven-development": "subagent-driven-development",
  "requesting-code-review": "requesting-code-review",
  "verification-before-completion": "verification-before-completion",
  "frontend-design": "frontend-design",
  "webapp-testing": "webapp-testing",
} as const satisfies Record<BuiltInPhase, string>

const CONTROL_PLANE_SKILL_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot CLI.",
  use: "Switch OMS to the selected preset for Copilot CLI.",
  disable: "Disable OMS for Copilot CLI.",
  sync: "Sync OMS artifacts for Copilot CLI.",
  doctor: "Inspect OMS diagnostics for Copilot CLI.",
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

function assertCopilotProjectionSupport(
  workflowKind: RouterConfig["workflow"]["kind"],
  sourceEntry: WorkflowSourceEntry,
) {
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
  instructions: string
}) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    "tools:",
    "  - bash",
    "  - edit",
    "  - read",
    "  - glob",
    "  - grep",
    "---",
    "",
    MARKER,
    input.instructions,
    "",
  ].join("\n")
}

export function renderCopilotPluginJson(input: { version: string }) {
  return JSON.stringify(
    {
      name: "oh-my-superagents-copilot",
      description: "oh-my-superagents integration for Copilot CLI",
      version: input.version,
      agents: "agents/",
      skills: ["skills/"],
      hooks: "hooks.json",
    },
    null,
    2,
  ) + "\n"
}

export function renderCopilotHooksJson() {
  return JSON.stringify(
    {
      sessionStart: [
        {
          command: "oh-my-superagents",
          args: ["status", "--host", "copilot"],
        },
      ],
      preToolUse: [
        {
          command: "oh-my-superagents",
          args: ["sync", "--host", "copilot"],
        },
      ],
    },
    null,
    2,
  ) + "\n"
}

export function renderCopilotSkillFile(input: {
  name: string
  description: string
  logicalCommand: ControlPlaneCommandKey
}) {
  return [
    `# ${MARKER_TEXT}`,
    renderControlPlaneOwnershipMetadata({
      host: "copilot",
      artifact: "skill",
      logicalCommand: input.logicalCommand,
      renderedName: input.name,
    }),
    "",
    `# Skill: ${input.name}`,
    "",
    "## Purpose",
    input.description,
    "",
    "## Instructions",
    `Run \`oh-my-superagents ${input.logicalCommand} --host copilot\` from the repository root.`,
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
    agentName: PHASE_TO_COPILOT_AGENT[phase],
  }
}

export function explainAllCopilot(config: RouterConfig) {
  return BUILT_IN_PHASES.map((phase) => explainCopilotPhase(config, phase))
}

export function buildCopilotArtifacts(config: RouterConfig) {
  const agents: GeneratedArtifact[] = []
  const skills: GeneratedArtifact[] = []

  if (config.workflow?.kind === "direct") {
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
          instructions: [
            renderRouteOwnershipMetadata({
              host: "copilot",
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
        }),
      })
    }

    return { agents, skills }
  }

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_COPILOT_AGENT[phase]
    const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

    assertCopilotProjectionSupport(config.workflow?.kind ?? "superpowers", resolved.sourceEntry)

    agents.push({
      kind: "agent",
      directory: ".copilot/agents",
      fileName: `${agentName}.agent.md`,
      ownerPrefix: "oms-",
      content: renderCopilotAgentFile({
        name: agentName,
        description: `${phase} phase agent for oh-my-superagents`,
        instructions: [
          renderRouteOwnershipMetadata({
            host: "copilot",
            source: resolved.sourceEntry.source,
            route: resolved.sourceEntry.canonicalRoute,
            projection: "agent",
            renderedName: agentName,
          }),
          `You are the ${agentName} phase agent for oh-my-superagents.`,
          formatCopilotWorkflowGuidance(resolved.sourceEntry, workflowEntryName),
          `If that ${resolved.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
          "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
        ].join("\n"),
      }),
    })
  }

  for (const commandKey of CONTROL_PLANE_COMMAND_KEYS) {
    const skillName = `oms-${commandKey}`

    skills.push({
      kind: "command",
      directory: ".copilot/skills",
      fileName: `${skillName}.md`,
      ownerPrefix: "oms-",
      content: renderCopilotSkillFile({
        name: skillName,
        description: CONTROL_PLANE_SKILL_DESCRIPTIONS[commandKey],
        logicalCommand: commandKey,
      }),
    })
  }

  return { agents, skills }
}
