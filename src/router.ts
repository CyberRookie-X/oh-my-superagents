import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"

export const EFFORT_TO_VARIANT = {
  fast: "low",
  balanced: "medium",
  deep: "high",
  max: "max",
} as const

export const PHASE_TO_COMMAND = {
  brainstorming: "/sp-brainstorm",
  "writing-plans": "/sp-plan",
  "subagent-driven-development": "/sp-execute",
  "requesting-code-review": "/sp-review",
  "verification-before-completion": "/sp-verify",
  "frontend-design": "/sp-visual",
  "webapp-testing": "/sp-web-test",
} as const satisfies Record<(typeof BUILT_IN_PHASES)[number], string>

export const PHASE_TO_AGENT = {
  brainstorming: "spr-strategy",
  "writing-plans": "spr-plan",
  "subagent-driven-development": "spr-build",
  "requesting-code-review": "spr-review",
  "verification-before-completion": "spr-verify",
  "frontend-design": "spr-visual",
  "webapp-testing": "spr-visual",
} as const satisfies Record<(typeof BUILT_IN_PHASES)[number], string>

export type BuiltInPhase = (typeof BUILT_IN_PHASES)[number]

export type ResolvedRoute = {
  phaseId: BuiltInPhase
  profileId: string
  selection: {
    model: string
    variant?: string
    effort?: "fast" | "balanced" | "deep" | "max"
    temperature?: number
  }
  description: string
}

export function resolvePhase(config: RouterConfig, phase: BuiltInPhase): ResolvedRoute {
  const profileId = config.routes[phase] ?? config.defaultRoute

  if (!profileId) {
    throw new Error(`No route configured for phase: ${phase}`)
  }

  const profile = config.profiles[profileId]
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`)
  }

  return {
    phaseId: phase,
    profileId,
    selection: {
      model: profile.model,
      effort: profile.effort,
      temperature: profile.temperature,
      variant: profile.variant ?? (profile.effort ? EFFORT_TO_VARIANT[profile.effort] : undefined),
    },
    description: `${phase} routed to ${profileId}`,
  }
}

export function explainPhase(config: RouterConfig, phase: BuiltInPhase) {
  const resolved = resolvePhase(config, phase)

  return {
    phase,
    profileId: resolved.profileId,
    model: resolved.selection.model,
    variant: resolved.selection.variant,
    commandName: PHASE_TO_COMMAND[phase],
    agentName: PHASE_TO_AGENT[phase],
  }
}

export function explainAll(config: RouterConfig) {
  return BUILT_IN_PHASES.map((phase) => explainPhase(config, phase))
}
