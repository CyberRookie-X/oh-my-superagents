import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

const capabilityLibrary = library as typeof library & {
  CAPABILITY_REASON_CODES?: readonly string[]
  isSourceRouteSupported?: (source: "superpowers" | "gstack" | "direct", canonicalRoute: string) => boolean
  getHostProjectionDecision?: (input: {
    host: "opencode" | "codex" | "qwen" | "claude"
    workflowKind: "superpowers" | "direct"
    sourceEntry: {
      canonicalRoute: string
      source: "superpowers" | "gstack" | "direct"
      entryName?: string
    }
  }) => {
    supported: boolean
    reasonCode?: string
  }
  getControlPlaneCommandDecision?: (input: {
    host: "opencode" | "codex" | "qwen" | "claude"
    command: "status" | "use" | "disable" | "sync" | "doctor" | "explain"
    workflowKind: "superpowers" | "direct"
  }) => {
    supported: boolean
    reasonCode?: string
  }
}

describe("capability registry", () => {
  it("exports stable capability reason codes", () => {
    expect(capabilityLibrary.CAPABILITY_REASON_CODES).toEqual([
      "unsupported_source_route",
      "unsupported_host_source_projection",
      "unsupported_host_direct_projection",
      "unsupported_control_plane_command",
      "unsupported_workflow_mode",
    ])
  })

  it("checks source-native route support through the source adapters", () => {
    expect(capabilityLibrary.isSourceRouteSupported).toBeTypeOf("function")

    expect(capabilityLibrary.isSourceRouteSupported!("superpowers", "phase.plan")).toBe(true)
    expect(capabilityLibrary.isSourceRouteSupported!("superpowers", "intent.plan")).toBe(false)
    expect(capabilityLibrary.isSourceRouteSupported!("gstack", "phase.plan")).toBe(true)
    expect(capabilityLibrary.isSourceRouteSupported!("gstack", "phase.brainstorm")).toBe(false)
    expect(capabilityLibrary.isSourceRouteSupported!("direct", "intent.plan")).toBe(true)
    expect(capabilityLibrary.isSourceRouteSupported!("direct", "phase.plan")).toBe(false)
  })

  it("reports host projection support and fails closed for unsupported combinations", () => {
    expect(capabilityLibrary.getHostProjectionDecision).toBeTypeOf("function")

    expect(
      capabilityLibrary.getHostProjectionDecision!({
        host: "opencode",
        workflowKind: "superpowers",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "gstack",
          entryName: "plan-eng-review",
        },
      }),
    ).toEqual({
      supported: true,
    })

    expect(
      capabilityLibrary.getHostProjectionDecision!({
        host: "opencode",
        workflowKind: "superpowers",
        sourceEntry: {
          canonicalRoute: "phase.brainstorm",
          source: "gstack",
        },
      }),
    ).toEqual({
      supported: false,
      reasonCode: "unsupported_source_route",
    })

    expect(
      capabilityLibrary.getHostProjectionDecision!({
        host: "claude",
        workflowKind: "direct",
        sourceEntry: {
          canonicalRoute: "intent.plan",
          source: "direct",
        },
      }),
    ).toEqual({
      supported: false,
      reasonCode: "unsupported_host_direct_projection",
    })

    expect(
      capabilityLibrary.getHostProjectionDecision!({
        host: "qwen",
        workflowKind: "superpowers",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "gstack",
          entryName: "plan-eng-review",
        },
      }),
    ).toEqual({
      supported: false,
      reasonCode: "unsupported_host_source_projection",
    })

    expect(
      capabilityLibrary.getHostProjectionDecision!({
        host: "qwen",
        workflowKind: "direct",
        sourceEntry: {
          canonicalRoute: "intent.plan",
          source: "direct",
        },
      }),
    ).toEqual({
      supported: true,
    })
  })

  it("reports control-plane command support separately from projection support", () => {
    expect(capabilityLibrary.getControlPlaneCommandDecision).toBeTypeOf("function")

    expect(
      capabilityLibrary.getControlPlaneCommandDecision!({
        host: "opencode",
        command: "use",
        workflowKind: "superpowers",
      }),
    ).toEqual({
      supported: true,
    })

    expect(
      capabilityLibrary.getControlPlaneCommandDecision!({
        host: "codex",
        command: "disable",
        workflowKind: "direct",
      }),
    ).toEqual({
      supported: false,
      reasonCode: "unsupported_workflow_mode",
    })

    expect(
      capabilityLibrary.getControlPlaneCommandDecision!({
        host: "qwen",
        command: "explain",
        workflowKind: "superpowers",
      }),
    ).toEqual({
      supported: false,
      reasonCode: "unsupported_control_plane_command",
    })

    expect(
      capabilityLibrary.getControlPlaneCommandDecision!({
        host: "qwen",
        command: "doctor",
        workflowKind: "direct",
      }),
    ).toEqual({
      supported: true,
    })

    expect(
      capabilityLibrary.getControlPlaneCommandDecision!({
        host: "claude",
        command: "status",
        workflowKind: "superpowers",
      }),
    ).toEqual({
      supported: true,
    })
  })
})
