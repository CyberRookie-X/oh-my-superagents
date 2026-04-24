# Phase 2: Configuration & CLI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split large control-plane.ts and cli.ts into focused modules, add --key=value CLI syntax, replace string-matching with Error subclass, require policyRules.id.

**Architecture:** Pure code reorganization — no behavioral changes. `control-plane.ts` and `cli.ts` become barrel re-exports from new subdirectories. Each command gets its own file. Tests update import paths only.

**Tech Stack:** TypeScript, Vitest

---

## File Structure

```
src/
  control-plane/
    index.ts              # barrel re-export
    types.ts              # ResolvedControlPlane, all interfaces
    resolve.ts            # resolveControlPlane, buildControlPlaneRouteExplainTrace
    status.ts             # summarizeControlPlaneArtifacts, buildOpenCodeStatusState
    doctor.ts             # summarizeRoutingValidation, validatePresetGraph
    explain.ts            # summarizeLaneExplainability, summarizeEffectiveSourceReadiness
    compression.ts        # resolveEffectiveContextCompression
    policy.ts             # buildPolicyRuntimeSnapshot, resolveContextIndex
    state-write.ts        # prepareControlPlaneStateWrite, clone* helpers
  cli/
    index.ts              # main entry, parseArgs, dispatch
    types.ts              # CliDeps, CliHost, CliResult
    shared.ts             # resolvePresetKey, format helpers
    status.ts             # handleStatus
    doctor.ts             # handleDoctor
    explain.ts            # handleExplain
    use.ts                # handleUse
    disable.ts            # handleDisable
    sync.ts               # handleSync
    bootstrap.ts          # handleBootstrap
    author.ts             # handleAuthorRouting, handleConfigAuthor
    artifacts.ts          # discoverOwnedArtifacts, OWNED_ARTIFACT_RULES
    diagnostics.ts        # buildOpenCodeCodexFastRuntimeDiagnostics
  errors.ts               # NEW: MissingConfigError class

test/
  control-plane/
    status.test.ts        # SPLIT from control-plane.test.ts
    doctor.test.ts        # SPLIT from control-plane.test.ts
    explain.test.ts       # SPLIT from control-plane.test.ts
    compression.test.ts   # SPLIT from control-plane.test.ts
    policy.test.ts        # SPLIT from control-plane.test.ts
    resolve.test.ts       # SPLIT from control-plane.test.ts
  cli/
    parse-args.test.ts    # NEW: tests for extended parseArgs
    errors.test.ts        # NEW: tests for MissingConfigError
```

---

### Task 1: Create MissingConfigError class

**Files:**
- Create: `src/errors.ts`
- Create: `test/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/errors.test.ts
import { describe, it, expect } from "vitest";
import { MissingConfigError } from "../src/errors.js";

describe("MissingConfigError", () => {
  it("is instanceof Error", () => {
    const err = new MissingConfigError("sync");
    expect(err).toBeInstanceOf(Error);
  });

  it("is instanceof MissingConfigError", () => {
    const err = new MissingConfigError("sync");
    expect(err).toBeInstanceOf(MissingConfigError);
  });

  it("has correct name", () => {
    const err = new MissingConfigError("sync");
    expect(err.name).toBe("MissingConfigError");
  });

  it("has code property", () => {
    const err = new MissingConfigError("sync");
    expect(err.code).toBe("MISSING_CONFIG");
  });

  it("has command property", () => {
    const err = new MissingConfigError("use");
    expect(err.command).toBe("use");
  });

  it("has descriptive message", () => {
    const err = new MissingConfigError("disable");
    expect(err.message).toContain("disable");
    expect(err.message).toContain("real config source");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/errors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement MissingConfigError**

```typescript
// src/errors.ts
export class MissingConfigError extends Error {
  readonly code = "MISSING_CONFIG" as const;
  readonly command: string;

  constructor(command: string) {
    super(`Command ${command} requires a real config source`);
    this.name = "MissingConfigError";
    this.command = command;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/errors.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts test/errors.test.ts
git commit -m "feat: add MissingConfigError class"
```

---

### Task 2: Replace string matching with instanceof check

**Files:**
- Modify: `src/control-plane.ts` (throw MissingConfigError)
- Modify: `src/cli.ts` (catch via instanceof)

- [ ] **Step 1: Find and replace in control-plane.ts**

In `resolveControlPlane`, where `MissingControlPlaneConfigError` is caught and re-thrown for write commands (around line 1707), change:

```typescript
// Before:
throw new Error(`Command ${command} requires a real config source`);

// After:
import { MissingConfigError } from "./errors.js";
throw new MissingConfigError(command);
```

- [ ] **Step 2: Find and replace in cli.ts**

In the sync command handler (around line 2922), change:

```typescript
// Before:
if (err instanceof Error && err.message === "Command sync requires a real config source") {
  // bootstrap path
}

// After:
import { MissingConfigError } from "./errors.js";
if (err instanceof MissingConfigError && err.command === "sync") {
  // bootstrap path
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run test/control-plane.test.ts test/cli.test.ts`
Expected: ALL PASS (update test expectations if they check exact error messages)

- [ ] **Step 4: Commit**

```bash
git add src/control-plane.ts src/cli.ts
git commit -m "refactor: replace error string matching with MissingConfigError instanceof"
```

---

### Task 3: Extend parseArgs for --key=value and short flags

**Files:**
- Modify: `src/cli.ts` (parseArgs function)
- Create: `test/cli/parse-args.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/cli/parse-args.test.ts
import { describe, it, expect } from "vitest";

// Import parseArgs — we'll need to export it from cli/index.ts later
// For now, test the logic directly by extracting it

describe("parseArgs", () => {
  // We'll test after extraction in Task 4
  it.todo("parses --key=value syntax");
  it.todo("parses -h short flag");
  it.todo("stops parsing at --");
  it.todo("backward compatible with --key value");
});
```

- [ ] **Step 2: Write the actual tests after extracting parseArgs in Task 4** (deferred)

This task prepares the ground. The actual implementation and tests will be in Task 4 when we extract the CLI into modules.

- [ ] **Step 3: Commit (placeholder)**

```bash
git add test/cli/parse-args.test.ts
git commit -m "test: add placeholder for parseArgs extended syntax tests"
```

---

### Task 4: Split control-plane.ts into modules

**Files:**
- Create: `src/control-plane/index.ts`
- Create: `src/control-plane/types.ts`
- Create: `src/control-plane/resolve.ts`
- Create: `src/control-plane/status.ts`
- Create: `src/control-plane/doctor.ts`
- Create: `src/control-plane/explain.ts`
- Create: `src/control-plane/compression.ts`
- Create: `src/control-plane/policy.ts`
- Create: `src/control-plane/state-write.ts`
- Delete: `src/control-plane.ts`
- Modify: all files importing from `src/control-plane.ts` (update to `src/control-plane/index.js`)

- [ ] **Step 1: Verify current tests pass**

Run: `npx vitest run test/control-plane.test.ts`
Expected: ALL PASS

- [ ] **Step 2: Create directory and types file**

```bash
mkdir -p src/control-plane
```

```typescript
// src/control-plane/types.ts
// Extract all type/interface/enum exports from control-plane.ts:
// ResolvedControlPlane, ResolveControlPlaneInput, PrepareControlPlaneStateWriteInput,
// OpenCodeStatusState, ExplainTrace, RoutingValidationSummary, etc.
// (Copy all type definitions from the original file, lines ~71-240)
```

- [ ] **Step 3: Create resolve.ts**

Move `resolveControlPlane` and `buildControlPlaneRouteExplainTrace` functions to `src/control-plane/resolve.ts`. Import types from `./types.js`.

- [ ] **Step 4: Create status.ts**

Move status-related functions: `summarizeControlPlaneArtifacts`, `buildOpenCodeStatusState`, `summarizeEffectiveSourceReadiness`.

- [ ] **Step 5: Create doctor.ts**

Move validation functions: `summarizeRoutingValidation`, `validatePresetGraph`, `validateControlPlaneConfig`.

- [ ] **Step 6: Create explain.ts**

Move explain functions: `summarizeLaneExplainability`.

- [ ] **Step 7: Create compression.ts**

Move compression functions: `resolveEffectiveContextCompression`, `resolveContextCompressionCanonicalRoute`, `buildCompressionEngineBundle`.

- [ ] **Step 8: Create policy.ts**

Move policy functions: `buildPolicyRuntimeSnapshot`, `resolveContextIndex`.

- [ ] **Step 9: Create state-write.ts**

Move state write functions: `prepareControlPlaneStateWrite`, clone helpers.

- [ ] **Step 10: Create index.ts barrel**

```typescript
// src/control-plane/index.ts
export * from "./types.js";
export { resolveControlPlane, buildControlPlaneRouteExplainTrace } from "./resolve.js";
export { summarizeControlPlaneArtifacts, buildOpenCodeStatusState, summarizeEffectiveSourceReadiness } from "./status.js";
export { summarizeRoutingValidation, validatePresetGraph, validateControlPlaneConfig } from "./doctor.js";
export { summarizeLaneExplainability } from "./explain.js";
export { resolveEffectiveContextCompression, resolveContextCompressionCanonicalRoute, buildCompressionEngineBundle } from "./compression.js";
export { buildPolicyRuntimeSnapshot, resolveContextIndex } from "./policy.js";
export { prepareControlPlaneStateWrite } from "./state-write.js";
```

- [ ] **Step 11: Update all imports**

Find all files importing from `"./control-plane.js"` and update to `"./control-plane/index.js"`:

```bash
rg "from ['\"]./control-plane\.js['\"]" src/ --files-with-matches
```

Update each import. In most cases, just change the path since the barrel re-exports everything.

- [ ] **Step 12: Delete old file**

```bash
rm src/control-plane.ts
```

- [ ] **Step 13: Run tests**

Run: `npx vitest run test/control-plane.test.ts`
Expected: ALL PASS (may need test import path updates)

- [ ] **Step 14: Commit**

```bash
git add src/control-plane/ src/control-plane.ts
git commit -m "refactor: split control-plane.ts into modular files"
```

---

### Task 5: Split cli.ts into modules

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/types.ts`
- Create: `src/cli/shared.ts`
- Create: `src/cli/status.ts`
- Create: `src/cli/doctor.ts`
- Create: `src/cli/explain.ts`
- Create: `src/cli/use.ts`
- Create: `src/cli/disable.ts`
- Create: `src/cli/sync.ts`
- Create: `src/cli/bootstrap.ts`
- Create: `src/cli/author.ts`
- Create: `src/cli/artifacts.ts`
- Create: `src/cli/diagnostics.ts`
- Delete: `src/cli.ts`
- Modify: all imports from `src/cli.ts`

- [ ] **Step 1: Verify current CLI tests pass**

Run: `npx vitest run test/cli.test.ts`
Expected: ALL PASS

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p src/cli
```

- [ ] **Step 3: Extract types.ts**

Move `CliResult`, `CliDeps`, `CliHost`, and all CLI-related type definitions.

- [ ] **Step 4: Extract shared.ts**

Move `resolvePresetKey`, `getCommaSeparatedFlag`, and other shared helper functions.

- [ ] **Step 5: Extract artifacts.ts**

Move `OWNED_ARTIFACT_RULES`, `discoverOwnedArtifacts`, `isOmsOwnedArtifactFile`, and related functions.

- [ ] **Step 6: Extract diagnostics.ts**

Move `buildOpenCodeCodexFastRuntimeDiagnostics`, `hasCodexMarketplaceEntry`, `removeCodexMarketplaceEntry`.

- [ ] **Step 7: Extract command files**

Extract each command handler to its own file:
- `status.ts`: `handleStatus` function
- `doctor.ts`: `handleDoctor` function
- `explain.ts`: `handleExplain` function
- `use.ts`: `handleUse` function
- `disable.ts`: `handleDisable` function
- `sync.ts`: `handleSync` function
- `bootstrap.ts`: `handleBootstrap` function
- `author.ts`: `handleAuthorRouting` and `handleConfigAuthor` functions

- [ ] **Step 8: Create index.ts with parseArgs and dispatch**

```typescript
// src/cli/index.ts
import { MissingConfigError } from "../errors.js";
// ... imports from command files

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { flags: {}, positional: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--") {
      result.positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx >= 0) {
        result.flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        result.flags[arg.slice(2)] = argv[++i];
      } else {
        result.flags[arg.slice(2)] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      result.flags[arg.slice(1)] = true;
    } else {
      result.positional.push(arg);
    }
    i++;
  }
  return result;
}

export async function main(argv: string[], deps: CliDeps): Promise<CliResult> {
  const args = parseArgs(argv);
  // dispatch to command handlers...
}
```

- [ ] **Step 9: Update imports and delete old file**

```bash
rm src/cli.ts
```

Update `src/bin.ts` and `src/plugin.ts` imports to point to `"./cli/index.js"`.

- [ ] **Step 10: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (update test imports as needed)

- [ ] **Step 11: Commit**

```bash
git add src/cli/ src/cli.ts src/bin.ts src/plugin.ts
git commit -m "refactor: split cli.ts into modular command files"
```

---

### Task 6: Require policyRules.id in schema

**Files:**
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`

- [ ] **Step 1: Change Zod schema**

In `src/config.ts`, change `PolicyRuleSchema`:

```typescript
// Before:
export const PolicyRuleSchema = z.object({
  id: z.string().optional(),
  // ...
});

// After:
export const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  // ...
});
```

- [ ] **Step 2: Add migration logic in finalizeConfig**

In `finalizeConfig` (around line 920), add:

```typescript
function assignDefaultRuleIds(rules: PolicyRule[]): PolicyRule[] {
  return rules.map((rule, i) => ({
    ...rule,
    id: rule.id || `rule-${String(i + 1).padStart(2, "0")}`,
  }));
}

// In finalizeConfig:
if (merged.policyRules) {
  merged.policyRules = assignDefaultRuleIds(merged.policyRules);
}
```

- [ ] **Step 3: Update JSON schema**

In `schemas/oh-my-superagents.schema.json`, update the policy rule definition to make `id` required:

```json
{
  "PolicyRule": {
    "type": "object",
    "required": ["id", "selector", "policy"],
    "properties": {
      "id": { "type": "string", "minLength": 1 }
    }
  }
}
```

- [ ] **Step 4: Run config tests**

Run: `npx vitest run test/config.test.ts test/docs-catalog.test.ts`
Expected: Update test expectations for rule IDs, then ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts schemas/oh-my-superagents.schema.json test/config.test.ts
git commit -m "feat: require policyRules.id with auto-assigned stable IDs"
```

---

### Task 7: Full regression test run

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

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 2 complete — config and CLI improvements"
```
