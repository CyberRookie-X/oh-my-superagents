import { getHostProjectionDecision } from "./capabilities.js"
import { BUILT_IN_PHASES, CONTROL_PLANE_COMMAND_KEYS, type ControlPlaneCommandKey, type RouterConfig } from "./config.js"
import { MARKER, renderRouteOwnershipMetadata, CONTROL_PLANE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

const PHASE_TO_COPILOT_PROMPT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot.",
  use: "Switch OMS to the selected preset for Copilot.",
  disable: "Disable OMS for Copilot.",
  sync: "Sync OMS artifacts for Copilot.",
  doctor: "Inspect OMS diagnostics for Copilot.",
}

const DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "sync", "doctor"])

export type CopilotPromptArtifact = {
  kind: "prompt"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type RenderCopilotPromptFileInput = {
  name: string
  description: string
  model: string
  phase: BuiltInPhase
  profileId: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName: string
}

function yamlScalar(value: string) {
  return `'${value.replace(/'/g, "''")}'`
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

export function renderCopilotPromptFile(input: RenderCopilotPromptFileInput) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    "---",
    "",
    MARKER,
    renderRouteOwnershipMetadata({
      host: "copilot",
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      projection: "prompt",
      renderedName: input.name,
    }),
    "",
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

function renderCopilotDirectPromptFile(input: {
  name: string
  description: string
  model: string
  intent: string
  sourceEntry: WorkflowSourceEntry
}) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    "---",
    "",
    MARKER,
    renderRouteOwnershipMetadata({
      host: "copilot",
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      projection: "prompt",
      renderedName: input.name,
    }),
    "",
    `You are the ${input.name} routing prompt for the \`${input.intent}\` intent.`,
    `Handle requests that match this intent: ${input.intent}.`,
    "Follow the requested intent directly without any upstream skill handoff.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- model: \`${input.model}\``,
    "",
  ].join("\n")
}

function renderCopilotControlPlaneCommandFile(input: {
  description: string
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    "---",
    "",
    MARKER,
    `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=1; host=copilot; artifact=command; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`,
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host copilot $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

export function buildCopilotArtifacts(config: RouterConfig) {
  const prompts: CopilotPromptArtifact[] = []

  if (config.workflow?.kind === "direct") {
    for (const [intent, intentConfig] of Object.entries(config.workflow.intents)) {
      if (!/^[a-z0-9-]+$/.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const sourceEntry = resolved.sourceEntry

      assertCopilotProjectionSupport(config.workflow.kind, sourceEntry)

      prompts.push({
        kind: "prompt",
        directory: ".github/prompts",
        fileName: `rt-${intent}.md`,
        ownerPrefix: "rt-",
        content: renderCopilotDirectPromptFile({
          name: `rt-${intent}`,
          description: `${intentConfig.label} prompt for Copilot direct mode.`,
          model: resolved.selection.model,
          intent,
          sourceEntry,
        }),
      })
    }

    return { prompts }
  }

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const promptName = PHASE_TO_COPILOT_PROMPT[phase]

    assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)

    prompts.push({
      kind: "prompt",
      directory: ".github/prompts",
      fileName: `${promptName}.md`,
      ownerPrefix: "oms-",
      content: renderCopilotPromptFile({
        name: promptName,
        description: `Copilot wrapper prompt for the ${phase} phase`,
        model: resolved.selection.model,
        phase,
        profileId: resolved.profileId,
        sourceEntry: resolved.sourceEntry,
        workflowEntryName: formatWorkflowEntryName(resolved.sourceEntry),
      }),
    })
  }

  return { prompts }
}

export type CopilotControlPlaneSettings = {
  commandPrefix: string
  commands: Record<ControlPlaneCommandKey, { name: string; aliases: string[] }>
}

export function buildCopilotControlPlaneArtifacts(
  settings: CopilotControlPlaneSettings,
  supportedCommands: ReadonlySet<ControlPlaneCommandKey> = new Set(CONTROL_PLANE_COMMAND_KEYS),
): CopilotPromptArtifact[] {
  const ownerPrefix = `${settings.commandPrefix}-`
  const seenFileNames = new Map<string, string>()

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
    if (!supportedCommands.has(commandKey)) {
      return []
    }

    const command = settings.commands[commandKey]
    const renderedNames = [command.name, ...command.aliases]

    return renderedNames.map((renderedName) => {
      const fileName = `${settings.commandPrefix}-${renderedName}.md`
      const existingCommand = seenFileNames.get(fileName)

      if (existingCommand) {
        throw new Error(`Duplicate OMS command file rendering: ${fileName} (${existingCommand}, ${commandKey})`)
      }

      seenFileNames.set(fileName, commandKey)

      return {
        kind: "prompt" as const,
        directory: ".github/prompts",
        fileName,
        ownerPrefix,
        content: renderCopilotControlPlaneCommandFile({
          description: CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
          logicalCommand: commandKey,
          renderedName: fileName.replace(/\.md$/, ""),
        }),
      }
    })
  })
}
