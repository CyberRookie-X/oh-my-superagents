import { describe, expect, it } from "vitest"
import {
  buildBuiltinCompressionBundle,
  evaluateCompressionReadiness,
  truncateMarkdownStructurally,
} from "../src/context-compression.js"
import { resolveContextCompressionPolicy } from "../src/context-packs.js"

const TRUNCATION_NOTICE = "\n\n[...truncated by OMS built-in compression]"

function createPolicy(input: {
  moments?: {
    subagentHandoff?: boolean
    planCheckpoint?: boolean
    reviewCheckpoint?: boolean
    verificationCheckpoint?: boolean
    sessionResume?: boolean
    sourceSwitch?: boolean
    branchIntegration?: boolean
  }
  safety?: {
    allowConditional?: boolean
    requireFreshVerification?: boolean
  }
} = {}) {
  return resolveContextCompressionPolicy({
    contextCompression: {
      mode: "auto",
      engine: "hybrid",
      inlineLevel: "standard",
      moments: input.moments,
      safety: input.safety,
    },
  })
}

describe("evaluateCompressionReadiness", () => {
  it("returns safe when authoritative artifacts and deterministic resume data exist", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "plan",
      policy: createPolicy({ moments: { planCheckpoint: true } }),
      artifacts: [
        { kind: "spec", path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", authority: "authoritative", source: "oms", lifecycleStage: "design" },
        { kind: "plan", path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
      ],
      unresolvedDecisions: [],
      freshness: { headCommit: "abc123", commitsSinceArtifact: 0 },
    })).toMatchObject({
      state: "safe",
      resumePacket: {
        lifecycleStage: "plan",
        authoritativeArtifacts: [
          "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
        ],
        unresolvedDecisions: [],
        requiredRechecks: [],
        freshness: { headCommit: "abc123", commitsSinceArtifact: 0 },
      },
    })
  })

  it("returns unsafe when authoritative artifacts belong to a different lifecycle boundary", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "review",
      policy: createPolicy({ moments: { reviewCheckpoint: true } }),
      artifacts: [
        { kind: "plan", path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
      ],
      unresolvedDecisions: [],
      freshness: { headCommit: "def456", commitsSinceArtifact: 0 },
    })).toMatchObject({
      state: "unsafe",
      reason: "No authoritative artifacts are available for this compression boundary.",
    })
  })

  it("returns unsafe when authoritative artifacts omit lifecycleStage for a boundary-scoped check", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "review",
      policy: createPolicy({ moments: { reviewCheckpoint: true } }),
      artifacts: [
        { kind: "review-log", path: "docs/superpowers/reviews/2026-04-15-review-log.md", authority: "authoritative", source: "oms" },
      ],
      unresolvedDecisions: [],
      freshness: { headCommit: "def456", commitsSinceArtifact: 0 },
    })).toMatchObject({
      state: "unsafe",
      reason: "No authoritative artifacts are available for this compression boundary.",
    })
  })

  it("returns unsafe when no authoritative artifact exists for the current boundary", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "review",
      policy: createPolicy({ moments: { reviewCheckpoint: true } }),
      artifacts: [
        { kind: "summary", path: ".gsd/SUMMARY.md", authority: "derived", source: "gsd" },
      ],
      unresolvedDecisions: [],
      freshness: { headCommit: "def456", commitsSinceArtifact: 0 },
    })).toMatchObject({ state: "unsafe" })
  })

  it("returns conditional with a resume packet when authoritative artifacts are stale but conditional compression is allowed", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "review",
      policy: createPolicy({
        moments: { reviewCheckpoint: true },
        safety: { allowConditional: true },
      }),
      artifacts: [
        { kind: "review-log", path: "docs/superpowers/reviews/2026-04-15-review-log.md", authority: "authoritative", source: "oms", lifecycleStage: "review" },
      ],
      unresolvedDecisions: ["Confirm the final reviewer assignment."],
      freshness: { headCommit: "def456", reviewedCommit: "abc123", commitsSinceArtifact: 2 },
    })).toMatchObject({
      state: "conditional",
      resumePacket: {
        lifecycleStage: "review",
        authoritativeArtifacts: ["docs/superpowers/reviews/2026-04-15-review-log.md"],
        unresolvedDecisions: ["Confirm the final reviewer assignment."],
        requiredRechecks: ["Refresh authoritative artifacts against the current HEAD before resuming compression."],
        freshness: { headCommit: "def456", reviewedCommit: "abc123", commitsSinceArtifact: 2 },
      },
    })
  })

  it("returns unsafe when authoritative artifacts are stale and conditional compression is disabled", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "review",
      policy: createPolicy({ moments: { reviewCheckpoint: true } }),
      artifacts: [
        { kind: "review-log", path: "docs/superpowers/reviews/2026-04-15-review-log.md", authority: "authoritative", source: "oms", lifecycleStage: "review" },
      ],
      unresolvedDecisions: [],
      freshness: { headCommit: "def456", reviewedCommit: "abc123", commitsSinceArtifact: 1 },
    })).toEqual({
      state: "unsafe",
      reason: "Freshness verification failed and conditional compression is disabled by policy.",
    })
  })
})

describe("buildBuiltinCompressionBundle", () => {
  it("preserves selected pack order and keeps truncated entries within the requested limit", () => {
    const truncatedSpecPrefix = "# Summary\nAlpha"
    const maxCharsPerArtifact = truncatedSpecPrefix.length + TRUNCATION_NOTICE.length

    const bundle = buildBuiltinCompressionBundle({
      selection: {
        lifecycleStage: "plan",
        packIds: ["spec-core", "plan-core"],
        artifacts: [
          {
            kind: "spec",
            path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "design",
            content: "# Summary\nAlpha\n## Deep Details\n" + "x".repeat(6000),
          },
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-hybrid-context-orchestration-plan.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            content: "Plan step 1\nPlan step 2",
          },
        ],
        policy: createPolicy({ moments: { planCheckpoint: true } }),
      },
      maxCharsPerArtifact,
    })

    expect(bundle.packIds).toEqual(["spec-core", "plan-core"])
    expect(bundle.entries.map((entry) => [entry.path, entry.kind])).toEqual([
      ["docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", "spec"],
      ["docs/superpowers/plans/2026-04-15-hybrid-context-orchestration-plan.md", "plan"],
    ])
    expect(bundle.entries[0]?.content.length).toBeLessThanOrEqual(maxCharsPerArtifact)
    expect(bundle.entries[0]?.content).toBe(truncatedSpecPrefix + TRUNCATION_NOTICE)
    expect(bundle.entries[1]?.content).toBe("Plan step 1\nPlan step 2")
  })
})

describe("truncateMarkdownStructurally", () => {
  it("returns short markdown unchanged", () => {
    const content = "# Summary\n\nAlpha"

    expect(truncateMarkdownStructurally(content, content.length)).toBe(content)
  })

  it("chooses the last markdown boundary within the capped content window", () => {
    const prefix = "# Summary\nAlpha\n## First Section\nBody"
    const maxChars = prefix.length + TRUNCATION_NOTICE.length
    const content = `${prefix}\n## Second Section\n${"x".repeat(40)}`

    expect(truncateMarkdownStructurally(content, maxChars)).toBe(prefix + TRUNCATION_NOTICE)
  })

  it("treats non-## ATX headings as structural boundaries", () => {
    const prefix = "# Summary\nAlpha\n### First Section\nBody"
    const content = `${prefix}\n### Second Section\n${"x".repeat(40)}`
    const maxChars = content.indexOf("\n### Second Section") + 5 + TRUNCATION_NOTICE.length

    expect(truncateMarkdownStructurally(content, maxChars)).toBe(prefix + TRUNCATION_NOTICE)
  })

  it("treats indented ATX headings as structural boundaries", () => {
    const prefix = "# Summary\nAlpha\n   ### First Section\nBody"
    const content = `${prefix}\n   ### Second Section\n${"x".repeat(40)}`
    const maxChars = content.indexOf("\n   ### Second Section") + 5 + TRUNCATION_NOTICE.length

    expect(truncateMarkdownStructurally(content, maxChars)).toBe(prefix + TRUNCATION_NOTICE)
  })

  it("treats heading lines that end right after the hash run as structural boundaries", () => {
    const prefix = "# Summary\nBody"
    const content = `${prefix}\n###\n${"x".repeat(80)}`
    const maxChars = content.indexOf("\n###\n") + 3 + TRUNCATION_NOTICE.length

    expect(truncateMarkdownStructurally(content, maxChars)).toBe(prefix + TRUNCATION_NOTICE)
  })

  it("falls back to direct truncation at the limit when no boundary exists", () => {
    const maxChars = TRUNCATION_NOTICE.length + 5

    expect(truncateMarkdownStructurally("abcdefghijklmnopqrstuvwxyz".repeat(2), maxChars)).toBe("abcde" + TRUNCATION_NOTICE)
  })

  it("keeps useful first-section content when the only boundary is a start-of-file heading", () => {
    const content = "## Intro\nBody text with useful detail that keeps going well beyond the retained window"
    const retainedPrefix = content.slice(0, 18)
    const maxChars = retainedPrefix.length + TRUNCATION_NOTICE.length

    expect(truncateMarkdownStructurally(content, maxChars)).toBe(retainedPrefix + TRUNCATION_NOTICE)
  })

  it("treats CRLF headings as structural boundaries", () => {
    const prefix = "# Summary\r\nAlpha\r\n## First Section\r\nBody"
    const maxChars = prefix.length + TRUNCATION_NOTICE.length
    const content = `${prefix}\r\n## Second Section\r\n${"x".repeat(40)}`

    expect(truncateMarkdownStructurally(content, maxChars)).toBe(prefix + TRUNCATION_NOTICE)
  })

  it("returns a capped notice variant when the limit cannot fit the full notice", () => {
    expect(truncateMarkdownStructurally("abcdef", 5)).toBe(TRUNCATION_NOTICE.slice(0, 5))
    expect(truncateMarkdownStructurally("abcdef", 0)).toBe("")
  })
})
