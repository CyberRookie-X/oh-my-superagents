import type { RouterConfig } from "./config.js"
import {
  PHASE_TO_AGENT,
  PHASE_TO_COMMAND,
  SUPERPOWERS_ROUTE_CATALOG,
  type BuiltInPhase,
} from "./workflow-superpowers.js"

export { PHASE_TO_AGENT, PHASE_TO_COMMAND } from "./workflow-superpowers.js"
export type { BuiltInPhase } from "./workflow-superpowers.js"

export const EFFORT_TO_VARIANT = {
  fast: "low",
  balanced: "medium",
  deep: "high",
  max: "max",
} as const

const SUPERPOWERS_ROUTE_SET = new Set<string>(SUPERPOWERS_ROUTE_CATALOG)

export type ResolvedRoute = {
  routeId: string
  phaseId?: BuiltInPhase
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

type RouteContext = {
  effectiveLane?: string
}

export function resolveRoute(config: RouterConfig, routeId: string, routeContext: RouteContext = {}): ResolvedRoute {
  const workflowKind = config.workflow?.kind ?? "superpowers"

  if (config.workflow?.kind === "direct" && !(routeId in config.workflow.intents)) {
    throw new Error(`Unknown intent: ${routeId}`)
  }

  const effectiveLane = routeContext.effectiveLane ?? config.effectiveLane
  const lane = effectiveLane ? config.lanes?.[effectiveLane] : undefined

  const presetRoute = config.routes[routeId]
  const laneRoute = lane?.routes[routeId]
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
    throw new Error(`No route configured for ${workflowKind === "direct" ? "intent" : "phase"}: ${routeId}`)
  }

  const profile = config.profiles[profileId]
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`)
  }

  return {
    routeId,
    phaseId: workflowKind === "superpowers" && SUPERPOWERS_ROUTE_SET.has(routeId) ? (routeId as BuiltInPhase) : undefined,
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
    description: `${routeId} routed to ${profileId} via ${routeSource}`,
  }
}

export function resolvePhase(config: RouterConfig, phase: BuiltInPhase, routeContext: RouteContext = {}): ResolvedRoute {
  return {
    ...resolveRoute(config, phase, routeContext),
    phaseId: phase,
  }
}

export function explainPhase(config: RouterConfig, phase: BuiltInPhase, routeContext: RouteContext = {}) {
  const resolved = resolvePhase(config, phase, routeContext)

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

export function explainAll(config: RouterConfig, routeContext: RouteContext = {}) {
  return SUPERPOWERS_ROUTE_CATALOG.map((phase) => explainPhase(config, phase, routeContext))
}
