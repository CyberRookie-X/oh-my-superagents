import { describe, expect, it, vi } from "vitest"
import * as library from "../src/index.js"

const readinessLibrary = library as typeof library & {
  UPSTREAM_AVAILABILITY_STATUSES?: readonly string[]
  UPSTREAM_COMPATIBILITY_STATUSES?: readonly string[]
  evaluateProjectionReadiness?: (input: {
    host: "opencode" | "codex" | "qwen" | "claude"
    workflowKind: "superpowers" | "direct"
    sourceEntry: {
      canonicalRoute: string
      source: "superpowers" | "gstack" | "direct"
      entryName?: string
    }
  }, options?: {
    availabilityBySource?: Partial<Record<"superpowers" | "gstack", (input: {
      host: "opencode" | "codex" | "qwen" | "claude"
      workflowKind: "superpowers" | "direct"
      sourceEntry: {
        canonicalRoute: string
        source: "superpowers" | "gstack" | "direct"
        entryName?: string
      }
    }) => {
      status: string
      reason: string
    } | null>>
    compatibilityBySource?: Partial<Record<"superpowers" | "gstack", (input: {
      host: "opencode" | "codex" | "qwen" | "claude"
      workflowKind: "superpowers" | "direct"
      sourceEntry: {
        canonicalRoute: string
        source: "superpowers" | "gstack" | "direct"
        entryName?: string
      }
    }) => {
      status: string
      reason: string
    } | null>>
  }) => {
    support: {
      supported: boolean
      reasonCode?: string
    }
    availability?: {
      status: string
      reason: string
    } | null
    compatibility?: {
      status: string
      reason: string
    } | null
  }
}

describe("upstream readiness", () => {
  it("exports stable availability and compatibility status models", () => {
    expect(readinessLibrary.UPSTREAM_AVAILABILITY_STATUSES).toEqual([
      "available",
      "not_detected",
      "error",
      "not_implemented",
    ])

    expect(readinessLibrary.UPSTREAM_COMPATIBILITY_STATUSES).toEqual([
      "compatible",
      "untested",
      "incompatible",
      "not_detected",
    ])
  })

  it("returns support only and skips readiness checks for unsupported projections", () => {
    expect(readinessLibrary.evaluateProjectionReadiness).toBeTypeOf("function")

    const availabilityEvaluator = vi.fn(() => ({
      status: "not_detected",
      reason: "No gstack install could be detected.",
    }))
    const compatibilityEvaluator = vi.fn(() => ({
      status: "not_detected",
      reason: "Compatibility could not be evaluated without a detected install.",
    }))

    expect(
      readinessLibrary.evaluateProjectionReadiness!(
        {
          host: "qwen",
          workflowKind: "superpowers",
          sourceEntry: {
            canonicalRoute: "phase.plan",
            source: "gstack",
            entryName: "plan-eng-review",
          },
        },
        {
          availabilityBySource: {
            gstack: availabilityEvaluator,
          },
          compatibilityBySource: {
            gstack: compatibilityEvaluator,
          },
        },
      ),
    ).toEqual({
      support: {
        supported: false,
        reasonCode: "unsupported_host_source_projection",
      },
    })

    expect(availabilityEvaluator).not.toHaveBeenCalled()
    expect(compatibilityEvaluator).not.toHaveBeenCalled()
  })

  it("returns separate availability and compatibility results for supported projections", () => {
    const availabilityEvaluator = vi.fn(() => ({
      status: "not_detected",
      reason: "No gstack install could be detected.",
    }))
    const compatibilityEvaluator = vi.fn(() => ({
      status: "untested",
      reason: "The detected gstack version is outside tested ranges.",
    }))

    expect(
      readinessLibrary.evaluateProjectionReadiness!(
        {
          host: "opencode",
          workflowKind: "superpowers",
          sourceEntry: {
            canonicalRoute: "phase.plan",
            source: "gstack",
            entryName: "plan-eng-review",
          },
        },
        {
          availabilityBySource: {
            gstack: availabilityEvaluator,
          },
          compatibilityBySource: {
            gstack: compatibilityEvaluator,
          },
        },
      ),
    ).toEqual({
      support: {
        supported: true,
      },
      availability: {
        status: "not_detected",
        reason: "No gstack install could be detected.",
      },
      compatibility: {
        status: "untested",
        reason: "The detected gstack version is outside tested ranges.",
      },
    })

    expect(availabilityEvaluator).toHaveBeenCalledOnce()
    expect(compatibilityEvaluator).toHaveBeenCalledOnce()
  })

  it("returns structured not_implemented availability when a supported projection has no evaluator", () => {
    expect(
      readinessLibrary.evaluateProjectionReadiness!({
        host: "opencode",
        workflowKind: "direct",
        sourceEntry: {
          canonicalRoute: "intent.plan",
          source: "direct",
        },
      }),
    ).toEqual({
      support: {
        supported: true,
      },
      availability: {
        status: "not_implemented",
        reason: "No upstream availability evaluator is implemented for direct sources.",
      },
      compatibility: null,
    })
  })

  it("normalizes evaluator exceptions into a structured availability error", () => {
    const compatibilityEvaluator = vi.fn(() => ({
      status: "compatible",
      reason: "The detected superpowers version is within a tested range.",
    }))

    expect(
      readinessLibrary.evaluateProjectionReadiness!(
        {
          host: "opencode",
          workflowKind: "superpowers",
          sourceEntry: {
            canonicalRoute: "phase.plan",
            source: "gstack",
            entryName: "plan-eng-review",
          },
        },
        {
          availabilityBySource: {
            gstack: () => {
              throw new Error("detector crashed")
            },
          },
          compatibilityBySource: {
            gstack: compatibilityEvaluator,
          },
        },
      ),
    ).toEqual({
      support: {
        supported: true,
      },
      availability: {
        status: "error",
        reason: "Upstream availability evaluator failed for gstack: detector crashed",
      },
      compatibility: {
        status: "compatible",
        reason: "The detected superpowers version is within a tested range.",
      },
    })

    expect(compatibilityEvaluator).toHaveBeenCalledOnce()
  })
})
