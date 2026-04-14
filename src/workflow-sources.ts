import { getGstackSourceEntry, normalizeGstackCanonicalRouteId } from "./workflow-gstack.js"

export const WORKFLOW_SOURCE_KINDS = ["superpowers", "gstack", "direct"] as const

export type WorkflowSourceKind = (typeof WORKFLOW_SOURCE_KINDS)[number]
export type CanonicalRouteId = `phase.${string}` | `intent.${string}`
export type WorkflowSourceEntry = {
  canonicalRoute: CanonicalRouteId
  source: WorkflowSourceKind
  entryName?: string
}
export type SourcePresetConfig = {
  routes: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
}

export const CANONICAL_ROUTE_ID_PATTERN = /^(phase|intent)\..+$/

type WorkflowSourceNormalizationInput =
  | {
      kind: "direct"
      intents: Record<string, unknown>
    }
  | {
      kind?: "superpowers"
    }
  | undefined

export function normalizeWorkflowSourceRoutes(
  workflow: WorkflowSourceNormalizationInput,
  routes: Partial<Record<CanonicalRouteId, WorkflowSourceKind>> | undefined,
): Partial<Record<CanonicalRouteId, WorkflowSourceKind>> {
  if (!routes) {
    return {}
  }

  if (workflow?.kind === "direct") {
    return { ...routes }
  }

  return Object.fromEntries(
    Object.entries(routes).map(([canonicalRoute, source]) => [
      normalizeGstackCanonicalRouteId(canonicalRoute as CanonicalRouteId),
      source,
    ]),
  ) as Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
}

export function getWorkflowSourceEntry(
  canonicalRoute: CanonicalRouteId,
  source: WorkflowSourceKind,
): WorkflowSourceEntry {
  if (source === "gstack") {
    return getGstackSourceEntry(canonicalRoute) ?? { canonicalRoute, source }
  }

  return { canonicalRoute, source }
}
