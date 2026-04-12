# Generic Routing Core OpenCode Direct Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the first concrete generic-routing slice by adding a workflow discriminator, keeping `superpowers` as the default adapter, and shipping an OpenCode-first direct mode that does not depend on upstream `superpowers` skills.

**Architecture:** Keep the existing routing core (`profile`, `preset`, `lane`, control plane, artifact materialization) and add a workflow adapter boundary in config and router resolution. The first non-superpowers slice is `workflow.kind = "direct"` with user-defined intents on OpenCode only. `superpowers` remains the default adapter and must continue to work unchanged. Direct mode generates host-native OpenCode commands and agents without upstream skill handoff.

**Tech Stack:** TypeScript, Vitest, jsonc-parser, Zod, JSON Schema, OpenCode artifact generation, existing OMS control plane

---

## Scope Decomposition

The generic-routing-core spec is too broad for a single implementation plan.
This plan covers only the first implementation slice:

- add workflow discrimination to config/core
- preserve `superpowers` as default behavior
- implement OpenCode-first direct mode with user-defined intents
- expose direct-mode explain/sync/status support where needed

Deferred from this plan:

- Codex or Qwen direct mode
- adapter extraction for every host
- full generic rebrand of the repository
- lane-aware multi-subagent execution in direct mode
- generic mode support for every CLI path beyond the minimal viable surface

## File Structure

### Core config and schema

- `src/config.ts`
  - add workflow discriminator and direct-mode intent schema
  - preserve legacy and default `superpowers` behavior
- `schemas/oh-my-superagents.schema.json`
  - mirror the new public workflow and intent schema

### Routing and workflow adapter boundary

- `src/router.ts`
  - generalize route resolution from a fixed built-in `superpowers` phase set toward adapter-provided route ids
- Create: `src/workflow-superpowers.ts`
  - hold current built-in `superpowers` route catalog and host-facing mapping that should stop living in the generic router core

### OpenCode direct-mode rendering

- `src/opencode.ts`
  - preserve existing `superpowers` rendering
  - add direct-mode OpenCode commands and agents for user-defined intents

### CLI and control plane

- `src/cli.ts`
  - preserve current behavior for `superpowers`
  - add direct-mode explain/sync/status surface for OpenCode
- `src/control-plane.ts`
  - keep control-plane state valid across workflow kinds where needed

### Library exports

- `src/index.ts`
  - export any new workflow-adapter or direct-mode helpers used as part of the public library surface

### Tests

- `test/config.test.ts`
- `test/router.test.ts`
- `test/opencode.test.ts`
- `test/cli.test.ts`
- `test/index.test.ts`

## Execution Notes

- `superpowers` must remain the default workflow behavior if `workflow` is omitted.
- Direct mode must not require upstream skill discovery or compatibility checks to succeed.
- The first direct-mode slice should use user-defined intents as the route catalog.
- Do not introduce persona prompts or specialist roleplay agents.
- Keep direct-mode host artifacts thin and explicit.

### Task 1: Workflow Discriminator and Direct Intent Schema

**Files:**
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing config tests for workflow discrimination**

Add tests in `test/config.test.ts`:

```ts
it("defaults to the superpowers workflow when workflow is omitted", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "profiles": { "build": { "model": "openai/gpt-5" } },
      "lanes": {},
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "routes": {},
          "defaultRoute": "build"
        }
      }
    }`,
  })

  expect(result.config.workflow.kind).toBe("superpowers")
})

it("accepts a direct workflow with named intents", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "workflow": {
        "kind": "direct",
        "intents": {
          "plan": { "label": "Plan" },
          "build": { "label": "Build" },
          "review": { "label": "Review" }
        }
      },
      "profiles": {
        "plan-profile": { "model": "openai/gpt-5" },
        "build-profile": { "model": "gpt-5.4" }
      },
      "lanes": {
        "frontend": {
          "label": "Frontend",
          "routes": { "plan": "plan-profile" },
          "defaultRoute": "build-profile"
        }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "usesLanes": ["frontend"],
          "defaultLane": "frontend",
          "routes": {},
          "defaultRoute": "build-profile"
        }
      }
    }`,
  })

  expect(result.config.workflow.kind).toBe("direct")
  expect(result.config.workflow.intents.plan.label).toBe("Plan")
})
```

- [ ] **Step 2: Run the focused config tests and verify failure**

Run: `npm test -- --run test/config.test.ts`

Expected: FAIL because `workflow` and `workflow.intents` are not yet part of the schema.

- [ ] **Step 3: Implement workflow discrimination in config and schema**

In `src/config.ts`, add a workflow union similar to:

```ts
const SuperpowersWorkflowSchema = z.object({
  kind: z.literal("superpowers").default("superpowers"),
}).strict()

const DirectIntentSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1).optional(),
}).strict()

const DirectWorkflowSchema = z.object({
  kind: z.literal("direct"),
  intents: z.record(z.string().min(1), DirectIntentSchema),
}).strict()

const WorkflowSchema = z.union([SuperpowersWorkflowSchema, DirectWorkflowSchema]).default({ kind: "superpowers" })
```

Thread this through both the control-plane config and loaded router config, keeping legacy configs synthesized as `{ kind: "superpowers" }`.

Mirror the same shape in `schemas/oh-my-superagents.schema.json`.

- [ ] **Step 4: Run the focused config tests and verify they pass**

Run: `npm test -- --run test/config.test.ts`

Expected: PASS for the new workflow-schema tests and the existing config suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/config.ts schemas/oh-my-superagents.schema.json test/config.test.ts
git commit -m "feat: add workflow discriminator schema"
```

### Task 2: Extract the Superpowers Route Catalog Boundary

**Files:**
- Create: `src/workflow-superpowers.ts`
- Modify: `src/router.ts`
- Modify: `src/index.ts`
- Test: `test/router.test.ts`
- Test: `test/index.test.ts`

- [ ] **Step 1: Write the failing router tests for adapter-provided route catalogs**

Add tests in `test/router.test.ts`:

```ts
it("resolves a direct-mode route id without relying on built-in superpowers phases", () => {
  const config = {
    workflow: {
      kind: "direct",
      intents: {
        plan: { label: "Plan" },
        build: { label: "Build" },
      },
    },
    profiles: {
      planner: { model: "openai/gpt-5" },
      builder: { model: "gpt-5.4" },
    },
    lanes: {
      frontend: {
        label: "Frontend",
        routes: { plan: "planner" },
        defaultRoute: "builder",
      },
    },
    routes: {},
    defaultRoute: "builder",
    effectiveLane: "frontend",
  }

  expect(resolveRoute(config as never, "plan").profileId).toBe("planner")
})

it("still exposes the superpowers built-in route catalog through the adapter", () => {
  expect(SUPERPOWERS_ROUTE_CATALOG).toContain("brainstorming")
})
```

Update `test/index.test.ts` to expect the new adapter export:

```ts
expect(library.SUPERPOWERS_ROUTE_CATALOG).toBeDefined()
```

- [ ] **Step 2: Run the focused router/index tests and verify failure**

Run: `npm test -- --run test/router.test.ts test/index.test.ts`

Expected: FAIL because the router still assumes only built-in superpowers phases and no adapter file exists.

- [ ] **Step 3: Extract the superpowers route catalog into its own module**

Create `src/workflow-superpowers.ts` with the existing built-in `superpowers` route vocabulary and current OpenCode/Codex mapping constants moved out of the generic router core.

In `src/router.ts`, introduce a generic route resolver entry point such as:

```ts
export function resolveRoute(config: RouterConfig, routeId: string, routeContext?: { effectiveLane?: string })
```

Keep `resolvePhase()` as a compatibility wrapper for `superpowers` mode that calls `resolveRoute()` with built-in phase keys.

Export the new adapter constants from `src/index.ts`.

- [ ] **Step 4: Run the focused router/index tests and verify they pass**

Run: `npm test -- --run test/router.test.ts test/index.test.ts`

Expected: PASS for the new generic-route tests and existing router/index coverage.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/workflow-superpowers.ts src/router.ts src/index.ts test/router.test.ts test/index.test.ts
git commit -m "feat: extract superpowers route catalog"
```

### Task 3: OpenCode Direct Mode Artifacts

**Files:**
- Modify: `src/opencode.ts`
- Test: `test/opencode.test.ts`

- [ ] **Step 1: Write the failing OpenCode direct-mode artifact tests**

Add tests in `test/opencode.test.ts`:

```ts
it("renders direct-mode OpenCode commands for workflow intents", () => {
  const artifacts = buildArtifacts({
    workflow: {
      kind: "direct",
      intents: {
        plan: { label: "Plan" },
        build: { label: "Build" },
      },
    },
    profiles: {
      planner: { model: "openai/gpt-5" },
      builder: { model: "gpt-5.4" },
    },
    lanes: {
      frontend: {
        label: "Frontend",
        routes: { plan: "planner" },
        defaultRoute: "builder",
      },
    },
    routes: {},
    defaultRoute: "builder",
    effectiveLane: "frontend",
  } as never)

  expect(artifacts.commands.map((item) => item.fileName)).toEqual(
    expect.arrayContaining(["ai-plan.md", "ai-build.md"]),
  )
})

it("renders direct-mode agents without upstream superpowers skill handoff", () => {
  const artifacts = buildArtifacts({
    workflow: {
      kind: "direct",
      intents: { plan: { label: "Plan" } },
    },
    profiles: { planner: { model: "openai/gpt-5" } },
    lanes: { frontend: { label: "Frontend", routes: { plan: "planner" }, defaultRoute: "planner" } },
    routes: {},
    defaultRoute: "planner",
    effectiveLane: "frontend",
  } as never)

  const command = artifacts.commands.find((item) => item.fileName === "ai-plan.md")
  const agent = artifacts.agents.find((item) => item.fileName === "rt-plan.md")

  expect(command?.content).toContain("intent: plan")
  expect(command?.content).not.toContain("Load and follow the upstream skill")
  expect(agent?.content).not.toContain("Load the upstream superpowers skill")
})
```

- [ ] **Step 2: Run the focused OpenCode tests and verify failure**

Run: `npm test -- --run test/opencode.test.ts`

Expected: FAIL because OpenCode only renders the current superpowers-mode command/agent surface.

- [ ] **Step 3: Implement direct-mode OpenCode commands and agents**

Extend `src/opencode.ts` so `buildArtifacts()` branches by workflow kind:

- `superpowers`: current behavior
- `direct`: generate one command per intent and one hidden agent per intent for the first slice

Suggested command/agent naming for direct mode:

- commands: `ai-<intent>.md`
- agents: `rt-<intent>.md`

The direct-mode command should pass the selected intent and forwarded arguments into the agent, and the agent should contain generic thin routing instructions rather than upstream skill-loading instructions.

- [ ] **Step 4: Run the focused OpenCode tests and verify they pass**

Run: `npm test -- --run test/opencode.test.ts`

Expected: PASS for the new direct-mode coverage and existing OpenCode tests.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/opencode.ts test/opencode.test.ts
git commit -m "feat: add OpenCode direct mode artifacts"
```

### Task 4: CLI Support for Direct Mode on OpenCode

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write the failing CLI tests for direct-mode sync and explain**

Add tests in `test/cli.test.ts`:

```ts
it("syncs OpenCode artifacts for a direct workflow config", async () => {
  const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
    loadConfig: async () => ({
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      config: {
        workflow: {
          kind: "direct",
          intents: { plan: { label: "Plan" } },
        },
        profiles: { planner: { model: "openai/gpt-5" } },
        lanes: { frontend: { label: "Frontend", routes: { plan: "planner" }, defaultRoute: "planner" } },
        routes: {},
        defaultRoute: "planner",
      },
    }),
  }))

  const parsed = JSON.parse(result.stdout)
  expect(parsed.written.some((filePath: string) => filePath.endsWith("ai-plan.md"))).toBe(true)
})

it("explains a direct workflow intent on OpenCode", async () => {
  const result = await runCli([
    "explain",
    "--host",
    "opencode",
    "--intent",
    "plan",
  ], createCliDeps({
    loadConfig: async () => ({
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      config: {
        workflow: {
          kind: "direct",
          intents: { plan: { label: "Plan" } },
        },
        profiles: { planner: { model: "openai/gpt-5" } },
        lanes: { frontend: { label: "Frontend", routes: { plan: "planner" }, defaultRoute: "planner" } },
        routes: {},
        defaultRoute: "planner",
      },
    }),
  }))

  const output = JSON.parse(result.stdout)
  expect(output.intent).toBe("plan")
  expect(output.model).toBe("openai/gpt-5")
})
```

- [ ] **Step 2: Run the focused CLI tests and verify failure**

Run: `npm test -- --run test/cli.test.ts`

Expected: FAIL because the CLI only supports phase-based `explain` and superpowers-shaped sync behavior.

- [ ] **Step 3: Implement direct-mode CLI support**

In `src/cli.ts`:

- keep current `superpowers` behavior unchanged
- allow `explain --intent <intent>` when `workflow.kind === "direct"`
- allow `--all` to show all direct intents for OpenCode
- ensure `sync --host opencode` works for direct configs and skips upstream superpowers compatibility requirements when the workflow is `direct`

Keep Stage 1 generic mode scoped to OpenCode only.

- [ ] **Step 4: Run the focused CLI tests and verify they pass**

Run: `npm test -- --run test/cli.test.ts`

Expected: PASS for the new direct-mode CLI tests and existing CLI coverage.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/cli.ts src/control-plane.ts test/cli.test.ts
git commit -m "feat: add OpenCode direct mode cli support"
```

### Task 5: Reframe Documentation and Export Surface

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README-architecture.md`
- Modify: `src/index.ts`
- Test: `test/index.test.ts`

- [ ] **Step 1: Write the failing documentation/export expectation**

Add or update `test/index.test.ts`:

```ts
it("exports the superpowers route catalog adapter helpers", () => {
  expect(library.SUPERPOWERS_ROUTE_CATALOG).toBeDefined()
  expect(library.resolveRoute).toBeTypeOf("function")
})
```

Before editing docs, confirm the current README still uses the old superpowers-only framing:

Run: `rg -n "Thin routing and host-local OMS control-plane support for `superpowers`|direct mode|workflow adapter" README.md README.zh-CN.md docs/README-architecture.md`

Expected: current top-level wording is still superpowers-first and does not yet describe direct mode as a first-party generic mode.

- [ ] **Step 2: Update exports and documentation**

In `src/index.ts`, export the new route-catalog / workflow adapter helpers.

In `README.md`, `README.zh-CN.md`, and `docs/README-architecture.md`, update the top-level framing to reflect:

- broader routing/control-plane product
- first-class `superpowers` support
- OpenCode-first direct mode as an experimental first generic slice

Keep wording careful:

- do not imply every host supports direct mode yet
- do not imply `superpowers` support is deprecated

- [ ] **Step 3: Verify the docs and exports landed**

Run:

- `npm test -- --run test/index.test.ts`
- `rg -n "direct mode|workflow adapter|first-class `superpowers` support" README.md README.zh-CN.md docs/README-architecture.md`

Expected: export tests pass and docs contain the new framing.

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run check && npm run build`

Expected: PASS for the full suite, type check, and build.

- [ ] **Step 5: Commit Task 5**

```bash
git add README.md README.zh-CN.md docs/README-architecture.md src/index.ts test/index.test.ts
git commit -m "docs: reframe generic routing core slice"
```

## Self-Review Notes

- Spec coverage:
  - The first generic slice is explicitly decomposed to OpenCode-first direct mode while preserving superpowers-first compatibility.
  - Workflow discrimination, route-catalog extraction, direct-mode OpenCode artifacts, direct-mode CLI support, and product reframing are all covered.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses `workflow.kind`, `intents`, `resolveRoute`, `SUPERPOWERS_ROUTE_CATALOG`, and OpenCode direct command names `ai-<intent>` with agent names `rt-<intent>`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-generic-routing-core-open-code-direct-mode.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user has consistently preferred subagent-driven TDD in this session, so proceed with Option 1 unless they explicitly redirect.
