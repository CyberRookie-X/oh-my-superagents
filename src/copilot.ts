import { BUILT_IN_PHASES, SAFE_NAME_PATTERN, CONTROL_PLANE_COMMAND_KEYS, type RouterConfig, type ControlPlaneConfig } from "./config.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { MARKER_TEXT, renderRouteOwnershipMetadata, renderControlPlaneOwnershipMetadata, type GeneratedArtifact } from "./opencode.js"
import type { WorkflowSourceEntry, WorkflowSourceKind, CanonicalRouteId } from "./workflow-sources.js"

export const PHASE_TO_COPILOT_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

export const CONTROL_PLANE_TO_COPILOT_SKILL = {
  status: "oms-status",
  use: "oms-use",
  disable: "oms-disable",
  sync: "oms-sync",
  doctor: "oms-doctor",
} as const

const SKILL_FILE_NAME = "SKILL.md"
const AGENT_FILE_SUFFIX = ".agent.md"
const PLUGIN_ROOT = "plugins/oh-my-superagents-copilot"

function yamlScalar(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry): string {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function getRouteSourceEntry(
  sourceEntry: WorkflowSourceEntry | undefined,
  fallback: WorkflowSourceEntry,
): WorkflowSourceEntry {
  return sourceEntry ?? fallback
}

export function renderCopilotAgentFile(input: {
  name: string
  description: string
  model: string
  instructions: string
  sourceEntry: WorkflowSourceEntry
}): string {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: "phase.unknown" as CanonicalRouteId,
    source: "superpowers" as WorkflowSourceKind,
  })

  return [
    "---",
    `name: ${yamlScalar(input.name)}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${yamlScalar(input.model)}`,
    "tools:",
    "  - '*'",
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    renderRouteOwnershipMetadata({
      host: "copilot",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.name,
    }),
    "",
    "# Instructions",
    "",
    input.instructions,
    "",
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
  ].join("\n")
}

export function renderCopilotSkillFile(input: {
  name: string
  description: string
  model: string
  command: "status" | "use" | "disable" | "sync" | "doctor"
  host: "copilot"
}): string {
  return [
    "---",
    `name: ${yamlScalar(input.name)}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${yamlScalar(input.model)}`,
    "tools:",
    "  - bash",
    "  - read",
    "  - write",
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    renderControlPlaneOwnershipMetadata({
      host: "copilot",
      artifact: "skill",
      logicalCommand: input.command,
      renderedName: input.name,
    }),
    "",
    `Run \`oh-my-superagents ${input.command} --host ${input.host} $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

export function renderCopilotDisableHelperSkill(): string {
  return [
    "---",
    `name: ${yamlScalar("oms-no-superpowers")}`,
    `description: ${yamlScalar("Temporarily disable superpowers for this conversation")}`,
    `model: ${yamlScalar("gpt-4o")}`,
    "tools:",
    "  - bash",
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    "",
    "Tell the assistant:",
    "- do not use superpowers in this conversation",
    "- do not proactively load superpowers skills, workflows, or phase agents",
    "- only use superpowers again if I explicitly ask",
    "",
    "You can add extra freeform arguments via $ARGUMENTS.",
    "",
  ].join("\n")
}

export type CopilotPluginManifest = {
  name: string
  version: string
  description: string
  agents: string
  skills: string
  hooks: string
}

export type CopilotGeneratedArtifacts = {
  agents: GeneratedArtifact[]
  skills: GeneratedArtifact[]
  pluginManifest: CopilotPluginManifest
}

export function buildCopilotArtifacts(
  config: RouterConfig,
  controlPlaneSettings?: ControlPlaneConfig["settings"],
): CopilotGeneratedArtifacts {
  const agents: GeneratedArtifact[] = []
  const skills: GeneratedArtifact[] = []

  if (config.workflow?.kind === "direct") {
    for (const intent of Object.keys(config.workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const agentName = `rt-${intent}`

      agents.push({
        kind: "agent",
        directory: `${PLUGIN_ROOT}/agents`,
        fileName: `${agentName}${AGENT_FILE_SUFFIX}`,
        ownerPrefix: "rt-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
          model: resolved.selection.model,
          instructions: `Handle requests that match this intent: ${intent}. Use the forwarded router context arguments as the task context.`,
          sourceEntry: resolved.sourceEntry,
        }),
      })
    }
  } else {
    for (const phase of BUILT_IN_PHASES) {
      const resolved = resolvePhase(config, phase)
      const agentName = PHASE_TO_COPILOT_AGENT[phase]
      const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

      agents.push({
        kind: "agent",
        directory: `${PLUGIN_ROOT}/agents`,
        fileName: `${agentName}${AGENT_FILE_SUFFIX}`,
        ownerPrefix: "oms-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${phase} phase agent for oh-my-superagents`,
          model: resolved.selection.model,
          instructions: `Load and follow the upstream workflow entry \`${workflowEntryName}\` for \`${resolved.sourceEntry.canonicalRoute}\` exactly. If that workflow entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
          sourceEntry: resolved.sourceEntry,
        }),
      })
    }
  }

  if (controlPlaneSettings) {
    for (const commandKey of CONTROL_PLANE_COMMAND_KEYS) {
      const skillName = CONTROL_PLANE_TO_COPILOT_SKILL[commandKey]

      skills.push({
        kind: "agent",
        directory: `${PLUGIN_ROOT}/skills/${skillName}`,
        fileName: SKILL_FILE_NAME,
        ownerPrefix: "oms-",
        content: renderCopilotSkillFile({
          name: skillName,
          description: `OMS ${commandKey} command for Copilot CLI`,
          model: "gpt-4o",
          command: commandKey,
          host: "copilot",
        }),
      })
    }

    skills.push({
      kind: "agent",
      directory: `${PLUGIN_ROOT}/skills/oms-no-superpowers`,
      fileName: SKILL_FILE_NAME,
      ownerPrefix: "oms-no-",
      content: renderCopilotDisableHelperSkill(),
    })
  }

  const pluginManifest: CopilotPluginManifest = {
    name: "oh-my-superagents-copilot",
    version: "0.1.0",
    description: "OMS routing and control plane for GitHub Copilot CLI",
    agents: "agents",
    skills: "skills",
    hooks: "hooks.json",
  }

  return { agents, skills, pluginManifest }
}