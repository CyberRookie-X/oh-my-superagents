import { describe, expect, it } from "vitest"
import { getHostProjectionDecision, getControlPlaneCommandDecision } from "../src/capabilities.js"

describe("copilot capabilities", () => {
  it("supports superpowers projection", () => {
    const decision = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "superpowers",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
    })
    expect(decision.supported).toBe(true)
  })

  it("supports direct mode projection", () => {
    const decision = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "direct",
      sourceEntry: {
        canonicalRoute: "intent.review",
        source: "direct",
      },
    })
    expect(decision.supported).toBe(true)
  })

  it("supports gstack source projection", () => {
    const decision = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "superpowers",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "gstack",
        entryName: "plan-eng-review",
      },
    })
    expect(decision.supported).toBe(true)
  })

  it("supports all control plane commands", () => {
    for (const command of ["status", "use", "disable", "sync", "doctor", "explain"] as const) {
      const decision = getControlPlaneCommandDecision({
        host: "copilot",
        command,
        workflowKind: "superpowers",
      })
      expect(decision.supported).toBe(true)
    }
  })

  it("supports control plane commands in direct mode", () => {
    for (const command of ["status", "sync", "doctor"] as const) {
      const decision = getControlPlaneCommandDecision({
        host: "copilot",
        command,
        workflowKind: "direct",
      })
      expect(decision.supported).toBe(true)
    }
  })
})
