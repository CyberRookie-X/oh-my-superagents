import type { ControlPlaneCommandKey } from "./config.js"
import type { CanonicalRouteId, WorkflowSourceEntry } from "./workflow-sources.js"
import { deriveLifecycleStage as deriveLifecycleStageFromRoute } from "./lifecycle-mappings.js"

export const CONTEXT_LIFECYCLE_STAGES = [
  "bootstrap",
  "design",
  "prepare_workspace",
  "plan",
  "execute_task",
  "review",
  "verify",
  "integrate_branch",
  "checkpoint",
  "resume",
] as const

export type ContextLifecycleStage = (typeof CONTEXT_LIFECYCLE_STAGES)[number]

export const CONTEXT_COMPRESSION_MOMENTS = [
  "subagent-handoff",
  "plan-checkpoint",
  "review-checkpoint",
  "verification-checkpoint",
  "session-resume",
  "source-switch",
  "branch-integration",
] as const

export type ContextCompressionMoment = (typeof CONTEXT_COMPRESSION_MOMENTS)[number]

const GSTACK_ENTRY_TO_STAGE: Record<string, ContextLifecycleStage> = {
  "plan-eng-review": "plan",
  review: "review",
  qa: "verify",
  ship: "integrate_branch",
}

export function deriveLifecycleStage(input: {
  command: ControlPlaneCommandKey | "explain"
  canonicalRoute: CanonicalRouteId
  sourceEntry: WorkflowSourceEntry
  lifecycleHint?: ContextLifecycleStage
}): ContextLifecycleStage {
  if (input.lifecycleHint) {
    return input.lifecycleHint
  }

  if (input.sourceEntry.source === "gstack" && input.sourceEntry.entryName) {
    const mapped = GSTACK_ENTRY_TO_STAGE[input.sourceEntry.entryName]
    if (mapped) {
      return mapped
    }
  }

  return deriveLifecycleStageFromRoute(input.canonicalRoute)
}

export function isLifecycleCompressionBoundary(stage: ContextLifecycleStage) {
  return stage === "plan"
    || stage === "review"
    || stage === "verify"
    || stage === "integrate_branch"
    || stage === "checkpoint"
    || stage === "resume"
}
