# Phase 2: Configuration & CLI Improvements Design

**Date:** 2026-04-24
**Status:** Design approved
**Parent:** oh-my-superagents architecture improvement (28 issues)

## Motivation

The control-plane and CLI modules have grown too large (`control-plane.ts` ~1779 lines, `cli.ts`
~3084 lines), making them hard to navigate and modify. The CLI argument parser is primitive, and
several patterns in the codebase are fragile.

## Design

### 1. Split control-plane.ts by concern

**Current:** Single file with resolve, status, doctor, explain, compression, policy, lane
execution, and write-preparation logic.

**Target structure:**

```
src/control-plane/
  index.ts              # barrel re-export of ResolvedControlPlane type + resolveControlPlane
  resolve.ts            # resolveControlPlane, buildControlPlaneRouteExplainTrace
  status.ts             # summarizeControlPlaneArtifacts, buildOpenCodeStatusState, etc.
  doctor.ts             # summarizeRoutingValidation, validatePresetGraph, etc.
  explain.ts            # summarizeLaneExplainability, summarizeEffectiveSourceReadiness
  compression.ts        # resolveEffectiveContextCompression, resolveContextCompressionCanonicalRoute
  policy.ts             # buildPolicyRuntimeSnapshot, resolvePolicyFamilies, resolveContextIndex
  state-write.ts        # prepareControlPlaneStateWrite, clone* helpers
  types.ts              # all interfaces and type exports
```

**Rules:**
- Each file < 400 lines
- `index.ts` re-exports the public API unchanged
- No behavioral changes — pure code movement + import path updates
- Existing tests pass without modification (imports updated if needed)

### 2. Split cli.ts by command

**Current:** Single file with all command implementations + shared helpers.

**Target structure:**

```
src/cli/
  index.ts              # main entry: parseArgs, dispatch, CliResult
  types.ts              # CliDeps, CliHost, CliResult types
  shared.ts             # resolvePresetKey, format helpers, artifact discovery
  status.ts             # handleStatus
  doctor.ts             # handleDoctor
  explain.ts            # handleExplain
  use.ts                # handleUse
  disable.ts            # handleDisable
  sync.ts               # handleSync
  bootstrap.ts          # handleBootstrap (Codex)
  author.ts             # handleAuthorRouting, handleConfigAuthor
  artifacts.ts          # discoverOwnedArtifacts, isOmsOwnedArtifactFile, OWNED_ARTIFACT_RULES
  diagnostics.ts        # buildOpenCodeCodexFastRuntimeDiagnostics, etc.
```

**Rules:**
- Each command file exports a single `handle*` function
- `index.ts` contains `parseArgs`, `main`, and the dispatch table
- `shared.ts` contains helpers used by 2+ command files
- No behavioral changes

### 3. --key=value CLI syntax and short flags

**Current:** `parseArgs` only supports `--key value` and `--key` (boolean).

**Fix:** Extend `parseArgs` to support:
- `--key=value` syntax (split on first `=`)
- `-h` short flag for `--help`
- `--` flag terminator (remaining args become positional)

Implementation:
```typescript
function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { flags: {}, positional: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      result.positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx >= 0) {
        result.flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        result.flags[arg.slice(2)] = argv[++i];
      } else {
        result.flags[arg.slice(2)] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      result.flags[arg.slice(1)] = true;
    } else {
      result.positional.push(arg);
    }
    i++;
  }
  return result;
}
```

**Acceptance criteria:**
- `--key=value` works identically to `--key value`
- `-h` triggers help output
- `--` stops flag parsing
- Backward compatible with all existing invocations

### 4. Replace string-matching with Error subclass

**Current:** `cli.ts:2922` checks `err.message === "Command sync requires a real config source"`.

**Fix:** Define `MissingConfigError` class:

```typescript
export class MissingConfigError extends Error {
  readonly code = 'MISSING_CONFIG';
  readonly command: string;
  constructor(command: string) {
    super(`Command ${command} requires a real config source`);
    this.name = 'MissingConfigError';
    this.command = command;
  }
}
```

Throw `new MissingConfigError(command)` in `resolveControlPlane`. Catch via `instanceof
MissingConfigError` in CLI.

**Acceptance criteria:**
- Sync bootstrap path works with new error class
- Error message change does not break detection
- Test: verify instanceof check catches MissingConfigError

### 5. Make policyRules id required

**Current:** `PolicyRuleSchema` has `id: z.string().optional()` (config.ts:217). Missing IDs are
synthesized as `rule-1`, `rule-2`, etc.

**Fix:** Change to `id: z.string().min(1)` — required, non-empty.

For migration, add `assignDefaultRuleIds` in `finalizeConfig` that assigns stable IDs to rules
without them:
```typescript
function assignDefaultRuleIds(rules: PolicyRule[]): PolicyRule[] {
  return rules.map((rule, i) => ({
    ...rule,
    id: rule.id ?? `rule-${String(i + 1).padStart(2, '0')}`,
  }));
}
```

Use 0-padded indices for deterministic sorting.

**Acceptance criteria:**
- Rules without explicit IDs get stable `rule-01`, `rule-02` IDs
- Validation rejects empty string IDs
- Schema type requires `id` to be `string`
- Existing configs with explicit IDs continue to work

## Non-Goals

- Adding new CLI commands
- Changing command behavior
- Modifying config format beyond policyRules.id requirement

## Impact

- `control-plane.ts` and `cli.ts` replaced by directory imports
- CLI now accepts `--key=value` syntax
- `MissingConfigError` replaces string matching
- Policy rules require or auto-receive stable IDs
