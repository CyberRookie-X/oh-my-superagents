# Lane Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lane-aware routing to OMS so fixed superpowers phases can resolve through reusable tech-stack lanes into different profiles, with explicit control-plane state and explainability, while preserving compatibility with existing host artifact generation.

**Architecture:** Introduce global `profiles` and `lanes`, let presets constrain which lanes they use, and add `settings.defaultLane` plus `laneSelection.mode` as the control-plane baseline. Keep runtime routing phase-first, with lane acting as an overlay below the phase layer. For Stage 1, lane awareness is expressed through config, control-plane validation, route resolution, explainability, and host artifact regeneration; heavy execution-time auto-fanout remains future work.

**Tech Stack:** TypeScript, Vitest, jsonc-parser, Zod, JSON Schema, OpenCode/Codex/Qwen artifact builders

---

## File Structure

### Shared config and schema

- `src/config.ts`
  - extend layered control-plane schema to include global `profiles`, global `lanes`, preset lane constraints, `settings.defaultLane`, and `settings.laneSelection.mode`
  - keep legacy router support intact during migration
- `schemas/oh-my-superagents.schema.json`
  - mirror the public schema additions for lanes and lane-selection settings

### Shared control-plane and routing core

- `src/control-plane.ts`
  - validate lane visibility and defaults
  - carry lane-related state in resolved control-plane output
  - prepare future writes to `settings.defaultLane`
- `src/router.ts`
  - resolve phases through the lane-aware overlay model
  - expose lane-aware explain metadata and keep profile selection explicit

### CLI and explainability

- `src/cli.ts`
  - surface lane-aware status/explain/doctor outputs
  - add control-plane lane switching and lane recommendation placeholders where needed for Stage 1

### Host rendering

- `src/opencode.ts`
  - ensure lane-aware route resolution changes generated OpenCode agent selection correctly

### Tests

- `test/config.test.ts`
- `test/control-plane.test.ts`
- `test/router.test.ts`
- `test/cli.test.ts`
- `test/opencode.test.ts`

## Execution Notes

- Keep `phase` as the top-level workflow key; do not add new pseudo-phases.
- Keep `lane` as a route bundle only; do not let lane carry model fields.
- Keep `profile` as the model/config leaf.
- Use `defaultLane` consistently at both `settings` and `preset` levels.
- `laneSelection.mode = auto` should remain non-persistent in semantics for Stage 1; do not silently write lane choices back into config.

### Task 1: Global Lane and Settings Schema

**Files:**
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing config tests for lane-aware schema acceptance**

Add tests in `test/config.test.ts`:

```ts
it("loads a layered config with global profiles, global lanes, and preset lane constraints", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "settings": {
        "activePreset": "default",
        "defaultLane": "backend",
        "laneSelection": { "mode": "suggest" }
      },
      "profiles": {
        "frontend-build": { "model": "openai/gpt-5" },
        "backend-build": { "model": "gpt-5.4", "codexFast": true }
      },
      "lanes": {
        "frontend": {
          "label": "Frontend",
          "routes": {},
          "defaultRoute": "frontend-build"
        },
        "backend": {
          "label": "Backend",
          "routes": {},
          "defaultRoute": "backend-build"
        }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "usesLanes": ["frontend", "backend"],
          "defaultLane": "backend",
          "routes": {},
          "defaultRoute": "backend-build"
        }
      }
    }`,
  })

  expect(result.config.settings.defaultLane).toBe("backend")
  expect(result.config.settings.laneSelection.mode).toBe("suggest")
  expect(result.config.profiles["backend-build"].codexFast).toBe(true)
  expect(result.config.lanes.backend.defaultRoute).toBe("backend-build")
  expect(result.config.presets.default.usesLanes).toEqual(["frontend", "backend"])
})

it("rejects a preset that references a missing lane", async () => {
  await expect(loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "settings": { "activePreset": "default" },
      "profiles": { "build": { "model": "openai/gpt-5" } },
      "lanes": {},
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
  })).rejects.toThrow(/lane/i)
})
```

- [ ] **Step 2: Run the focused config tests and verify failure**

Run: `npm test -- --run test/config.test.ts`

Expected: FAIL because global `profiles`, `lanes`, `settings.defaultLane`, `laneSelection`, and `usesLanes` are not yet part of the schema.

- [ ] **Step 3: Implement the global lane-aware config shape**

Update `src/config.ts` and `schemas/oh-my-superagents.schema.json`.

Add new schema pieces conceptually like:

```ts
const LaneSelectionSchema = z.object({
  mode: z.enum(["manual", "suggest", "auto"]).default("suggest"),
}).strict()

const LaneSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  routes: z.record(z.string().min(1), z.string().min(1)),
  defaultRoute: z.string().min(1),
}).strict()
```

Extend layered settings and preset shapes:

```ts
defaultLane: z.string().min(1).optional(),
laneSelection: LaneSelectionSchema.optional(),
```

and preset:

```ts
usesLanes: z.array(z.string().min(1)).default([]),
defaultLane: z.string().min(1).optional(),
```

Move lane/profile collections to top level in the layered control-plane shape, while preserving legacy flat router loading separately.

- [ ] **Step 4: Run the focused config tests and verify they pass**

Run: `npm test -- --run test/config.test.ts`

Expected: PASS for the new lane schema tests and existing config coverage.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/config.ts schemas/oh-my-superagents.schema.json test/config.test.ts
git commit -m "feat: add global lane config schema"
```

### Task 2: Control-Plane Validation and Baseline Lane State

**Files:**
- Modify: `src/control-plane.ts`
- Test: `test/control-plane.test.ts`

- [ ] **Step 1: Write the failing control-plane tests for lane defaults and visibility**

Add tests in `test/control-plane.test.ts`:

```ts
it("resolves settings.defaultLane when allowed by the active preset", async () => {
  const result = await resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => true,
    readFile: async () => `{
      "settings": {
        "activePreset": "default",
        "defaultLane": "frontend"
      },
      "profiles": {
        "frontend-build": { "model": "openai/gpt-5" },
        "backend-build": { "model": "gpt-5.4" }
      },
      "lanes": {
        "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
        "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "usesLanes": ["frontend", "backend"],
          "defaultLane": "backend",
          "routes": {},
          "defaultRoute": "backend-build"
        }
      }
    }`,
  })

  expect(result.config.settings.defaultLane).toBe("frontend")
})

it("rejects settings.defaultLane when the active preset does not allow that lane", async () => {
  await expect(resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => true,
    readFile: async () => `{
      "settings": {
        "activePreset": "default",
        "defaultLane": "frontend"
      },
      "profiles": {
        "frontend-build": { "model": "openai/gpt-5" },
        "backend-build": { "model": "gpt-5.4" }
      },
      "lanes": {
        "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
        "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "usesLanes": ["backend"],
          "defaultLane": "backend",
          "routes": {},
          "defaultRoute": "backend-build"
        }
      }
    }`,
  })).rejects.toThrow(/defaultLane|lane/i)
})
```

- [ ] **Step 2: Run the focused control-plane tests and verify failure**

Run: `npm test -- --run test/control-plane.test.ts`

Expected: FAIL because control-plane validation does not yet understand lanes.

- [ ] **Step 3: Implement lane-aware control-plane validation**

In `src/control-plane.ts`, validate:

- every preset `usesLanes` entry points at a real global lane
- `preset.defaultLane`, if present, is included in `usesLanes`
- `settings.defaultLane`, if present, is allowed by the active preset

Also extend the control-plane config and resolved output so lane-selection settings survive through `resolveControlPlane()` and `prepareControlPlaneStateWrite()`.

- [ ] **Step 4: Run the focused control-plane tests and verify they pass**

Run: `npm test -- --run test/control-plane.test.ts`

Expected: PASS for the new lane validation tests and existing control-plane coverage.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/control-plane.ts test/control-plane.test.ts
git commit -m "feat: validate control-plane lane defaults"
```

### Task 3: Lane-Aware Phase Resolution

**Files:**
- Modify: `src/router.ts`
- Test: `test/router.test.ts`

- [ ] **Step 1: Write the failing router tests for lane-aware routing**

Add tests in `test/router.test.ts`:

```ts
it("routes through the effective lane before falling back to preset defaultRoute", () => {
  const config = {
    profiles: {
      "frontend-strategy": { model: "frontend-model", effort: "deep" },
      "frontend-build": { model: "frontend-build-model" },
      "backend-build": { model: "backend-model" },
    },
    lanes: {
      frontend: {
        label: "Frontend",
        routes: { brainstorming: "frontend-strategy" },
        defaultRoute: "frontend-build",
      },
    },
    routes: {},
    defaultRoute: "backend-build",
  }

  expect(resolvePhase(config as never, "brainstorming", { effectiveLane: "frontend" }).profileId).toBe("frontend-strategy")
  expect(resolvePhase(config as never, "writing-plans", { effectiveLane: "frontend" }).profileId).toBe("frontend-build")
})

it("falls back to preset defaultRoute when there is no effective lane", () => {
  const config = {
    profiles: { build: { model: "openai/gpt-5" } },
    lanes: {},
    routes: {},
    defaultRoute: "build",
  }

  expect(resolvePhase(config as never, "writing-plans").profileId).toBe("build")
})
```

- [ ] **Step 2: Run the focused router tests and verify failure**

Run: `npm test -- --run test/router.test.ts`

Expected: FAIL because `resolvePhase()` does not yet accept or use lane context.

- [ ] **Step 3: Implement lane-aware route resolution**

Update `src/router.ts` so `resolvePhase()` conceptually accepts:

```ts
resolvePhase(config, phase, { effectiveLane?: string })
```

Resolution order should be:

1. preset phase override route
2. effective lane explicit route
3. effective lane defaultRoute
4. preset defaultRoute

Thread lane-related metadata into explain output so later CLI work can expose it.

- [ ] **Step 4: Run the focused router tests and verify they pass**

Run: `npm test -- --run test/router.test.ts`

Expected: PASS for the new lane routing tests and existing router coverage.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/router.ts test/router.test.ts
git commit -m "feat: add lane-aware phase resolution"
```

### Task 4: CLI Explainability for Default and Effective Lane

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write the failing CLI tests for lane-aware explain and doctor output**

Add tests in `test/cli.test.ts`:

```ts
it("includes defaultLane and effectiveLane in opencode explain output", async () => {
  const result = await runCli([
    "explain",
    "--host",
    "opencode",
    "--phase",
    "brainstorming",
  ], createCliDeps({
    resolveControlPlane: async () => ({
      source: { kind: "file", hasRealSource: true, path: "/workspace/project/oh-my-superagents.config.jsonc", sources: ["/workspace/project/oh-my-superagents.config.jsonc"] },
      config: {
        ...controlPlaneConfig,
        settings: { ...controlPlaneConfig.settings, defaultLane: "backend", laneSelection: { mode: "suggest" } },
      },
      activePreset: {
        key: "default",
        preset: { ...controlPlaneConfig.presets.default, usesLanes: ["frontend", "backend"], defaultLane: "backend" },
      },
    }),
  }))

  const output = JSON.parse(result.stdout)
  expect(output.defaultLane).toBe("backend")
  expect(output.effectiveLane).toBe("backend")
})

it("shows lane selection mode and allowed lanes in doctor output", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
    resolveControlPlane: async () => ({
      source: { kind: "file", hasRealSource: true, path: "/workspace/project/oh-my-superagents.config.jsonc", sources: ["/workspace/project/oh-my-superagents.config.jsonc"] },
      config: {
        ...controlPlaneConfig,
        settings: { ...controlPlaneConfig.settings, defaultLane: "frontend", laneSelection: { mode: "auto" } },
      },
      activePreset: {
        key: "default",
        preset: { ...controlPlaneConfig.presets.default, usesLanes: ["frontend", "backend"], defaultLane: "backend" },
      },
    }),
  }))

  const output = JSON.parse(result.stdout)
  expect(output.laneSelection.mode).toBe("auto")
  expect(output.allowedLanes).toEqual(["frontend", "backend"])
  expect(output.defaultLane).toBe("frontend")
})
```

- [ ] **Step 2: Run the focused CLI tests and verify failure**

Run: `npm test -- --run test/cli.test.ts`

Expected: FAIL because explain/doctor outputs do not yet surface lane information.

- [ ] **Step 3: Implement lane-aware explainability fields**

In `src/control-plane.ts` and `src/cli.ts`, add helpers so the CLI can expose:

- `defaultLane`
- `presetDefaultLane`
- `effectiveLane`
- `allowedLanes`
- `laneSelection.mode`

For Stage 1, `effectiveLane` can resolve to the persisted/default baseline when no session override exists.

- [ ] **Step 4: Run the focused CLI tests and verify they pass**

Run: `npm test -- --run test/cli.test.ts`

Expected: PASS for the new lane explain/doctor coverage and the existing CLI suite.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/cli.ts src/control-plane.ts test/cli.test.ts
git commit -m "feat: expose lane routing diagnostics"
```

### Task 5: OpenCode Lane-Aware Artifact Generation

**Files:**
- Modify: `src/opencode.ts`
- Test: `test/opencode.test.ts`

- [ ] **Step 1: Write the failing OpenCode tests for lane-aware agent selection**

Add tests in `test/opencode.test.ts`:

```ts
it("uses the effective lane when generating OpenCode shared agents", () => {
  const config = {
    profiles: {
      "frontend-build": { model: "frontend-model", effort: "balanced" },
      "backend-build": { model: "backend-model", effort: "balanced" },
    },
    lanes: {
      frontend: { label: "Frontend", routes: {}, defaultRoute: "frontend-build" },
    },
    routes: {},
    defaultRoute: "backend-build",
  }

  const artifacts = buildArtifacts(config as never, createDefaultControlPlaneConfig().settings, {
    effectiveLane: "frontend",
  })

  const buildAgent = artifacts.agents.find((item) => item.fileName === "spr-build.md")
  expect(buildAgent?.content).toContain("frontend-model")
})

it("still throws shared agent conflict when a lane makes shared phases diverge", () => {
  expect(() =>
    buildArtifacts({
      profiles: {
        "frontend-visual": { model: "frontend-model", variant: "high" },
        "frontend-web": { model: "other-model", variant: "low" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: {
            "frontend-design": "frontend-visual",
            "webapp-testing": "frontend-web",
          },
          defaultRoute: "frontend-visual",
        },
      },
      routes: {},
      defaultRoute: "frontend-visual",
    } as never, createDefaultControlPlaneConfig().settings, { effectiveLane: "frontend" }),
  ).toThrow(/spr-visual/)
})
```

- [ ] **Step 2: Run the focused OpenCode tests and verify failure**

Run: `npm test -- --run test/opencode.test.ts`

Expected: FAIL because `buildArtifacts()` does not yet accept lane context.

- [ ] **Step 3: Implement lane-aware OpenCode artifact generation**

Update `src/opencode.ts` so `buildArtifacts()` accepts an optional lane context and passes it through to `resolvePhase()` for every built-in phase.

Keep the existing shared-agent conflict detection intact, but make it compare lane-resolved selections.

- [ ] **Step 4: Run the focused OpenCode tests and verify they pass**

Run: `npm test -- --run test/opencode.test.ts`

Expected: PASS for the new lane-aware OpenCode coverage and the existing OpenCode suite.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/opencode.ts test/opencode.test.ts
git commit -m "feat: add lane-aware OpenCode routing"
```

### Task 6: README Documentation for Lane Concepts and Modes

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing documentation diff expectation**

Run: `rg -n "lane|defaultLane|laneSelection|effectiveLane" README.md README.zh-CN.md`

Expected: no current public README explanation of the lane model.

- [ ] **Step 2: Update the documentation**

Add a short section in both READMEs that explains:

- `phase` remains fixed from superpowers
- `lane` is a tech-stack route bundle
- `profile` is the model/config leaf
- `preset` chooses work mode and allowed lanes
- `settings.defaultLane` is the persisted baseline lane
- `laneSelection.mode` supports `manual`, `suggest`, and `auto`

Include a compact example using the new global `profiles` + global `lanes` + preset `usesLanes` shape.

- [ ] **Step 3: Verify the documentation update landed**

Run: `rg -n "lane|defaultLane|laneSelection|effectiveLane" README.md README.zh-CN.md`

Expected: both READMEs include the new lane section and example.

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run check && npm run build`

Expected: PASS for the full suite, type check, and build.

- [ ] **Step 5: Commit Task 6**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add lane routing guidance"
```

## Self-Review Notes

- Spec coverage:
  - global lanes/profiles, preset lane selection, default lane semantics, lane selection modes, lane-aware OpenCode behavior, and explainability are covered by Tasks 1-6.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses `defaultLane`, `laneSelection.mode`, `usesLanes`, `effectiveLane`, `profiles`, and `lanes` with stable meanings.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-lane-routing.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user has already indicated a preference for subagent-driven TDD execution in this session, so proceed with Option 1 unless they explicitly redirect.
