import type { CanonicalRouteId, WorkflowSourceEntry } from "./workflow-sources.js"

export const GSTACK_SOURCE_CATALOG = {
  "phase.plan": "plan-eng-review",
  "phase.execute": "ship",
  "phase.review": "review",
  "phase.verify": "qa",
} as const satisfies Partial<Record<CanonicalRouteId, string>>

export const GSTACK_CANONICAL_ROUTE_ALIASES: Partial<Record<CanonicalRouteId, CanonicalRouteId>> = {
  "phase.plan": "phase.writing-plans",
  "phase.execute": "phase.subagent-driven-development",
  "phase.review": "phase.requesting-code-review",
  "phase.verify": "phase.verification-before-completion",
}

const GSTACK_SOURCE_ALIASES: Partial<Record<CanonicalRouteId, string>> = {
  ...GSTACK_SOURCE_CATALOG,
  "phase.writing-plans": GSTACK_SOURCE_CATALOG["phase.plan"],
  "phase.subagent-driven-development": GSTACK_SOURCE_CATALOG["phase.execute"],
  "phase.requesting-code-review": GSTACK_SOURCE_CATALOG["phase.review"],
  "phase.verification-before-completion": GSTACK_SOURCE_CATALOG["phase.verify"],
}

export function normalizeGstackCanonicalRouteId(canonicalRoute: CanonicalRouteId): CanonicalRouteId {
  return GSTACK_CANONICAL_ROUTE_ALIASES[canonicalRoute] ?? canonicalRoute
}

export function getGstackSourceEntry(canonicalRoute: CanonicalRouteId): WorkflowSourceEntry | undefined {
  const entryName = GSTACK_SOURCE_ALIASES[canonicalRoute]

  if (!entryName) {
    return undefined
  }

  return {
    canonicalRoute,
    source: "gstack",
    entryName,
  }
}
