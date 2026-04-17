# Context Lifecycle and Artifact Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared lifecycle-stage and context-artifact primitives that every later Hybrid+ stage depends on.

**Architecture:** Introduce two small shared modules in the OMS core: one module for lifecycle-stage semantics and one module for context artifacts, freshness, and resume packets. Keep both modules pure and independent from host adapters so later D1, D2, compression, and provider work can build on one stable foundation.

**Tech Stack:** TypeScript, Vitest, existing canonical route/source types, OMS library exports

---

## Scope Decomposition

This plan covers only the shared foundations for Hybrid+ context orchestration.

It includes:

- lifecycle-stage constants and derivation helpers
- compression-boundary classification helpers
- context-artifact authority and freshness types
- resume-packet helpers
- library exports and focused unit tests

Deferred to later plans:

- indexing real artifacts from disk
- integrating lifecycle/artifact data into `resolveControlPlane`
- selecting context packs
- evaluating compression readiness
- invoking built-in or external compression engines

## File Structure

### Shared lifecycle model

- Create: `src/context-lifecycle.ts`
  - define lifecycle stage ids, compression moment ids, and derivation helpers

### Shared artifact model

- Create: `src/context-artifacts.ts`
  - define artifact authority, freshness, and resume-packet helpers

### Exports

- Modify: `src/index.ts`
  - export the new lifecycle and artifact modules

### Tests

- Create: `test/context-lifecycle.test.ts`
- Create: `test/context-artifacts.test.ts`

## Execution Notes

- Keep routing truth out of these modules. They consume canonical routes; they do not define them.
- Prefer explicit string unions and small helpers over clever inference.
- Lifecycle derivation should use source-entry names where those names carry stronger context-boundary meaning than canonical routes.
- Artifact freshness should stay simple and deterministic at this stage.

### Task 1: Add the Shared Lifecycle Stage Module

**Files:**
- Create: `src/context-lifecycle.ts`
- Create: `test/context-lifecycle.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing lifecycle tests**

Create `test/context-lifecycle.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the focused lifecycle tests and verify failure**

Run: `pnpm test -- --run test/context-lifecycle.test.ts`

Expected: FAIL because `src/context-lifecycle.ts` does not exist yet.

- [ ] **Step 3: Implement the shared lifecycle module**

Create `src/context-lifecycle.ts` with:

```ts
import type { ControlPlaneCommandKey } from "./config.js"
import type { CanonicalRouteId, WorkflowSourceEntry } from "./workflow-sources.js"

export const CONTEXT_LIFECYCLE_STAGES = [
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
] as const

export type ContextLifecycleStage = (typeof CONTEXT_LIFECYCLE_STAGES)[number]

export const CONTEXT_COMPRESSION_MOMENTS = [
  "subagent-handoff",
  "plan-checkpoint",
  "review-checkpoint",
  "verification-checkpoint",
  "session-resume",
  "source-switch",
  "branch-integration",
] as const

export type ContextCompressionMoment = (typeof CONTEXT_COMPRESSION_MOMENTS)[number]

const GSTACK_ENTRY_TO_STAGE: Record<string, ContextLifecycleStage> = {
  "plan-eng-review": "plan",
  review: "review",
  qa: "verify",
  ship: "integrate_branch",
}

export function deriveLifecycleStage(input: {
  command: ControlPlaneCommandKey | "explain"
  canonicalRoute: CanonicalRouteId
  sourceEntry: WorkflowSourceEntry
  lifecycleHint?: ContextLifecycleStage
}): ContextLifecycleStage {
  if (input.lifecycleHint) {
    return input.lifecycleHint
  }

  if (input.sourceEntry.source === "gstack" && input.sourceEntry.entryName) {
    const mapped = GSTACK_ENTRY_TO_STAGE[input.sourceEntry.entryName]
    if (mapped) {
      return mapped
    }
  }

  switch (input.canonicalRoute) {
    case "phase.brainstorm":
      return "design"
    case "phase.plan":
      return "plan"
    case "phase.execute":
      return "execute_task"
    case "phase.review":
      return "review"
    case "phase.verify":
    case "phase.web-test":
      return "verify"
    case "phase.visual":
      return "design"
    default:
      return input.canonicalRoute.startsWith("intent.") ? "execute_task" : "bootstrap"
  }
}

export function isLifecycleCompressionBoundary(stage: ContextLifecycleStage) {
  return stage === "plan"
    || stage === "review"
    || stage === "verify"
    || stage === "integrate_branch"
    || stage === "checkpoint"
    || stage === "resume"
}
```

Export the new lifecycle helpers from `src/index.ts`:

```ts
export * from "./context-lifecycle.js"
```

- [ ] **Step 4: Run the focused lifecycle tests and verify they pass**

Run: `pnpm test -- --run test/context-lifecycle.test.ts`

Expected: PASS for the new lifecycle primitives.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/context-lifecycle.ts src/index.ts test/context-lifecycle.test.ts
git commit -m "feat: add context lifecycle foundations"
```

### Task 2: Add the Shared Context Artifact and Resume-Packet Module

**Files:**
- Create: `src/context-artifacts.ts`
- Create: `test/context-artifacts.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing artifact-model tests**

Create `test/context-artifacts.test.ts` with:

```ts
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
})
```

- [ ] **Step 2: Run the focused artifact-model tests and verify failure**

Run: `pnpm test -- --run test/context-artifacts.test.ts`

Expected: FAIL because `src/context-artifacts.ts` does not exist yet.

- [ ] **Step 3: Implement the shared context-artifact module**

Create `src/context-artifacts.ts` with:

```ts
import type { ContextLifecycleStage } from "./context-lifecycle.js"

export const CONTEXT_ARTIFACT_AUTHORITIES = ["authoritative", "derived", "advisory"] as const
export type ContextArtifactAuthority = (typeof CONTEXT_ARTIFACT_AUTHORITIES)[number]

export const CONTEXT_ARTIFACT_SOURCES = ["oms", "superpowers", "gstack", "gsd", "external"] as const
export type ContextArtifactSource = (typeof CONTEXT_ARTIFACT_SOURCES)[number]

export type ContextArtifact = {
  kind: "spec" | "plan" | "decision" | "knowledge" | "summary" | "checkpoint" | "review-log" | "verification" | "anchor" | "continue-packet" | "repo-pack" | "memory-snapshot"
  path: string
  authority: ContextArtifactAuthority
  source: ContextArtifactSource
  lifecycleStage?: ContextLifecycleStage
  updatedAt?: string
  headCommit?: string
  reviewedCommit?: string
  commitsSinceArtifact?: number
  staleAfter?: string
}

export type ResumePacket = {
  lifecycleStage: ContextLifecycleStage
  nextStep: string
  authoritativeArtifacts: string[]
  unresolvedDecisions: string[]
  requiredRechecks: string[]
}

export function createContextArtifact(input: ContextArtifact): ContextArtifact {
  return { ...input }
}

export function isContextArtifactFresh(input: {
  headCommit?: string
  reviewedCommit?: string
  commitsSinceArtifact?: number
}) {
  if ((input.commitsSinceArtifact ?? 0) > 0) {
    return false
  }

  if (input.reviewedCommit && input.headCommit && input.reviewedCommit !== input.headCommit) {
    return false
  }

  return true
}

export function buildResumePacket(input: ResumePacket): ResumePacket {
  return {
    lifecycleStage: input.lifecycleStage,
    nextStep: input.nextStep,
    authoritativeArtifacts: [...input.authoritativeArtifacts],
    unresolvedDecisions: [...input.unresolvedDecisions],
    requiredRechecks: [...input.requiredRechecks],
  }
}
```

Export the new artifact helpers from `src/index.ts`:

```ts
export * from "./context-artifacts.js"
```

- [ ] **Step 4: Run the focused artifact-model tests and verify they pass**

Run: `pnpm test -- --run test/context-artifacts.test.ts`

Expected: PASS for the artifact model and resume-packet helpers.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/context-artifacts.ts src/index.ts test/context-artifacts.test.ts
git commit -m "feat: add context artifact foundations"
```
