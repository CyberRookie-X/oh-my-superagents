import type { CanonicalRouteId, WorkflowSourceKind } from "./workflow-sources.js"

export function toDirectCanonicalRouteId(intentId: string): CanonicalRouteId {
  return `intent.${intentId}`
}

export function createDirectSourceEntries(
  intentIds: Iterable<string>,
): Partial<Record<CanonicalRouteId, WorkflowSourceKind>> {
  return Object.fromEntries(
    Array.from(intentIds, (intentId) => [toDirectCanonicalRouteId(intentId), "direct"]),
  )
}

export function createDirectWorkflowSourceEntries(intents: Record<string, unknown>) {
  return createDirectSourceEntries(Object.keys(intents))
}
