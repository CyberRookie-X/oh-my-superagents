# Lane-Aware Subagent Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first lane-aware multi-subagent execution slice by introducing execution-mode config, lane-scoped execute helper surfaces for OpenCode under the `superpowers` integration, and diagnostics that make lane-scoped execution explicit without turning OMS into a heavyweight orchestrator.

**Architecture:** Keep the routing core unchanged and layer execution support on top of the existing `superpowers` `subagent-driven-development` phase. Introduce a small execution helper module that derives lane-scoped execution units from the active preset and selected lanes, use that to render lane-specific OpenCode execute commands/agents, and add mode-aware guidance (`manual`, `suggest`, `auto`) to the primary execute command. Subagents remain ordinary superpowers-driven executions; the new behavior is that different subagents can now run through different lane-scoped wrappers.

**Tech Stack:** TypeScript, Vitest, existing control-plane/router utilities, OpenCode artifact generation, JSON Schema

---

## Scope Decomposition

This plan covers only the first slice of lane-aware multi-subagent execution:

- execution-mode config
- lane-scoped execution unit derivation
- OpenCode-first lane-specific execute commands and agents
- lane-aware execution diagnostics

Deferred from this plan:

- Codex or Qwen lane-aware execution helpers
- automatic split planning by the product runtime
- lane-aware generic direct-mode execution
- full host-specific execution UIs

## File Structure

### Config and control plane

- `src/config.ts`
  - add execution-mode config for lane-aware subagent fan-out
- `schemas/oh-my-superagents.schema.json`
  - mirror the public execution-mode shape
- `src/control-plane.ts`
  - validate and expose execution-mode state in diagnostics

### Execution helper core

- Create: `src/lane-execution.ts`
  - derive lane-scoped execution units
  - normalize host-safe execution helper names from lane ids
  - render mode-aware split guidance text inputs for adapters

### OpenCode adapter

- `src/opencode.ts`
  - generate lane-scoped `sp-execute-<laneSlug>.md` commands and `spr-build--<laneSlug>.md` agents for the `subagent-driven-development` phase
  - keep current `sp-execute.md` / `spr-build.md` behavior intact
  - add mode-aware split guidance to the main execute command

### CLI diagnostics

- `src/cli.ts`
  - surface lane-aware execution mode and available lane-scoped execute helpers on supported OpenCode surfaces

### Tests

- Create: `test/lane-execution.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/opencode.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- This slice stays under the `superpowers` integration.
- The primary execute workflow is still `superpowers/subagent-driven-development`.
- The new lane-specific helpers are execution wrappers, not new top-level routed phases.
- Avoid runtime global planner behavior.
- The first slice should make `suggest` the default execution mode.

### Task 1: Execution Mode Schema and Control-Plane State

**Files:**
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Write the failing schema tests for execution mode**

Add tests in `test/config.test.ts`:

```ts
it("accepts subagent execution mode on layered config settings", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "settings": {
        "activePreset": "default",
        "subagentExecution": { "mode": "suggest" }
      },
      "profiles": {
        "build": { "model": "openai/gpt-5" }
      },
      "lanes": {
        "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "build" }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "usesLanes": ["frontend"],
          "defaultLane": "frontend",
          "routes": {},
          "defaultRoute": "build"
        }
      }
    }`,
  })

  expect(result.config.settings.subagentExecution.mode).toBe("suggest")
})

it("defaults subagent execution mode to suggest when omitted", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => false,
    readFile: async () => {
      throw new Error("should not read")
    },
  })

  expect(result.config.settings.subagentExecution.mode).toBe("suggest")
})
```

- [ ] **Step 2: Run the focused config tests and verify failure**

Run: `pnpm test -- --run test/config.test.ts`

Expected: FAIL because `subagentExecution` is not yet part of the schema/default config.

- [ ] **Step 3: Implement execution mode config**

Add a new settings schema block in `src/config.ts`:

```ts
const SubagentExecutionSchema = z.object({
  mode: z.enum(["manual", "suggest", "auto"]).default("suggest"),
}).strict()
```

Thread it through the layered settings shape, default config synthesis, clone/serialize helpers, and the JSON schema.

- [ ] **Step 4: Run the focused config tests and verify they pass**

Run: `pnpm test -- --run test/config.test.ts`

Expected: PASS for the new execution-mode tests and the existing config suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/config.ts schemas/oh-my-superagents.schema.json test/config.test.ts
git commit -m "feat: add lane-aware subagent execution config"
```

### Task 2: Lane Execution Helper Core

**Files:**
- Create: `src/lane-execution.ts`
- Modify: `test/lane-execution.test.ts`

- [ ] **Step 1: Write the failing lane-execution helper tests**

Create `test/lane-execution.test.ts` with tests like:

```ts
it("derives lane-scoped execution units from the active preset", () => {
  const units = listLaneExecutionUnits({
    activePresetKey: "default",
    activePreset: {
      label: "Default",
      short: "def",
      usesLanes: ["frontend", "backend"],
      defaultLane: "backend",
      routes: {},
      defaultRoute: "build",
    },
  })

  expect(units.map((unit) => unit.lane)).toEqual(["frontend", "backend"])
  expect(units[0]?.commandFileName).toMatch(/sp-execute-/)
  expect(units[0]?.agentFileName).toMatch(/spr-build--/)
})

it("uses stable lane slugs and rejects collisions", () => {
  expect(() =>
    listLaneExecutionUnits({
      activePresetKey: "default",
      activePreset: {
        label: "Default",
        short: "def",
        usesLanes: ["front-end", "front end"],
        routes: {},
        defaultRoute: "build",
      },
    }),
  ).toThrow(/collision|lane/i)
})
```

- [ ] **Step 2: Run the focused helper tests and verify failure**

Run: `pnpm test -- --run test/lane-execution.test.ts`

Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Implement the lane-execution helper core**

Create `src/lane-execution.ts` with:

```ts
export type LaneExecutionMode = "manual" | "suggest" | "auto"

export type LaneExecutionUnit = {
  lane: string
  laneSlug: string
  commandFileName: string
  agentFileName: string
}

export function listLaneExecutionUnits(...) { ... }
export function renderLaneSplitGuidance(...) { ... }
```

Rules:

- derive units from `preset.usesLanes`
- generate host-safe slugs
- fail on slug collisions
- produce mode-aware split guidance text for adapters

- [ ] **Step 4: Run the focused helper tests and verify they pass**

Run: `pnpm test -- --run test/lane-execution.test.ts`

Expected: PASS for the new helper tests.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lane-execution.ts test/lane-execution.test.ts
git commit -m "feat: add lane execution helper core"
```

### Task 3: OpenCode Lane-Scoped Execute Helpers

**Files:**
- Modify: `src/opencode.ts`
- Modify: `test/opencode.test.ts`

- [ ] **Step 1: Write the failing OpenCode tests for lane-scoped execute helpers**

Add tests in `test/opencode.test.ts`:

```ts
it("renders lane-scoped execute commands and agents for subagent-driven-development", () => {
  const artifacts = buildArtifacts({
    workflow: { kind: "superpowers" },
    profiles: {
      frontendBuild: { model: "openai/gpt-5" },
      backendBuild: { model: "gpt-5.4" },
    },
    lanes: {
      frontend: { label: "Frontend", routes: {}, defaultRoute: "frontendBuild" },
      backend: { label: "Backend", routes: {}, defaultRoute: "backendBuild" },
    },
    routes: {},
    defaultRoute: "backendBuild",
    effectiveLane: "backend",
  } as never, {
    ...createDefaultControlPlaneConfig().settings,
    subagentExecution: { mode: "suggest" },
  })

  expect(artifacts.commands.map((item) => item.fileName)).toEqual(
    expect.arrayContaining(["sp-execute-frontend.md", "sp-execute-backend.md"]),
  )
  expect(artifacts.agents.map((item) => item.fileName)).toEqual(
    expect.arrayContaining(["spr-build--frontend.md", "spr-build--backend.md"]),
  )
})

it("adds suggest-mode split guidance to the main execute command", () => {
  const artifacts = buildArtifacts({
    workflow: { kind: "superpowers" },
    profiles: { build: { model: "openai/gpt-5" } },
    lanes: { frontend: { label: "Frontend", routes: {}, defaultRoute: "build" } },
    routes: {},
    defaultRoute: "build",
  } as never, {
    ...createDefaultControlPlaneConfig().settings,
    subagentExecution: { mode: "suggest" },
  })

  const execute = artifacts.commands.find((item) => item.fileName === "sp-execute.md")
  expect(execute?.content).toContain("If the task spans multiple lanes, propose a split plan first")
  expect(execute?.content).toContain("sp-execute-frontend")
})
```

- [ ] **Step 2: Run the focused OpenCode tests and verify failure**

Run: `pnpm test -- --run test/opencode.test.ts`

Expected: FAIL because lane-scoped execution helpers are not yet generated.

- [ ] **Step 3: Implement OpenCode lane-scoped execute helpers**

Update `src/opencode.ts` so that in superpowers mode:

- the main `sp-execute.md` remains
- additional lane-scoped execute commands and agents are generated from `listLaneExecutionUnits(...)`
- each lane-scoped command still loads `superpowers/subagent-driven-development`
- each lane-scoped agent is rendered from the lane-resolved selection for that lane

Keep owner prefixes explicit so cleanup works across lane changes.

- [ ] **Step 4: Run the focused OpenCode tests and verify they pass**

Run: `pnpm test -- --run test/opencode.test.ts`

Expected: PASS for the new lane-scoped execute helper tests and the existing OpenCode suite.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/opencode.ts test/opencode.test.ts
git commit -m "feat: add OpenCode lane-scoped execute helpers"
```

### Task 4: CLI Diagnostics for Lane-Aware Subagent Execution

**Files:**
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing diagnostics tests**

Add tests that verify:

```ts
it("shows subagent execution mode and available lane-scoped execute commands in doctor for OpenCode", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
    resolveControlPlane: async () => ({
      source: { kind: "file", hasRealSource: true, path: "/workspace/project/oh-my-superagents.config.jsonc", sources: ["/workspace/project/oh-my-superagents.config.jsonc"] },
      config: {
        ...controlPlaneConfig,
        settings: {
          ...controlPlaneConfig.settings,
          subagentExecution: { mode: "suggest" },
        },
      },
      activePreset: {
        key: "default",
        preset: {
          ...controlPlaneConfig.presets.default,
          usesLanes: ["frontend", "backend"],
        },
      },
      laneState: {
        allowedLanes: ["frontend", "backend"],
        presetDefaultLane: "backend",
        defaultLane: "backend",
        effectiveLane: "backend",
        runtimeLane: undefined,
        mode: "suggest",
      },
    }),
  }))

  const output = JSON.parse(result.stdout)
  expect(output.subagentExecution.mode).toBe("suggest")
  expect(output.subagentExecution.availableLanes).toEqual(["frontend", "backend"])
  expect(output.subagentExecution.commandsByLane.frontend).toBe("sp-execute-frontend")
})
```

- [ ] **Step 2: Run the focused diagnostics tests and verify failure**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: FAIL because diagnostics do not yet expose subagent execution helpers.

- [ ] **Step 3: Implement diagnostics support**

In `src/control-plane.ts` and `src/cli.ts`, expose a small `subagentExecution` block on supported OpenCode surfaces with:

- mode
- available lanes
- command names by lane

Do not add a new CLI command in this slice.

- [ ] **Step 4: Run the focused diagnostics tests and verify they pass**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: PASS for the new diagnostics coverage and existing suites.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/control-plane.ts src/cli.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: expose lane-aware subagent execution diagnostics"
```

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing documentation expectation**

Run: `rg -n "subagent execution|lane-scoped execute|sp-execute-frontend|suggest" README.md README.zh-CN.md`

Expected: no current docs for this new execution helper surface.

- [ ] **Step 2: Update docs**

Add a short section to both READMEs describing:

- lane-aware subagent execution as an execution-layer enhancement
- `manual | suggest | auto` execution mode
- OpenCode-first lane-scoped execute helpers such as `sp-execute-frontend`
- that this is still under the `superpowers` execution flow, not a new top-level workflow system

- [ ] **Step 3: Verify docs landed**

Run: `rg -n "subagent execution|lane-scoped execute|sp-execute-frontend|suggest" README.md README.zh-CN.md`

Expected: both READMEs contain the new guidance.

- [ ] **Step 4: Run full verification**

Run: `pnpm test && pnpm check && pnpm build`

Expected: PASS for the full suite, type check, and build.

- [ ] **Step 5: Commit Task 5**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add lane-aware execution guidance"
```

## Self-Review Notes

- Spec coverage:
  - execution-mode config, lane-scoped execution unit derivation, OpenCode lane-scoped execute helpers, and diagnostics/docs are all covered.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses `subagentExecution.mode`, `LaneExecutionUnit`, `sp-execute-<laneSlug>`, and `spr-build--<laneSlug>` as the first-slice execution surface.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-lane-aware-subagent-execution.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user has already requested subagent-driven TDD execution, so proceed with Option 1 unless they explicitly redirect.
