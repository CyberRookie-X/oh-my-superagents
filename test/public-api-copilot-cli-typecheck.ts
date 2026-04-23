// Type check tests for Copilot CLI public API
import {
  COPILOT_MARKING_TEXT,
  COPILOT_MARKING,
  COPILOT_ROUTE_MARKER_PREFIX,
  COPILOT_SKILLS_ROOT,
  COPILOT_COMMANDS_ROOT,
  renderCopilotSkill,
  renderCopilotCommand,
  buildCopilotArtifacts,
  explainCopilotPhase,
  explainAllCopilot,
  type GeneratedCopilotArtifact,
} from "../src/index.js"
import type { RouterConfig } from "../src/config.js"

// Type check: constants are strings
const _markingText: string = COPILOT_MARKING_TEXT
const _marking: string = COPILOT_MARKING
const _routePrefix: string = COPILOT_ROUTE_MARKER_PREFIX
const _skillsRoot: string = COPILOT_SKILLS_ROOT
const _commandsRoot: string = COPILOT_COMMANDS_ROOT

// Type check: renderCopilotSkill returns string
const _skillContent: string = renderCopilotSkill({
  skillName: "copilot-plan",
  description: "Test skill",
  model: "gpt-4",
})

// Type check: renderCopilotSkill with optional parameters
const _skillWithVariant: string = renderCopilotSkill({
  skillName: "copilot-plan",
  description: "Test",
  model: "gpt-4",
  variant: "high",
  temperature: 0.7,
})

// Type check: renderCopilotCommand returns string
const _commandContent: string = renderCopilotCommand({
  commandName: "oms-status",
  description: "Show status",
  script: "echo status",
})

// Type check: buildCopilotArtifacts accepts RouterConfig
const _config: RouterConfig = {
  defaultRoute: "default",
  profiles: {
    default: {
      model: "gpt-4",
    },
  },
  routes: {},
}

// Type check: buildCopilotArtifacts returns GeneratedCopilotArtifact[]
const _artifacts: GeneratedCopilotArtifact[] = buildCopilotArtifacts(_config)

// Type check: GeneratedCopilotArtifact structure
const _artifact: GeneratedCopilotArtifact = {
  kind: "skill",
  directory: ".github-copilot/skills",
  fileName: "oms-plan.md",
  ownerPrefix: "oms-plan",
  content: "# Test",
}

const _commandArtifact: GeneratedCopilotArtifact = {
  kind: "command",
  directory: ".github-copilot/commands",
  fileName: "oms-status.md",
  ownerPrefix: "oms-status",
  content: "# Test",
}

// Type check: explainCopilotPhase
const _explanation = explainCopilotPhase(_config, "writing-plans")
const _phase: string = _explanation.phase
const _profileId: string | undefined = _explanation.profileId
const _skillName: string = _explanation.skillName
const _model: string = _explanation.model

// Type check: explainAllCopilot
const _allExplanations = explainAllCopilot(_config)
const _firstExplanation = _allExplanations[0]

// Type check: BuiltInPhase types
const _phases: Array<"brainstorming" | "writing-plans" | "subagent-driven-development" | "requesting-code-review" | "verification-before-completion" | "frontend-design" | "webapp-testing"> = [
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "requesting-code-review",
  "verification-before-completion",
  "frontend-design",
  "webapp-testing",
]

for (const phase of _phases) {
  const _exp = explainCopilotPhase(_config, phase)
  void _exp
}

export {}
