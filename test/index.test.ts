import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

describe("library exports", () => {
  it("exports Stage 1 control-plane and Stage 2 Qwen helpers", () => {
    expect(library.resolveControlPlane).toBeTypeOf("function")
    expect(library.prepareControlPlaneStateWrite).toBeTypeOf("function")
    expect(library.buildQwenArtifacts).toBeTypeOf("function")
    expect(library.discoverQwenUpstreamSkills).toBeTypeOf("function")
    expect(library.renderQwenAgentFile).toBeTypeOf("function")
  })

  it("exports the superpowers route catalog adapter helpers", () => {
    expect(Array.isArray(library.SUPERPOWERS_ROUTE_CATALOG)).toBe(true)
    expect(library.SUPERPOWERS_ROUTE_CATALOG).toContain("brainstorming")
    expect(library.resolveRoute).toBeTypeOf("function")
  })
})
