# Phase 3: Compatibility & Versioning Improvements Design

**Date:** 2026-04-24
**Status:** Design approved
**Parent:** oh-my-superagents architecture improvement (28 issues)

## Motivation

The superpowers compatibility monitor has several gaps:
- v6.x passes silently as `"untested"` with no warning or block
- Prerelease versions never match tested ranges
- The compatibility matrix is entirely hardcoded, not user-configurable
- Plugin startup only checks OpenCode, not Codex
- No mechanism to populate `knownBadRanges`

## Design

### 1. v6.x warning with `allowUntested` config

**Current:** `shouldBlock` only triggers on `"incompatible"` status. `"untested"` never blocks.

**Fix:** Add `allowUntested` field to compatibility config:

```typescript
// config.ts schema addition
compatibility: z.object({
  mode: z.enum(["warn", "strict"]).default("warn"),
  allowUntested: z.enum(["warn", "block"]).default("warn"),
})
```

Update `shouldBlock` logic:
```typescript
shouldBlock:
  (policyMode === "strict" && outcome.status === "incompatible") ||
  (allowUntested === "block" && outcome.status === "untested")
```

When `shouldBlock` is true and status is `"untested"`, the reason message includes:
"This superpowers version has not been tested with this release of oh-my-superagents."

**Acceptance criteria:**
- Default: v6.x logs warning, does not block
- `allowUntested: "block"`: v6.x blocks with clear message
- `doctor` command shows untested status prominently
- Config schema updated

### 2. Prerelease version matching

**Current:** `matchesRange` (superpowers-compatibility.ts:487) rejects prerelease versions when
the range has no prerelease boundary.

**Fix:** Add prerelease-aware matching rule:

```typescript
// If version has prerelease, accept if the core version (without prerelease)
// matches the range and the range has no prerelease restrictions.
// Example: 5.1.0-beta.1 matches >=5.0.0 <6.0.0 because 5.1.0 is in range.
if (version.prerelease.length > 0) {
  const coreVersion = { ...version, prerelease: [] };
  if (matchesRange(coreVersion, range)) {
    return true;
  }
}
```

The rationale: prerelease versions of a compatible core version should be accepted unless the
range explicitly excludes them. Users who want to reject prereleases can use `knownBadRanges`.

**Acceptance criteria:**
- `5.1.0-beta.1` matches `>=5.0.0 <6.0.0` → `"compatible"`
- `5.0.0-alpha.1` matches `>=5.0.0 <6.0.0` → `"compatible"`
- `4.9.0-beta.1` does NOT match `>=5.0.0 <6.0.0` → `"incompatible"`
- Existing non-prerelease tests unchanged

### 3. Configurable compatibility matrix overrides

**Current:** `SUPERPOWERS_COMPATIBILITY` is `as const` in source code. Schema only allows
`compatibility.mode`.

**Fix:** Add `overrides` to schema:

```json
{
  "compatibility": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "mode": { "enum": ["warn", "strict"], "default": "warn" },
      "allowUntested": { "enum": ["warn", "block"], "default": "warn" },
      "overrides": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "opencode": { "$ref": "#/$defs/compatibilityOverride" },
          "codex": { "$ref": "#/$defs/compatibilityOverride" }
        }
      }
    }
  }
}
```

Where `compatibilityOverride` allows:
```typescript
{
  minimumSupportedVersion?: string;
  testedRanges?: string[];
  knownBadRanges?: string[];
}
```

`evaluateSuperpowersCompatibility` merges config overrides over the hardcoded defaults:

```typescript
const effectiveMatrix = {
  ...DEFAULT_MATRIX[host],
  ...configOverrides?.[host],
};
```

**Acceptance criteria:**
- User can override `minimumSupportedVersion` per host
- User can add `knownBadRanges` to block specific versions
- User can extend `testedRanges` to include future versions
- Config validation rejects invalid semver in overrides
- Empty config (no overrides) uses hardcoded defaults

### 4. knownBadRanges population mechanism

**Current:** `knownBadRanges` is an empty array with no mechanism to fill it.

**Fix:** This phase enables `knownBadRanges` via config overrides (item 3 above). A future phase
can add remote fetching, but for now, users manually configure bad ranges.

When a version matches `knownBadRanges`, the status is `"incompatible"` with reason:
"Version X.Y.Z is in the known-bad range: [range]."

**Acceptance criteria:**
- Version in `knownBadRanges` → `"incompatible"` + blocks in strict mode
- `doctor` surfaces known-bad matches

### 5. Plugin startup checks Codex compatibility

**Current:** `plugin.ts:179` hardcodes `detectOpenCodeSuperpowers()`. Codex is never checked at
startup.

**Fix:** Make `resolveCompatibilityForStartup` host-aware:

```typescript
async function resolveCompatibilityForStartup(
  host: SupportedSuperpowersHost,
  deps: CompatibilityDeps,
): Promise<SuperpowersCompatibilityResult> {
  const detector = host === "opencode"
    ? detectOpenCodeSuperpowers
    : detectCodexSuperpowers;
  const detection = await detector(deps);
  return evaluateSuperpowersCompatibility(detection, "warn", SUPERPOWERS_COMPATIBILITY);
}
```

At plugin startup, detect which host is being used (via environment or plugin config) and call
the appropriate detector. If host cannot be determined, default to OpenCode.

**Acceptance criteria:**
- Codex host gets compatibility checked at plugin startup
- OpenCode behavior unchanged
- Unknown host falls back to OpenCode detection

## Non-Goals

- Remote fetching of knownBadRanges (future phase)
- Auto-update of compatibility matrix
- Breaking changes to existing compatibility API

## Impact

- Config schema extended with `allowUntested` and `overrides`
- `evaluateSuperpowersCompatibility` accepts optional overrides parameter
- Plugin startup gains host awareness
- Prerelease versions now match tested ranges
