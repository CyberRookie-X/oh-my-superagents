# Context Index and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `D1` by indexing durable context artifacts from the workspace and surfacing that index through OMS control-plane diagnostics.

**Architecture:** Add a read-only context index module that scans known OMS, GSD-family, and external memory roots into shared artifact records, then thread that index through `resolveControlPlane`, `status`, `doctor`, and `explain`. Keep the index deterministic and file-based so later D2 and compression work can rely on one stable artifact inventory.

**Tech Stack:** TypeScript, Vitest, Node filesystem access, existing control-plane and CLI diagnostics

---

## Scope Decomposition

This plan covers only the `D1` index and diagnostics layer.

It includes:

- scanning known artifact roots into shared artifact records
- summarizing the context index inside `ResolvedControlPlane`
- surfacing context diagnostics through `status`, `doctor`, and `explain`

Deferred to later plans:

- selecting context packs from the index
- evaluating compression readiness
- invoking built-in or external engines
- configuring external providers

## File Structure

### Shared context index

- Create: `src/context-index.ts`
  - scan durable artifact roots and classify artifact records

### Core diagnostics integration

- Modify: `src/control-plane.ts`
  - carry index data in `ResolvedControlPlane` and expose summarizers
- Modify: `src/cli.ts`
  - show context index details in `status`, `doctor`, and `explain`

### Exports

- Modify: `src/index.ts`
  - export the context index helpers

### Tests

- Create: `test/context-index.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- Keep `D1` read-only. Do not write or mutate any indexed artifact in this plan.
- Use path-root classification before content heuristics.
- Treat OMS spec and plan files as authoritative by default.
- Treat external memory and summary files as derived or advisory unless the classifier can prove otherwise.

### Task 1: Build the Read-Only Context Index Module

**Files:**
- Create: `src/context-index.ts`
- Create: `test/context-index.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing context-index tests**

Create `test/context-index.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { buildContextIndex } from "../src/context-index.js"

describe("buildContextIndex", () => {
  it("indexes OMS specs and plans as authoritative artifacts", async () => {
    const index = await buildContextIndex({
      cwd: "/workspace/project",
      walkFiles: async () => [
        "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
        "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
      ],
    })

    expect(index.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "spec", authority: "authoritative", source: "oms" }),
      expect.objectContaining({ kind: "plan", authority: "authoritative", source: "oms" }),
    ]))
  })

  it("classifies GSD and legacy planning roots without treating them as OMS-owned", async () => {
    const index = await buildContextIndex({
      cwd: "/workspace/project",
      walkFiles: async () => [
        ".gsd/DECISIONS.md",
        ".gsd/KNOWLEDGE.md",
        ".planning/STATE.md",
      ],
    })

    expect(index.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ".gsd/DECISIONS.md", source: "gsd", kind: "decision" }),
      expect.objectContaining({ path: ".gsd/KNOWLEDGE.md", source: "gsd", kind: "knowledge" }),
      expect.objectContaining({ path: ".planning/STATE.md", source: "gsd", kind: "checkpoint" }),
    ]))
  })
})
```

- [ ] **Step 2: Run the focused context-index tests and verify failure**

Run: `pnpm test -- --run test/context-index.test.ts`

Expected: FAIL because `src/context-index.ts` does not exist yet.

- [ ] **Step 3: Implement the read-only context index module**

Create `src/context-index.ts` with:

```ts
import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { createContextArtifact, type ContextArtifact } from "./context-artifacts.js"

export type ContextIndex = {
  artifacts: ContextArtifact[]
  warnings: string[]
}

export async function buildContextIndex(input: {
  cwd: string
  walkFiles?: (cwd: string) => Promise<string[]>
}): Promise<ContextIndex> {
  const walkFiles = input.walkFiles ?? defaultWalkFiles
  const files = await walkFiles(input.cwd)

  return {
    artifacts: files.flatMap((filePath) => classifyIndexedFile(filePath)),
    warnings: [],
  }
}

function classifyIndexedFile(filePath: string): ContextArtifact[] {
  if (filePath.startsWith("docs/superpowers/specs/")) {
    return [createContextArtifact({ kind: "spec", path: filePath, authority: "authoritative", source: "oms", lifecycleStage: "design" })]
  }

  if (filePath.startsWith("docs/superpowers/plans/")) {
    return [createContextArtifact({ kind: "plan", path: filePath, authority: "authoritative", source: "oms", lifecycleStage: "plan" })]
  }

  if (filePath === ".gsd/DECISIONS.md") {
    return [createContextArtifact({ kind: "decision", path: filePath, authority: "derived", source: "gsd", lifecycleStage: "plan" })]
  }

  if (filePath === ".gsd/KNOWLEDGE.md") {
    return [createContextArtifact({ kind: "knowledge", path: filePath, authority: "derived", source: "gsd" })]
  }

  if (filePath === ".planning/STATE.md") {
    return [createContextArtifact({ kind: "checkpoint", path: filePath, authority: "derived", source: "gsd", lifecycleStage: "checkpoint" })]
  }

  if (path.basename(filePath).toUpperCase().includes("SUMMARY")) {
    return [createContextArtifact({ kind: "summary", path: filePath, authority: "derived", source: "external" })]
  }

  return []
}

async function defaultWalkFiles(cwd: string) {
  const roots = [
    "docs/superpowers/specs",
    "docs/superpowers/plans",
    ".gsd",
    ".planning",
    ".memorybank",
  ]

  const results: string[] = []

  for (const root of roots) {
    const absoluteRoot = path.join(cwd, root)
    try {
      const entries = await readdir(absoluteRoot, { recursive: true })
      for (const entry of entries) {
        const absolutePath = path.join(absoluteRoot, entry)
        const entryStat = await stat(absolutePath)
        if (entryStat.isFile()) {
          results.push(path.relative(cwd, absolutePath).replace(/\\/g, "/"))
        }
      }
    } catch {
      // Missing optional roots are ignored by design.
    }
  }

  return results
}
```

Export the new helper from `src/index.ts`:

```ts
export * from "./context-index.js"
```

- [ ] **Step 4: Run the focused context-index tests and verify they pass**

Run: `pnpm test -- --run test/context-index.test.ts`

Expected: PASS for the read-only index classifier.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/context-index.ts src/index.ts test/context-index.test.ts
git commit -m "feat: add read-only context index"
```

### Task 2: Thread Context Index Data Through the Control Plane

**Files:**
- Modify: `src/control-plane.ts`
- Modify: `test/control-plane.test.ts`

- [ ] **Step 1: Write the failing control-plane tests**

Add to `test/control-plane.test.ts`:

```ts
it("includes a read-only context index summary in resolved control-plane state", async () => {
  const resolved = await resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => false,
    readFile: async () => {
      throw new Error("should not read")
    },
    buildContextIndex: async () => ({
      artifacts: [
        { kind: "spec", path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", authority: "authoritative", source: "oms", lifecycleStage: "design" },
        { kind: "plan", path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
      ],
      warnings: [],
    }),
  })

  expect(resolved.contextIndex?.artifacts).toHaveLength(2)
})
```

- [ ] **Step 2: Run the focused control-plane tests and verify failure**

Run: `pnpm test -- --run test/control-plane.test.ts`

Expected: FAIL because `ResolvedControlPlane` does not carry context index data yet.

- [ ] **Step 3: Implement control-plane context index support**

Update `src/control-plane.ts` so `ResolveControlPlaneInput` accepts an injected builder and `ResolvedControlPlane` carries the result:

```ts
import { buildContextIndex, type ContextIndex } from "./context-index.js"

export type ResolveControlPlaneInput = LoadControlPlaneConfigInput & {
  command: ControlPlaneCommandKey
  runtimeLane?: string
  buildContextIndex?: (input: { cwd: string }) => Promise<ContextIndex>
}
```

Add the new field to the existing `ResolvedControlPlane` type:

```ts
contextIndex?: ContextIndex
```

Inside `resolveControlPlane`, call the index builder after config resolution succeeds or falls back to defaults:

```ts
const contextIndex = await (input.buildContextIndex ?? ((args) => buildContextIndex(args)))({ cwd: input.cwd })

return {
  source: {
    kind: "file",
    hasRealSource: true,
    path: loaded.path,
    sources: loaded.sources,
  },
  config: loaded.config,
  activePreset,
  layers: loaded.layers,
  laneState,
  effectiveSources,
  trace: {
    activePresetDefinition,
    parentPresetDefinition,
  },
  contextIndex,
}
```

- [ ] **Step 4: Run the focused control-plane tests and verify they pass**

Run: `pnpm test -- --run test/control-plane.test.ts`

Expected: PASS with the new `contextIndex` field present.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/control-plane.ts test/control-plane.test.ts
git commit -m "feat: thread context index through control plane"
```

### Task 3: Surface D1 Context Diagnostics in the CLI

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing CLI tests**

Add to `test/cli.test.ts`:

```ts
it("shows indexed context artifacts in doctor output", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], {
    ...deps,
    resolveControlPlane: async () => ({
      ...resolvedControlPlane,
      contextIndex: {
        artifacts: [
          { kind: "spec", path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", authority: "authoritative", source: "oms", lifecycleStage: "design" },
          { kind: "plan", path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
        ],
        warnings: [],
      },
    }),
  })

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toMatch(/context/i)
  expect(result.stdout).toMatch(/hybrid-context-orchestration-design/i)
})
```

- [ ] **Step 2: Run the focused CLI tests and verify failure**

Run: `pnpm test -- --run test/cli.test.ts`

Expected: FAIL because the CLI does not render any context-index diagnostics yet.

- [ ] **Step 3: Implement CLI context-index rendering**

Update `src/cli.ts` so `status`, `doctor`, and `explain` attach a `context` block whenever `resolved.contextIndex` exists:

```ts
function summarizeContextIndex(index: ContextIndex | undefined) {
  if (!index) {
    return undefined
  }

  return {
    artifactCount: index.artifacts.length,
    authoritativePaths: index.artifacts
      .filter((artifact) => artifact.authority === "authoritative")
      .map((artifact) => artifact.path),
    warnings: index.warnings,
  }
}
```

Then include that summary in the rendered output objects for `status`, `doctor`, and `explain`.

- [ ] **Step 4: Run the focused CLI tests and verify they pass**

Run: `pnpm test -- --run test/cli.test.ts`

Expected: PASS with `context` diagnostics visible.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: show D1 context diagnostics in CLI"
```
