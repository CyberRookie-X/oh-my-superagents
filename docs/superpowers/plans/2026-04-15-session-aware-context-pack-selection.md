# Session-Aware Context Pack Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade OMS from `D1` indexing to `D2` session-aware context pack selection with a real control-plane config surface.

**Architecture:** Add a shared `context-packs` layer that consumes canonical routing, lifecycle stage, effective lane, and indexed artifacts to derive `effectiveContextPackSelection`. Introduce a first-class `settings.contextCompression` policy plus reusable `compressionPresets`, but keep selection post-routing so packs never become routing truth.

**Tech Stack:** TypeScript, Zod, JSON schema updates, Vitest, control-plane resolution, CLI diagnostics

---

## Scope Decomposition

This plan covers only `D2` context pack selection and its configuration surface.

It includes:

- config schemas for compression policy and reusable presets
- a shared context-pack selector
- `ResolvedControlPlane` support for effective compression policy and pack selection
- CLI diagnostics for the selected packs

Deferred to later plans:

- evaluating compression safety at runtime boundaries
- running built-in or external compression engines
- external provider interoperability

## File Structure

### Shared pack-selection layer

- Create: `src/context-packs.ts`
  - resolve effective policy and select context packs from route, lifecycle, and index state

### Config and schema

- Modify: `src/config.ts`
  - add `settings.contextCompression` and top-level `compressionPresets`
- Modify: `schemas/oh-my-superagents.schema.json`
  - expose the new config surface

### Core diagnostics integration

- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`

### Tests

- Create: `test/context-packs.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- Keep all pack decisions post-routing.
- Reuse the existing OMS merge style: global `settings`, optional top-level reusable bundles, session-scoped effective values.
- Treat pack output as a diagnostic/runtime-hint layer, not as a new host artifact identity.
- Prefer a small initial pack vocabulary over an open-ended DSL.

### Task 1: Add the Config Surface for Context Compression and Presets

**Files:**
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Write the failing config tests**

Add to `test/config.test.ts`:

```ts
it("loads contextCompression settings and reusable compression presets", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "settings": {
        "activePreset": "default",
        "contextCompression": {
          "preset": "balanced",
          "mode": "auto",
          "engine": "hybrid",
          "inlineLevel": "standard",
          "moments": {
            "subagentHandoff": true,
            "sessionResume": true
          },
          "safety": {
            "allowConditional": false,
            "requireFreshVerification": true
          }
        }
      },
      "compressionPresets": {
        "balanced": {
          "mode": "suggest",
          "engine": "hybrid",
          "inlineLevel": "standard",
          "moments": {
            "subagentHandoff": true,
            "planCheckpoint": true,
            "reviewCheckpoint": true,
            "verificationCheckpoint": true,
            "sessionResume": true,
            "sourceSwitch": false,
            "branchIntegration": true
          },
          "safety": {
            "allowConditional": false,
            "requireFreshVerification": true
          }
        }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "routes": {},
          "defaultRoute": "build"
        }
      }
    }`,
  })

  expect(result.config.settings.contextCompression).toMatchObject({
    preset: "balanced",
    mode: "auto",
    engine: "hybrid",
    inlineLevel: "standard",
  })
  expect(result.config.compressionPresets.balanced.moments.branchIntegration).toBe(true)
})
```

- [ ] **Step 2: Run the focused config tests and verify failure**

Run: `pnpm test -- --run test/config.test.ts`

Expected: FAIL because the config schemas do not support `contextCompression` or `compressionPresets` yet.

- [ ] **Step 3: Implement the config and schema changes**

Update `src/config.ts` with new schemas and types:

```ts
const ContextCompressionModeSchema = z.enum(["manual", "suggest", "auto"])
const ContextCompressionEngineSchema = z.enum(["builtin", "external", "hybrid"])
const ContextInlineLevelSchema = z.enum(["minimal", "standard", "full"])

const ContextCompressionMomentsSchema = z.object({
  subagentHandoff: z.boolean().optional(),
  planCheckpoint: z.boolean().optional(),
  reviewCheckpoint: z.boolean().optional(),
  verificationCheckpoint: z.boolean().optional(),
  sessionResume: z.boolean().optional(),
  sourceSwitch: z.boolean().optional(),
  branchIntegration: z.boolean().optional(),
}).strict()

const ContextCompressionSafetySchema = z.object({
  allowConditional: z.boolean().default(false),
  requireFreshVerification: z.boolean().default(true),
}).strict()

const ContextCompressionSchema = z.object({
  preset: z.string().min(1).optional(),
  mode: ContextCompressionModeSchema.default("suggest"),
  engine: ContextCompressionEngineSchema.default("hybrid"),
  inlineLevel: ContextInlineLevelSchema.default("standard"),
  moments: ContextCompressionMomentsSchema.optional(),
  safety: ContextCompressionSafetySchema.optional(),
}).strict()

const CompressionPresetSchema = z.object({
  mode: ContextCompressionModeSchema.default("suggest"),
  engine: ContextCompressionEngineSchema.default("hybrid"),
  inlineLevel: ContextInlineLevelSchema.default("standard"),
  moments: ContextCompressionMomentsSchema,
  safety: ContextCompressionSafetySchema,
}).strict()
```

Thread them into `LayeredSettingsSchema`, `LayeredControlPlaneConfigSchema`, `ControlPlaneConfig`, `createDefaultControlPlaneConfig()`, `mergeLayeredConfigs()`, and `finalizeConfig()`.

Update `schemas/oh-my-superagents.schema.json` so the new settings and preset blocks are documented and validated.

- [ ] **Step 4: Run the focused config tests and verify they pass**

Run: `pnpm test -- --run test/config.test.ts`

Expected: PASS with the new config surface loaded and validated.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/config.ts schemas/oh-my-superagents.schema.json test/config.test.ts
git commit -m "feat: add context compression config surface"
```

### Task 2: Implement the Shared D2 Context Pack Selector

**Files:**
- Create: `src/context-packs.ts`
- Create: `test/context-packs.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing context-pack tests**

Create `test/context-packs.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { resolveContextCompressionPolicy, selectContextPacks } from "../src/context-packs.js"

describe("resolveContextCompressionPolicy", () => {
  it("merges a selected compression preset with explicit settings overrides", () => {
    expect(resolveContextCompressionPolicy({
      compressionPresets: {
        balanced: {
          mode: "suggest",
          engine: "hybrid",
          inlineLevel: "standard",
          moments: { subagentHandoff: true, planCheckpoint: true, reviewCheckpoint: true, verificationCheckpoint: true, sessionResume: true, sourceSwitch: false, branchIntegration: true },
          safety: { allowConditional: false, requireFreshVerification: true },
        },
      },
      contextCompression: {
        preset: "balanced",
        mode: "auto",
        moments: { sessionResume: false },
      },
    })).toMatchObject({
      mode: "auto",
      engine: "hybrid",
      moments: expect.objectContaining({ planCheckpoint: true, sessionResume: false }),
    })
  })
})

describe("selectContextPacks", () => {
  it("selects plan-centric packs for the planning lifecycle stage", () => {
    const selection = selectContextPacks({
      lifecycleStage: "plan",
      canonicalRoute: "phase.plan",
      resolvedSource: "superpowers",
      artifacts: [
        { kind: "spec", path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md", authority: "authoritative", source: "oms", lifecycleStage: "design" },
        { kind: "plan", path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
        { kind: "knowledge", path: ".gsd/KNOWLEDGE.md", authority: "derived", source: "gsd" },
      ],
      policy: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: { planCheckpoint: true },
        safety: { allowConditional: false, requireFreshVerification: true },
      },
    })

    expect(selection.packIds).toEqual(["spec-core", "plan-core", "knowledge-support"])
  })
})
```

- [ ] **Step 2: Run the focused context-pack tests and verify failure**

Run: `pnpm test -- --run test/context-packs.test.ts`

Expected: FAIL because `src/context-packs.ts` does not exist yet.

- [ ] **Step 3: Implement the shared D2 selector**

Create `src/context-packs.ts` with:

```ts
import type { ContextArtifact } from "./context-artifacts.js"
import type { ContextLifecycleStage } from "./context-lifecycle.js"
import type { CanonicalRouteId, WorkflowSourceKind } from "./workflow-sources.js"
import type { ControlPlaneConfig } from "./config.js"

export type EffectiveContextCompressionPolicy = {
  mode: "manual" | "suggest" | "auto"
  engine: "builtin" | "external" | "hybrid"
  inlineLevel: "minimal" | "standard" | "full"
  moments: Record<string, boolean>
  safety: {
    allowConditional: boolean
    requireFreshVerification: boolean
  }
}

export type EffectiveContextPackSelection = {
  lifecycleStage: ContextLifecycleStage
  packIds: string[]
  artifacts: ContextArtifact[]
  policy: EffectiveContextCompressionPolicy
}

export function resolveContextCompressionPolicy(input: {
  compressionPresets: ControlPlaneConfig["compressionPresets"]
  contextCompression: ControlPlaneConfig["settings"]["contextCompression"]
}): EffectiveContextCompressionPolicy {
  const preset = input.contextCompression.preset
    ? input.compressionPresets[input.contextCompression.preset]
    : undefined

  return {
    mode: input.contextCompression.mode ?? preset?.mode ?? "suggest",
    engine: input.contextCompression.engine ?? preset?.engine ?? "hybrid",
    inlineLevel: input.contextCompression.inlineLevel ?? preset?.inlineLevel ?? "standard",
    moments: {
      ...(preset?.moments ?? {}),
      ...(input.contextCompression.moments ?? {}),
    },
    safety: {
      allowConditional: input.contextCompression.safety?.allowConditional ?? preset?.safety.allowConditional ?? false,
      requireFreshVerification: input.contextCompression.safety?.requireFreshVerification ?? preset?.safety.requireFreshVerification ?? true,
    },
  }
}

export function selectContextPacks(input: {
  lifecycleStage: ContextLifecycleStage
  canonicalRoute: CanonicalRouteId
  resolvedSource: WorkflowSourceKind
  artifacts: ContextArtifact[]
  policy: EffectiveContextCompressionPolicy
}): EffectiveContextPackSelection {
  const packIds: string[] = []

  if (input.lifecycleStage === "plan") {
    if (input.artifacts.some((artifact) => artifact.kind === "spec")) packIds.push("spec-core")
    if (input.artifacts.some((artifact) => artifact.kind === "plan")) packIds.push("plan-core")
  }

  if (input.artifacts.some((artifact) => artifact.kind === "knowledge")) {
    packIds.push("knowledge-support")
  }

  return {
    lifecycleStage: input.lifecycleStage,
    packIds,
    artifacts: input.artifacts.filter((artifact) => (
      packIds.includes("spec-core") && artifact.kind === "spec"
    ) || (
      packIds.includes("plan-core") && artifact.kind === "plan"
    ) || (
      packIds.includes("knowledge-support") && artifact.kind === "knowledge"
    )),
    policy: input.policy,
  }
}
```

Export the new helpers from `src/index.ts`:

```ts
export * from "./context-packs.js"
```

- [ ] **Step 4: Run the focused context-pack tests and verify they pass**

Run: `pnpm test -- --run test/context-packs.test.ts`

Expected: PASS for policy resolution and pack selection.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/context-packs.ts src/index.ts test/context-packs.test.ts
git commit -m "feat: add session-aware context pack selection"
```

### Task 3: Integrate Effective Context Pack Selection into the Control Plane and CLI

**Files:**
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add to `test/control-plane.test.ts`:

```ts
it("adds effective context compression policy and pack selection to resolved state", async () => {
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
        { kind: "plan", path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md", authority: "authoritative", source: "oms", lifecycleStage: "plan" },
      ],
      warnings: [],
    }),
  })

  expect(resolved.contextCompression?.policy.engine).toBe("hybrid")
  expect(resolved.contextCompression?.selection.packIds).toContain("plan-core")
})
```

Add to `test/cli.test.ts`:

```ts
it("shows effective context pack selection in explain output", async () => {
  const result = await runCli(["explain", "--host", "opencode", "--phase", "writing-plans"], {
    ...deps,
    resolveControlPlane: async () => ({
      ...resolvedControlPlane,
      contextCompression: {
        policy: {
          mode: "auto",
          engine: "hybrid",
          inlineLevel: "standard",
          moments: { planCheckpoint: true },
          safety: { allowConditional: false, requireFreshVerification: true },
        },
        selection: {
          lifecycleStage: "plan",
          packIds: ["spec-core", "plan-core"],
          artifacts: [],
        },
      },
    }),
  })

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toMatch(/context/i)
  expect(result.stdout).toMatch(/plan-core/i)
})
```

- [ ] **Step 2: Run the focused integration tests and verify failure**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: FAIL because `ResolvedControlPlane` does not expose D2 policy or selection yet.

- [ ] **Step 3: Implement control-plane and CLI integration**

Update `src/control-plane.ts` to add a new resolved field:

```ts
contextCompression?: {
  policy: EffectiveContextCompressionPolicy
  selection: EffectiveContextPackSelection
}
```

Then, inside `resolveControlPlane`, derive lifecycle, resolve the effective policy, and compute the selection after `effectiveSources` and `contextIndex` are available.

Update `src/cli.ts` so `status`, `doctor`, and `explain` render a `contextCompression` section that includes:

- policy mode
- engine
- inline level
- selected pack ids
- selected lifecycle stage

- [ ] **Step 4: Run the focused integration tests and verify they pass**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: PASS with D2 state visible in both library and CLI surfaces.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/control-plane.ts src/cli.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: surface effective context pack selection"
```
