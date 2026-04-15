import type { CanonicalRouteId, WorkflowSourceEntry } from "./workflow-sources.js"

export const GSTACK_SOURCE_CATALOG: Partial<Record<CanonicalRouteId, string>> = {
  "phase.plan": "plan-eng-review",
  "phase.execute": "ship",
  "phase.review": "review",
  "phase.verify": "qa",
}

export function getGstackSourceEntry(canonicalRoute: CanonicalRouteId): WorkflowSourceEntry | undefined {
  const entryName = GSTACK_SOURCE_CATALOG[canonicalRoute]

  if (!entryName) {
    return undefined
  }

  return {
    canonicalRoute,
    source: "gstack",
    entryName,
  }
}
