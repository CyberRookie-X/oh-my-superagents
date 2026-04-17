import { describe, expect, it } from "vitest"
import { resolveContextCompressionPolicy, selectContextPacks } from "../src/context-packs.js"

const planSelectionArtifacts = [
  { kind: "spec", path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", authority: "authoritative", source: "oms", lifecycleStage: "design" },
  { kind: "plan", path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
  { kind: "knowledge", path: ".gsd/KNOWLEDGE.md", authority: "derived", source: "gsd" },
  { kind: "decision", path: ".gsd/DECISIONS.md", authority: "derived", source: "gsd", lifecycleStage: "plan" },
] as const

describe("resolveContextCompressionPolicy", () => {
  it("merges a selected compression preset with explicit settings overrides", () => {
    expect(resolveContextCompressionPolicy({
      compressionPresets: {
        balanced: {
          mode: "suggest",
          engine: "hybrid",
          inlineLevel: "standard",
          moments: { subagentHandoff: true, planCheckpoint: true, reviewCheckpoint: true, verificationCheckpoint: true, sessionResume: true, sourceSwitch: false, branchIntegration: true },
          safety: { allowConditional: false, requireFreshVerification: true },
        },
      },
      contextCompression: {
        preset: "balanced",
        mode: "auto",
        moments: { sessionResume: false },
      },
    })).toMatchObject({
      mode: "auto",
      engine: "hybrid",
      moments: expect.objectContaining({ planCheckpoint: true, sessionResume: false }),
    })
  })

  it("falls back safely when the selected preset name is unknown", () => {
    const policy = resolveContextCompressionPolicy({
      compressionPresets: {
        balanced: {
          mode: "suggest",
          engine: "hybrid",
          inlineLevel: "standard",
          moments: { subagentHandoff: false, planCheckpoint: true, reviewCheckpoint: false, verificationCheckpoint: false, sessionResume: false, sourceSwitch: false, branchIntegration: false },
          safety: { allowConditional: true, requireFreshVerification: false },
        },
      },
      contextCompression: {
        preset: "missing",
        mode: "auto",
        inlineLevel: "standard",
      },
    })

    expect(policy).toMatchObject({
      mode: "auto",
      engine: "builtin",
      inlineLevel: "standard",
      moments: expect.objectContaining({ planCheckpoint: false }),
      safety: expect.objectContaining({ allowConditional: false, requireFreshVerification: true }),
    })
    expect(policy).not.toHaveProperty("preset")
  })
})

describe("selectContextPacks", () => {
  it("selects plan-centric packs for the planning lifecycle stage", () => {
    const selection = selectContextPacks({
      lifecycleStage: "plan",
      canonicalRoute: "phase.plan",
      resolvedSource: "superpowers",
      artifacts: [...planSelectionArtifacts],
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: { planCheckpoint: true },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
    })

    expect(selection.packIds).toEqual(["spec-core", "plan-core", "knowledge-support"])
    expect(selection.artifacts.map((artifact) => artifact.path)).toEqual([
      "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
      "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
      ".gsd/KNOWLEDGE.md",
    ])
  })

  it("does not select plan packs for non-planning routes", () => {
    const selection = selectContextPacks({
      lifecycleStage: "plan",
      canonicalRoute: "phase.review",
      resolvedSource: "superpowers",
      artifacts: [...planSelectionArtifacts],
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: { planCheckpoint: true },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
    })

    expect(selection.packIds).toEqual(["knowledge-support"])
    expect(selection.artifacts.map((artifact) => artifact.path)).toEqual([".gsd/KNOWLEDGE.md"])
  })

  it("does not select plan packs outside the plan lifecycle stage", () => {
    const selection = selectContextPacks({
      lifecycleStage: "review",
      canonicalRoute: "phase.plan",
      resolvedSource: "superpowers",
      artifacts: [...planSelectionArtifacts],
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: { planCheckpoint: true },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
    })

    expect(selection.packIds).toEqual(["knowledge-support"])
    expect(selection.artifacts.map((artifact) => artifact.path)).toEqual([".gsd/KNOWLEDGE.md"])
  })

  it("omits knowledge-support for minimal inline policies", () => {
    const selection = selectContextPacks({
      lifecycleStage: "plan",
      canonicalRoute: "phase.plan",
      resolvedSource: "superpowers",
      artifacts: [...planSelectionArtifacts],
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "minimal",
        moments: { planCheckpoint: true },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
    })

    expect(selection.packIds).toEqual(["spec-core", "plan-core"])
    expect(selection.artifacts.map((artifact) => artifact.path)).toEqual([
      "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
      "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
    ])
  })

  it("suppresses plan-centric packs when the plan checkpoint moment is disabled", () => {
    const selection = selectContextPacks({
      lifecycleStage: "plan",
      canonicalRoute: "phase.plan",
      resolvedSource: "superpowers",
      artifacts: [...planSelectionArtifacts],
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: { planCheckpoint: false },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
    })

    expect(selection.packIds).toEqual(["knowledge-support"])
    expect(selection.artifacts.map((artifact) => artifact.path)).toEqual([".gsd/KNOWLEDGE.md"])
  })

  it("suppresses plan-centric packs when the plan checkpoint moment is omitted", () => {
    const selection = selectContextPacks({
      lifecycleStage: "plan",
      canonicalRoute: "phase.plan",
      resolvedSource: "superpowers",
      artifacts: [...planSelectionArtifacts],
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: {},
        safety: { allowConditional: false, requireFreshVerification: true },
      },
    })

    expect(selection.packIds).toEqual(["knowledge-support"])
    expect(selection.artifacts.map((artifact) => artifact.path)).toEqual([".gsd/KNOWLEDGE.md"])
  })
})
