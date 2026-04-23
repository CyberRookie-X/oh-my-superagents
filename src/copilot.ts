import { BUILT_IN_PHASES, CONTROL_PLANE_COMMAND_KEYS, SAFE_NAME_PATTERN, type ControlPlaneCommandKey, type RouterConfig } from "./config.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX, CONTROL_PLANE_MARKER_PREFIX, type GeneratedArtifact } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import { toSuperpowersCanonicalRouteId } from "./workflow-superpowers.js"
import type { WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

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

const PHASE_TOOLS: Record<BuiltInPhase, string[]> = {
  brainstorming: ["bash", "view", "glob", "rg"],
  "writing-plans": ["bash", "view", "glob", "rg"],
  "subagent-driven-development": ["bash", "view", "edit", "glob", "rg", "task"],
  "requesting-code-review": ["bash", "view", "glob", "rg"],
  "verification-before-completion": ["bash", "view", "glob", "rg"],
  "frontend-design": ["bash", "view", "edit", "glob", "rg"],
  "webapp-testing": ["bash", "view", "edit", "glob", "rg"],
}

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot CLI.",
  use: "Switch OMS to the selected preset for Copilot CLI.",
  disable: "Disable OMS for Copilot CLI.",
  sync: "Sync OMS artifacts for Copilot CLI.",
  doctor: "Inspect OMS diagnostics for Copilot CLI.",
}

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

export type CopilotCommandArtifact = {
  kind: "command"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

function yamlScalar(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function renderCopilotRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  projection: "agent" | "skill"
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=3; host=copilot; source=${input.source}; route=${input.route}; projection=${input.projection}; rendered-name=${input.renderedName} -->`
}

function renderCopilotControlPlaneMetadata(input: {
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=3; host=copilot; artifact=command; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function formatTools(tools: string[]) {
  return `[${tools.map((t) => `"${t}"`).join(", ")}]`
}

export type RenderCopilotAgentInput = {
  name: string
  description: string
  model: string
  variant?: string
  temperature?: number
  phase?: BuiltInPhase
  intent?: string
  profileId?: string
  effectiveLane?: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName?: string
}

export function renderCopilotAgentFile(input: RenderCopilotAgentInput): string {
  const tools = input.phase ? PHASE_TOOLS[input.phase] : ["bash", "view", "edit", "glob", "rg", "task"]
  const frontMatter = [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `tools: ${formatTools(tools)}`,
    ...(input.variant ? [`variant: ${yamlScalar(input.variant)}`] : []),
    ...(input.temperature !== undefined ? [`temperature: ${input.temperature}`] : []),
    "---",
  ].join("\n")

  const body = [
    `<!-- ${MARKER_TEXT} -->`,
    renderCopilotRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.name,
    }),
    "",
    `You are the ${input.name} agent.`,
  ]

  if (input.workflowEntryName) {
    body.push(
      `Load and follow the upstream workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`,
      `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
    )
  } else if (input.intent) {
    body.push(
      `Handle requests that match the \`${input.intent}\` intent.`,
      "Follow the requested intent directly without any upstream skill handoff.",
    )
  }

  body.push(
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
  )

  if (input.profileId) {
    body.push(`- profile: \`${input.profileId}\``)
  }
  body.push(`- model: \`${input.model}\``)

  if (input.effectiveLane) {
    body.push(`- lane: ${input.effectiveLane}`)
  }

  body.push("")

  return [frontMatter, ...body].join("\n")
}

export type RenderCopilotSkillInput = {
  name: string
  phase?: BuiltInPhase
  intent?: string
  profileId: string
  model: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName?: string
}

export function renderCopilotSkillFile(input: RenderCopilotSkillInput): string {
  const lines = [
    `# ${MARKER_TEXT}`,
    renderCopilotRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      projection: "skill",
      renderedName: input.name,
    }),
    "",
    `# Skill: ${input.name}`,
    "",
    "## Purpose",
    `This project-scoped Copilot CLI wrapper routes the \`${input.phase ?? input.intent}\` ${input.phase ? "phase" : "intent"} through OMS profile \`${input.profileId}\`.`,
    "",
    "## Instructions",
  ]

  if (input.workflowEntryName) {
    lines.push(
      `Use the workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`,
      `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
    )
  } else {
    lines.push(
      "Follow the requested intent directly without any upstream skill handoff.",
    )
  }

  lines.push(
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- profile: \`${input.profileId}\``,
    `- model: \`${input.model}\``,
    "",
  )

  return lines.join("\n")
}

export function buildCopilotPluginManifest(): string {
  return JSON.stringify(
    {
      name: "oh-my-superagents",
      description: "OMS routing and control-plane for Copilot CLI",
      version: "0.1.0",
      author: {
        name: "oh-my-superagents contributors",
      },
      license: "MIT",
      keywords: ["routing", "superpowers", "workflow", "agent"],
      category: "development",
      agents: "agents/",
      skills: "skills/",
      hooks: "hooks.json",
    },
    null,
    2,
  ) + "\n"
}

export type CopilotHooksOptions = {
  enableSessionStart?: boolean
  enablePostToolUse?: boolean
}

export function buildCopilotHooksConfig(options: CopilotHooksOptions = {}): string {
  const hooks: Record<string, unknown[]> = {
    sessionStart: [],
    postToolUse: [],
  }

  if (options.enableSessionStart !== false) {
    hooks.sessionStart.push({
      type: "command",
      bash: "npx oh-my-superagents sync --host copilot --quiet",
      timeoutSec: 15,
    })
  }

  if (options.enablePostToolUse) {
    hooks.postToolUse.push({
      type: "command",
      bash: "npx oh-my-superagents status --host copilot --quiet 2>/dev/null || true",
      timeoutSec: 5,
    })
  }

  return JSON.stringify({ version: 1, hooks }, null, 2) + "\n"
}

function renderCopilotControlPlaneCommandFile(input: {
  description: string
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return [
    "---",
    `name: ${yamlScalar(input.renderedName)}`,
    `description: ${yamlScalar(input.description)}`,
    'tools: ["bash"]',
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    renderCopilotControlPlaneMetadata({
      logicalCommand: input.logicalCommand,
      renderedName: input.renderedName,
    }),
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host copilot\` from the repository root.`,
    "",
  ].join("\n")
}

function buildControlPlaneCommandArtifacts(): CopilotCommandArtifact[] {
  return CONTROL_PLANE_COMMAND_KEYS.map((commandKey) => {
    const renderedName = `oms-${commandKey}`
    return {
      kind: "command" as const,
      directory: ".copilot-plugin/agents",
      fileName: `${renderedName}.agent.md`,
      ownerPrefix: "oms-",
      content: renderCopilotControlPlaneCommandFile({
        description: CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
        logicalCommand: commandKey,
        renderedName,
      }),
    }
  })
}

export type BuildCopilotArtifactsResult = {
  agents: CopilotAgentArtifact[]
  skills: CopilotSkillArtifact[]
  commands: CopilotCommandArtifact[]
  pluginManifest: string
  hooksConfig: string
}

export function buildCopilotArtifacts(config: RouterConfig): BuildCopilotArtifactsResult {
  const agents: CopilotAgentArtifact[] = []
  const skills: CopilotSkillArtifact[] = []
  const workflow = config.workflow

  if (workflow?.kind === "direct") {
    for (const [intent, intentConfig] of Object.entries(workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const agentName = `rt-${intent}`

      agents.push({
        kind: "agent",
        directory: ".copilot-plugin/agents",
        fileName: `${agentName}.agent.md`,
        ownerPrefix: "rt-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
          model: resolved.selection.model,
          intent,
          sourceEntry: resolved.sourceEntry,
        }),
      })

      skills.push({
        kind: "skill",
        directory: `.copilot-plugin/skills/${agentName}`,
        fileName: "SKILL.md",
        ownerPrefix: "rt-",
        content: renderCopilotSkillFile({
          name: agentName,
          intent,
          profileId: resolved.profileId,
          model: resolved.selection.model,
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
        directory: ".copilot-plugin/agents",
        fileName: `${agentName}.agent.md`,
        ownerPrefix: "oms-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} phase agent for oh-my-superagents`,
          model: resolved.selection.model,
          variant: resolved.selection.variant,
          temperature: resolved.selection.temperature,
          phase,
          profileId: resolved.profileId,
          sourceEntry: resolved.sourceEntry,
          workflowEntryName,
        }),
      })

      skills.push({
        kind: "skill",
        directory: `.copilot-plugin/skills/${agentName}`,
        fileName: "SKILL.md",
        ownerPrefix: "oms-",
        content: renderCopilotSkillFile({
          name: agentName,
          phase,
          profileId: resolved.profileId,
          model: resolved.selection.model,
          sourceEntry: resolved.sourceEntry,
          workflowEntryName,
        }),
      })
    }
  }

  const commands = buildControlPlaneCommandArtifacts()

  return {
    agents,
    skills,
    commands,
    pluginManifest: buildCopilotPluginManifest(),
    hooksConfig: buildCopilotHooksConfig({ enableSessionStart: true }),
  }
}
