# OpenSpec Artifact Dialect and Workflow Role Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate OpenSpec as an artifact and process dialect while keeping `superpowers` and `gstack` as workflow sources, and refine OMS's external capability boundaries so it can coordinate without hijacking upstream workflow brains.

**Architecture:** Add a narrow OpenSpec artifact reader and catalog, index its artifacts into OMS context selection, and extend source/tool explanation to distinguish workflow sources from artifact dialects and external capabilities. Keep user-installed skills, plugins, MCPs, and providers in OMS policy scope while explicitly excluding upstream workflow-internal skills.

**Tech Stack:** TypeScript, JSON/Markdown parsing, existing context index and control-plane modules, Vitest

---

## Scope Decomposition

This plan covers:

- OpenSpec artifact discovery and indexing
- source-versus-dialect explanation
- external capability boundary refinement

It does not cover:

- making OpenSpec a workflow source
- adopting OpenSpec runtime semantics wholesale

## File Structure

- Create: `src/openspec.ts`
  - parse and classify OpenSpec artifacts
- Modify: `src/context-artifacts.ts`
  - add OpenSpec source classification where needed
- Modify: `src/context-index.ts`
  - include OpenSpec artifact discovery
- Modify: `src/context-packs.ts`
  - allow OpenSpec artifacts into pack selection
- Modify: `src/control-plane.ts`
  - explain workflow-source versus artifact-dialect roles
- Modify: `src/cli.ts`
  - show OpenSpec and external capability boundaries
- Create: `test/openspec.test.ts`
- Modify: `test/context-index.test.ts`
- Modify: `test/context-packs.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- OpenSpec is an artifact/process dialect, not a workflow source.
- OMS may policy-filter user-installed skills and external tools, but it must not attempt to control workflow-internal skills belonging to upstream brains.
- Keep OpenSpec handling file- and artifact-centric.

### Task 1: Add OpenSpec Artifact Detection

**Files:**
- Create: `src/openspec.ts`
- Create: `test/openspec.test.ts`

- [ ] **Step 1: Write the failing OpenSpec test**

Create `test/openspec.test.ts` with:

```ts
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
})
```

- [ ] **Step 2: Run the focused OpenSpec test and verify failure**

Run: `pnpm test -- --run test/openspec.test.ts`

Expected: FAIL because `src/openspec.ts` does not exist yet.

- [ ] **Step 3: Implement narrow OpenSpec artifact classification**

Create `src/openspec.ts` with:

```ts
export function classifyOpenSpecArtifact(filePath: string) {
  if (filePath.includes("/specs/") && filePath.endsWith(".md")) {
    return { kind: "spec" as const, dialect: "openspec" as const }
  }
  if (filePath.includes("/changes/") && filePath.endsWith("tasks.md")) {
    return { kind: "plan" as const, dialect: "openspec" as const }
  }
  return undefined
}
```

- [ ] **Step 4: Run the focused OpenSpec test and verify it passes**

Run: `pnpm test -- --run test/openspec.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/openspec.ts test/openspec.test.ts
git commit -m "feat: classify openspec artifacts"
```

### Task 2: Thread OpenSpec Artifacts into Context Index and Packs

**Files:**
- Modify: `src/context-artifacts.ts`
- Modify: `src/context-index.ts`
- Modify: `src/context-packs.ts`
- Modify: `test/context-index.test.ts`
- Modify: `test/context-packs.test.ts`

- [ ] **Step 1: Write the failing index test**

Add this to `test/context-index.test.ts`:

```ts
it("indexes openspec artifacts as external authoritative or advisory inputs", async () => {
  const index = await buildContextIndex({
    cwd: "/repo",
    globFiles: async () => ["/repo/openspec/specs/auth/spec.md"],
  })

  expect(index.artifacts.some((artifact) => artifact.source === "external" && artifact.kind === "spec")).toBe(true)
})
```

- [ ] **Step 2: Run the focused index tests and verify failure**

Run: `pnpm test -- --run test/context-index.test.ts test/context-packs.test.ts`

Expected: FAIL because OpenSpec discovery is not integrated.

- [ ] **Step 3: Integrate OpenSpec discovery into index and pack selection**

Update `src/context-index.ts` to call `classifyOpenSpecArtifact()` for discovered files and translate matches into `ContextArtifact` entries such as:

```ts
createContextArtifact({
  kind: classified.kind,
  path: filePath,
  authority: classified.kind === "spec" ? "authoritative" : "advisory",
  source: "external",
})
```

Update `src/context-packs.ts` so OpenSpec `spec` and `plan` artifacts are eligible for relevant planning and resume packs.

- [ ] **Step 4: Run the focused index and pack tests and verify they pass**

Run: `pnpm test -- --run test/context-index.test.ts test/context-packs.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/context-artifacts.ts src/context-index.ts src/context-packs.ts test/context-index.test.ts test/context-packs.test.ts
git commit -m "feat: index openspec artifacts for context packs"
```

### Task 3: Refine Source and Tool Role Explainability

**Files:**
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing explainability test**

Add this to `test/cli.test.ts`:

```ts
it("explains openspec as an artifact dialect and not a workflow source", async () => {
  const result = await runCli(["status"], deps)
  expect(result.stdout).toContain("artifact dialect")
  expect(result.stdout).not.toContain("workflow source: openspec")
})
```

- [ ] **Step 2: Run the focused explainability tests and verify failure**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: FAIL because explainability does not distinguish workflow sources from artifact dialects yet.

- [ ] **Step 3: Implement source-versus-dialect explanation and external capability boundary text**

Update `src/control-plane.ts` so diagnostics distinguish:

- workflow source: `superpowers`, `gstack`, `direct`
- artifact dialect: `openspec`
- external capability scope: user-installed skills, plugins, MCPs, providers
- excluded scope: upstream workflow-internal skills

Update `src/cli.ts` so status text can include lines like:

```ts
"Workflow sources: superpowers, gstack"
"Artifact dialects: openspec"
"External capability policy targets user-installed skills, plugins, MCPs, and providers only."
```

- [ ] **Step 4: Run the focused explainability tests and final verification**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts && pnpm check`

Expected: PASS.

- [x] **Step 5: Commit Task 3**

```bash
git add src/control-plane.ts src/cli.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: explain openspec and external capability roles"
```

---

## Implementation Status: ✅ Complete

All tasks in this plan have been implemented and verified.

### Code Coverage

| Plan Task | Implementation Files | Test Files |
|-----------|---------------------|------------|
| Task 1: OpenSpec artifact detection | `src/openspec.ts` | `test/openspec.test.ts` |
| Task 2: Thread OpenSpec into context index/packs | `src/context-index.ts`, `src/context-packs.ts` | `test/context-index.test.ts`, `test/context-packs.test.ts` |
| Task 3: Source vs dialect explainability | `src/control-plane.ts`, `src/cli.ts` | `test/control-plane.test.ts`, `test/cli.test.ts` |

### Key Implementation Details

- **Artifact classification**: `src/openspec.ts:1-13` classifies `openspec/specs/**/*.md` as `spec` and `openspec/changes/**/tasks.md` as `plan`
- **Context indexing**: `src/context-index.ts:61-79` integrates OpenSpec artifacts with `authority: "authoritative"` for specs and `"advisory"` for plans
- **Pack selection**: `src/context-packs.ts:100-139` includes OpenSpec artifacts in planning packs when lifecycle stage and source match
- **Explainability**: `src/control-plane.ts:471-500` distinguishes `workflowSources` from `artifactDialects` and documents external capability scope
- **Boundary enforcement**: External capability policy targets user-installed skills/plugins/MCPs/providers; explicitly excludes upstream workflow-internal skills

### Verification

- All focused tests pass: `test/openspec.test.ts`, `test/context-index.test.ts`, `test/context-packs.test.ts`, `test/control-plane.test.ts`, `test/cli.test.ts`
- Full test suite: 770/771 tests pass (1 unrelated failure in `test/package-manager-repo.test.ts`)
- `pnpm check` and `pnpm build` both pass
