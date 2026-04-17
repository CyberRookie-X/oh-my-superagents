import { describe, expect, it } from "vitest"
import {
  CONTEXT_COMPRESSION_MOMENTS,
  CONTEXT_LIFECYCLE_STAGES,
  deriveLifecycleStage,
  isLifecycleCompressionBoundary,
} from "../src/context-lifecycle.js"

describe("CONTEXT_LIFECYCLE_STAGES", () => {
  it("keeps the full shared Hybrid+ stage catalog stable", () => {
    expect(CONTEXT_LIFECYCLE_STAGES).toEqual([
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
    ])
  })
})

describe("deriveLifecycleStage", () => {
  it("maps superpowers planning routes to the plan lifecycle stage", () => {
    expect(deriveLifecycleStage({
      command: "sync",
      canonicalRoute: "phase.plan",
      sourceEntry: { canonicalRoute: "phase.plan", source: "superpowers", entryName: "writing-plans" },
    })).toBe("plan")
  })

  it("prefers gstack ship semantics over the broad execute route family", () => {
    expect(deriveLifecycleStage({
      command: "sync",
      canonicalRoute: "phase.execute",
      sourceEntry: { canonicalRoute: "phase.execute", source: "gstack", entryName: "ship" },
    })).toBe("integrate_branch")
  })

  it("accepts explicit lifecycle hints for non-route transitions such as resume", () => {
    expect(deriveLifecycleStage({
      command: "status",
      lifecycleHint: "resume",
      canonicalRoute: "phase.review",
      sourceEntry: { canonicalRoute: "phase.review", source: "superpowers", entryName: "requesting-code-review" },
    })).toBe("resume")
  })
})

describe("isLifecycleCompressionBoundary", () => {
  it("marks durable handoff stages as compression boundaries", () => {
    expect(isLifecycleCompressionBoundary("plan")).toBe(true)
    expect(isLifecycleCompressionBoundary("checkpoint")).toBe(true)
    expect(isLifecycleCompressionBoundary("bootstrap")).toBe(false)
  })
})

describe("CONTEXT_COMPRESSION_MOMENTS", () => {
  it("keeps the initial moment ids stable", () => {
    expect(CONTEXT_COMPRESSION_MOMENTS).toEqual([
      "subagent-handoff",
      "plan-checkpoint",
      "review-checkpoint",
      "verification-checkpoint",
      "session-resume",
      "source-switch",
      "branch-integration",
    ])
  })
})
