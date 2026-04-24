# Phase 1: Core Safety & Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 safety/reliability issues: Codex double-write, JSON.parse protection, path traversal defense, duplicate escapeGlobPattern, TOCTOU races.

**Architecture:** Each fix is independent. Create a shared `src/utils/glob-utils.ts` and `src/utils/json.ts`. Modify `codex-bootstrap.ts`, `materialize.ts`, `cli.ts`, `control-plane.ts`, `config.ts`, and `policy-selectors.ts`.

**Tech Stack:** TypeScript, Vitest, Node.js fs

---

## File Structure

```
src/
  utils/
    glob-utils.ts          # NEW: escapeGlobPattern, matchesGlobPattern, normalizeRelativePath
    json.ts                # NEW: safeJsonParse helper
  materialize.ts           # MODIFY: add path traversal guard
  codex-bootstrap.ts       # MODIFY: fix double-write, add atomic rename to scaffold writes
  control-plane.ts         # MODIFY: remove duplicate glob code, add path guard
  cli.ts                   # MODIFY: wrap JSON.parse calls
  config.ts                # MODIFY: replace access-then-readFile pattern
  policy-selectors.ts      # MODIFY: remove duplicate glob code, import from glob-utils

test/
  glob-utils.test.ts       # NEW: tests for shared glob utilities
  json.test.ts             # NEW: tests for safeJsonParse
  materialize.test.ts      # MODIFY: add path traversal tests
  codex-bootstrap.test.ts  # MODIFY: verify single-write behavior
  cli.test.ts              # MODIFY: add malformed JSON tests
  control-plane.test.ts    # MODIFY: add path guard tests, verify glob imports work
  config.test.ts           # MODIFY: add TOCTOU tests
```

---

### Task 1: Create shared glob-utils module

**Files:**
- Create: `src/utils/glob-utils.ts`
- Create: `test/glob-utils.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/glob-utils.test.ts
import { describe, it, expect } from "vitest";
import { escapeGlobPattern, matchesGlobPattern, normalizeRelativePath } from "../src/utils/glob-utils.js";

describe("escapeGlobPattern", () => {
  it("escapes regex metacharacters", () => {
    const escaped = escapeGlobPattern("src/*.ts");
    expect(escaped).toBe("src/\\*\\.ts");
  });

  it("handles ** pattern", () => {
    const escaped = escapeGlobPattern("src/**/*.ts");
    expect(escaped).toContain(".*");
  });

  it("handles question marks", () => {
    const escaped = escapeGlobPattern("file?.ts");
    expect(escaped).toContain("[^/]");
  });

  it("handles character classes", () => {
    const escaped = escapeGlobPattern("file[abc].ts");
    expect(escaped).toBe("file\\[abc\\]\\.ts");
  });

  it("handles empty string", () => {
    expect(escapeGlobPattern("")).toBe("");
  });
});

describe("matchesGlobPattern", () => {
  it("matches exact pattern", () => {
    expect(matchesGlobPattern("*.ts", "file.ts")).toBe(true);
    expect(matchesGlobPattern("*.ts", "file.js")).toBe(false);
  });

  it("matches ** recursive", () => {
    expect(matchesGlobPattern("src/**/*.ts", "src/foo/bar/file.ts")).toBe(true);
    expect(matchesGlobPattern("src/**/*.ts", "src/file.ts")).toBe(true);
  });

  it("rejects path traversal in match", () => {
    expect(matchesGlobPattern("*.ts", "../file.ts")).toBe(false);
  });

  it("matches question mark", () => {
    expect(matchesGlobPattern("file?.ts", "file1.ts")).toBe(true);
    expect(matchesGlobPattern("file?.ts", "file12.ts")).toBe(false);
  });
});

describe("normalizeRelativePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizeRelativePath("src\\foo\\bar.ts")).toBe("src/foo/bar.ts");
  });

  it("trims trailing slash", () => {
    expect(normalizeRelativePath("src/foo/")).toBe("src/foo");
  });

  it("handles already normalized path", () => {
    expect(normalizeRelativePath("src/foo/bar.ts")).toBe("src/foo/bar.ts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/glob-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/glob-utils.ts
export function escapeGlobPattern(pattern: string): string {
  let result = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    switch (ch) {
      case "*":
        if (pattern[i + 1] === "*") {
          if (pattern[i + 2] === "/" || pattern[i + 2] === undefined) {
            result += "(?:.+/)?";
            i += 2;
          } else {
            result += ".*";
            i += 1;
          }
        } else {
          result += "[^/]*";
        }
        break;
      case "?":
        result += "[^/]";
        break;
      case ".": case "\\": case "+": case "^": case "$":
      case "{": case "}": case "(": case ")": case "|":
      case "[": case "]":
        result += "\\" + ch;
        break;
      default:
        result += ch;
    }
  }
  return result;
}

export function matchesGlobPattern(pattern: string, value: string): boolean {
  if (value.includes("..")) return false;
  const escaped = escapeGlobPattern(pattern);
  const regex = new RegExp("^" + escaped + "$");
  return regex.test(value);
}

export function normalizeRelativePath(p: string): string {
  let result = p.replace(/\\/g, "/");
  if (result.endsWith("/") && result.length > 1) {
    result = result.slice(0, -1);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/glob-utils.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/glob-utils.ts test/glob-utils.test.ts
git commit -m "feat: add shared glob-utils module"
```

---

### Task 2: Migrate control-plane.ts to use glob-utils

**Files:**
- Modify: `src/control-plane.ts` (remove duplicate code, add import)

- [ ] **Step 1: Verify existing tests pass before change**

Run: `npx vitest run test/control-plane.test.ts`
Expected: ALL PASS (or pre-existing failures noted)

- [ ] **Step 2: Remove duplicate functions and add import**

In `src/control-plane.ts`, remove the following functions (lines ~1500-1547):
- `escapeGlobPattern`
- `matchesGlobPattern`
- `normalizeRelativePath`

Add import at top:
```typescript
import { escapeGlobPattern, matchesGlobPattern, normalizeRelativePath } from "./utils/glob-utils.js";
```

Ensure all usages of these functions within control-plane.ts continue to resolve. The function signatures are identical.

- [ ] **Step 3: Run tests to verify no regression**

Run: `npx vitest run test/control-plane.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/control-plane.ts
git commit -m "refactor: use shared glob-utils in control-plane"
```

---

### Task 3: Migrate policy-selectors.ts to use glob-utils

**Files:**
- Modify: `src/policy-selectors.ts` (remove duplicate code, add import)

- [ ] **Step 1: Verify existing tests pass before change**

Run: `npx vitest run test/policy-selectors.test.ts`
Expected: ALL PASS

- [ ] **Step 2: Remove duplicate functions and add import**

In `src/policy-selectors.ts`, remove `escapeGlobPattern`, `matchesGlobPattern`, and `normalizeRelativePath` (lines ~40-79).

Add import at top:
```typescript
import { escapeGlobPattern, matchesGlobPattern, normalizeRelativePath } from "./utils/glob-utils.js";
```

- [ ] **Step 3: Run tests to verify no regression**

Run: `npx vitest run test/policy-selectors.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/policy-selectors.ts
git commit -m "refactor: use shared glob-utils in policy-selectors"
```

---

### Task 4: Create safeJsonParse utility

**Files:**
- Create: `src/utils/json.ts`
- Create: `test/json.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/json.test.ts
import { describe, it, expect } from "vitest";
import { safeJsonParse } from "../src/utils/json.js";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    const result = safeJsonParse('{"key": "value"}', {});
    expect(result.value).toEqual({ key: "value" });
    expect(result.warning).toBeUndefined();
  });

  it("returns fallback for invalid JSON", () => {
    const result = safeJsonParse("{invalid", { default: true });
    expect(result.value).toEqual({ default: true });
    expect(result.warning).toContain("Failed to parse JSON");
  });

  it("returns fallback for empty string", () => {
    const result = safeJsonParse("", []);
    expect(result.value).toEqual([]);
    expect(result.warning).toBeDefined();
  });

  it("returns fallback for null input", () => {
    const result = safeJsonParse(null as unknown as string, "fallback");
    expect(result.value).toBe("fallback");
    expect(result.warning).toBeDefined();
  });

  it("parses arrays", () => {
    const result = safeJsonParse("[1, 2, 3]", [] as number[]);
    expect(result.value).toEqual([1, 2, 3]);
    expect(result.warning).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/json.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/json.ts
export interface SafeJsonResult<T> {
  value: T;
  warning?: string;
}

export function safeJsonParse<T>(content: string | null | undefined, fallback: T): SafeJsonResult<T> {
  if (content == null || content === "") {
    return { value: fallback, warning: "Failed to parse JSON: empty or null content" };
  }
  try {
    return { value: JSON.parse(content) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: fallback, warning: `Failed to parse JSON: ${message}` };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/json.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/json.ts test/json.test.ts
git commit -m "feat: add safeJsonParse utility"
```

---

### Task 5: Protect JSON.parse calls in cli.ts

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Verify existing CLI tests pass**

Run: `npx vitest run test/cli.test.ts`
Expected: ALL PASS (or pre-existing failures noted)

- [ ] **Step 2: Fix buildOpenCodeCodexFastRuntimeDiagnostics (around line 1609)**

Find the `JSON.parse` call in `buildOpenCodeCodexFastRuntimeDiagnostics`. Replace:

```typescript
// Before (approximate):
const metadata = JSON.parse(content);
```

With:

```typescript
import { safeJsonParse } from "./utils/json.js";

// In buildOpenCodeCodexFastRuntimeDiagnostics:
const { value: metadata, warning } = safeJsonParse<Record<string, unknown>>(content, {});
if (warning) {
  diagnostics.push({ level: "warning", message: warning });
  return diagnostics;
}
```

- [ ] **Step 3: Fix hasCodexMarketplaceEntry (around line 1754)**

Replace:
```typescript
const marketplace = JSON.parse(content);
```

With:
```typescript
const { value: marketplace, warning } = safeJsonParse<Record<string, unknown>>(content, {});
if (warning) {
  // Log warning via deps.log?.warn or return false
  return false;
}
```

- [ ] **Step 4: Fix removeCodexMarketplaceEntry (around line 1765)**

Replace:
```typescript
const marketplace = JSON.parse(content);
```

With:
```typescript
const { value: marketplace, warning } = safeJsonParse<Record<string, unknown>>(content, {});
if (warning) {
  // Log warning, skip removal
  return;
}
```

- [ ] **Step 5: Run CLI tests**

Run: `npx vitest run test/cli.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "fix: protect JSON.parse calls in CLI with safeJsonParse"
```

---

### Task 6: Add path traversal defense-in-depth

**Files:**
- Modify: `src/materialize.ts`
- Modify: `src/control-plane.ts`
- Modify: `test/materialize.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/materialize.test.ts`:

```typescript
import { assertSafeArtifactPath } from "../src/materialize.js";

describe("assertSafeArtifactPath", () => {
  it("accepts safe relative path", () => {
    expect(() => assertSafeArtifactPath("/project", ".opencode/agents/file.md")).not.toThrow();
  });

  it("rejects path with .. traversal", () => {
    expect(() => assertSafeArtifactPath("/project", "../etc/passwd")).toThrow();
  });

  it("rejects absolute path", () => {
    expect(() => assertSafeArtifactPath("/project", "/etc/passwd")).toThrow();
  });

  it("rejects path escaping via nested ..", () => {
    expect(() => assertSafeArtifactPath("/project", ".opencode/../../etc/passwd")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/materialize.test.ts -t "assertSafeArtifactPath"
Expected: FAIL — function not exported

- [ ] **Step 3: Implement assertSafeArtifactPath and integrate**

In `src/materialize.ts`, add:

```typescript
export function assertSafeArtifactPath(cwd: string, relativePath: string): void {
  const resolved = path.resolve(cwd, relativePath);
  const resolvedCwd = path.resolve(cwd);
  if (!resolved.startsWith(resolvedCwd + path.sep) && resolved !== resolvedCwd) {
    throw new Error(`Artifact path escapes working directory: ${relativePath}`);
  }
}
```

In `materializeArtifacts`, add before the collision check loop:
```typescript
for (const artifact of artifacts) {
  assertSafeArtifactPath(cwd, path.join(artifact.directory, artifact.fileName));
}
```

In `src/control-plane.ts`, in `buildCompressionEngineBundle` (around line 1326), add:
```typescript
import { assertSafeArtifactPath } from "./materialize.js";

// Before path.join(input.cwd, artifact.path):
assertSafeArtifactPath(input.cwd, artifact.path);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/materialize.test.ts`
Expected: ALL PASS including new tests

- [ ] **Step 5: Commit**

```bash
git add src/materialize.ts src/control-plane.ts test/materialize.test.ts
git commit -m "fix: add path traversal defense-in-depth"
```

---

### Task 7: Fix TOCTOU in config loading

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Verify existing config tests pass**

Run: `npx vitest run test/config.test.ts`
Expected: ALL PASS

- [ ] **Step 2: Replace access-then-read pattern**

In `loadControlPlaneConfig` (around line 1293), find the pattern that checks file existence via `access` then reads. Replace with try/catch on direct read:

```typescript
// Before (approximate):
const exists = await deps.access(configPath);
if (exists) {
  const content = await deps.readFile(configPath, "utf-8");
  // ...
}

// After:
try {
  const content = await deps.readFile(configPath, "utf-8");
  // parse content...
} catch (err) {
  if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
    // File does not exist — handle gracefully
  } else {
    throw err;
  }
}
```

Similarly fix `defaultExists` (line ~587) which catches all errors from `access()` — add specific error handling:

```typescript
// In defaultExists:
try {
  await deps.access(configPath);
  return true;
} catch (err) {
  if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
    return false;
  }
  // Permission errors or other issues — log and treat as non-existent
  return false;
}
```

- [ ] **Step 3: Add mtime guard to prepareControlPlaneStateWrite**

In `src/control-plane.ts` `prepareControlPlaneStateWrite`, capture mtime before mutation and pass to write function:

```typescript
// At the start of prepareControlPlaneStateWrite:
let expectedMtime: number | undefined;
try {
  const stat = await deps.stat(input.configPath);
  expectedMtime = stat.mtimeMs;
} catch {
  expectedMtime = undefined;
}

// Return expectedMtime in the result
return {
  // ... existing fields ...
  expectedMtime,
};
```

In `src/cli.ts`, before calling `writeAuthorityWithRecoverySnapshotAtomically`, check:
```typescript
if (result.expectedMtime !== undefined) {
  try {
    const currentStat = await deps.stat(input.configPath);
    if (currentStat.mtimeMs !== result.expectedMtime) {
      // Config was modified concurrently
      return { exitCode: 1, stderr: "Config was modified by another process. Please retry." };
    }
  } catch {
    // File was deleted — proceed with write (it's a new file)
  }
}
```

- [ ] **Step 4: Run config and control-plane tests**

Run: `npx vitest run test/config.test.ts test/control-plane.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/control-plane.ts src/cli.ts
git commit -m "fix: address TOCTOU races in config loading and writing"
```

---

### Task 8: Fix Codex bootstrap double-write

**Files:**
- Modify: `src/codex-bootstrap.ts`
- Modify: `test/codex-bootstrap.test.ts`

- [ ] **Step 1: Verify existing bootstrap tests pass**

Run: `npx vitest run test/codex-bootstrap.test.ts`
Expected: ALL PASS

- [ ] **Step 2: Refactor runCodexBootstrap to split artifacts**

In `runCodexBootstrap` (around line 455), restructure the artifact flow:

```typescript
// Build agent artifacts (for materialize)
const agentArtifacts = input.buildCodexArtifacts(loaded.config).agents;

// Build scaffold files (plugin manifest, marketplace, skills, starter config)
const bootstrapFiles = buildCodexBootstrapFiles({
  config: loaded.config,
  configPath: resolvedConfigPath,
  // ...
});

// Separate skills from other scaffold files for atomic writing
const skillFiles = bootstrapFiles.files.filter(f => f.path.endsWith("SKILL.md"));
const otherScaffoldFiles = bootstrapFiles.files.filter(f => !f.path.endsWith("SKILL.md"));

// 1. Materialize agent artifacts only (not skills)
const materializeResult = await materializeArtifacts(cwd, agentArtifacts, {
  readFile: deps.readFile,
  writeFile: deps.writeFile,
  unlink: deps.unlink,
  mkdir: deps.mkdir,
  readdir: deps.readdir,
  rmdir: deps.rmdir,
});

// 2. Write scaffold files atomically
for (const file of otherScaffoldFiles) {
  const fullPath = path.join(cwd, file.path);
  await deps.mkdir(path.dirname(fullPath), { recursive: true });
  const tmpPath = fullPath + ".tmp";
  await deps.writeFile(tmpPath, file.content);
  await deps.rename(tmpPath, fullPath);
}

// 3. Write skill files atomically
for (const file of skillFiles) {
  const fullPath = path.join(cwd, file.path);
  await deps.mkdir(path.dirname(fullPath), { recursive: true });
  const tmpPath = fullPath + ".tmp";
  await deps.writeFile(tmpPath, file.content);
  await deps.rename(tmpPath, fullPath);
}
```

Remove the `toGeneratedArtifact` conversion that was passing skills to `materializeArtifacts`.

- [ ] **Step 3: Add test for single-write behavior**

Add to `test/codex-bootstrap.test.ts`:

```typescript
it("writes each skill file exactly once", async () => {
  const writtenPaths: string[] = [];
  const deps = createMockDeps({
    writeFile: async (p: string, _content: string) => {
      writtenPaths.push(p);
    },
  });

  await runCodexBootstrap({ /* ... setup ... */ });

  // Each skill path should appear exactly once
  const skillPaths = writtenPaths.filter(p => p.includes("SKILL.md"));
  const uniqueSkillPaths = new Set(skillPaths);
  expect(skillPaths.length).toBe(uniqueSkillPaths.size);
});
```

- [ ] **Step 4: Run bootstrap tests**

Run: `npx vitest run test/codex-bootstrap.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/codex-bootstrap.ts test/codex-bootstrap.test.ts
git commit -m "fix: eliminate Codex bootstrap double-write of skill files"
```

---

### Task 9: Full regression test run

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: ALL PASS (any pre-existing failures should be noted but not introduced by these changes)

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Commit if any cleanup needed, otherwise done**

```bash
# Only if needed
git add -A
git commit -m "chore: final cleanup for Phase 1"
```
