import { getGstackSourceEntry } from "./workflow-gstack.js"
import { getSuperpowersSourceEntry } from "./workflow-superpowers.js"

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
  _workflow: WorkflowSourceNormalizationInput,
  routes: Partial<Record<CanonicalRouteId, WorkflowSourceKind>> | undefined,
): Partial<Record<CanonicalRouteId, WorkflowSourceKind>> {
  if (!routes) {
    return {}
  }

  return { ...routes }
}

const SOURCE_ENTRY_LOOKUPS: Partial<
  Record<WorkflowSourceKind, (canonicalRoute: CanonicalRouteId) => WorkflowSourceEntry | undefined>
> = {
  superpowers: getSuperpowersSourceEntry,
  gstack: getGstackSourceEntry,
}

export function getWorkflowSourceEntry(
  canonicalRoute: CanonicalRouteId,
  source: WorkflowSourceKind,
): WorkflowSourceEntry {
  return SOURCE_ENTRY_LOOKUPS[source]?.(canonicalRoute) ?? { canonicalRoute, source }
}
