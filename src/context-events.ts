export const CONTEXT_LIFECYCLE_EVENTS = Object.freeze([
  "session_start",
  "before_compact",
  "after_edit",
  "post_commit",
  "session_end",
  "reindex_complete",
] as const)

const CONTEXT_LIFECYCLE_EVENT_SET: ReadonlySet<string> = new Set(CONTEXT_LIFECYCLE_EVENTS)

export type ContextLifecycleEvent = (typeof CONTEXT_LIFECYCLE_EVENTS)[number]

export function isContextLifecycleEvent(value: unknown): value is ContextLifecycleEvent {
  return typeof value === "string" && CONTEXT_LIFECYCLE_EVENT_SET.has(value)
}
