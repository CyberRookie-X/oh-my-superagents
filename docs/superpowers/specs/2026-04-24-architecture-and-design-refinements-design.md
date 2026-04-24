# Phase 5: Architecture & Design Refinements Design

**Date:** 2026-04-24
**Status:** Design approved
**Parent:** oh-my-superagents architecture improvement (28 issues)

## Motivation

Several design decisions made early in the project now limit flexibility:
- Preset `extends` is single-level only
- Config merge semantics are inconsistent between array fields
- `explainAll` ignores workflow type
- Route catalogs are static module-level constants
- Lifecycle-to-route mappings are hardcoded

## Design

### 1. Multi-level preset extends

**Current:** `resolvePresetReuse` (config.ts:1121) rejects chains:
```typescript
if (child.extends && parent.extends) {
  throw new Error("chained extends are not allowed");
}
```

**Fix:** Allow chained extends with a maximum depth of 5:

```typescript
function resolvePresetReuse(
  presets: Record<string, ControlPlanePreset>,
  presetKey: string,
  visiting: Set<string> = new Set(),
  depth: number = 0,
): ControlPlanePreset {
  if (depth > 5) {
    throw new Error("Preset extends chain exceeds maximum depth of 5");
  }
  // ... existing cycle detection and merge logic
  if (child.extends) {
    const parent = resolvePresetReuse(presets, child.extends, visiting, depth + 1);
    // merge parent profiles, routes, sourceRoutes, lanes
    return {
      ...parent,
      ...child,
      profiles: { ...parent.profiles, ...child.profiles },
      routes: { ...parent.routes, ...child.routes },
      sourceRoutes: { ...parent.sourceRoutes, ...child.sourceRoutes },
      usesLanes: child.usesLanes ?? parent.usesLanes,
      defaultLane: child.defaultLane ?? parent.defaultLane,
      sourcePreset: child.sourcePreset ?? parent.sourcePreset,
    };
  }
  return child;
}
```

Merge order: root → parent → child (child overrides parent, parent overrides root).

**Acceptance criteria:**
- `grandchild extends child extends parent` resolves correctly
- Cycle detection still works across chains
- Depth limit of 5 enforced with clear error
- Existing single-level extends continue to work
- Config validation catches chains exceeding max depth

### 2. Unified config merge semantics

**Current:** `mergeLayeredConfigs` (config.ts:764) uses concatenation for `authority` and
`policyRules` but spread-override for `profiles`, `lanes`, `presets`. Users cannot remove items
added by lower-priority configs.

**Fix:** Support `null`-clear semantics for concatenated arrays. When a higher-priority config
sets `policyRules: null`, it clears all policy rules from lower layers. When it sets
`policyRules: [...]`, the new rules replace (not append to) lower-layer rules.

```typescript
function mergeLayeredConfigs(base: LayeredConfig, override: LayeredConfig): LayeredConfig {
  // ... existing merge ...
  // For authority.policyRules:
  if (override.authority?.policyRules === null) {
    result.authority.policyRules = [];
  } else if (override.authority?.policyRules) {
    result.authority.policyRules = override.authority.policyRules; // replace, don't concat
  }
  // Same for authority.workloadMappings
  // For top-level policyRules:
  if (override.policyRules === null) {
    result.policyRules = [];
  } else if (override.policyRules) {
    result.policyRules = override.policyRules;
  }
}
```

Wait — this changes existing behavior. To maintain backward compatibility while adding the clear
option, use a sentinel:

```typescript
// null = clear all lower-priority rules
// array = replace lower-priority rules (new behavior)
// undefined/absent = concatenate with lower-priority rules (current behavior)
```

Actually, the simplest backward-compatible approach: add a `policyRulesMerge` setting:

```json
{
  "settings": {
    "policyRulesMerge": "concat"  // default, current behavior
    // or "replace" — higher priority replaces lower
  }
}
```

This is explicit and backward-compatible. Users opt into `"replace"` mode.

**Acceptance criteria:**
- Default behavior unchanged (`concat`)
- `policyRulesMerge: "replace"` replaces lower-priority rules
- `authority.workloadMappingsMerge: "replace"` replaces lower-priority mappings
- Config validation accepts new settings
- Test: verify concat vs replace behavior

### 3. explainAll workflow-aware

**Current:** `router.ts:186-188` always iterates `SUPERPOWERS_ROUTE_CATALOG` (7 phases) regardless
of workflow type.

**Fix:**

```typescript
export function explainAll(config: RouterConfig): ExplainResult[] {
  if (isDirectWorkflow(config)) {
    const intents = Object.keys(config.workflow.intents ?? {});
    return intents.map(intentId => {
      const canonicalRoute = toDirectCanonicalRouteId(intentId);
      return explainRoute(config, canonicalRoute);
    });
  }
  return SUPERPOWERS_ROUTE_CATALOG.map(phase => {
    return explainPhase(config, phase);
  });
}
```

Add `explainRoute` function for generic route explanation (used by both modes).

**Acceptance criteria:**
- `explainAll` in direct mode returns user intents, not superpowers phases
- `explainAll` in superpowers mode returns 7 phases (unchanged)
- CLI `explain` command correctly delegates

### 4. Dynamic route catalog

**Current:** `SUPERPOWERS_ROUTE_SET` is a module-level `Set` built from `as const` data at import
time.

**Fix:** Convert to a factory function:

```typescript
export function createSuperpowersRouteSet(): Set<BuiltInPhase> {
  return new Set(SUPERPOWERS_ROUTE_CATALOG);
}
```

Export a shared singleton for current consumers:
```typescript
export const SUPERPOWERS_ROUTE_SET = createSuperpowersRouteSet();
```

This allows future extensibility (e.g., plugin-registered phases) without changing the module
interface. Current consumers don't need to change.

**Acceptance criteria:**
- `SUPERPOWERS_ROUTE_SET` still works as a Set
- `createSuperpowersRouteSet()` returns a fresh Set each call
- All existing tests pass

### 5. Extract lifecycle-to-route mappings

**Current:** `deriveLifecycleStage` (context-lifecycle.ts:38-72) hardcodes:
```
phase.brainstorm → design
phase.plan → plan
phase.execute → execute_task
phase.review → review
phase.verify → verify
phase.web-test → verify
phase.visual → design
intent.* → execute_task
```

And `resolveContextCompressionCanonicalRoute` (control-plane.ts:1200-1219) hardcodes:
```
design → phase.brainstorm
bootstrap → phase.brainstorm
plan → phase.plan
checkpoint → phase.plan
resume → phase.plan
execute_task → phase.execute
...
```

**Fix:** Create `src/lifecycle-mappings.ts`:

```typescript
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
```

Import these maps in `context-lifecycle.ts` and `control-plane.ts`.

**Acceptance criteria:**
- All lifecycle stage derivation tests pass
- Mappings are centralized in one file
- Adding a new route → lifecycle mapping requires changes in one place only

## Non-Goals

- Full plugin system for route catalogs (future)
- Dynamic lifecycle stage configuration (future)
- Breaking existing config format

## Impact

- Preset `extends` now supports chains up to 5 levels deep
- Config merge gains explicit `policyRulesMerge` / `workloadMappingsMerge` setting
- `explainAll` returns correct results for both workflow modes
- Route catalogs use factory functions (foundation for future extensibility)
- Lifecycle mappings centralized in dedicated module
