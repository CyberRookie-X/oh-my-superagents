# Phase 4: Host Adapter Improvements Design

**Date:** 2026-04-24
**Status:** Design approved
**Parent:** oh-my-superagents architecture improvement (28 issues)

## Motivation

The four host adapters (OpenCode, Codex, Qwen, Claude) have accumulated inconsistencies and
duplicated logic. This phase addresses the most impactful issues without a full rewrite.

## Design

### 1. Abstract shared adapter logic

**Target:** Create `src/adapters/shared.ts` to hold logic used by 2+ adapters:

**Extracted functions:**
- `validateProfile(profiles, profileId)` — profile existence check with standardized error
- `resolveRouteForAdapter(config, routeId)` — thin wrapper around router.resolveRoute
- `SAFE_NAME_PATTERN` — shared constant (currently duplicated in opencode.ts, codex.ts, qwen.ts)
- `buildRouteOwnershipMarker(route)` — standardize HTML comment marker generation
- `renderYamlFrontmatter(fields)` — shared YAML frontmatter rendering (currently duplicated)

**Usage:** Each adapter imports from `src/adapters/shared.ts` instead of implementing locally.
This is purely code extraction — no behavioral changes.

**Acceptance criteria:**
- All adapter tests pass with imports updated
- SAFE_NAME_PATTERN has single source of truth
- No new coupling between adapters (shared.ts is a utility module, not a base class)

### 2. Qwen graceful degradation on missing upstream skills

**Current:** `buildQwenArtifacts` throws when upstream superpowers skills are not found in
`.qwen/skills` or `.agents/skills`.

**Fix:** Instead of throwing, generate "stub" agent artifacts with a warning marker:

```typescript
// When skill is missing:
{
  path: ".qwen/agents/oms-brainstorm.md",
  content: `---
name: oms-brainstorm
description: [MISSING UPSTREAM] brainstorming
model: ${profile.model}
---

<!-- oms-route: canonicalRoute=phase.brainstorm ... -->
<!-- oms-warning: upstream-skill-missing skill=brainstorming -->

# WARNING: Upstream skill not found

The superpowers "brainstorming" skill is not installed.
Install it first:
  cp -r <superpowers>/skills/brainstorming .qwen/skills/brainstorming/

Then re-run: oh-my-superagents sync --host qwen
`,
}
```

The artifact is still generated so routing works, but the body clearly instructs the user to
install the missing dependency.

**Acceptance criteria:**
- Missing skills produce stub artifacts, not crashes
- Stub artifacts include clear installation instructions
- `doctor --host qwen` surfaces missing-skill warnings
- All existing Qwen tests continue to pass (test setup includes skills)

### 3. Claude model configuration support

**Current:** Claude skill files list model only in the "Route Metadata" section as a comment.
Claude uses its default model regardless of OMS config.

**Fix:** If Claude's SKILL.md format supports a model directive, embed it in a way Claude
recognizes. Based on Claude Code documentation, skills can specify model preferences via
frontmatter or specific instruction syntax.

Research Claude's current skill model configuration mechanism. If supported, add:

```markdown
---
model: claude-sonnet-4-20250514
---

# generated-by: oh-my-superagents; do-not-edit: true
...
```

If Claude does not support per-skill model selection, document this limitation clearly in the
skill file and README.

**Acceptance criteria:**
- Claude skills include model configuration if Claude API supports it
- If unsupported, limitation is documented in generated files and architecture docs
- No regression in existing Claude skill rendering

### 4. Route artifact collision precision

**Current:** `materialize.ts` collision detection for route-owned artifacts uses
`isRouteOwnedFile` which only checks for the presence of any route ownership marker, not
whether it matches the artifact being generated.

**Fix:** Add `isSameRouteOwnership` function that parses and compares the canonical route ID:

```typescript
function isSameRouteOwnership(
  existingContent: string,
  artifact: GeneratedArtifact,
): boolean {
  const existingMarker = parseRouteOwnership(existingContent);
  const artifactMarker = parseRouteOwnership(artifact.content);
  if (!existingMarker || !artifactMarker) return false;
  return existingMarker.canonicalRoute === artifactMarker.canonicalRoute
    && existingMarker.host === artifactMarker.host;
}
```

Use this in `isArtifactOwnedByCurrentContract` for route-owned artifacts (instead of
`isRouteOwnedFile`).

**Acceptance criteria:**
- Route-owned artifacts with different canonical routes don't collide
- Same-route artifacts correctly identify as owned by current contract
- Existing materialize tests pass
- New test: two different routes producing same filename → no collision

### 5. Codex serviceTier logic fix

**Current:** `codex.ts:46` uses OR logic:
```typescript
serviceTier: codexFast || effort === "fast" ? "fast" : undefined
```
This means if `effort` is `"fast"` but `codexFast` is `false`, `serviceTier` is still `"fast"`.

**Fix:** Change to explicit precedence:
```typescript
serviceTier: codexFast ? "fast" : (effort === "fast" ? "fast" : undefined)
```

The rationale: `codexFast` is the explicit profile-level toggle. `effort: "fast"` is a routing
hint. `codexFast: false` should override `effort: "fast"`.

**Acceptance criteria:**
- `codexFast: true` → serviceTier is `"fast"` regardless of effort
- `codexFast: false, effort: "fast"` → serviceTier is `undefined`
- `codexFast: false, effort: "balanced"` → serviceTier is `undefined`
- `codexFast: undefined, effort: "fast"` → serviceTier is `"fast"`

## Non-Goals

- Full adapter interface/abstract class (out of scope)
- Adding new hosts
- Changing artifact formats

## Impact

- Shared utility module reduces adapter code duplication
- Qwen becomes resilient to missing upstream skills
- Claude gets model configuration (if supported)
- Route artifact collision detection becomes more precise
- Codex serviceTier behavior is more predictable
