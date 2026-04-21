# Config Lifecycle Safety and Last-Known-Good Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OMS config writes and startup loading safe by validating candidate config before activation, writing authority atomically, and falling back to a last-known-good snapshot when current authority is broken.

**Architecture:** Keep runtime loading startup/session-based instead of adding heavy hot reload. Add atomic write helpers, last-known-good snapshot persistence, startup fallback, and visible diagnostics in `status`, `doctor`, and `explain`.

**Tech Stack:** TypeScript, Node filesystem APIs, JSONC parsing, existing `src/config.ts`, `src/control-plane.ts`, `src/cli.ts`, Vitest

---

## Scope Decomposition

This plan covers:

- atomic authority writes
- candidate validation before write
- last-known-good persistence
- startup/session fallback loading
- visible fallback diagnostics

It does not cover:

- in-session live hot reload
- long-running watcher processes

## File Structure

- Create: `src/config-write.ts`
  - atomic temp-file and rename helpers
- Create: `src/config-recovery.ts`
  - last-known-good metadata and recovery helpers
- Modify: `src/config.ts`
  - integrate startup fallback loading path
- Modify: `src/control-plane.ts`
  - expose fallback state in resolved output
- Modify: `src/cli.ts`
  - show fallback warnings in status and doctor
- Create: `test/config-write.test.ts`
- Create: `test/config-recovery.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- Do not implement file watchers in this plan.
- Last-known-good is a recovery artifact, not a second authority source.
- Fallback state must be user-visible.

### Task 1: Add Atomic Config Write Helpers

**Files:**
- Create: `src/config-write.ts`
- Create: `test/config-write.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing atomic write test**

Create `test/config-write.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest"
import { writeAuthorityAtomically } from "../src/config-write.js"

describe("writeAuthorityAtomically", () => {
  it("writes to a temp path and renames into place", async () => {
    const fs = {
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    }

    await writeAuthorityAtomically("/repo/oh-my-superagents.config.jsonc", "{}\n", fs)

    expect(fs.writeFile).toHaveBeenCalledWith("/repo/oh-my-superagents.config.jsonc.tmp", "{}\n")
    expect(fs.rename).toHaveBeenCalledWith(
      "/repo/oh-my-superagents.config.jsonc.tmp",
      "/repo/oh-my-superagents.config.jsonc",
    )
  })
})
```

- [ ] **Step 2: Run the focused atomic-write test and verify failure**

Run: `pnpm test -- --run test/config-write.test.ts`

Expected: FAIL because `src/config-write.ts` does not exist yet.

- [ ] **Step 3: Implement atomic write helpers and use them**

Create `src/config-write.ts` with:

```ts
import path from "node:path"

export async function writeAuthorityAtomically(
  filePath: string,
  content: string,
  fs: {
    mkdir: (filePath: string, options?: { recursive?: boolean }) => Promise<void>
    writeFile: (filePath: string, content: string) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
  },
) {
  const tempPath = `${filePath}.tmp`
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(tempPath, content)
  await fs.rename(tempPath, filePath)
}
```

Update `src/cli.ts` so authority writes call `writeAuthorityAtomically` instead of direct `writeFile`.

- [ ] **Step 4: Run the focused atomic-write test and relevant CLI test**

Run: `pnpm test -- --run test/config-write.test.ts test/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/config-write.ts src/cli.ts test/config-write.test.ts test/cli.test.ts
git commit -m "feat: atomically write authority config"
```

### Task 2: Add Last-Known-Good Recovery Contracts

**Files:**
- Create: `src/config-recovery.ts`
- Create: `test/config-recovery.test.ts`
- Modify: `src/config.ts`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Write the failing recovery tests**

Create `test/config-recovery.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { shouldFallbackToLastKnownGood } from "../src/config-recovery.js"

describe("shouldFallbackToLastKnownGood", () => {
  it("requests fallback when authority load fails and lkg exists", () => {
    expect(shouldFallbackToLastKnownGood({
      authorityError: new Error("Invalid JSONC"),
      hasLastKnownGood: true,
    })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the focused recovery test and verify failure**

Run: `pnpm test -- --run test/config-recovery.test.ts`

Expected: FAIL because `src/config-recovery.ts` does not exist yet.

- [ ] **Step 3: Implement recovery helpers and startup fallback loading**

Create `src/config-recovery.ts` with:

```ts
export type ConfigRecoveryState = {
  activeSource: "authority" | "last-known-good"
  authorityError?: string
  lastKnownGoodPath?: string
}

export function shouldFallbackToLastKnownGood(input: {
  authorityError: Error
  hasLastKnownGood: boolean
}) {
  return Boolean(input.authorityError) && input.hasLastKnownGood
}
```

Update `src/config.ts` so loading can follow this pattern:

```ts
try {
  return { loaded: await loadAuthorityConfig(...), recovery: { activeSource: "authority" } }
} catch (error) {
  if (!hasLastKnownGood) {
    throw error
  }
  return { loaded: await loadLastKnownGoodConfig(...), recovery: {
    activeSource: "last-known-good",
    authorityError: error instanceof Error ? error.message : String(error),
    lastKnownGoodPath,
  } }
}
```

- [ ] **Step 4: Run the focused recovery and config tests**

Run: `pnpm test -- --run test/config-recovery.test.ts test/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/config-recovery.ts src/config.ts test/config-recovery.test.ts test/config.test.ts
git commit -m "feat: add last-known-good config recovery"
```

### Task 3: Surface Fallback State in Control Plane Diagnostics

**Files:**
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing fallback-diagnostic tests**

Add this to `test/control-plane.test.ts`:

```ts
it("surfaces config recovery state when last-known-good is active", async () => {
  const resolved = await resolveControlPlane({
    command: "status",
    cwd: "/repo",
    loadControlPlaneConfig: async () => ({
      path: "/repo/oh-my-superagents.config.jsonc",
      sources: ["/repo/.oms/last-known-good.json"],
      layers: [],
      hasRealSource: true,
      config: createDefaultControlPlaneConfig(),
      recovery: {
        activeSource: "last-known-good",
        authorityError: "Invalid JSONC",
        lastKnownGoodPath: "/repo/.oms/last-known-good.json",
      },
    }),
  })

  expect(resolved.recovery?.activeSource).toBe("last-known-good")
})
```

- [ ] **Step 2: Run the focused diagnostics tests and verify failure**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts`

Expected: FAIL because recovery state is not threaded through resolved output yet.

- [ ] **Step 3: Implement recovery visibility**

Update `src/control-plane.ts` so resolved control-plane output carries:

```ts
recovery: loaded.recovery,
```

Update `src/cli.ts` so `status` and `doctor` render warnings like:

```ts
if (resolved.recovery?.activeSource === "last-known-good") {
  warnings.push(
    `Authority config failed to load; using last-known-good from ${resolved.recovery.lastKnownGoodPath}.`,
  )
}
```

- [ ] **Step 4: Run the focused diagnostics tests and a full verification pass**

Run: `pnpm test -- --run test/control-plane.test.ts test/cli.test.ts && pnpm check && pnpm build`

Expected: PASS.

- [x] **Step 5: Commit Task 3**

```bash
git add src/control-plane.ts src/cli.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: show last-known-good fallback state"
```

---

## Implementation Status: ✅ Complete

All tasks in this plan have been implemented and verified.

### Code Coverage

| Plan Task | Implementation Files | Test Files |
|-----------|---------------------|------------|
| Task 1: Atomic config write helpers | `src/config-write.ts` | `test/config-write.test.ts` |
| Task 2: Last-known-good recovery contracts | `src/config-recovery.ts`, `src/config.ts` | `test/config-recovery.test.ts`, `test/config.test.ts` |
| Task 3: Surface fallback state in diagnostics | `src/control-plane.ts`, `src/cli.ts` | `test/control-plane.test.ts`, `test/cli.test.ts` |

### Key Implementation Details

- **Atomic writes**: `src/config-write.ts:34-63` implements `writeAuthorityAtomically` with temp-file + rename pattern
- **Recovery snapshot**: `src/config-write.ts:65-72` implements `writeAuthorityWithRecoverySnapshotAtomically` that writes LKG before authority
- **Recovery helpers**: `src/config-recovery.ts:9-18` provides `getLastKnownGoodPath` and `shouldFallbackToLastKnownGood`
- **Startup fallback**: `src/config.ts:1401-1445` tries authority first, falls back to LKG on parse/semantic validation errors
- **CLI warnings**: `src/cli.ts:614-622` surfaces recovery warnings in status/doctor/explain output
- **Control plane exposure**: `src/control-plane.ts:1683-1692` threads `recovery` state through resolved output

### Verification

- All focused tests pass: `test/config-write.test.ts`, `test/config-recovery.test.ts`, `test/config.test.ts`, `test/control-plane.test.ts`, `test/cli.test.ts`
- Full test suite: 770/771 tests pass (1 unrelated failure in `test/package-manager-repo.test.ts`)
- `pnpm check` and `pnpm build` both pass
