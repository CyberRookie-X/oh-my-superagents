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
  routeSource: "preset-route" | "lane-route" | "lane-default" | "preset-default"
  effectiveLane?: string
  selection: {
    model: string
    variant?: string
    effort?: "fast" | "balanced" | "deep" | "max"
    codexFast?: boolean
    temperature?: number
  }
  description: string
}

type LaneContext = {
  effectiveLane?: string
}

export function resolvePhase(config: RouterConfig, phase: BuiltInPhase, laneContext: LaneContext = {}): ResolvedRoute {
  const effectiveLane = laneContext.effectiveLane ?? config.effectiveLane
  const lane = effectiveLane ? config.lanes?.[effectiveLane] : undefined

  const presetRoute = config.routes[phase]
  const laneRoute = lane?.routes[phase]
  const laneDefaultRoute = lane?.defaultRoute
  const profileId = presetRoute ?? laneRoute ?? laneDefaultRoute ?? config.defaultRoute
  const routeSource = presetRoute
    ? "preset-route"
    : laneRoute
      ? "lane-route"
      : laneDefaultRoute
        ? "lane-default"
        : "preset-default"

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
    routeSource,
    effectiveLane,
    selection: {
      model: profile.model,
      effort: profile.effort,
      codexFast: profile.codexFast,
      temperature: profile.temperature,
      variant: profile.variant ?? (profile.effort ? EFFORT_TO_VARIANT[profile.effort] : undefined),
    },
    description: `${phase} routed to ${profileId} via ${routeSource}`,
  }
}

export function explainPhase(config: RouterConfig, phase: BuiltInPhase, laneContext: LaneContext = {}) {
  const resolved = resolvePhase(config, phase, laneContext)

  return {
    phase,
    profileId: resolved.profileId,
    effectiveLane: resolved.effectiveLane,
    routeSource: resolved.routeSource,
    model: resolved.selection.model,
    variant: resolved.selection.variant,
    commandName: PHASE_TO_COMMAND[phase],
    agentName: PHASE_TO_AGENT[phase],
  }
}

export function explainAll(config: RouterConfig, laneContext: LaneContext = {}) {
  return BUILT_IN_PHASES.map((phase) => explainPhase(config, phase, laneContext))
}
