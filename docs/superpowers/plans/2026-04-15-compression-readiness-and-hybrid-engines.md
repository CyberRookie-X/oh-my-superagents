# Compression Readiness and Hybrid Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `CompressionReadiness`, safe-auto policy evaluation, and the built-in rule-first, summary-enhanced compression engine for OMS context packs.

**Architecture:** Introduce one shared compression module that evaluates safety and produces resume packets, then add a built-in engine that first narrows by rule-based manifests and structured truncation before optionally applying summary enhancement. Keep execution engine selection explicit so OMS can run `builtin`, `external`, or `hybrid` paths without hiding the decision.

**Tech Stack:** TypeScript, Vitest, existing lifecycle/artifact/pack-selection modules, CLI diagnostics

---

## Scope Decomposition

This plan covers only compression safety and engine execution.

It includes:

- `CompressionReadiness` evaluation
- built-in rule-first compression bundles
- summary-enhanced augmentation hooks
- CLI diagnostics for opportunities and selected engine behavior

Deferred to later plans:

- external provider registration
- MCP or CLI transport integration
- provider manifest and event contracts

## File Structure

### Shared compression layer

- Create: `src/context-compression.ts`
  - evaluate readiness, build resume packets, and assemble built-in compression bundles

### Core diagnostics integration

- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`

### Tests

- Create: `test/context-compression.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- Default to rule-first compression. Do not require LLM summarization for the base path.
- Treat summary output as derived, never authoritative.
- Safe-auto must be fail-closed: if readiness is not `safe`, automatic execution must not proceed unless policy explicitly allows the conditional case.
- Keep the built-in engine independent from any host-specific runtime or provider hook.

### Task 1: Add Compression Readiness and Resume-Packet Evaluation

**Files:**
- Create: `src/context-compression.ts`
- Create: `test/context-compression.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing readiness tests**

Create `test/context-compression.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { evaluateCompressionReadiness } from "../src/context-compression.js"

describe("evaluateCompressionReadiness", () => {
  it("returns safe when authoritative artifacts and deterministic resume data exist", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "plan",
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: { planCheckpoint: true },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
      artifacts: [
        { kind: "spec", path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", authority: "authoritative", source: "oms", lifecycleStage: "design" },
        { kind: "plan", path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
      ],
      unresolvedDecisions: [],
      freshness: { headCommit: "abc123", commitsSinceArtifact: 0 },
    })).toMatchObject({ state: "safe" })
  })

  it("returns unsafe when no authoritative artifact exists for the current boundary", () => {
    expect(evaluateCompressionReadiness({
      lifecycleStage: "review",
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: { reviewCheckpoint: true },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
      artifacts: [
        { kind: "summary", path: ".gsd/SUMMARY.md", authority: "derived", source: "gsd" },
      ],
      unresolvedDecisions: [],
      freshness: { headCommit: "def456", commitsSinceArtifact: 0 },
    })).toMatchObject({ state: "unsafe" })
  })
})
```

- [ ] **Step 2: Run the focused readiness tests and verify failure**

Run: `pnpm test -- --run test/context-compression.test.ts`

Expected: FAIL because `src/context-compression.ts` does not exist yet.

- [ ] **Step 3: Implement readiness evaluation and resume packets**

Create `src/context-compression.ts` with:

```ts
import { buildResumePacket, isContextArtifactFresh, type ContextArtifact, type ResumePacket } from "./context-artifacts.js"
import type { EffectiveContextCompressionPolicy, EffectiveContextPackSelection } from "./context-packs.js"
import type { ContextLifecycleStage } from "./context-lifecycle.js"

export type CompressionReadiness = {
  state: "safe" | "conditional" | "unsafe"
  reason: string
  resumePacket?: ResumePacket
}

export function evaluateCompressionReadiness(input: {
  lifecycleStage: ContextLifecycleStage
  policy: EffectiveContextCompressionPolicy
  artifacts: ContextArtifact[]
  unresolvedDecisions: string[]
  freshness: { headCommit?: string; reviewedCommit?: string; commitsSinceArtifact?: number }
}): CompressionReadiness {
  const authoritativeArtifacts = input.artifacts.filter((artifact) => artifact.authority === "authoritative")
  if (authoritativeArtifacts.length === 0) {
    return { state: "unsafe", reason: `No authoritative artifacts are available for ${input.lifecycleStage}.` }
  }

  if (!isContextArtifactFresh(input.freshness)) {
    return {
      state: input.policy.safety.allowConditional ? "conditional" : "unsafe",
      reason: "Freshness metadata indicates newer work exists than the candidate artifact boundary.",
      resumePacket: buildResumePacket({
        lifecycleStage: input.lifecycleStage,
        nextStep: "Re-run the relevant verification or review command before compressing.",
        authoritativeArtifacts: authoritativeArtifacts.map((artifact) => artifact.path),
        unresolvedDecisions: input.unresolvedDecisions,
        requiredRechecks: ["Refresh verification or review evidence before compacting."],
      }),
    }
  }

  return {
    state: "safe",
    reason: `Authoritative artifacts exist for ${input.lifecycleStage} and freshness checks passed.`,
    resumePacket: buildResumePacket({
      lifecycleStage: input.lifecycleStage,
      nextStep: `Resume from the ${input.lifecycleStage} stage using the authoritative artifacts below.`,
      authoritativeArtifacts: authoritativeArtifacts.map((artifact) => artifact.path),
      unresolvedDecisions: input.unresolvedDecisions,
      requiredRechecks: [],
    }),
  }
}
```

Export the helper from `src/index.ts`:

```ts
export * from "./context-compression.js"
```

- [ ] **Step 4: Run the focused readiness tests and verify they pass**

Run: `pnpm test -- --run test/context-compression.test.ts`

Expected: PASS for the readiness evaluator.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/context-compression.ts src/index.ts test/context-compression.test.ts
git commit -m "feat: add compression readiness evaluation"
```

### Task 2: Build the Built-In Rule-First Compression Engine

**Files:**
- Modify: `src/context-compression.ts`
- Modify: `test/context-compression.test.ts`

- [ ] **Step 1: Write the failing built-in engine tests**

Extend `test/context-compression.test.ts` with:

```ts
import { buildBuiltinCompressionBundle } from "../src/context-compression.js"

describe("buildBuiltinCompressionBundle", () => {
  it("truncates long markdown structurally and preserves the selected pack ordering", () => {
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
            content: "# Summary\n\nAlpha\n\n## Deep Details\n\n" + "x".repeat(6000),
          },
        ],
        policy: {
          mode: "auto",
          engine: "hybrid",
          inlineLevel: "minimal",
          moments: { planCheckpoint: true },
          safety: { allowConditional: false, requireFreshVerification: true },
        },
      },
      maxCharsPerArtifact: 512,
    })

    expect(bundle.entries[0]?.content.length).toBeLessThanOrEqual(512)
    expect(bundle.entries[0]?.content).toMatch(/Summary/)
    expect(bundle.packIds).toEqual(["spec-core", "plan-core"])
  })
})
```

- [ ] **Step 2: Run the focused built-in engine tests and verify failure**

Run: `pnpm test -- --run test/context-compression.test.ts`

Expected: FAIL because the built-in engine helpers do not exist yet.

- [ ] **Step 3: Implement the rule-first built-in engine**

Extend `src/context-compression.ts` with:

```ts
export type BuiltinCompressionBundle = {
  packIds: string[]
  entries: Array<{ path: string; kind: string; content: string }>
}

export function buildBuiltinCompressionBundle(input: {
  selection: EffectiveContextPackSelection & {
    artifacts: Array<ContextArtifact & { content?: string }>
  }
  maxCharsPerArtifact: number
}): BuiltinCompressionBundle {
  return {
    packIds: [...input.selection.packIds],
    entries: input.selection.artifacts.map((artifact) => ({
      path: artifact.path,
      kind: artifact.kind,
      content: truncateMarkdownStructurally(artifact.content ?? "", input.maxCharsPerArtifact),
    })),
  }
}

export function truncateMarkdownStructurally(content: string, maxChars: number) {
  if (content.length <= maxChars) {
    return content
  }

  const preferredCut = content.lastIndexOf("\n## ", maxChars)
  const cutIndex = preferredCut > 0 ? preferredCut : maxChars
  return `${content.slice(0, cutIndex).trimEnd()}\n\n[...truncated by OMS built-in compression]`
}
```

- [ ] **Step 4: Run the focused built-in engine tests and verify they pass**

Run: `pnpm test -- --run test/context-compression.test.ts`

Expected: PASS for the built-in rule-first engine.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/context-compression.ts test/context-compression.test.ts
git commit -m "feat: add built-in rule-first compression engine"
```

### Task 3: Add Summary Enhancement and CLI Compression Diagnostics

**Files:**
- Modify: `src/context-compression.ts`
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add to `test/control-plane.test.ts`:

```ts
it("includes compression readiness and engine details in resolved context compression state", async () => {
  const resolved = await resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => false,
    readFile: async () => {
      throw new Error("should not read")
    },
  })

  expect(resolved.contextCompression?.readiness).toBeDefined()
  expect(resolved.contextCompression?.engineBundle).toBeDefined()
})
```

Add to `test/cli.test.ts`:

```ts
it("shows compression readiness and selected engine details in doctor output", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], {
    ...deps,
    resolveControlPlane: async () => ({
      ...resolvedControlPlane,
      contextCompression: {
        policy: {
          mode: "auto",
          engine: "hybrid",
          inlineLevel: "minimal",
          moments: { planCheckpoint: true },
          safety: { allowConditional: false, requireFreshVerification: true },
        },
        selection: { lifecycleStage: "plan", packIds: ["spec-core"], artifacts: [] },
        readiness: { state: "safe", reason: "Ready to compress." },
        engineBundle: { packIds: ["spec-core"], entries: [{ path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", kind: "spec", content: "# Summary" }] },
      },
    }),
  })

  expect(result.stdout).toMatch(/safe/i)
  expect(result.stdout).toMatch(/hybrid/i)
  expect(result.stdout).toMatch(/spec-core/i)
})
```

- [ ] **Step 2: Run the focused integration tests and verify failure**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: FAIL because readiness and bundle data are not threaded through diagnostics yet.

- [ ] **Step 3: Implement summary enhancement hooks and CLI diagnostics**

Extend `src/context-compression.ts` with a summary-enhancement hook that leaves the base engine deterministic:

```ts
export async function enhanceCompressionBundleWithSummary(input: {
  bundle: BuiltinCompressionBundle
  summarize?: (entries: BuiltinCompressionBundle["entries"]) => Promise<string | null>
}) {
  if (!input.summarize) {
    return { ...input.bundle, summary: null }
  }

  return {
    ...input.bundle,
    summary: await input.summarize(input.bundle.entries),
  }
}
```

Update `src/control-plane.ts` to compute:

- `contextCompression.readiness`
- `contextCompression.engineBundle`

Update `src/cli.ts` so `status`, `doctor`, and `explain` show:

- readiness state
- readiness reason
- engine kind
- selected pack ids
- truncated bundle entries

- [ ] **Step 4: Run the focused integration tests and verify they pass**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: PASS with readiness and engine diagnostics visible.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/context-compression.ts src/control-plane.ts src/cli.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: surface compression readiness and engine bundles"
```
