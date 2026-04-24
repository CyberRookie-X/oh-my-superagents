# Phase 3: Compatibility & Versioning Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `allowUntested` config, fix prerelease version matching, make compatibility matrix configurable, add knownBadRanges support, make plugin startup host-aware.

**Architecture:** Extend `superpowers-compatibility.ts` with new matching logic and overrides parameter. Extend config schema with `allowUntested` and `overrides` fields. Update `plugin.ts` to accept host parameter.

**Tech Stack:** TypeScript, Vitest, Zod

---

## File Structure

```
src/
  superpowers-compatibility.ts  # MODIFY: add allowUntested, overrides, prerelease matching
  config.ts                     # MODIFY: extend compatibility schema
  plugin.ts                     # MODIFY: host-aware startup check
  cli/
    doctor.ts                   # MODIFY: show untested status

test/
  superpowers-compatibility.test.ts  # MODIFY: new test cases
  config.test.ts                     # MODIFY: override tests
  plugin.test.ts                     # MODIFY: host-aware tests

schemas/
  oh-my-superagents.schema.json      # MODIFY: add allowUntested, overrides
```

---

### Task 1: Add prerelease version matching

**Files:**
- Modify: `src/superpowers-compatibility.ts`
- Modify: `test/superpowers-compatibility.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/superpowers-compatibility.test.ts`:

```typescript
describe("prerelease version matching", () => {
  const matrix = {
    opencode: { minimumSupportedVersion: "5.0.0", testedRanges: [">=5.0.0 <6.0.0"], knownBadRanges: [] },
  };

  it("accepts prerelease of compatible core version", () => {
    const detection = { host: "opencode" as const, source: "test", detectedVersion: "5.1.0-beta.1", detectedRef: "v5.1.0-beta.1" };
    const result = evaluateSuperpowersCompatibility(detection, "strict", matrix);
    expect(result.status).toBe("compatible");
  });

  it("accepts prerelease at minimum version", () => {
    const detection = { host: "opencode" as const, source: "test", detectedVersion: "5.0.0-alpha.1", detectedRef: "v5.0.0-alpha.1" };
    const result = evaluateSuperpowersCompatibility(detection, "strict", matrix);
    expect(result.status).toBe("compatible");
  });

  it("rejects prerelease below minimum version", () => {
    const detection = { host: "opencode" as const, source: "test", detectedVersion: "4.9.0-beta.1", detectedRef: "v4.9.0-beta.1" };
    const result = evaluateSuperpowersCompatibility(detection, "strict", matrix);
    expect(result.status).toBe("incompatible");
  });

  it("still rejects non-matching prerelease", () => {
    const detection = { host: "opencode" as const, source: "test", detectedVersion: "6.0.0-beta.1", detectedRef: "v6.0.0-beta.1" };
    const result = evaluateSuperpowersCompatibility(detection, "strict", matrix);
    // 6.0.0 is not in tested range, so status depends on allowUntested
    expect(result.status).toBe("untested");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/superpowers-compatibility.test.ts -t "prerelease"`
Expected: FAIL — prerelease versions not accepted

- [ ] **Step 3: Implement prerelease matching**

In `src/superpowers-compatibility.ts`, modify `matchesRange` (around line 487):

```typescript
function matchesRange(version: Semver, range: string): boolean {
  const comparators = parseRange(range);

  for (const comp of comparators) {
    if (!matchesComparator(version, comp)) {
      // If version has prerelease, try matching core version
      if (version.prerelease.length > 0) {
        const coreVersion: Semver = {
          ...version,
          prerelease: [],
        };
        if (!matchesComparator(coreVersion, comp)) {
          return false;
        }
      } else {
        return false;
      }
    }
  }

  return true;
}
```

Also update `evaluateSuperpowersCompatibility` to handle the prerelease case — when version has prerelease but core version matches tested ranges:

```typescript
// In evaluateSuperpowersCompatibility, after the testedRanges check:
const coreVersion = parsed.prerelease.length > 0
  ? { ...parsed, prerelease: [] as string[] }
  : parsed;

for (const range of matrix.testedRanges) {
  if (matchesRange(coreVersion, range)) {
    return { status: "compatible", /* ... */ };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/superpowers-compatibility.test.ts`
Expected: ALL PASS including new prerelease tests

- [ ] **Step 5: Commit**

```bash
git add src/superpowers-compatibility.ts test/superpowers-compatibility.test.ts
git commit -m "fix: accept prerelease versions within tested ranges"
```

---

### Task 2: Add allowUntested config

**Files:**
- Modify: `src/config.ts`
- Modify: `src/superpowers-compatibility.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Update schema**

In `schemas/oh-my-superagents.schema.json`, add to the compatibility object:

```json
"compatibility": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "mode": { "enum": ["warn", "strict"], "default": "warn" },
    "allowUntested": { "enum": ["warn", "block"], "default": "warn" }
  }
}
```

- [ ] **Step 2: Update Zod schema**

In `src/config.ts`:

```typescript
const SuperpowersCompatibilitySchema = z.object({
  mode: z.enum(["warn", "strict"]).default("warn"),
  allowUntested: z.enum(["warn", "block"]).default("warn"),
}).strict();
```

- [ ] **Step 3: Update shouldBlock logic**

In `src/superpowers-compatibility.ts`, update `shouldBlock`:

```typescript
function shouldBlock(
  policyMode: "warn" | "strict",
  allowUntested: "warn" | "block",
  status: SuperpowersCompatibilityStatus,
): boolean {
  if (policyMode === "strict" && status === "incompatible") return true;
  if (allowUntested === "block" && status === "untested") return true;
  return false;
}
```

Update `evaluateSuperpowersCompatibility` signature to accept `allowUntested`:

```typescript
export function evaluateSuperpowersCompatibility(
  detection: SuperpowersDetectionResult,
  policyMode: "warn" | "strict",
  matrix: SuperpowersCompatibilityMatrix,
  allowUntested: "warn" | "block" = "warn",
): SuperpowersCompatibilityResult {
  // ... existing logic ...
  return {
    // ...
    shouldBlock: shouldBlock(policyMode, allowUntested, outcome.status),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/config.test.ts test/superpowers-compatibility.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/superpowers-compatibility.ts schemas/oh-my-superagents.schema.json
git commit -m "feat: add allowUntested config for compatibility monitoring"
```

---

### Task 3: Make compatibility matrix configurable via overrides

**Files:**
- Modify: `src/config.ts`
- Modify: `src/superpowers-compatibility.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Update JSON schema**

Add `overrides` to the compatibility section in `schemas/oh-my-superagents.schema.json`:

```json
"overrides": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "opencode": { "$ref": "#/$defs/CompatibilityOverride" },
    "codex": { "$ref": "#/$defs/CompatibilityOverride" }
  }
}
```

Add `CompatibilityOverride` definition:

```json
"CompatibilityOverride": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "minimumSupportedVersion": { "type": "string" },
    "testedRanges": { "type": "array", "items": { "type": "string" } },
    "knownBadRanges": { "type": "array", "items": { "type": "string" } }
  }
}
```

- [ ] **Step 2: Update Zod schema**

In `src/config.ts`:

```typescript
const CompatibilityOverrideSchema = z.object({
  minimumSupportedVersion: z.string().optional(),
  testedRanges: z.array(z.string()).optional(),
  knownBadRanges: z.array(z.string()).optional(),
}).strict();

const SuperpowersCompatibilitySchema = z.object({
  mode: z.enum(["warn", "strict"]).default("warn"),
  allowUntested: z.enum(["warn", "block"]).default("warn"),
  overrides: z.object({
    opencode: CompatibilityOverrideSchema.optional(),
    codex: CompatibilityOverrideSchema.optional(),
  }).optional(),
}).strict();
```

- [ ] **Step 3: Implement override merging**

In `src/superpowers-compatibility.ts`:

```typescript
export interface CompatibilityOverride {
  minimumSupportedVersion?: string;
  testedRanges?: string[];
  knownBadRanges?: string[];
}

export function mergeMatrixWithOverrides(
  matrix: SuperpowersCompatibilityMatrix,
  overrides?: Record<string, CompatibilityOverride>,
): SuperpowersCompatibilityMatrix {
  const result: SuperpowersCompatibilityMatrix = {};
  for (const [host, entry] of Object.entries(matrix)) {
    const override = overrides?.[host];
    result[host] = {
      minimumSupportedVersion: override?.minimumSupportedVersion ?? entry.minimumSupportedVersion,
      testedRanges: override?.testedRanges ?? [...entry.testedRanges],
      knownBadRanges: override?.knownBadRanges ?? [...entry.knownBadRanges],
    };
  }
  return result;
}
```

- [ ] **Step 4: Use merged matrix in evaluation**

Update callers of `evaluateSuperpowersCompatibility` to pass merged matrix:

```typescript
const effectiveMatrix = mergeMatrixWithOverrides(
  SUPERPOWERS_COMPATIBILITY,
  config.compatibility?.overrides,
);
const result = evaluateSuperpowersCompatibility(
  detection,
  config.compatibility?.mode ?? "warn",
  effectiveMatrix,
  config.compatibility?.allowUntested ?? "warn",
);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/config.test.ts test/superpowers-compatibility.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/superpowers-compatibility.ts schemas/oh-my-superagents.schema.json
git commit -m "feat: support configurable compatibility matrix overrides"
```

---

### Task 4: Implement knownBadRanges blocking

**Files:**
- Modify: `src/superpowers-compatibility.ts`
- Modify: `test/superpowers-compatibility.test.ts`

- [ ] **Step 1: Write failing test**

Add to `test/superpowers-compatibility.test.ts`:

```typescript
describe("knownBadRanges", () => {
  it("blocks version in known bad range", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [">=5.2.0 <=5.2.5"],
      },
    };
    const detection = { host: "opencode" as const, source: "test", detectedVersion: "5.2.3", detectedRef: "v5.2.3" };
    const result = evaluateSuperpowersCompatibility(detection, "strict", matrix);
    expect(result.status).toBe("incompatible");
    expect(result.reason).toContain("known-bad");
    expect(result.shouldBlock).toBe(true);
  });

  it("does not block version outside known bad range", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [">=5.2.0 <=5.2.5"],
      },
    };
    const detection = { host: "opencode" as const, source: "test", detectedVersion: "5.3.0", detectedRef: "v5.3.0" };
    const result = evaluateSuperpowersCompatibility(detection, "strict", matrix);
    expect(result.status).toBe("compatible");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/superpowers-compatibility.test.ts -t "knownBadRanges"`
Expected: FAIL

- [ ] **Step 3: Implement knownBadRanges check**

In `evaluateSuperpowersCompatibility`, add before the testedRanges check:

```typescript
// Check known bad ranges
for (const badRange of matrix.knownBadRanges) {
  if (matchesRange(parsed, badRange)) {
    return {
      status: "incompatible",
      reason: `Version ${detection.detectedVersion} is in the known-bad range: ${badRange}.`,
      host: detection.host,
      detectedVersion: detection.detectedVersion,
      detectedRef: detection.detectedRef,
      minimumSupportedVersion: matrix.minimumSupportedVersion,
      shouldBlock: shouldBlock(policyMode, allowUntested, "incompatible"),
    };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/superpowers-compatibility.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/superpowers-compatibility.ts test/superpowers-compatibility.test.ts
git commit -m "feat: implement knownBadRanges blocking in compatibility monitor"
```

---

### Task 5: Make plugin startup host-aware

**Files:**
- Modify: `src/plugin.ts`
- Modify: `test/plugin.test.ts`

- [ ] **Step 1: Update resolveCompatibilityForStartup**

In `src/plugin.ts`, modify `resolveCompatibilityForStartup` (around line 171):

```typescript
async function resolveCompatibilityForStartup(
  host: "opencode" | "codex",
  deps: CompatibilityDeps,
): Promise<SuperpowersCompatibilityResult> {
  const detector = host === "opencode"
    ? detectOpenCodeSuperpowers
    : detectCodexSuperpowers;
  try {
    const detection = await detector(deps);
    return evaluateSuperpowersCompatibility(
      detection,
      "warn",
      SUPERPOWERS_COMPATIBILITY,
      "warn",
    );
  } catch {
    return createNotDetectedCompatibilityResult();
  }
}
```

- [ ] **Step 2: Detect host at plugin startup**

In the plugin initialization (around line 127), determine the current host:

```typescript
// Detect current host from environment or plugin config
const currentHost: "opencode" | "codex" =
  process.env.OMS_HOST === "codex" ? "codex" : "opencode";

const compatResult = await resolveCompatibilityForStartup(currentHost, {
  readFile: fs.promises.readFile,
  access: (p: string) => fs.promises.access(p).then(() => true).catch(() => false),
  readdir: fs.promises.readdir,
  lstat: fs.promises.lstat,
  realpath: fs.promises.realpath,
  execFile: execFileAsync,
  homedir: os.homedir,
  pathExists: async (p: string) => {
    try { await fs.promises.access(p); return true; }
    catch { return false; }
  },
});
```

- [ ] **Step 3: Run plugin tests**

Run: `npx vitest run test/plugin.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugin.ts test/plugin.test.ts
git commit -m "feat: make plugin startup compatibility check host-aware"
```

---

### Task 6: Show untested status in doctor output

**Files:**
- Modify: `src/cli/doctor.ts` (or `src/control-plane/doctor.ts`)

- [ ] **Step 1: Add untested status to doctor output**

In the doctor handler, after compatibility check:

```typescript
if (compatResult.status === "untested") {
  doctorIssues.push({
    level: compatConfig.allowUntested === "block" ? "error" : "warning",
    message: `Superpowers version ${compatResult.detectedVersion} is untested with this release of oh-my-superagents.`,
    suggestion: compatConfig.allowUntested === "block"
      ? "Set compatibility.allowUntested to 'warn' or upgrade/downgrade superpowers."
      : "Consider testing thoroughly before production use.",
  });
}
```

- [ ] **Step 2: Run doctor tests**

Run: `npx vitest run test/control-plane.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli/doctor.ts
git commit -m "feat: surface untested compatibility status in doctor output"
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

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 3 complete — compatibility and versioning improvements"
```
