import { describe, expect, it } from "vitest"
import {
  buildResumePacket,
  createContextArtifact,
  isContextArtifactFresh,
} from "../src/context-artifacts.js"

describe("createContextArtifact", () => {
  it("creates authoritative OMS plan artifacts with explicit provenance", () => {
    expect(createContextArtifact({
      kind: "plan",
      path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
      authority: "authoritative",
      source: "oms",
      lifecycleStage: "plan",
    })).toMatchObject({
      kind: "plan",
      authority: "authoritative",
      source: "oms",
      lifecycleStage: "plan",
    })
  })
})

describe("isContextArtifactFresh", () => {
  it("treats zero commits since artifact as fresh", () => {
    expect(isContextArtifactFresh({ commitsSinceArtifact: 0 })).toBe(true)
  })

  it("treats review artifacts with later commits as stale", () => {
    expect(isContextArtifactFresh({ reviewedCommit: "abc123", headCommit: "def456", commitsSinceArtifact: 2 })).toBe(false)
  })

  it("treats artifacts past staleAfter as stale when now is supplied", () => {
    expect(isContextArtifactFresh({
      staleAfter: "2026-04-15T12:00:00.000Z",
      now: "2026-04-15T12:00:01.000Z",
    })).toBe(false)
  })
})

describe("buildResumePacket", () => {
  it("builds a minimal packet from authoritative artifact paths and unresolved decisions", () => {
    expect(buildResumePacket({
      lifecycleStage: "review",
      nextStep: "Run the review-focused command for the active source.",
      authoritativeArtifacts: [
        "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
        "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
      ],
      unresolvedDecisions: ["Choose the initial MCP provider priority order."],
      requiredRechecks: ["Re-run pnpm test -- --run test/context-packs.test.ts before continuing."],
    })).toEqual({
      lifecycleStage: "review",
      nextStep: "Run the review-focused command for the active source.",
      authoritativeArtifacts: [
        "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
        "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
      ],
      unresolvedDecisions: ["Choose the initial MCP provider priority order."],
      requiredRechecks: ["Re-run pnpm test -- --run test/context-packs.test.ts before continuing."],
    })
  })

  it("clones optional freshness metadata for later safe resume checks", () => {
    const freshness = {
      headCommit: "def456",
      reviewedCommit: "abc123",
      commitsSinceArtifact: 0,
      staleAfter: "2026-04-16T00:00:00.000Z",
    }

    const packet = buildResumePacket({
      lifecycleStage: "review",
      nextStep: "Resume from the latest authoritative review packet.",
      authoritativeArtifacts: ["docs/superpowers/reviews/2026-04-15-review-log.md"],
      unresolvedDecisions: [],
      requiredRechecks: [],
      freshness,
    })

    freshness.headCommit = "mutated"
    freshness.reviewedCommit = "mutated"
    freshness.commitsSinceArtifact = 3
    freshness.staleAfter = "2026-04-17T00:00:00.000Z"

    expect(packet.freshness).toEqual({
      headCommit: "def456",
      reviewedCommit: "abc123",
      commitsSinceArtifact: 0,
      staleAfter: "2026-04-16T00:00:00.000Z",
    })
    expect(packet.freshness).not.toBe(freshness)
  })
})
