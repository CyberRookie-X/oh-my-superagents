# Phase 5: Architecture & Design Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-level preset extends, unified config merge semantics, workflow-aware explainAll, dynamic route catalog, centralized lifecycle mappings.

**Architecture:** Modify `config.ts` merge logic and preset resolution. Extract lifecycle mappings to new `lifecycle-mappings.ts`. Add `policyRulesMerge` setting. Refactor `router.ts` and `workflow-superpowers.ts`.

**Tech Stack:** TypeScript, Vitest, Zod

---

## File Structure

```
src/
  config.ts                       # MODIFY: multi-level extends, merge settings
  router.ts                       # MODIFY: workflow-aware explainAll
  workflow-superpowers.ts         # MODIFY: factory function for route set
  context-lifecycle.ts            # MODIFY: import from lifecycle-mappings
  control-plane/
    compression.ts                # MODIFY: import from lifecycle-mappings
  lifecycle-mappings.ts           # NEW: centralized route-to-lifecycle maps
  utils/
    merge.ts                      # NEW: merge helper with replace/concat modes

test/
  config.test.ts                  # MODIFY: extends chain tests, merge mode tests
  router.test.ts                  # MODIFY: explainAll direct mode tests
  context-lifecycle.test.ts       # MODIFY: updated import tests
  lifecycle-mappings.test.ts      # NEW: mapping tests

schemas/
  oh-my-superagents.schema.json   # MODIFY: add policyRulesMerge, workloadMappingsMerge
```

---

### Task 1: Create lifecycle-mappings module

**Files:**
- Create: `src/lifecycle-mappings.ts`
- Create: `test/lifecycle-mappings.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/lifecycle-mappings.test.ts
import { describe, it, expect } from "vitest";
import {
  CANONICAL_ROUTE_TO_LIFECYCLE_STAGE,
  LIFECYCLE_STAGE_TO_CANONICAL_ROUTE,
  deriveLifecycleStage,
  resolveLifecycleStageToCanonicalRoute,
} from "../src/lifecycle-mappings.js";

describe("CANONICAL_ROUTE_TO_LIFECYCLE_STAGE", () => {
  it("maps phase.plan to plan", () => {
    expect(CANONICAL_ROUTE_TO_LIFECYCLE_STAGE["phase.plan"]).toBe("plan");
  });

  it("maps phase.brainstorm to design", () => {
    expect(CANONICAL_ROUTE_TO_LIFECYCLE_STAGE["phase.brainstorm"]).toBe("design");
  });

  it("maps phase.execute to execute_task", () => {
    expect(CANONICAL_ROUTE_TO_LIFECYCLE_STAGE["phase.execute"]).toBe("execute_task");
  });
});

describe("LIFECYCLE_STAGE_TO_CANONICAL_ROUTE", () => {
  it("maps design to phase.brainstorm", () => {
    expect(LIFECYCLE_STAGE_TO_CANONICAL_ROUTE["design"]).toBe("phase.brainstorm");
  });

  it("maps plan to phase.plan", () => {
    expect(LIFECYCLE_STAGE_TO_CANONICAL_ROUTE["plan"]).toBe("phase.plan");
  });
});

describe("deriveLifecycleStage", () => {
  it("returns execute_task for intent routes", () => {
    expect(deriveLifecycleStage("intent.build")).toBe("execute_task");
  });

  it("returns design for phase.brainstorm", () => {
    expect(deriveLifecycleStage("phase.brainstorm")).toBe("design");
  });

  it("returns bootstrap for unknown routes", () => {
    expect(deriveLifecycleStage("phase.unknown" as any)).toBe("bootstrap");
  });
});

describe("resolveLifecycleStageToCanonicalRoute", () => {
  it("maps design to phase.brainstorm", () => {
    expect(resolveLifecycleStageToCanonicalRoute("design")).toBe("phase.brainstorm");
  });

  it("returns undefined for unknown stages", () => {
    expect(resolveLifecycleStageToCanonicalRoute("unknown" as any)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/lifecycle-mappings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lifecycle-mappings**

```typescript
// src/lifecycle-mappings.ts
import type { CanonicalRouteId } from "./workflow-sources.js";
import type { ContextLifecycleStage } from "./context-lifecycle.js";

export const CANONICAL_ROUTE_TO_LIFECYCLE_STAGE: Record<string, ContextLifecycleStage> = {
  "phase.brainstorm": "design",
  "phase.plan": "plan",
  "phase.execute": "execute_task",
  "phase.review": "review",
  "phase.verify": "verify",
  "phase.web-test": "verify",
  "phase.visual": "design",
};

export const LIFECYCLE_STAGE_TO_CANONICAL_ROUTE: Record<string, CanonicalRouteId> = {
  design: "phase.brainstorm",
  bootstrap: "phase.brainstorm",
  plan: "phase.plan",
  checkpoint: "phase.plan",
  resume: "phase.plan",
  execute_task: "phase.execute",
  review: "phase.review",
  verify: "phase.verify",
  integrate_branch: "phase.verify",
};

export function deriveLifecycleStage(canonicalRoute: CanonicalRouteId): ContextLifecycleStage {
  if (canonicalRoute.startsWith("intent.")) return "execute_task";
  return CANONICAL_ROUTE_TO_LIFECYCLE_STAGE[canonicalRoute] ?? "bootstrap";
}

export function resolveLifecycleStageToCanonicalRoute(
  stage: ContextLifecycleStage,
): CanonicalRouteId | undefined {
  return LIFECYCLE_STAGE_TO_CANONICAL_ROUTE[stage];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lifecycle-mappings.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lifecycle-mappings.ts test/lifecycle-mappings.test.ts
git commit -m "feat: extract centralized lifecycle-to-route mappings"
```

---

### Task 2: Migrate consumers to lifecycle-mappings

**Files:**
- Modify: `src/context-lifecycle.ts`
- Modify: `src/control-plane/compression.ts`

- [ ] **Step 1: Update context-lifecycle.ts**

Replace hardcoded mappings in `deriveLifecycleStage` with import:

```typescript
import { deriveLifecycleStage as deriveFromMappings } from "./lifecycle-mappings.js";

// Replace the body of deriveLifecycleStage to delegate:
export function deriveLifecycleStage(
  canonicalRoute: CanonicalRouteId,
  // ... other params ...
): ContextLifecycleStage {
  // Keep the explicit hint and gstack entry mapping logic,
  // but use the centralized mapping as fallback
  // ... existing logic for explicit hints and gstack entries ...
  return deriveFromMappings(canonicalRoute);
}
```

- [ ] **Step 2: Update control-plane/compression.ts**

Replace hardcoded `resolveContextCompressionCanonicalRoute` mappings:

```typescript
import { resolveLifecycleStageToCanonicalRoute } from "../lifecycle-mappings.js";

// Replace hardcoded switch/if-else with:
export function resolveContextCompressionCanonicalRoute(
  stage: ContextLifecycleStage,
): CanonicalRouteId | undefined {
  return resolveLifecycleStageToCanonicalRoute(stage);
}
```

- [ ] **Step 3: Run affected tests**

Run: `npx vitest run test/context-lifecycle.test.ts test/control-plane.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/context-lifecycle.ts src/control-plane/compression.ts
git commit -m "refactor: use centralized lifecycle mappings in consumers"
```

---

### Task 3: Multi-level preset extends

**Files:**
- Modify: `src/config.ts`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/config.test.ts`:

```typescript
describe("multi-level preset extends", () => {
  it("resolves grandchild extends child extends parent", () => {
    const presets = {
      base: {
        label: "Base",
        short: "base",
        profiles: { plan: "gpt5", review: "sonnet" },
        routes: { brainstorming: "gpt5" },
      },
      frontend: {
        label: "Frontend",
        short: "frontend",
        extends: "base",
        profiles: { plan: "sonnet" },
        routes: { "writing-plans": "sonnet" },
      },
      "frontend-react": {
        label: "Frontend React",
        short: "frontend-react",
        extends: "frontend",
        profiles: { visual: "vision-review" },
      },
    };

    const result = resolvePresetReuse(presets, "frontend-react");

    // Inherits from base via frontend
    expect(result.profiles.review).toBe("sonnet"); // from base
    expect(result.profiles.plan).toBe("sonnet"); // from frontend (overrides base)
    expect(result.profiles.visual).toBe("vision-review"); // from frontend-react
    expect(result.routes.brainstorming).toBe("gpt5"); // from base
    expect(result.routes["writing-plans"]).toBe("sonnet"); // from frontend
  });

  it("detects cycles across chains", () => {
    const presets = {
      a: { label: "A", short: "a", extends: "c", profiles: {}, routes: {} },
      b: { label: "B", short: "b", extends: "a", profiles: {}, routes: {} },
      c: { label: "C", short: "c", extends: "b", profiles: {}, routes: {} },
    };

    expect(() => resolvePresetReuse(presets, "a")).toThrow("cycle");
  });

  it("enforces maximum depth of 5", () => {
    const presets: Record<string, any> = {};
    for (let i = 0; i <= 6; i++) {
      presets[`p${i}`] = {
        label: `P${i}`,
        short: `p${i}`,
        extends: i > 0 ? `p${i - 1}` : undefined,
        profiles: {},
        routes: {},
      };
    }

    expect(() => resolvePresetReuse(presets, "p6")).toThrow("exceeds maximum depth");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/config.test.ts -t "multi-level preset extends"`
Expected: FAIL — chained extends rejected

- [ ] **Step 3: Implement multi-level extends**

In `src/config.ts`, modify `resolvePresetReuse` (around line 1121):

```typescript
const MAX_EXTENDS_DEPTH = 5;

function resolvePresetReuse(
  presets: Record<string, ControlPlanePreset>,
  presetKey: string,
  visiting: Set<string> = new Set(),
  depth: number = 0,
): ControlPlanePreset {
  if (depth > MAX_EXTENDS_DEPTH) {
    throw new Error(
      `Preset extends chain exceeds maximum depth of ${MAX_EXTENDS_DEPTH}: ${presetKey}`
    );
  }

  if (visiting.has(presetKey)) {
    throw new Error(`Circular preset extends detected: ${[...visiting, presetKey].join(" -> ")}`);
  }

  const resolved = new Map<string, ControlPlanePreset>();
  resolved.set(presetKey, presets[presetKey]);

  const preset = presets[presetKey];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetKey}`);
  }

  visiting.add(presetKey);

  if (preset.extends) {
    const parent = resolvePresetReuse(presets, preset.extends, visiting, depth + 1);
    return {
      ...preset,
      profiles: { ...parent.profiles, ...preset.profiles },
      routes: { ...parent.routes, ...preset.routes },
      sourceRoutes: { ...parent.sourceRoutes, ...preset.sourceRoutes },
      usesLanes: preset.usesLanes ?? parent.usesLanes,
      defaultLane: preset.defaultLane ?? parent.defaultLane,
      sourcePreset: preset.sourcePreset ?? parent.sourcePreset,
      extends: preset.extends,
    };
  }

  visiting.delete(presetKey);
  return preset;
}
```

- [ ] **Step 4: Run config tests**

Run: `npx vitest run test/config.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: support multi-level preset extends with depth limit"
```

---

### Task 4: Unified config merge semantics

**Files:**
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Add merge mode settings to schema**

In `schemas/oh-my-superagents.schema.json`, add to `settings`:

```json
"policyRulesMerge": { "enum": ["concat", "replace"], "default": "concat" },
"workloadMappingsMerge": { "enum": ["concat", "replace"], "default": "concat" }
```

- [ ] **Step 2: Add to Zod schema and implement merge logic**

In `src/config.ts`:

```typescript
const SettingsSchema = z.object({
  policyRulesMerge: z.enum(["concat", "replace"]).default("concat"),
  workloadMappingsMerge: z.enum(["concat", "replace"]).default("concat"),
  // ... existing settings
}).strict();
```

In `mergeLayeredConfigs`, use the merge mode:

```typescript
function mergeLayeredConfigs(
  base: LayeredControlPlaneConfigInput,
  override: LayeredControlPlaneConfigInput,
): LayeredControlPlaneConfigInput {
  const policyRulesMerge = override.settings?.policyRulesMerge ?? base.settings?.policyRulesMerge ?? "concat";
  const workloadMappingsMerge = override.settings?.workloadMappingsMerge ?? base.settings?.workloadMappingsMerge ?? "concat";

  // For policyRules:
  if (override.policyRules !== undefined) {
    if (policyRulesMerge === "replace" || override.policyRules === null) {
      result.policyRules = override.policyRules === null ? [] : override.policyRules;
    } else {
      result.policyRules = [...(base.policyRules ?? []), ...override.policyRules];
    }
  }

  // For authority.workloadMappings:
  if (override.authority?.workloadMappings !== undefined) {
    if (workloadMappingsMerge === "replace" || override.authority.workloadMappings === null) {
      result.authority.workloadMappings = override.authority.workloadMappings === null ? [] : override.authority.workloadMappings;
    } else {
      result.authority.workloadMappings = [
        ...(base.authority?.workloadMappings ?? []),
        ...override.authority.workloadMappings,
      ];
    }
  }

  // ... rest of merge
}
```

- [ ] **Step 3: Add test for merge modes**

Add to `test/config.test.ts`:

```typescript
describe("policyRules merge modes", () => {
  it("concats by default", () => {
    const base = { policyRules: [{ id: "rule-01", selector: {}, policy: {} }] };
    const override = { policyRules: [{ id: "rule-02", selector: {}, policy: {} }] };
    const result = mergeLayeredConfigs(base, override);
    expect(result.policyRules).toHaveLength(2);
  });

  it("replaces when policyRulesMerge is replace", () => {
    const base = { policyRules: [{ id: "rule-01", selector: {}, policy: {} }] };
    const override = {
      settings: { policyRulesMerge: "replace" as const },
      policyRules: [{ id: "rule-02", selector: {}, policy: {} }],
    };
    const result = mergeLayeredConfigs(base, override);
    expect(result.policyRules).toHaveLength(1);
    expect(result.policyRules![0].id).toBe("rule-02");
  });
});
```

- [ ] **Step 4: Run config tests**

Run: `npx vitest run test/config.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts schemas/oh-my-superagents.schema.json test/config.test.ts
git commit -m "feat: add policyRulesMerge and workloadMappingsMerge settings"
```

---

### Task 5: Make explainAll workflow-aware

**Files:**
- Modify: `src/router.ts`
- Modify: `test/router.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/router.test.ts`:

```typescript
describe("explainAll with direct workflow", () => {
  it("returns user intents instead of superpowers phases", () => {
    const config: RouterConfig = {
      workflow: {
        kind: "direct",
        intents: { build: {}, test: {} },
      },
      profiles: { default: { model: "gpt5" } },
      routes: {},
      defaultRoute: "default",
    };
    const results = explainAll(config);
    expect(results).toHaveLength(2);
    expect(results[0].routeId).toBe("build");
    expect(results[1].routeId).toBe("test");
  });
});

describe("explainAll with superpowers workflow", () => {
  it("returns all 7 superpowers phases", () => {
    const config: RouterConfig = {
      workflow: { kind: "superpowers" },
      profiles: { default: { model: "sonnet" } },
      routes: {},
      defaultRoute: "default",
    };
    const results = explainAll(config);
    expect(results).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/router.test.ts -t "explainAll"`
Expected: FAIL — explainAll returns 7 results for direct mode

- [ ] **Step 3: Implement fix**

In `src/router.ts`, modify `explainAll`:

```typescript
export function explainAll(config: RouterSourceConfig): ExplainResult[] {
  if (isDirectWorkflow(config)) {
    const intents = Object.keys(config.workflow?.intents ?? {});
    return intents.map((intentId) => {
      const canonicalRoute = toDirectCanonicalRouteId(intentId);
      try {
        return explainPhase(config, canonicalRoute as any);
      } catch {
        return {
          routeId: intentId,
          canonicalRoute,
          profileId: config.defaultRoute,
          routeSource: "preset-default",
          effectiveLane: undefined,
          resolvedSource: "direct",
          sourceResolution: "default",
          description: `Direct intent: ${intentId}`,
        };
      }
    });
  }

  return SUPERPOWERS_ROUTE_CATALOG.map((phase) => explainPhase(config, phase));
}
```

- [ ] **Step 4: Run router tests**

Run: `npx vitest run test/router.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/router.ts test/router.test.ts
git commit -m "fix: make explainAll workflow-aware for direct mode"
```

---

### Task 6: Dynamic route catalog

**Files:**
- Modify: `src/workflow-superpowers.ts`
- Modify: `test/workflow-superpowers.test.ts` (if exists, or add to router.test.ts)

- [ ] **Step 1: Add factory function**

In `src/workflow-superpowers.ts`:

```typescript
export function createSuperpowersRouteSet(): Set<BuiltInPhase> {
  return new Set(SUPERPOWERS_ROUTE_CATALOG);
}

// Keep existing singleton for backward compat
export const SUPERPOWERS_ROUTE_SET = createSuperpowersRouteSet();
```

- [ ] **Step 2: Add test**

```typescript
it("createSuperpowersRouteSet returns independent sets", () => {
  const set1 = createSuperpowersRouteSet();
  const set2 = createSuperpowersRouteSet();
  set1.delete("brainstorming");
  expect(set2.has("brainstorming")).toBe(true);
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run test/router.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/workflow-superpowers.ts
git commit -m "refactor: add createSuperpowersRouteSet factory function"
```

---

### Task 7: Full regression

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: Phase 5 complete — architecture and design refinements"
```
