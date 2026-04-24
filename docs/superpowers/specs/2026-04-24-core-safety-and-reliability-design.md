# Phase 1: Core Safety & Reliability Design

**Date:** 2026-04-24
**Status:** Design approved
**Parent:** oh-my-superagents architecture improvement (28 issues)

## Motivation

The codebase analysis identified five safety and reliability issues that should be fixed before
further development:

1. **Codex bootstrap double-write**: Control-plane skill files are written twice — once by
   `materializeArtifacts` and once by `writeCodexBootstrapFiles` — with the second write using
   non-atomic file operations, creating a file-corruption window.
2. **Unprotected JSON.parse**: Three call-sites in `cli.ts` parse artifact content without try/catch.
   Malformed files cause unhandled crashes.
3. **Missing defense-in-depth path traversal**: `path.join(cwd, artifact.path)` in
   `control-plane.ts:1326` relies solely on upstream validation without a local guard.
4. **Duplicate `escapeGlobPattern`**: Identical ~80-line implementation in `control-plane.ts` and
   `policy-selectors.ts`. Divergence risk.
5. **TOCTOU race windows**: `loadControlPlaneConfig` checks file existence (`access`) then reads
   (`readFile`). File can disappear between calls.

## Design

### 1. Fix Codex bootstrap double-write

**Current behavior:** `runCodexBootstrap` (codex-bootstrap.ts:534-547) calls both
`materializeArtifacts` with control-plane skills (converted via `toGeneratedArtifact`) AND
`writeCodexBootstrapFiles` which writes the same skill files directly.

**Fix:** Split the bootstrap file set into two categories:
- **Route-owned artifacts** (agent files from `buildCodexArtifacts`) → pass to `materializeArtifacts`
- **Scaffold files** (plugin manifest, marketplace, skill files, starter config) → write via
  `writeCodexBootstrapFiles` only

Remove the `toGeneratedArtifact` conversion for skills. `materializeArtifacts` only receives agent
artifacts. Skills are written by `writeCodexBootstrapFiles` with proper error handling.

**Acceptance criteria:**
- `runCodexBootstrap` writes each file exactly once
- Control-plane skills use atomic rename (add `.tmp` + rename to `writeCodexBootstrapFiles`)
- Existing Codex bootstrap tests pass without modification
- New test: verify skill files appear exactly once in written output

### 2. Add JSON.parse protection

**Affected locations:**
- `cli.ts:1609` — `buildOpenCodeCodexFastRuntimeDiagnostics`
- `cli.ts:1754` — `hasCodexMarketplaceEntry`
- `cli.ts:1765` — `removeCodexMarketplaceEntry`

**Fix:** Wrap each `JSON.parse` call in try/catch. On parse failure:
- `buildOpenCodeCodexFastRuntimeDiagnostics`: return empty diagnostics + warning
- `hasCodexMarketplaceEntry`: return `false` + log warning
- `removeCodexMarketplaceEntry`: skip removal + log warning

Extract a helper `safeJsonParse<T>(content: string, fallback: T): { value: T; warning?: string }`
to `src/utils/json.ts`.

**Acceptance criteria:**
- Malformed JSON files do not crash CLI commands
- Warnings are emitted to stderr
- Unit tests for `safeJsonParse` with valid JSON, invalid JSON, empty string

### 3. Path traversal defense-in-depth

**Fix:** In `materialize.ts` `materializeArtifacts`, before `path.join(cwd, artifact.path)`, add
explicit check:

```typescript
function assertSafeArtifactPath(cwd: string, relativePath: string): void {
  const resolved = path.resolve(cwd, relativePath);
  if (!resolved.startsWith(path.resolve(cwd) + path.sep) && resolved !== path.resolve(cwd)) {
    throw new Error(`Artifact path escapes working directory: ${relativePath}`);
  }
}
```

Also add to `buildCompressionEngineBundle` in `control-plane.ts:1326`.

**Acceptance criteria:**
- Artifact path containing `../` is rejected
- Absolute artifact paths are rejected
- Existing valid artifacts continue to work
- Test: verify rejection of traversal attempts

### 4. Unify escapeGlobPattern

**Fix:** Create `src/utils/glob-utils.ts`:

```typescript
export function escapeGlobPattern(pattern: string): string { /* ... */ }
export function matchesGlobPattern(pattern: string, value: string): boolean { /* ... */ }
export function normalizeRelativePath(p: string): string { /* ... */ }
```

Import from both `control-plane.ts` and `policy-selectors.ts`. Remove duplicate implementations.
Behavior must be identical.

**Acceptance criteria:**
- All existing glob-matching tests pass
- Both consumers use the shared implementation
- No behavioral change

### 5. Fix TOCTOU race conditions

**Fix A — `loadControlPlaneConfig`:**
Replace the `access`-then-`readFile` pattern with direct `readFile` wrapped in try/catch:

```typescript
// Before (racy):
const exists = await access(configPath);
if (exists) { const content = await readFile(configPath); }

// After (safe):
try {
  const content = await readFile(configPath, 'utf-8');
} catch (err) {
  if (err.code === 'ENOENT') { /* handle missing */ }
  else { throw err; }
}
```

**Fix B — `prepareControlPlaneStateWrite`:**
Add optional mtime guard. When reading the config, capture `fs.statSync(path).mtimeMs`. Before
writing, re-stat and compare. If mtime changed, return an error result instead of overwriting.

This is a best-effort guard; true atomicity requires filesystem locks which are out of scope.

**Acceptance criteria:**
- No `access`-then-`readFile` pattern in `loadControlPlaneConfig`
- `prepareControlPlaneStateWrite` returns error when config was modified concurrently
- Test: simulate concurrent modification via mock fs

## Non-Goals

- Filesystem-level locking (out of scope for this phase)
- Changing artifact format or ownership markers
- Adding new CLI commands

## Impact

- No API changes
- All existing tests must continue to pass
- New tests added for each fix
- No configuration migration required
