import type { RouterConfig } from "./config.js"
import { createDirectWorkflowSourceEntries, toDirectCanonicalRouteId } from "./workflow-direct.js"
import {
  PHASE_TO_AGENT,
  PHASE_TO_COMMAND,
  SUPERPOWERS_ROUTE_CATALOG,
  SUPERPOWERS_SOURCE_ENTRIES,
  type BuiltInPhase,
  toSuperpowersCanonicalRouteId,
} from "./workflow-superpowers.js"
import {
  getWorkflowSourceEntry,
  normalizeWorkflowSourceRoutes,
  type CanonicalRouteId,
  type WorkflowSourceEntry,
  type WorkflowSourceKind,
} from "./workflow-sources.js"

export { PHASE_TO_AGENT, PHASE_TO_COMMAND } from "./workflow-superpowers.js"
export type { BuiltInPhase } from "./workflow-superpowers.js"

export const EFFORT_TO_VARIANT = {
  fast: "low",
  balanced: "medium",
  deep: "high",
  max: "max",
} as const

const SUPERPOWERS_ROUTE_SET = new Set<string>(SUPERPOWERS_ROUTE_CATALOG)

function hasOwnKey(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export type ResolvedRoute = {
  routeId: string
  canonicalRoute: CanonicalRouteId
  phaseId?: BuiltInPhase
  profileId: string
  routeSource: "preset-route" | "lane-route" | "lane-default" | "preset-default"
  effectiveLane?: string
  resolvedSource: WorkflowSourceKind
  sourceEntry: WorkflowSourceEntry
  sourceResolution: "default" | "explicit"
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

type RouterSourceConfig = RouterConfig & {
  effectiveSources?: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
}

function isDirectWorkflow(
  config: { workflow?: RouterConfig["workflow"] },
): config is { workflow: Extract<RouterConfig["workflow"], { kind: "direct" }> } {
  return config.workflow?.kind === "direct"
}

export function resolveCanonicalRoute(config: { workflow?: RouterConfig["workflow"] }, routeId: string): CanonicalRouteId {
  return isDirectWorkflow(config)
    ? toDirectCanonicalRouteId(routeId)
    : toSuperpowersCanonicalRouteId(routeId as BuiltInPhase)
}

export function getDefaultSourceEntries(
  config: { workflow?: RouterConfig["workflow"] },
): Partial<Record<CanonicalRouteId, WorkflowSourceKind>> {
  return isDirectWorkflow(config)
    ? createDirectWorkflowSourceEntries(config.workflow.intents)
    : { ...SUPERPOWERS_SOURCE_ENTRIES }
}

export function resolveEffectiveSources(
  config: {
    workflow?: RouterConfig["workflow"]
    effectiveSources?: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
  },
): Partial<Record<CanonicalRouteId, WorkflowSourceKind>> {
  const explicitSources = normalizeWorkflowSourceRoutes(config.workflow, config.effectiveSources)

  return {
    ...getDefaultSourceEntries(config),
    ...explicitSources,
  }
}

export function resolveRoute(config: RouterSourceConfig, routeId: string, routeContext: RouteContext = {}): ResolvedRoute {
  const workflowKind = config.workflow?.kind ?? "superpowers"

  if (config.workflow?.kind === "direct") {
    if (!hasOwnKey(config.workflow.intents, routeId)) {
      throw new Error(`Unknown intent: ${routeId}`)
    }
  } else if (!SUPERPOWERS_ROUTE_SET.has(routeId)) {
    throw new Error(`Unknown phase: ${routeId}`)
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

  const canonicalRoute = resolveCanonicalRoute(config, routeId)
  const explicitSources = normalizeWorkflowSourceRoutes(config.workflow, config.effectiveSources)
  const sourceResolution = hasOwnKey(explicitSources, canonicalRoute) ? "explicit" : "default"
  const resolvedSource = resolveEffectiveSources(config)[canonicalRoute]

  if (!resolvedSource) {
    throw new Error(`No source configured for canonical route: ${canonicalRoute}`)
  }

  const profile = config.profiles[profileId]
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`)
  }

  return {
    routeId,
    canonicalRoute,
    phaseId: workflowKind === "superpowers" && SUPERPOWERS_ROUTE_SET.has(routeId) ? (routeId as BuiltInPhase) : undefined,
    profileId,
    routeSource,
    effectiveLane,
    resolvedSource,
    sourceEntry: getWorkflowSourceEntry(canonicalRoute, resolvedSource),
    sourceResolution,
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
    canonicalRoute: resolved.canonicalRoute,
    profileId: resolved.profileId,
    effectiveLane: resolved.effectiveLane,
    routeSource: resolved.routeSource,
    resolvedSource: resolved.resolvedSource,
    model: resolved.selection.model,
    variant: resolved.selection.variant,
    commandName: PHASE_TO_COMMAND[phase],
    agentName: PHASE_TO_AGENT[phase],
  }
}

export function explainAll(config: RouterConfig, routeContext: RouteContext = {}) {
  return SUPERPOWERS_ROUTE_CATALOG.map((phase) => explainPhase(config, phase, routeContext))
}
