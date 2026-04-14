# Gstack Workflow Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `gstack` as a first-party workflow source that maps onto canonical routes, participates in workflow fusion, and projects safely into OMS-supported hosts without turning OMS into a clone of `gstack`.

**Architecture:** Build `gstack` on top of the source-aware routing foundation. Add a curated `gstack` source catalog with canonical-route mappings, let fusion resolve those routes to `gstack`, and teach supported hosts to render the same stable route entrypoints with `gstack`-specific source payloads. Keep OMS responsible for routing, diagnostics, and wrapper generation, while assuming `gstack` itself is installed and available separately.

**Tech Stack:** TypeScript, Vitest, existing OMS source-aware router, OpenCode/Codex host renderers, JSON Schema, control-plane diagnostics

---

## Scope Decomposition

This plan assumes the workflow source foundation has landed first.

It covers:

- a curated `gstack` source catalog
- canonical-route to `gstack` entry mapping
- route-to-source fusion behavior for `gstack`
- OpenCode and Codex projection
- explicit unsupported-host diagnostics where projection is not yet safe

Deferred from this plan:

- OMS-managed `gstack` installation or setup
- Qwen `gstack` projection
- heavy `gstack` runtime features such as browser daemons or deploy helpers

## File Structure

### Source catalog and mapping

- Create: `src/workflow-gstack.ts`
  - hold the curated `gstack` route catalog and canonical-route mappings
- Modify: `src/workflow-sources.ts`
  - register `gstack` as a source and expose `gstack` source-entry lookup
- Modify: `src/config.ts`
  - validate `gstack` as an allowed workflow source kind

### Router and control plane

- Modify: `src/router.ts`
  - resolve `gstack` source entries from canonical routes
- Modify: `src/control-plane.ts`
  - surface `gstack` availability and unsupported-host diagnostics
- Modify: `src/cli.ts`
  - show `gstack` source details in `status`, `doctor`, and `explain`

### Host renderers

- Modify: `src/opencode.ts`
  - project `gstack` routes into stable OpenCode command/agent entrypoints
- Modify: `src/codex.ts`
  - project `gstack` routes into stable Codex agents

### Exports and docs

- Modify: `src/index.ts`
  - export the `gstack` catalog helpers
- Modify: `README.md`
- Modify: `README.zh-CN.md`
  - describe `gstack` as a supported workflow source and clarify current host coverage

### Tests

- Create: `test/workflow-gstack.test.ts`
- Modify: `test/router.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/opencode.test.ts`
- Modify: `test/codex.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- Keep the `gstack` catalog curated; do not mirror every upstream command.
- Preserve stable canonical host entrypoints where possible; switch source payload, not user-facing route identity.
- Fail clearly when a selected host does not yet support `gstack` projection.
- Do not add installer logic or browser/sidecar ownership in this plan.

### Task 1: Curated Gstack Source Catalog

**Files:**
- Create: `src/workflow-gstack.ts`
- Modify: `src/workflow-sources.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Create: `test/workflow-gstack.test.ts`
- Modify: `test/router.test.ts`

- [ ] **Step 1: Write the failing catalog and router tests**

Create `test/workflow-gstack.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { GSTACK_ROUTE_CATALOG, lookupGstackSourceEntry } from "../src/workflow-gstack.js"

describe("workflow-gstack", () => {
  it("maps canonical planning and review routes to curated gstack entries", () => {
    expect(GSTACK_ROUTE_CATALOG["phase.plan"]?.entry).toBe("plan-eng-review")
    expect(GSTACK_ROUTE_CATALOG["phase.review"]?.entry).toBe("review")
  })

  it("returns a source entry for supported canonical routes", () => {
    expect(lookupGstackSourceEntry("phase.plan")).toBe("plan-eng-review")
  })
})
```

Add to `test/router.test.ts`:

```ts
it("resolves gstack source entries for canonical routes", () => {
  const resolved = resolvePhase({
    workflow: { kind: "superpowers" },
    profiles: { build: { model: "openai/gpt-5" } },
    routes: {},
    defaultRoute: "build",
    sourceRoutes: { "phase.plan": "gstack" },
  } as never, "writing-plans")

  expect(resolved.resolvedSource).toBe("gstack")
  expect(resolved.sourceEntry).toBe("plan-eng-review")
})
```

- [ ] **Step 2: Run the focused catalog/router tests and verify failure**

Run: `npm test -- --run test/workflow-gstack.test.ts test/router.test.ts`

Expected: FAIL because `src/workflow-gstack.ts` and `gstack` source-entry lookup do not exist yet.

- [ ] **Step 3: Implement the curated gstack catalog**

Create `src/workflow-gstack.ts` with a curated mapping like:

```ts
import type { CanonicalRouteId } from "./workflow-sources.js"

export const GSTACK_ROUTE_CATALOG = {
  "phase.plan": { entry: "plan-eng-review", label: "Engineering planning" },
  "phase.execute": { entry: "ship", label: "Delivery" },
  "phase.review": { entry: "review", label: "Review" },
  "phase.verify": { entry: "qa", label: "QA" },
} as const satisfies Partial<Record<CanonicalRouteId, { entry: string; label: string }>>

export function lookupGstackSourceEntry(route: CanonicalRouteId) {
  return GSTACK_ROUTE_CATALOG[route]?.entry
}
```

Register `gstack` in `src/workflow-sources.ts`, re-export helpers from `src/index.ts`, and ensure `src/config.ts` accepts `gstack` in the source enum.

- [ ] **Step 4: Run the focused catalog/router tests and verify they pass**

Run: `npm test -- --run test/workflow-gstack.test.ts test/router.test.ts`

Expected: PASS for the new `gstack` catalog tests and the existing router suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/workflow-gstack.ts src/workflow-sources.ts src/config.ts src/index.ts test/workflow-gstack.test.ts test/router.test.ts
git commit -m "feat: add gstack source catalog"
```

### Task 2: OpenCode Projection for Gstack Routes

**Files:**
- Modify: `src/opencode.ts`
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/opencode.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing OpenCode and diagnostics tests**

Add to `test/opencode.test.ts`:

```ts
it("keeps stable OpenCode command names while switching the plan route to gstack", () => {
  const artifacts = buildArtifacts({
    workflow: { kind: "superpowers" },
    profiles: { build: { model: "openai/gpt-5" } },
    routes: {},
    defaultRoute: "build",
    sourceRoutes: { "phase.plan": "gstack" },
  } as never)

  const planCommand = artifacts.commands.find((item) => item.fileName === "sp-plan.md")
  expect(planCommand?.content).toContain("gstack")
  expect(planCommand?.content).toContain("plan-eng-review")
})
```

Add to `test/cli.test.ts`:

```ts
it("reports gstack as the source for the planning route in explain output", async () => {
  const result = await runCli(["explain", "--phase", "writing-plans"], createCliDeps({
    loadConfig: async () => ({
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      config: {
        workflow: { kind: "superpowers" },
        profiles: { build: { model: "openai/gpt-5" } },
        routes: {},
        defaultRoute: "build",
        sourceRoutes: { "phase.plan": "gstack" },
        superpowersCompatibility: { mode: "warn" },
      },
    }),
  }))

  expect(result.stdout).toContain("Source: gstack")
  expect(result.stdout).toContain("Source Entry: plan-eng-review")
})
```

- [ ] **Step 2: Run the focused OpenCode/CLI tests and verify failure**

Run: `npm test -- --run test/opencode.test.ts test/control-plane.test.ts test/cli.test.ts`

Expected: FAIL because OpenCode wrappers still hard-code `superpowers` skill handoff text and the CLI does not yet report `gstack` source entries.

- [ ] **Step 3: Implement gstack-aware OpenCode projection and diagnostics**

Update `src/opencode.ts` so route commands use `resolved.sourceEntry` text instead of assuming a `superpowers/<skill>` payload. For a `gstack` planning route, the body should look like:

```md
Load and follow the upstream workflow entry `gstack/plan-eng-review` exactly.

## Router Context
- canonical-route: phase.plan
- source: gstack
- phase: writing-plans
- arguments: $ARGUMENTS
```

Also update `src/control-plane.ts` and `src/cli.ts` to surface the selected `gstack` source and source entry in explain/status diagnostics.

- [ ] **Step 4: Run the focused OpenCode/CLI tests and verify they pass**

Run: `npm test -- --run test/opencode.test.ts test/control-plane.test.ts test/cli.test.ts`

Expected: PASS for the new OpenCode `gstack` projection tests and the existing diagnostics suites.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/opencode.ts src/control-plane.ts src/cli.ts test/opencode.test.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: project gstack routes to opencode"
```

### Task 3: Codex Projection, Unsupported-Host Diagnostics, and Docs

**Files:**
- Modify: `src/codex.ts`
- Modify: `src/cli.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `test/codex.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing Codex and unsupported-host tests**

Add to `test/codex.test.ts`:

```ts
it("renders a gstack-backed Codex plan agent with gstack developer instructions", () => {
  const artifacts = buildCodexArtifacts({
    workflow: { kind: "superpowers" },
    profiles: { build: { model: "gpt-5.4" } },
    routes: {},
    defaultRoute: "build",
    sourceRoutes: { "phase.plan": "gstack" },
  } as never)

  const planAgent = artifacts.agents.find((item) => item.fileName === "oms-plan.toml")
  expect(planAgent?.content).toContain("gstack")
  expect(planAgent?.content).toContain("plan-eng-review")
})
```

Add to `test/cli.test.ts`:

```ts
it("fails clearly when qwen is asked to project a gstack route", async () => {
  const result = await runCli(["sync", "--host", "qwen"], createDirectCliDeps({
    loadConfig: async () => ({
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      config: {
        workflow: { kind: "superpowers" },
        profiles: { build: { model: "openai/gpt-5" } },
        routes: {},
        defaultRoute: "build",
        sourceRoutes: { "phase.plan": "gstack" },
        superpowersCompatibility: { mode: "warn" },
      },
    }),
  }))

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("gstack is not yet supported on qwen")
})
```

- [ ] **Step 2: Run the focused Codex/CLI tests and verify failure**

Run: `npm test -- --run test/codex.test.ts test/cli.test.ts`

Expected: FAIL because Codex developer instructions still assume only `superpowers`, and unsupported-host diagnostics do not yet special-case `gstack`.

- [ ] **Step 3: Implement Codex gstack projection, unsupported-host diagnostics, and docs**

Update `src/codex.ts` to generate source-aware developer instructions, for example:

```ts
developerInstructions: [
  `You are the ${agentName} phase agent for oh-my-superagents.`,
  `Use the ${resolved.resolvedSource} workflow entry \`${resolved.sourceEntry}\` as the workflow source for this task whenever it is relevant.`,
  "If that source is unavailable, report the missing workflow source and stop.",
].join("\n")
```

In `src/cli.ts`, fail clearly for hosts that do not yet support `gstack` projection, and update both READMEs to state:

- `gstack` is a first-party source
- current projection support is OpenCode and Codex
- Qwen remains unsupported for `gstack` in this slice

- [ ] **Step 4: Run the focused Codex/CLI tests and verify they pass**

Run: `npm test -- --run test/codex.test.ts test/cli.test.ts`

Expected: PASS for the new Codex `gstack` tests, the unsupported-host diagnostics test, and the existing suites.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/codex.ts src/cli.ts README.md README.zh-CN.md test/codex.test.ts test/cli.test.ts
git commit -m "feat: add gstack host projections"
```

### Task 4: Full Verification

**Files:**
- Modify: none
- Test: full repository verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS with all test files green, including the new `gstack` suite.

- [ ] **Step 2: Run type checking**

Run: `npm run check`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS and regenerate `dist/` successfully.

- [ ] **Step 4: Commit the verification-only checkpoint**

```bash
git add .
git commit -m "test: verify gstack source integration"
```
