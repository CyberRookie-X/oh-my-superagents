import {
  BUILT_IN_PHASES,
  type RouterConfig,
} from "./config.js"
import { PHASE_TO_COMMAND, type BuiltInPhase } from "./router.js"
import type { CanonicalRouteId, WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

export const COPILOT_MARKING_TEXT = "generated-by: oh-my-superagents; do-not-edit: true"
export const COPILOT_MARKING = `<!-- ${COPILOT_MARKING_TEXT} -->`
export const COPILOT_ROUTE_MARKER_PREFIX = "oms-route:"
export const COPILOT_SKILLS_ROOT = ".github-copilot/skills"
export const COPILOT_COMMANDS_ROOT = ".github-copilot/commands"

const COPILOT_SKILL_PREFIXES = new Set(["oms-"])
const COPILOT_COMMAND_PREFIXES = new Set(["oms-"])

function renderCopilotRouteOwnershipMetadata(input: {
  host: "copilot-cli"
  source: WorkflowSourceKind
  route: CanonicalRouteId
  projection: "skill" | "command"
  renderedName: string
}): string {
  return `<!-- ${COPILOT_ROUTE_MARKER_PREFIX} stage=1; host=copilot-cli; source=${input.source}; route=${input.route}; projection=${input.projection}; rendered-name=${input.renderedName} -->`
}

export function renderCopilotSkill(input: {
  skillName: string
  description: string
  model: string
  variant?: string
  temperature?: number
  sourceEntry?: WorkflowSourceEntry
}): string {
  const sourceEntry = input.sourceEntry ?? {
    canonicalRoute: "phase.unknown" as CanonicalRouteId,
    source: "superpowers",
  }

  const workflowEntryName = sourceEntry.entryName 
    ? `${sourceEntry.source}/${sourceEntry.entryName}`
    : sourceEntry.canonicalRoute

  return [
    "# " + input.skillName,
    "",
    COPILOT_MARKING,
    renderCopilotRouteOwnershipMetadata({
      host: "copilot-cli",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "skill",
      renderedName: input.skillName,
    }),
    "",
    "**Description:** " + input.description,
    "",
    "**Workflow:** " + workflowEntryName,
    "",
    "**Model:** " + input.model,
    ...(input.variant ? ["**Variant:** " + input.variant] : []),
    ...(input.temperature !== undefined ? ["**Temperature:** " + input.temperature.toString()] : []),
    "",
    "---",
    "",
    "You are the " + input.skillName + " helper for GitHub Copilot CLI.",
    "",
    "## Role",
    "",
    "This skill provides specialized assistance for the " + input.skillName + " workflow phase.",
    "",
    "## Instructions",
    "",
    "Follow the OMS routing configuration for this phase. Use the configured model and parameters.",
  ].join("\n")
}

export function renderCopilotCommand(input: {
  commandName: string
  description: string
  script: string
}): string {
  return [
    "# " + input.commandName,
    "",
    COPILOT_MARKING,
    renderCopilotRouteOwnershipMetadata({
      host: "copilot-cli",
      source: "superpowers",
      route: "command." + input.commandName as CanonicalRouteId,
      projection: "command",
      renderedName: input.commandName,
    }),
    "",
    "**Description:** " + input.description,
    "",
    "---",
    "",
    "```bash",
    input.script,
    "```",
  ].join("\n")
}

export type GeneratedCopilotArtifact = {
  kind: "skill" | "command"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export function buildCopilotArtifacts(config: RouterConfig): GeneratedCopilotArtifact[] {
  const artifacts: GeneratedCopilotArtifact[] = []

  const phaseSkillMap: Record<BuiltInPhase, string> = {
    "brainstorming": "brainstorm",
    "writing-plans": "plan",
    "subagent-driven-development": "execute",
    "requesting-code-review": "review",
    "verification-before-completion": "verify",
    "frontend-design": "visual",
    "webapp-testing": "web-test",
  }

  for (const phase of BUILT_IN_PHASES) {
    const skillSuffix = phaseSkillMap[phase]
    const skillName = `oms-${skillSuffix}`
    
    const profileId = config.routes?.[phase] ?? config.defaultRoute
    const profile = profileId ? config.profiles[profileId] : undefined
    
    if (!profile) continue

    const content = renderCopilotSkill({
      skillName: `copilot-${skillSuffix}`,
      description: `OMS ${phase} helper for Copilot CLI`,
      model: profile.model,
      variant: profile.variant,
      temperature: profile.temperature,
      sourceEntry: {
        canonicalRoute: `phase.${phase}` as CanonicalRouteId,
        source: "superpowers",
        entryName: phase,
      },
    })

    artifacts.push({
      kind: "skill",
      directory: COPILOT_SKILLS_ROOT,
      fileName: `${skillName}.md`,
      ownerPrefix: `oms-${skillSuffix}`,
      content,
    })
  }

  const commands = [
    { name: "status", description: "Show OMS status for Copilot CLI" },
    { name: "sync", description: "Sync OMS artifacts for Copilot CLI" },
    { name: "doctor", description: "Inspect OMS diagnostics for Copilot CLI" },
  ]

  for (const cmd of commands) {
    const content = renderCopilotCommand({
      commandName: `oms-${cmd.name}`,
      description: cmd.description,
      script: `echo "OMS ${cmd.name} command for Copilot CLI"`,
    })

    artifacts.push({
      kind: "command",
      directory: COPILOT_COMMANDS_ROOT,
      fileName: `oms-${cmd.name}.md`,
      ownerPrefix: `oms-${cmd.name}`,
      content,
    })
  }

  return artifacts
}

export function explainCopilotPhase(config: RouterConfig, phase: BuiltInPhase) {
  const profileId = config.routes?.[phase] ?? config.defaultRoute
  const profile = profileId ? config.profiles[profileId] : undefined

  const phaseSkillMap: Record<BuiltInPhase, string> = {
    "brainstorming": "brainstorm",
    "writing-plans": "plan",
    "subagent-driven-development": "execute",
    "requesting-code-review": "review",
    "verification-before-completion": "verify",
    "frontend-design": "visual",
    "webapp-testing": "web-test",
  }

  return {
    phase,
    profileId,
    skillName: `copilot-${phaseSkillMap[phase]}`,
    model: profile?.model ?? "unknown",
    commandName: PHASE_TO_COMMAND[phase],
  }
}

export function explainAllCopilot(config: RouterConfig) {
  return BUILT_IN_PHASES.map((phase) => explainCopilotPhase(config, phase))
}

export { COPILOT_SKILL_PREFIXES, COPILOT_COMMAND_PREFIXES }
