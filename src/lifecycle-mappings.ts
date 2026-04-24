import type { CanonicalRouteId } from "./workflow-sources.js";
import type { ContextLifecycleStage } from "./context-lifecycle.js";

export const CANONICAL_ROUTE_TO_LIFECYCLE_STAGE: Record<string, ContextLifecycleStage> = {
  "phase.brainstorm": "design",
  "phase.plan": "plan",
  "phase.execute": "execute_task",
  "phase.review": "review",
  "phase.verify": "verify",
  "phase.web-test": "verify",
  "phase.visual": "design",
};

export const LIFECYCLE_STAGE_TO_CANONICAL_ROUTE: Record<string, CanonicalRouteId> = {
  design: "phase.brainstorm",
  bootstrap: "phase.brainstorm",
  plan: "phase.plan",
  checkpoint: "phase.plan",
  resume: "phase.plan",
  execute_task: "phase.execute",
  review: "phase.review",
  verify: "phase.verify",
  integrate_branch: "phase.verify",
};

export function deriveLifecycleStage(canonicalRoute: CanonicalRouteId): ContextLifecycleStage {
  if (canonicalRoute.startsWith("intent.")) return "execute_task";
  return CANONICAL_ROUTE_TO_LIFECYCLE_STAGE[canonicalRoute] ?? "bootstrap";
}

export function resolveLifecycleStageToCanonicalRoute(stage: ContextLifecycleStage): CanonicalRouteId | undefined {
  return LIFECYCLE_STAGE_TO_CANONICAL_ROUTE[stage];
}
