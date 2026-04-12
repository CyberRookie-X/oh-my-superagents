# AI-Assisted Routing Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CLI-first routing authoring flow that inspects the repo, current config, and user-supplied model inventory, then proposes lane/profile/preset config changes with an explicit preview and write step.

**Architecture:** Keep the first slice host-independent and CLI-first. Introduce a small authoring core that collects repo signals, validates a simple model inventory input, produces a deterministic routing proposal, renders a human-readable summary and config diff, and only writes on explicit confirmation or `--write`. This creates a reusable foundation for later host-local AI wrappers without embedding a heavyweight autonomous planner into the core.

**Tech Stack:** TypeScript, Vitest, jsonc-parser, existing config/control-plane utilities, filesystem inspection, CLI parsing

---

## Scope Decomposition

This plan covers only the first slice of AI-assisted routing authoring:

- CLI-first `author routing`
- repo signal inspection
- model inventory input
- deterministic routing proposal generation
- preview/diff output
- explicit write support

Deferred from this plan:

- OpenCode/Codex/Qwen host-local wrappers for the authoring engine
- conversational UI inside hosts
- remote provider/model discovery
- true model-in-the-loop proposal generation inside the product runtime

## File Structure

### Authoring core

- Create: `src/author-routing.ts`
  - repo inspection
  - model inventory parsing
  - deterministic routing proposal generation
  - diff/summary helpers

### CLI

- Modify: `src/cli.ts`
  - add `author` command parsing and execution
  - preserve existing command behavior

### Library exports

- Modify: `src/index.ts`
  - export authoring helpers

### Tests

- Create: `test/author-routing.test.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/index.test.ts`

## Execution Notes

- Keep the first slice deterministic and explicit.
- Do not silently write config.
- Require either explicit confirmation or `--write` to persist changes.
- Support both current workflow modes:
  - `superpowers`
  - `direct`
- Keep generated proposals minimal, not exhaustive.

### Task 1: Authoring Core Input and Proposal Generation

**Files:**
- Create: `src/author-routing.ts`
- Create: `test/author-routing.test.ts`

- [ ] **Step 1: Write the failing authoring-core tests**

Add tests in `test/author-routing.test.ts`:

```ts
it("detects likely frontend/backend lanes from repo signals", async () => {
  const result = await inspectRoutingAuthoringInputs({
    cwd: "/workspace/project",
    exists: async (filePath) => [
      "/workspace/project/package.json",
      "/workspace/project/src/components/App.tsx",
      "/workspace/project/server/main.py",
    ].includes(filePath),
    readFile: async (filePath) => filePath.endsWith("package.json")
      ? JSON.stringify({ dependencies: { react: "18.0.0" } })
      : "",
    readdir: async () => [],
  })

  expect(result.suggestedLanes).toEqual(expect.arrayContaining(["frontend", "backend"]))
})

it("builds a deterministic routing proposal from repo signals and model inventory", () => {
  const proposal = buildRoutingProposal({
    mode: "direct",
    suggestedLanes: ["frontend", "backend"],
    inventory: {
      models: {
        "frontend-build": { model: "openai/gpt-5", specialties: ["frontend", "build"] },
        "backend-build": { model: "gpt-5.4", specialties: ["backend", "build"] },
      },
    },
  })

  expect(proposal.profiles["frontend-build"].model).toBe("openai/gpt-5")
  expect(proposal.lanes.frontend.defaultRoute).toBe("frontend-build")
  expect(proposal.presets.default.usesLanes).toEqual(["frontend", "backend"])
})
```

- [ ] **Step 2: Run the focused authoring tests and verify failure**

Run: `npm test -- --run test/author-routing.test.ts`

Expected: FAIL because the authoring module does not exist yet.

- [ ] **Step 3: Implement the authoring core**

Create `src/author-routing.ts` with a small deterministic core:

```ts
export type ModelInventory = {
  models: Record<string, {
    model: string
    specialties?: string[]
    effort?: "fast" | "balanced" | "deep" | "max"
    codexFast?: boolean
  }>
}

export async function inspectRoutingAuthoringInputs(...) { ... }
export function buildRoutingProposal(...) { ... }
```

Rules for the first slice:

- detect likely lanes from repo signals only
- use explicit model inventory input; do not guess remote model availability
- build minimal `profiles`, `lanes`, and `presets.default`
- in direct mode, optionally create basic `workflow.intents` such as `build` and `review` when supported by the inventory

- [ ] **Step 4: Run the focused authoring tests and verify they pass**

Run: `npm test -- --run test/author-routing.test.ts`

Expected: PASS for the new authoring-core tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/author-routing.ts test/author-routing.test.ts
git commit -m "feat: add routing authoring core"
```

### Task 2: CLI `author routing` Preview Mode

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing CLI tests for preview mode**

Add tests in `test/cli.test.ts`:

```ts
it("prints a routing proposal summary without writing by default", async () => {
  const result = await runCli([
    "author",
    "routing",
    "--mode",
    "direct",
    "--models",
    "/workspace/project/models.json",
  ], createCliDeps({
    readFile: async (filePath) => filePath.endsWith("models.json")
      ? JSON.stringify({ models: { builder: { model: "openai/gpt-5", specialties: ["frontend", "build"] } } })
      : JSON.stringify({ dependencies: { react: "18.0.0" } }),
    artifactExists: async () => false,
    writeFile: async () => {
      throw new Error("writeFile should not be called in preview mode")
    },
  }))

  const output = JSON.parse(result.stdout)
  expect(output.mode).toBe("direct")
  expect(output.summary.lanes).toContain("frontend")
  expect(output.written).toBe(false)
})
```

- [ ] **Step 2: Run the focused CLI tests and verify failure**

Run: `npm test -- --run test/cli.test.ts`

Expected: FAIL because `author` is not yet a recognized CLI command.

- [ ] **Step 3: Implement `author routing` preview mode**

In `src/cli.ts`:

- allow a new top-level command `author`
- require subcommand `routing`
- accept:
  - `--mode superpowers|direct`
  - `--models <path>`
- run the authoring core
- print a summary payload with:
  - detected lanes
  - proposed profiles
  - proposed presets
  - preview diff or equivalent patch structure
  - `written: false`

Do not write files yet in preview mode.

- [ ] **Step 4: Run the focused CLI tests and verify they pass**

Run: `npm test -- --run test/cli.test.ts`

Expected: PASS for the new preview-mode tests and existing CLI coverage.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: add routing authoring preview command"
```

### Task 3: Explicit Write Path and Config Diff Application

**Files:**
- Modify: `src/author-routing.ts`
- Modify: `src/cli.ts`
- Modify: `test/author-routing.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing tests for explicit write support**

Add tests for:

```ts
it("writes the proposed routing config only when --write is provided", async () => {
  let writtenPath = ""
  let writtenContent = ""

  const result = await runCli([
    "author",
    "routing",
    "--mode",
    "direct",
    "--models",
    "/workspace/project/models.json",
    "--write",
  ], createCliDeps({
    readFile: async (filePath) => filePath.endsWith("models.json")
      ? JSON.stringify({ models: { builder: { model: "openai/gpt-5", specialties: ["frontend", "build"] } } })
      : JSON.stringify({ dependencies: { react: "18.0.0" } }),
    writeFile: async (filePath, content) => {
      writtenPath = filePath
      writtenContent = content
    },
  }))

  expect(JSON.parse(result.stdout).written).toBe(true)
  expect(writtenPath).toContain("oh-my-superagents.config.jsonc")
  expect(writtenContent).toContain("\"profiles\"")
})
```

- [ ] **Step 2: Run the focused authoring/CLI tests and verify failure**

Run: `npm test -- --run test/author-routing.test.ts test/cli.test.ts`

Expected: FAIL because preview mode does not yet apply writes.

- [ ] **Step 3: Implement explicit write support**

Implement a minimal config rendering/apply path:

- if there is no config, write a new layered config document
- if there is an existing config, merge in the proposed sections conservatively
- only write when `--write` is present

Keep the write path explicit and deterministic.

- [ ] **Step 4: Run the focused authoring/CLI tests and verify they pass**

Run: `npm test -- --run test/author-routing.test.ts test/cli.test.ts`

Expected: PASS for the new explicit write behavior and existing tests.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/author-routing.ts src/cli.ts test/author-routing.test.ts test/cli.test.ts
git commit -m "feat: add explicit routing authoring writes"
```

### Task 4: Library Exports and Documentation

**Files:**
- Modify: `src/index.ts`
- Modify: `test/index.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing export/doc expectation**

Update `test/index.test.ts`:

```ts
it("exports routing authoring helpers", () => {
  expect(library.buildRoutingProposal).toBeTypeOf("function")
  expect(library.inspectRoutingAuthoringInputs).toBeTypeOf("function")
})
```

Before editing docs, confirm the new command is not documented yet:

Run: `rg -n "author routing|routing authoring|模型清单|model inventory" README.md README.zh-CN.md`

Expected: no current docs for this feature.

- [ ] **Step 2: Update exports and docs**

In `src/index.ts`, export the new authoring helpers.

In both READMEs, add a short section describing:

- the new `author routing` command
- required `--models <path>` input for the first slice
- preview-by-default and explicit `--write`
- that the feature is AI-assisted authoring support, not autonomous rewriting

- [ ] **Step 3: Verify docs and exports landed**

Run:

- `npm test -- --run test/index.test.ts`
- `rg -n "author routing|routing authoring|model inventory|模型清单" README.md README.zh-CN.md`

Expected: export tests pass and docs contain the new command description.

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run check && npm run build`

Expected: PASS for the full suite, type check, and build.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/index.ts test/index.test.ts README.md README.zh-CN.md
git commit -m "docs: add routing authoring guidance"
```

## Self-Review Notes

- Spec coverage:
  - The plan covers repo-aware authoring inputs, model inventory, proposal generation, preview/diff output, explicit write behavior, and CLI-first generic surface.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses `author routing`, `ModelInventory`, `inspectRoutingAuthoringInputs`, and `buildRoutingProposal` as the public first-slice authoring surface.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-ai-assisted-routing-authoring.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user has already requested subagent-driven TDD execution, so proceed with Option 1 unless they explicitly redirect.
