import { describe, expect, it } from "vitest"
import { classifyOpenSpecArtifact } from "../src/openspec.js"

describe("classifyOpenSpecArtifact", () => {
  it("classifies spec and change artifacts without treating them as workflow sources", () => {
    expect(classifyOpenSpecArtifact("openspec/specs/auth/spec.md")).toEqual({
      kind: "spec",
      dialect: "openspec",
    })
    expect(classifyOpenSpecArtifact("openspec/changes/add-auth/tasks.md")).toEqual({
      kind: "plan",
      dialect: "openspec",
    })
  })

  it("ignores non-openspec specs and generic change task paths", () => {
    expect(classifyOpenSpecArtifact("docs/superpowers/specs/2026-04-17-design.md")).toBeUndefined()
    expect(classifyOpenSpecArtifact(".agents/superpowers/specs/auth/spec.md")).toBeUndefined()
    expect(classifyOpenSpecArtifact("changes/add-auth/tasks.md")).toBeUndefined()
  })
})
