# Workflow Source and Fusion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade OMS from a single global `workflow.kind` model to a canonical-route and source-aware routing core that can power future fusion, `gstack`, and Claude Code work without turning OMS into an orchestrator.

**Architecture:** Keep the existing lane/profile/control-plane structure, but insert a new stable routing layer: `canonical route -> source -> source entry -> profile -> host projection`. Preserve current `superpowers` and direct behavior during migration by deriving canonical routes from existing phases and intents, then teach the router, control plane, and host renderers to consume resolved source metadata instead of hard-coding workflow assumptions.

**Tech Stack:** TypeScript, Vitest, jsonc-parser, Zod, JSON Schema, existing OpenCode/Codex/Qwen builders, OMS control plane and artifact materializer

---

## Scope Decomposition

This plan covers the routing-foundation slice only.

It includes:

- canonical route and source-aware config/schema additions
- resolved source metadata in router output
- explain/status/doctor groundwork for mixed-source routing
- ownership metadata changes needed before multiple sources can safely share host directories

Deferred to follow-on plans:

- adding the actual `gstack` source catalog
- adding Claude Code host projection
- broad README support-matrix expansion beyond the new source-aware diagnostics

## File Structure

### Core route and source model

- Create: `src/workflow-direct.ts`
  - define helpers that map direct intents into canonical routes and source entries
- Create: `src/workflow-sources.ts`
  - hold source kinds, canonical route helpers, source-resolution helpers, and shared route/source metadata types
- Modify: `src/workflow-superpowers.ts`
  - add canonical-route mapping for existing built-in phases without changing host-facing names

### Config and schema

- Modify: `src/config.ts`
  - add source-aware config shapes, fusion preset schema, and effective route-to-source expansion helpers
- Modify: `schemas/oh-my-superagents.schema.json`
  - mirror the new public source-routing schema

### Router and control plane

- Modify: `src/router.ts`
  - return canonical route, resolved source, and source entry data
- Modify: `src/control-plane.ts`
  - validate fusion preset expansion and surface effective route-to-source information
- Modify: `src/cli.ts`
  - show source-aware explain/status/doctor output

### Host builders and ownership metadata

- Modify: `src/opencode.ts`
- Modify: `src/codex.ts`
- Modify: `src/qwen.ts`
  - consume resolved source data instead of assuming only `superpowers` vs direct
- Modify: `src/materialize.ts`
  - include source-aware ownership parsing for generated artifacts

### Exports

- Modify: `src/index.ts`
  - export new source and canonical-route helpers

### Tests

- Modify: `test/config.test.ts`
- Modify: `test/router.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/opencode.test.ts`
- Modify: `test/codex.test.ts`
- Modify: `test/qwen.test.ts`
- Modify: `test/materialize.test.ts`

## Execution Notes

- Preserve existing behavior for current `superpowers` and direct configs while the new foundation lands.
- Keep `profile` selection independent from `source` selection.
- Treat the long-lived subagent/profile-switch issue as capability reporting, not as a reason to weaken route/source resolution.
- Do not introduce runtime source chaining or orchestration semantics in this plan.

### Task 1: Canonical Route and Source-Aware Schema

**Files:**
- Create: `src/workflow-direct.ts`
- Create: `src/workflow-sources.ts`
- Modify: `src/workflow-superpowers.ts`
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing config tests for source-aware routing**

Add tests in `test/config.test.ts`:

```ts
it("loads source presets and route-to-source overrides", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "workflow": { "kind": "superpowers" },
      "settings": { "activePreset": "default" },
      "profiles": {
        "plan-model": { "model": "openai/gpt-5" },
        "build-model": { "model": "gpt-5.4" }
      },
      "sourcePresets": {
        "gstack-plan": {
          "routes": {
            "phase.plan": "gstack",
            "phase.execute": "superpowers"
          }
        }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "sourcePreset": "gstack-plan",
          "routes": {},
          "defaultRoute": "build-model"
        }
      }
    }`,
  })

  expect(result.config.sourcePresets?.["gstack-plan"].routes["phase.plan"]).toBe("gstack")
  expect(result.config.presets.default.sourcePreset).toBe("gstack-plan")
})

it("rejects unknown source kinds in route-to-source mappings", async () => {
  await expect(loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "profiles": { "build": { "model": "openai/gpt-5" } },
      "sourcePresets": {
        "bad": { "routes": { "phase.plan": "unknown-source" } }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "sourcePreset": "bad",
          "routes": {},
          "defaultRoute": "build"
        }
      }
    }`,
  })).rejects.toThrow(/source/i)
})
```

- [ ] **Step 2: Run the focused config tests and verify failure**

Run: `npm test -- --run test/config.test.ts`

Expected: FAIL because `sourcePresets`, canonical route ids, and source enums are not yet part of the config schema.

- [ ] **Step 3: Implement the canonical-route and source schema**

Add source-aware types in `src/workflow-sources.ts`:

```ts
export const WORKFLOW_SOURCE_KINDS = ["superpowers", "gstack", "direct"] as const
export type WorkflowSourceKind = (typeof WORKFLOW_SOURCE_KINDS)[number]

export type CanonicalRouteId = `phase.${string}` | `intent.${string}`

export type SourcePresetConfig = {
  routes: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
}
```

Extend `src/config.ts` with source-aware schemas:

```ts
const WorkflowSourceKindSchema = z.enum(WORKFLOW_SOURCE_KINDS)

const SourcePresetSchema = z.object({
  routes: z.record(z.string().min(1), WorkflowSourceKindSchema),
}).strict()

const ControlPlanePresetSchema = z.object({
  label: z.string().min(1),
  short: z.string().min(1),
  sourcePreset: z.string().min(1).optional(),
  sourceRoutes: z.record(z.string().min(1), WorkflowSourceKindSchema).optional(),
  routes: z.record(z.string().min(1), z.string().min(1)),
  defaultRoute: z.string().min(1),
}).strict()
```

Also add top-level `sourcePresets` to the layered control-plane schema and mirror the same shape in `schemas/oh-my-superagents.schema.json`.

- [ ] **Step 4: Run the focused config tests and verify they pass**

Run: `npm test -- --run test/config.test.ts`

Expected: PASS for the new source-aware config tests and the existing config suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/workflow-direct.ts src/workflow-sources.ts src/workflow-superpowers.ts src/config.ts schemas/oh-my-superagents.schema.json test/config.test.ts
git commit -m "feat: add source-aware routing schema"
```

### Task 2: Resolved Source Metadata in Router and Control Plane

**Files:**
- Modify: `src/router.ts`
- Modify: `src/control-plane.ts`
- Modify: `src/index.ts`
- Test: `test/router.test.ts`
- Test: `test/control-plane.test.ts`

- [ ] **Step 1: Write the failing router and control-plane tests**

Add tests in `test/router.test.ts`:

```ts
it("resolves canonical route, source, and source entry for a superpowers phase", () => {
  const resolved = resolvePhase({
    workflow: { kind: "superpowers" },
    profiles: { build: { model: "openai/gpt-5" } },
    routes: {},
    defaultRoute: "build",
    sourceRoutes: { "phase.plan": "gstack" },
  } as never, "writing-plans")

  expect(resolved.canonicalRoute).toBe("phase.plan")
  expect(resolved.resolvedSource).toBe("gstack")
  expect(resolved.sourceEntry).toBeDefined()
})
```

Add tests in `test/control-plane.test.ts`:

```ts
it("expands preset sourcePreset plus sourceRoutes into an effective source table", async () => {
  const resolved = await resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => true,
    readFile: async () => `{
      "sourcePresets": {
        "gstack-plan": {
          "routes": {
            "phase.plan": "gstack",
            "phase.review": "gstack"
          }
        }
      },
      "profiles": { "build": { "model": "openai/gpt-5" } },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "sourcePreset": "gstack-plan",
          "sourceRoutes": { "phase.execute": "superpowers" },
          "routes": {},
          "defaultRoute": "build"
        }
      }
    }`,
  })

  expect(resolved.effectiveSources?.["phase.plan"]).toBe("gstack")
  expect(resolved.effectiveSources?.["phase.execute"]).toBe("superpowers")
})
```

- [ ] **Step 2: Run the focused router/control-plane tests and verify failure**

Run: `npm test -- --run test/router.test.ts test/control-plane.test.ts`

Expected: FAIL because resolved routes do not yet expose canonical route or source metadata, and the control plane does not yet expand effective source tables.

- [ ] **Step 3: Implement source-aware route resolution and effective source expansion**

Update `src/router.ts` so `ResolvedRoute` includes source fields:

```ts
export type ResolvedRoute = {
  routeId: string
  canonicalRoute: CanonicalRouteId
  resolvedSource: WorkflowSourceKind
  sourceEntry: string
  profileId: string
  routeSource: "preset-route" | "lane-route" | "lane-default" | "preset-default"
  sourceResolution: "preset-source-route" | "source-preset" | "source-default"
  // existing selection fields stay here
}
```

Add helpers that map existing phase and direct intent ids into canonical routes and default sources, then let explicit source overrides replace those defaults before host builders consume the result.

In `src/control-plane.ts`, expand a deterministic `effectiveSources` table during preset resolution by applying:

```ts
const effectiveSources = {
  ...config.sourcePresets?.[preset.sourcePreset ?? ""]?.routes,
  ...preset.sourceRoutes,
}
```

Export any shared route/source helpers from `src/index.ts`.

- [ ] **Step 4: Run the focused router/control-plane tests and verify they pass**

Run: `npm test -- --run test/router.test.ts test/control-plane.test.ts`

Expected: PASS for the new source-aware resolution tests and the existing suites.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/router.ts src/control-plane.ts src/index.ts test/router.test.ts test/control-plane.test.ts
git commit -m "feat: resolve sources per canonical route"
```

### Task 3: Source-Aware Explainability and Ownership Metadata

**Files:**
- Modify: `src/opencode.ts`
- Modify: `src/codex.ts`
- Modify: `src/qwen.ts`
- Modify: `src/materialize.ts`
- Modify: `src/cli.ts`
- Test: `test/opencode.test.ts`
- Test: `test/codex.test.ts`
- Test: `test/qwen.test.ts`
- Test: `test/materialize.test.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write the failing explainability and ownership tests**

Add tests in `test/materialize.test.ts`:

```ts
it("treats source-tagged OpenCode wrappers as OMS-owned artifacts", async () => {
  const sourceTagged = [
    "---",
    "---",
    "",
    "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
    "<!-- oms-route: stage=3; host=opencode; source=gstack; route=phase.plan; projection=command; rendered-name=sp-plan -->",
    "",
  ].join("\n")

  const { fs, removedPaths } = createMemoryFs({
    "/workspace/.opencode/commands/sp-plan.md": sourceTagged,
  })

  await materializeArtifacts({ cwd: "/workspace", artifacts: [], fs })
  expect(removedPaths).toContain("/workspace/.opencode/commands/sp-plan.md")
})
```

Add tests in `test/cli.test.ts`:

```ts
it("shows resolved source information in explain output", async () => {
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
  expect(result.stdout).toContain("Canonical Route: phase.plan")
})
```

- [ ] **Step 2: Run the focused host/materialize/cli tests and verify failure**

Run: `npm test -- --run test/opencode.test.ts test/codex.test.ts test/qwen.test.ts test/materialize.test.ts test/cli.test.ts`

Expected: FAIL because ownership metadata, host renderers, and CLI explain output do not yet carry source-aware fields.

- [ ] **Step 3: Implement source-aware projection metadata and CLI output**

Tag generated wrappers with source-aware ownership metadata, for example in `src/opencode.ts`:

```ts
return `<!-- oms-route: stage=3; host=opencode; source=${input.source}; route=${input.canonicalRoute}; projection=command; rendered-name=${input.renderedName} -->`
```

Update `src/codex.ts` and `src/qwen.ts` to build developer instructions from `resolved.sourceEntry` instead of hard-coding only `superpowers` wording.

Extend `src/materialize.ts` with a parser for the new `oms-route` marker and teach `src/cli.ts` to print canonical route and source lines in explain/status/doctor output.

- [ ] **Step 4: Run the focused host/materialize/cli tests and verify they pass**

Run: `npm test -- --run test/opencode.test.ts test/codex.test.ts test/qwen.test.ts test/materialize.test.ts test/cli.test.ts`

Expected: PASS for the new source-aware ownership and explain tests and the existing suites.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/opencode.ts src/codex.ts src/qwen.ts src/materialize.ts src/cli.ts test/opencode.test.ts test/codex.test.ts test/qwen.test.ts test/materialize.test.ts test/cli.test.ts
git commit -m "feat: add source-aware routing diagnostics"
```

### Task 4: Full Verification

**Files:**
- Modify: none
- Test: full repository verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS with all test files green.

- [ ] **Step 2: Run type checking**

Run: `npm run check`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS and regenerate `dist/` successfully.

- [ ] **Step 4: Commit the verification-only checkpoint**

```bash
git add .
git commit -m "test: verify source-aware routing foundation"
```
