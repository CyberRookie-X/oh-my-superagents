import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

const indexLibrary = library as typeof library & {
  applyRoutingProposalToConfig?: unknown
  renderRoutingConfigDocument?: unknown
}

describe("library exports", () => {
  it("exports Stage 1 control-plane and Stage 2 Qwen helpers", () => {
    expect(indexLibrary.resolveControlPlane).toBeTypeOf("function")
    expect(indexLibrary.prepareControlPlaneStateWrite).toBeTypeOf("function")
    expect(indexLibrary.buildClaudeArtifacts).toBeTypeOf("function")
    expect(indexLibrary.buildQwenArtifacts).toBeTypeOf("function")
    expect(indexLibrary.discoverQwenUpstreamSkills).toBeTypeOf("function")
    expect(indexLibrary.renderClaudeSkillFile).toBeTypeOf("function")
    expect(indexLibrary.renderQwenAgentFile).toBeTypeOf("function")
  })

  it("exports the superpowers route catalog adapter helpers", () => {
    expect(Array.isArray(indexLibrary.SUPERPOWERS_ROUTE_CATALOG)).toBe(true)
    expect(indexLibrary.SUPERPOWERS_ROUTE_CATALOG).toContain("brainstorming")
    expect(indexLibrary.resolveRoute).toBeTypeOf("function")
  })

  it("exports routing authoring helpers", () => {
    expect(indexLibrary.buildRoutingProposal).toBeTypeOf("function")
    expect(indexLibrary.inspectRoutingAuthoringInputs).toBeTypeOf("function")
    expect(indexLibrary.applyRoutingProposalToConfig).toBeUndefined()
    expect(indexLibrary.renderRoutingConfigDocument).toBeUndefined()
  })

  it("re-exports context artifact helpers from the library entrypoint", () => {
    expect(indexLibrary.createContextArtifact).toBeTypeOf("function")
    expect(indexLibrary.isContextArtifactFresh).toBeTypeOf("function")
    expect(indexLibrary.buildResumePacket).toBeTypeOf("function")
  })

  it("re-exports context pack selectors from the library entrypoint", () => {
    expect(indexLibrary.resolveContextCompressionPolicy).toBeTypeOf("function")
    expect(indexLibrary.selectContextPacks).toBeTypeOf("function")
  })

  it("re-exports context compression readiness helpers from the library entrypoint", () => {
    expect(indexLibrary.evaluateCompressionReadiness).toBeTypeOf("function")
  })

  it("re-exports context manifest and lifecycle event contracts from the library entrypoint", () => {
    expect(indexLibrary.CONTEXT_PROVIDER_CAPABILITIES).toEqual(["recall", "search", "summarize", "pack", "status"])
    expect(indexLibrary.parseContextProviderManifest).toBeTypeOf("function")
    expect(indexLibrary.CONTEXT_LIFECYCLE_EVENTS).toEqual([
      "session_start",
      "before_compact",
      "after_edit",
      "post_commit",
      "session_end",
      "reindex_complete",
    ])
    expect(indexLibrary.isContextLifecycleEvent).toBeTypeOf("function")
  })

  it("re-exports context provider registry and CLI adapter helpers", () => {
    expect(indexLibrary.resolveContextProviders).toBeTypeOf("function")
    expect(indexLibrary.runCliContextProvider).toBeTypeOf("function")
  })
})
