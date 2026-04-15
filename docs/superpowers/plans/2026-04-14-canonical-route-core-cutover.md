# Canonical Route Core Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace transitional `superpowers`-specific internal route IDs with a true canonical route core so OMS route resolution, source mapping, diagnostics, host projection, and ownership metadata all use one source-neutral truth layer.

**Architecture:** Normalize built-in OMS phase inputs such as `writing-plans` and `requesting-code-review` into true canonical routes such as `phase.plan` and `phase.review` at the OMS boundary. Keep source-native entry naming inside `workflow-superpowers.ts` and `workflow-gstack.ts`, then teach the router, control plane, CLI, host adapters, and materializer to consume the corrected canonical route identity end-to-end.

**Tech Stack:** TypeScript, Vitest, JSON Schema, OMS router/control-plane/materializer, existing OpenCode/Codex/Qwen/Claude host builders

---

## Scope Decomposition

This plan covers Stage 1 of the architecture remediation roadmap only.

It includes:

- the true canonical phase route registry
- built-in phase input normalization
- source adapter refactoring for `superpowers` and `gstack`
- router and config cutover to the new canonical route IDs
- host projection, explainability, and ownership metadata migration

Deferred to follow-on plans:

- centralized capability and fail-closed policy registry
- generalized upstream availability and diagnostics

## File Structure

### Route and source model

- Modify: `src/workflow-superpowers.ts`
  - replace `phase.<superpowers-phase>` as the canonical route model with a true canonical-phase mapping and source-entry catalog
- Modify: `src/workflow-gstack.ts`
  - remove alias-driven canonical normalization and make `gstack` consume true canonical routes directly
- Modify: `src/workflow-sources.ts`
  - dispatch source-entry lookup by source adapter instead of shared alias normalization

### Core routing and config

- Modify: `src/router.ts`
  - normalize built-in phase inputs into true canonical routes before source resolution
- Modify: `src/config.ts`
  - validate source routing tables against the new canonical phase registry and reject legacy `superpowers` route IDs
- Modify: `src/control-plane.ts`
  - surface effective source entries and explain traces with the new canonical routes only

### Host projection and ownership

- Modify: `src/opencode.ts`
- Modify: `src/codex.ts`
- Modify: `src/qwen.ts`
- Modify: `src/claude.ts`
  - consume true canonical routes and source entries without reintroducing legacy route meaning in host code
- Modify: `src/materialize.ts`
  - preserve route-aware ownership parsing and cleanup using the corrected canonical route metadata

### Public docs and schema

- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README-architecture.md`
  - remove internal references that still describe `phase.writing-plans`-style IDs as canonical

### Tests

- Modify: `test/router.test.ts`
- Modify: `test/workflow-gstack.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/claude.test.ts`
- Modify: `test/qwen.test.ts`
- Modify: `test/materialize.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- Do not preserve a dual truth layer in the core.
- The only durable compatibility boundary is built-in phase input at the OMS edge.
- If a change appears to require host-local route alias logic, stop and move that logic back into a source adapter instead.
- Keep direct-mode `intent.*` behavior intact while changing only the phase-family truth layer.

### Task 1: Rewrite Tests Around the New Canonical Route Truth Layer

**Files:**
- Modify: `test/router.test.ts`
- Modify: `test/workflow-gstack.test.ts`
- Modify: `test/config.test.ts`
- Modify: `src/workflow-superpowers.ts`
- Modify: `src/workflow-gstack.ts`
- Modify: `src/workflow-sources.ts`

- [ ] **Step 1: Write the failing route and source tests**

Update `test/router.test.ts` so built-in phases now assert true canonical routes:

```ts
it("normalizes writing-plans to the true canonical planning route", () => {
  const resolved = resolvePhase(
    {
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    } as never,
    "writing-plans",
  )

  expect(resolved.canonicalRoute).toBe("phase.plan")
  expect(resolved.sourceEntry).toMatchObject({
    canonicalRoute: "phase.plan",
    source: "superpowers",
    entryName: "writing-plans",
  })
})

it("maps gstack directly from true canonical routes without superpowers aliases", () => {
  const resolved = resolvePhase(
    {
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
      effectiveSources: { "phase.plan": "gstack" },
    } as never,
    "writing-plans",
  )

  expect(resolved.canonicalRoute).toBe("phase.plan")
  expect(resolved.sourceEntry).toMatchObject({
    canonicalRoute: "phase.plan",
    source: "gstack",
    entryName: "plan-eng-review",
  })
})
```

Update `test/workflow-gstack.test.ts`:

```ts
it("defines gstack entries in true canonical route space", () => {
  expect(getGstackSourceEntry("phase.plan")).toEqual({
    canonicalRoute: "phase.plan",
    source: "gstack",
    entryName: "plan-eng-review",
  })
  expect(getGstackSourceEntry("phase.review")).toEqual({
    canonicalRoute: "phase.review",
    source: "gstack",
    entryName: "review",
  })
})
```

Update `test/config.test.ts` with an explicit rejection for legacy route IDs:

```ts
it("rejects legacy superpowers canonical route ids in source mappings", async () => {
  await expect(
    loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "sourcePresets": {
          "legacy": {
            "routes": {
              "phase.writing-plans": "gstack"
            }
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": { "build": { "model": "openai/gpt-5" } },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }),
  ).rejects.toThrow(/phase\.writing-plans|canonical route/i)
})
```

- [ ] **Step 2: Run the focused route/source tests and verify failure**

Run: `pnpm test -- --run test/router.test.ts test/workflow-gstack.test.ts test/config.test.ts`

Expected: FAIL because the router still emits `phase.writing-plans`-style internal route IDs and the shared source layer still performs alias-based normalization.

- [ ] **Step 3: Implement the true canonical phase registry and source-entry catalogs**

Replace the route helpers in `src/workflow-superpowers.ts` with a true canonical-phase mapping and source-entry catalog:

```ts
export const BUILT_IN_PHASE_TO_CANONICAL_ROUTE = {
  brainstorming: "phase.brainstorm",
  "writing-plans": "phase.plan",
  "subagent-driven-development": "phase.execute",
  "requesting-code-review": "phase.review",
  "verification-before-completion": "phase.verify",
  "frontend-design": "phase.visual",
  "webapp-testing": "phase.web-test",
} as const satisfies Record<BuiltInPhase, CanonicalRouteId>

export function toCanonicalPhaseRoute(phase: BuiltInPhase): CanonicalRouteId {
  return BUILT_IN_PHASE_TO_CANONICAL_ROUTE[phase]
}

const SUPERPOWERS_SOURCE_CATALOG = {
  "phase.brainstorm": "brainstorming",
  "phase.plan": "writing-plans",
  "phase.execute": "subagent-driven-development",
  "phase.review": "requesting-code-review",
  "phase.verify": "verification-before-completion",
  "phase.visual": "frontend-design",
  "phase.web-test": "webapp-testing",
} as const satisfies Partial<Record<CanonicalRouteId, BuiltInPhase>>

export function getSuperpowersSourceEntry(canonicalRoute: CanonicalRouteId) {
  const entryName = SUPERPOWERS_SOURCE_CATALOG[canonicalRoute]
  return entryName
    ? { canonicalRoute, source: "superpowers" as const, entryName }
    : undefined
}
```

Update `src/workflow-gstack.ts` so it uses only true canonical routes:

```ts
export const GSTACK_SOURCE_CATALOG = {
  "phase.plan": "plan-eng-review",
  "phase.execute": "ship",
  "phase.review": "review",
  "phase.verify": "qa",
} as const satisfies Partial<Record<CanonicalRouteId, string>>
```

Update `src/workflow-sources.ts` so source lookup dispatches by source instead of alias normalization:

```ts
export function normalizeWorkflowSourceRoutes(
  workflow: WorkflowSourceNormalizationInput,
  routes: Partial<Record<CanonicalRouteId, WorkflowSourceKind>> | undefined,
) {
  return routes ? { ...routes } : {}
}

export function getWorkflowSourceEntry(canonicalRoute: CanonicalRouteId, source: WorkflowSourceKind) {
  if (source === "superpowers") {
    return getSuperpowersSourceEntry(canonicalRoute) ?? { canonicalRoute, source }
  }
  if (source === "gstack") {
    return getGstackSourceEntry(canonicalRoute) ?? { canonicalRoute, source }
  }
  return { canonicalRoute, source }
}
```

- [ ] **Step 4: Run the focused route/source tests and verify they pass**

Run: `pnpm test -- --run test/router.test.ts test/workflow-gstack.test.ts test/config.test.ts`

Expected: PASS for the new canonical route assertions and existing direct-mode source tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/workflow-superpowers.ts src/workflow-gstack.ts src/workflow-sources.ts test/router.test.ts test/workflow-gstack.test.ts test/config.test.ts
git commit -m "feat: cut over to true canonical phase routes"
```

### Task 2: Cut Over Router, Config, and Control Plane to the New Canonical IDs

**Files:**
- Modify: `src/router.ts`
- Modify: `src/config.ts`
- Modify: `src/control-plane.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `test/router.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/control-plane.test.ts`

- [ ] **Step 1: Write the failing router/control-plane tests for the full truth-layer cutover**

Add to `test/control-plane.test.ts`:

```ts
it("summarizes effective sources with true canonical routes only", async () => {
  const resolved = await resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => true,
    readFile: async () => `{
      "sourcePresets": {
        "fusion": {
          "routes": { "phase.plan": "gstack" }
        }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "sourcePreset": "fusion",
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": {},
          "defaultRoute": "build"
        }
      }
    }`,
  })

  expect(summarizeEffectiveSourceEntries(resolved)).toMatchObject({
    "phase.plan": { canonicalRoute: "phase.plan", source: "gstack", entryName: "plan-eng-review" },
  })
})

it("builds explain traces with the new canonical route ids", async () => {
  const resolved = await resolveControlPlane({ command: "status", cwd: "/workspace/project" })
  const trace = buildControlPlaneRouteExplainTrace({
    cwd: "/workspace/project",
    resolved,
    routeId: "writing-plans",
  })

  expect(trace.sourceEntry?.canonicalRoute).toBe("phase.plan")
})
```

- [ ] **Step 2: Run the focused router/config/control-plane tests and verify failure**

Run: `pnpm test -- --run test/router.test.ts test/config.test.ts test/control-plane.test.ts`

Expected: FAIL because the router still derives canonical routes from `toSuperpowersCanonicalRouteId()` and config validation still accepts the legacy `phase.<superpowers-phase>` namespace.

- [ ] **Step 3: Implement the router and config cutover**

Update `src/router.ts` so built-in phase inputs normalize through the new mapping:

```ts
export function resolveCanonicalRoute(config: { workflow?: RouterConfig["workflow"] }, routeId: string): CanonicalRouteId {
  return isDirectWorkflow(config)
    ? toDirectCanonicalRouteId(routeId)
    : toCanonicalPhaseRoute(routeId as BuiltInPhase)
}
```

Update `src/config.ts` so source route validation accepts only the true canonical phase IDs for `superpowers` workflows:

```ts
const TRUE_CANONICAL_PHASE_ROUTES = new Set([
  "phase.brainstorm",
  "phase.plan",
  "phase.execute",
  "phase.review",
  "phase.verify",
  "phase.visual",
  "phase.web-test",
])

function isSupportedCanonicalPhaseRoute(routeId: CanonicalRouteId) {
  return routeId.startsWith("phase.") && TRUE_CANONICAL_PHASE_ROUTES.has(routeId)
}
```

Then reject legacy `phase.writing-plans`-style IDs during source route validation and update `summarizeEffectiveSourceEntries()` and `buildControlPlaneRouteExplainTrace()` to report only the new canonical routes.

Mirror the new canonical examples in `schemas/oh-my-superagents.schema.json` so public examples use `phase.plan` and `phase.review`, not `phase.writing-plans`.

- [ ] **Step 4: Run the focused router/config/control-plane tests and verify they pass**

Run: `pnpm test -- --run test/router.test.ts test/config.test.ts test/control-plane.test.ts`

Expected: PASS for the new canonical route summaries and explain traces.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/router.ts src/config.ts src/control-plane.ts schemas/oh-my-superagents.schema.json test/router.test.ts test/config.test.ts test/control-plane.test.ts
git commit -m "feat: cut control plane over to canonical route ids"
```

### Task 3: Migrate Host Projection and Ownership Metadata End-to-End

**Files:**
- Modify: `src/opencode.ts`
- Modify: `src/codex.ts`
- Modify: `src/qwen.ts`
- Modify: `src/claude.ts`
- Modify: `src/materialize.ts`
- Modify: `src/cli.ts`
- Modify: `test/claude.test.ts`
- Modify: `test/qwen.test.ts`
- Modify: `test/materialize.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing host and ownership tests**

Update `test/claude.test.ts`:

```ts
expect(output).toContain(
  "<!-- oms-route: stage=1; host=claude; source=gstack; route=phase.plan; projection=skill; rendered-name=oms-plan -->",
)
expect(output).toContain("Use the gstack workflow entry `gstack/plan-eng-review` for `phase.plan` whenever it is relevant.")
```

Update `test/qwen.test.ts`:

```ts
await expect(buildQwenArtifacts(config, deps)).rejects.toThrow(
  /gstack is not yet supported on qwen for canonical route phase.review/,
)
```

Update `test/materialize.test.ts` stale-rewrite fixtures so route metadata uses `phase.plan` instead of `phase.writing-plans`.

Update `test/cli.test.ts` to expect the Qwen projection error to list `phase.plan` and `phase.review` rather than legacy route IDs.

- [ ] **Step 2: Run the focused host/materializer/CLI tests and verify failure**

Run: `pnpm test -- --run test/claude.test.ts test/qwen.test.ts test/materialize.test.ts test/cli.test.ts`

Expected: FAIL because host renderers and route markers still inherit legacy `superpowers` canonical IDs in some paths.

- [ ] **Step 3: Implement the host and ownership cutover**

Update the host builders to consume only the resolved `canonicalRoute` and `sourceEntry` fields.

In `src/claude.ts`, keep the wrapper names but render the corrected route metadata:

```ts
const PHASE_TO_CLAUDE_SKILL = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const

// keep phase input for naming, but always render resolved.sourceEntry.canonicalRoute
```

In `src/qwen.ts`, remove any fallback that reconstructs `toSuperpowersCanonicalRouteId(phase)` and instead trust `resolved.sourceEntry` directly.

In `src/materialize.ts`, keep the same ownership marker shape but ensure rewrite, cleanup, and collision logic operate on the new route metadata values.

In `src/cli.ts`, keep the same Qwen fail-closed policy, but derive unsupported entries from the resolved `sourceEntry.canonicalRoute` values now returned by the router.

- [ ] **Step 4: Run the focused host/materializer/CLI tests and verify they pass**

Run: `pnpm test -- --run test/claude.test.ts test/qwen.test.ts test/materialize.test.ts test/cli.test.ts`

Expected: PASS for the new route marker and fail-closed assertions.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/opencode.ts src/codex.ts src/qwen.ts src/claude.ts src/materialize.ts src/cli.ts test/claude.test.ts test/qwen.test.ts test/materialize.test.ts test/cli.test.ts
git commit -m "feat: migrate host projections to canonical route ids"
```

### Task 4: Update Public Docs and Run Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README-architecture.md`

- [ ] **Step 1: Update docs to describe the corrected canonical route model**

Update `docs/README-architecture.md` so the workflow adapter section describes:

```md
- built-in OMS phase inputs normalize to true canonical routes such as `phase.plan`
- source adapters map canonical routes to source-native entries such as `writing-plans` or `plan-eng-review`
- host adapters consume resolved canonical routes and source entries instead of treating source-native phase names as the internal truth layer
```

Update `README.md` and `README.zh-CN.md` examples so any configuration or diagnostic examples use `phase.plan`, `phase.review`, and `phase.verify` as the internal route IDs.

- [ ] **Step 2: Run the full verification suite**

Run: `pnpm test && pnpm check && pnpm build`

Expected: all tests pass, type checks pass, and the production build succeeds with the new canonical route core.

- [ ] **Step 3: Commit Task 4**

```bash
git add README.md README.zh-CN.md docs/README-architecture.md
git commit -m "docs: align docs with canonical route cutover"
```
