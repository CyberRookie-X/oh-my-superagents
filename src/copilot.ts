import { BUILT_IN_PHASES, SAFE_NAME_PATTERN, type RouterConfig } from "./config.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX, type GeneratedArtifact } from "./opencode.js"
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

const COPILOT_DEFAULT_TOOLS = ["bash", "edit", "view"] as const
const COPILOT_PLUGIN_NAME = "oh-my-superagents-copilot"
const COPILOT_PLUGIN_DIRECTORY = "plugins/oh-my-superagents-copilot"
const COPILOT_STANDALONE_AGENTS_DIRECTORY = ".github/agents"

export type CopilotAgentArtifact = GeneratedArtifact & { kind: "agent" }

export type CopilotSkillArtifact = {
  kind: "skill"
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

export type CopilotPluginManifestArtifact = {
  kind: "plugin-manifest"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type RenderCopilotAgentFileInput = {
  name: string
  description: string
  tools: readonly string[]
  developerInstructions: string
}

export type RenderCopilotSkillFileInput = {
  name: string
  description: string
  instructions: string
}

export type BuildCopilotArtifactsInput = {
  config: RouterConfig
  pluginVersion?: string
}

export type BuildCopilotArtifactsResult = {
  agents: CopilotAgentArtifact[]
  skills: CopilotSkillArtifact[]
  hooks?: CopilotHooksArtifact
  pluginManifest?: CopilotPluginManifestArtifact
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

function formatCopilotWorkflowGuidance(sourceEntry: WorkflowSourceEntry, workflowEntryName: string) {
  if (sourceEntry.source === "gstack") {
    return `Use the gstack workflow entry \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
  }

  return `Use the workflow entry \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
}

export function renderCopilotAgentFile(input: RenderCopilotAgentFileInput) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    `tools: ${JSON.stringify(input.tools)}`,
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    input.developerInstructions,
    "",
  ].join("\n")
}

export function renderCopilotSkillFile(input: RenderCopilotSkillFileInput) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    input.instructions,
    "",
  ].join("\n")
}

export function renderCopilotHooksFile() {
  return JSON.stringify(
    {
      version: 1,
      hooks: {
        sessionStart: [
          {
            type: "command",
            bash: "npx oh-my-superagents status --host copilot --json 2>/dev/null || echo '{}'",
            timeoutSec: 10,
          },
        ],
      },
    },
    null,
    2,
  )
}

export function renderCopilotPluginManifest(input: { pluginVersion?: string }) {
  return JSON.stringify(
    {
      name: COPILOT_PLUGIN_NAME,
      description: "OMS routing and control-plane support for GitHub Copilot CLI",
      version: input.pluginVersion ?? "0.1.0",
      author: { name: "oh-my-superagents" },
      license: "MIT",
      keywords: ["oms", "routing", "control-plane"],
      agents: "agents/",
      skills: ["skills/"],
      hooks: "hooks.json",
    },
    null,
    2,
  )
}

export function buildCopilotArtifacts(input: BuildCopilotArtifactsInput) {
  const { config } = input

  if (config.workflow?.kind === "direct") {
    const agents: CopilotAgentArtifact[] = []

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
        directory: COPILOT_STANDALONE_AGENTS_DIRECTORY,
        fileName: `${agentName}.agent.md`,
        ownerPrefix: "rt-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
          tools: COPILOT_DEFAULT_TOOLS,
          developerInstructions: [
            renderCopilotRouteMetadata({
              source: resolved.sourceEntry.source,
              route: resolved.sourceEntry.canonicalRoute,
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

    return { agents, skills: [] } as BuildCopilotArtifactsResult
  }

  const agents: CopilotAgentArtifact[] = []
  const skills: CopilotSkillArtifact[] = []

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_COPILOT_AGENT[phase]
    const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

    agents.push({
      kind: "agent",
      directory: COPILOT_STANDALONE_AGENTS_DIRECTORY,
      fileName: `${agentName}.agent.md`,
      ownerPrefix: "oms-",
      content: renderCopilotAgentFile({
        name: agentName,
        description: `${phase} phase agent for oh-my-superagents`,
        tools: COPILOT_DEFAULT_TOOLS,
        developerInstructions: [
          renderCopilotRouteMetadata({
            source: resolved.sourceEntry.source,
            route: resolved.sourceEntry.canonicalRoute,
            renderedName: agentName,
          }),
          `You are the ${agentName} phase agent for oh-my-superagents.`,
          formatCopilotWorkflowGuidance(resolved.sourceEntry, workflowEntryName),
          `If that ${resolved.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.`,
          "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
        ].join("\n"),
      }),
    })

    skills.push({
      kind: "skill",
      directory: `${COPILOT_PLUGIN_DIRECTORY}/skills/${agentName}`,
      fileName: "SKILL.md",
      ownerPrefix: "oms-",
      content: renderCopilotSkillFile({
        name: agentName,
        description: `${phase} phase skill for oh-my-superagents`,
        instructions: [
          renderCopilotRouteMetadata({
            source: resolved.sourceEntry.source,
            route: resolved.sourceEntry.canonicalRoute,
            renderedName: agentName,
          }),
          `Use the ${agentName} agent for the \`${phase}\` phase.`,
          formatCopilotWorkflowGuidance(resolved.sourceEntry, workflowEntryName),
          `If that ${resolved.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.`,
          "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
        ].join("\n"),
      }),
    })
  }

  const hooks: CopilotHooksArtifact = {
    kind: "hooks",
    directory: COPILOT_PLUGIN_DIRECTORY,
    fileName: "hooks.json",
    ownerPrefix: "oms-",
    content: renderCopilotHooksFile(),
  }

  const pluginManifest: CopilotPluginManifestArtifact = {
    kind: "plugin-manifest",
    directory: COPILOT_PLUGIN_DIRECTORY,
    fileName: "plugin.json",
    ownerPrefix: "oms-",
    content: renderCopilotPluginManifest({ pluginVersion: input.pluginVersion }),
  }

  return { agents, skills, hooks, pluginManifest }
}
