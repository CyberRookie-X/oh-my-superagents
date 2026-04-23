import {
  BUILT_IN_PHASES,
  CONTROL_PLANE_COMMAND_KEYS,
  type ControlPlaneCommandKey,
  type RouterConfig,
} from "./config.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, type BuiltInPhase } from "./router.js"
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

export type CopilotHookArtifact = {
  kind: "hook"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
  executable: boolean
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
    "## Purpose",
    `This project-scoped Copilot wrapper routes the \`${input.phase}\` phase through OMS profile \`${input.profileId}\`.`,
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

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot CLI.",
  use: "Switch OMS to the selected preset for Copilot CLI.",
  disable: "Disable OMS for Copilot CLI.",
  sync: "Sync OMS artifacts for Copilot CLI.",
  doctor: "Inspect OMS diagnostics for Copilot CLI.",
}

function renderCopilotControlPlaneMetadata(input: {
  host: "copilot"
  artifact: "skill"
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return `<!-- oms-control-plane: stage=1; host=${input.host}; artifact=${input.artifact}; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

export function renderCopilotSkillFile(input: {
  name: string
  command: ControlPlaneCommandKey
}) {
  return [
    `# ${MARKER_TEXT}`,
    renderCopilotControlPlaneMetadata({
      host: "copilot",
      artifact: "skill",
      logicalCommand: input.command,
      renderedName: input.name,
    }),
    "",
    `# Skill: ${input.name}`,
    "",
    "## Purpose",
    CONTROL_PLANE_COMMAND_DESCRIPTIONS[input.command],
    "",
    "## Instructions",
    `Run \`oh-my-superagents ${input.command} --host copilot\` and present the results.`,
    "",
  ].join("\n")
}

function renderCopilotHookMetadata(input: {
  host: "copilot"
  hook: "pre-command" | "post-command"
  renderedName: string
}) {
  return `<!-- oms-hook: stage=1; host=${input.host}; hook=${input.hook}; rendered-name=${input.renderedName} -->`
}

export function renderCopilotPreCommandHook() {
  return [
    "#!/bin/bash",
    `# ${MARKER_TEXT}`,
    renderCopilotHookMetadata({
      host: "copilot",
      hook: "pre-command",
      renderedName: "pre-command.sh",
    }),
    "",
    "# Pre-command hook for OMS Copilot integration",
    "# Validates OMS state before command execution",
    "",
    'COMMAND="$1"',
    'if [ -f ".copilot/oh-my-superagents/state.json" ]; then',
    '  STATE=$(cat .copilot/oh-my-superagents/state.json)',
    '  if echo "$STATE" | grep -q \'"enabled": false\'; then',
    '    echo "OMS is disabled for this project"',
    "    exit 0",
    "  fi",
    "fi",
    "",
  ].join("\n")
}

export function renderCopilotPostCommandHook() {
  return [
    "#!/bin/bash",
    `# ${MARKER_TEXT}`,
    renderCopilotHookMetadata({
      host: "copilot",
      hook: "post-command",
      renderedName: "post-command.sh",
    }),
    "",
    "# Post-command hook for OMS Copilot integration",
    "# Handles cleanup after command execution",
    "",
    'COMMAND="$1"',
    'EXIT_CODE="$2"',
    "",
    "# Log command execution for diagnostics",
    'if [ -d ".copilot/oh-my-superagents/logs" ]; then',
    '  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $COMMAND $EXIT_CODE" >> .copilot/oh-my-superagents/logs/commands.log',
    "fi",
    "",
  ].join("\n")
}

export function buildCopilotControlPlaneSkills(config: RouterConfig, commandPrefix?: string) {
  const prefix = commandPrefix ?? "oms"

  return CONTROL_PLANE_COMMAND_KEYS.map<CopilotSkillArtifact>((command) => {
    const skillName = `${commandPrefix}-${command}`

    return {
      kind: "skill",
      directory: `.github/copilot/skills/${skillName}`,
      fileName: "SKILL.md",
      ownerPrefix: "oms-",
      content: renderCopilotSkillFile({
        name: skillName,
        command,
      }),
    }
  })
}

export function buildCopilotHooks() {
  return [
    {
      kind: "hook" as const,
      directory: ".github/copilot/hooks",
      fileName: "pre-command.sh",
      ownerPrefix: "oms-",
      content: renderCopilotPreCommandHook(),
      executable: true,
    },
    {
      kind: "hook" as const,
      directory: ".github/copilot/hooks",
      fileName: "post-command.sh",
      ownerPrefix: "oms-",
      content: renderCopilotPostCommandHook(),
      executable: true,
    },
  ]
}

export function buildCopilotArtifacts(config: RouterConfig, commandPrefix?: string) {
  const agents = BUILT_IN_PHASES.map<CopilotAgentArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_COPILOT_AGENT[phase]

    return {
      kind: "agent",
      directory: `.github/copilot/agents`,
      fileName: `${agentName}.md`,
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

  const skills = buildCopilotControlPlaneSkills(config, commandPrefix)
  const hooks = buildCopilotHooks()

  return { agents, skills, hooks }
}
