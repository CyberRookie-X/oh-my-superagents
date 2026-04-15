# Oh My Superpowers Compatibility Monitor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-aware `superpowers` compatibility monitor that detects upstream installation refs for OpenCode and Codex, evaluates them against a local compatibility matrix, and surfaces `compatible / untested / incompatible / not_detected` through `sync`, `explain`, `bootstrap`, and OpenCode startup diagnostics with configurable `warn` or `strict` policy.

**Architecture:** Keep detection, evaluation, and policy handling separate. Add one shared compatibility module plus one detector module per supported host. Wire the CLI and OpenCode plugin entrypoint through a small integration layer so compatibility checks happen before side effects and JSON outputs remain stable except for an added top-level `compatibility` field.

**Tech Stack:** TypeScript, Node.js, Vitest, existing CLI/config/plugin code

---

## File Structure

**Create:**

- `src/superpowers-compatibility.ts` - compatibility matrix, normalized types, evaluator, and host integration helpers
- `src/superpowers-detectors.ts` - OpenCode and Codex detection functions with host-specific path and spec parsing
- `test/superpowers-compatibility.test.ts` - evaluator and policy tests
- `test/superpowers-detectors.test.ts` - detector tests for OpenCode and Codex path/spec cases

**Modify:**

- `src/config.ts` - add `superpowersCompatibility.mode` to config schema and types
- `schemas/oh-my-superagents.schema.json` - add compatibility-mode schema for editor validation
- `src/cli.ts` - include compatibility results in `explain`, `sync`, and `bootstrap`; block writes in strict mode on `incompatible`
- `src/codex-bootstrap.ts` - accept compatibility result in bootstrap output and enforce pre-write ordering
- `src/plugin.ts` - log compatibility diagnostics on OpenCode startup
- `src/index.ts` - export compatibility helpers
- `test/config.test.ts` - config parsing tests for compatibility mode
- `test/cli.test.ts` - CLI compatibility output and strict-mode behavior
- `test/plugin.test.ts` - startup diagnostics compatibility logging tests
- `README.md` - document compatibility monitoring and policy mode

## Chunk 1: Matrix and Evaluation Core

### Task 1: Add config and evaluator tests first

**Files:**
- Modify: `test/config.test.ts`
- Create: `test/superpowers-compatibility.test.ts`

- [ ] **Step 1: Write failing config tests for `superpowersCompatibility.mode`**
  Cover:
  - default `warn` when omitted
  - explicit `strict` accepted
  - unknown mode rejected

- [ ] **Step 2: Write failing evaluator tests**
  Cover:
  - missing version -> `not_detected`
  - below minimum -> `incompatible`
  - known bad range -> `incompatible`
  - tested range -> `compatible`
  - parseable semver above tested range -> `untested`
  - `strict` blocks only on `incompatible`

- [ ] **Step 3: Run `pnpm test -- --run test/config.test.ts test/superpowers-compatibility.test.ts`**
  Expected: FAIL because the config schema and compatibility evaluator do not exist yet.

- [ ] **Step 4: Implement minimal config schema and evaluator**
  Files:
  - `src/config.ts`
  - `schemas/oh-my-superagents.schema.json`
  - `src/superpowers-compatibility.ts`

- [ ] **Step 5: Re-run `pnpm test -- --run test/config.test.ts test/superpowers-compatibility.test.ts`**
  Expected: PASS

## Chunk 2: Host Detectors

### Task 2: Add OpenCode and Codex detector tests first

**Files:**
- Create: `test/superpowers-detectors.test.ts`

- [ ] **Step 1: Write failing detector tests**
  Cover OpenCode:
  - project config wins over user config
  - user config is used when project config has no upstream plugin entry
  - semver tag extracted from git plugin spec
  - leading `v` is stripped from tags
  - prerelease tags stay parseable
  - floating branch becomes `detectedRef`
  - local file plugin spec becomes `detectedRef`
  - missing upstream plugin -> `not_detected`
  - detector read/parsing failure degrades to `not_detected`

  Cover Codex:
  - symlink target repo is preferred over fallback clone
  - semver tag on `HEAD` becomes `detectedVersion`
  - highest semver tag wins when multiple tags point at `HEAD`
  - raw commit becomes `detectedRef`
  - missing clone and symlink -> `not_detected`
  - detector repo-read failure degrades to `not_detected`

- [ ] **Step 2: Run `pnpm test -- --run test/superpowers-detectors.test.ts`**
  Expected: FAIL because detector functions do not exist yet.

- [ ] **Step 3: Implement detector module**
  Files:
  - `src/superpowers-detectors.ts`
  - `src/superpowers-compatibility.ts`

- [ ] **Step 4: Re-run `pnpm test -- --run test/superpowers-detectors.test.ts test/superpowers-compatibility.test.ts`**
  Expected: PASS

## Chunk 3: CLI Integration

### Task 3: Add compatibility-aware CLI tests first

**Files:**
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**
  Cover:
  - single-phase `explain` returns the existing object payload plus top-level `compatibility`
  - `explain --all` preserves the existing array shape and attaches `compatibility` to each item
  - `sync` in `warn` mode includes compatibility and warning text and continues
  - `sync` in `strict` mode blocks on `incompatible` before writes
  - `bootstrap` in `warn` mode includes compatibility and warning text and continues
  - `bootstrap` in `strict` mode blocks before starter config or scaffold writes
  - blocked `sync`/`bootstrap` responses have deterministic exit code and stderr text

- [ ] **Step 2: Run `pnpm test -- --run test/cli.test.ts`**
  Expected: FAIL because CLI outputs do not include compatibility and strict-mode blocking does not exist.

- [ ] **Step 3: Implement compatibility-aware CLI flow**
  Files:
  - `src/cli.ts`
  - `src/codex-bootstrap.ts`
  - `src/superpowers-compatibility.ts`

- [ ] **Step 4: Add a direct bootstrap no-side-effects test**
  Files:
  - `test/codex-bootstrap.test.ts`
  Cover:
  - strict-mode incompatible result returns before starter config, marketplace writes, or generated agents

- [ ] **Step 5: Re-run `pnpm test -- --run test/cli.test.ts test/codex-bootstrap.test.ts test/superpowers-compatibility.test.ts test/superpowers-detectors.test.ts`**
  Expected: PASS

## Chunk 4: OpenCode Startup Diagnostics

### Task 4: Add plugin startup tests first

**Files:**
- Modify: `test/plugin.test.ts`

- [ ] **Step 1: Write failing plugin tests**
  Cover:
  - missing upstream detection logs warning and continues
  - incompatible upstream detection logs error and continues
  - detector/evaluator exceptions degrade to `not_detected`, log, and continue
  - plugin startup never throws or blocks

- [ ] **Step 2: Run `pnpm test -- --run test/plugin.test.ts`**
  Expected: FAIL because plugin startup only checks router config today.

- [ ] **Step 3: Implement compatibility logging in the OpenCode plugin entrypoint**
  Files:
  - `src/plugin.ts`
  - `src/superpowers-compatibility.ts`

- [ ] **Step 4: Re-run `pnpm test -- --run test/plugin.test.ts`**
  Expected: PASS

## Chunk 5: Docs and Final Verification

### Task 5: Document and verify end-to-end

**Files:**
- Modify: `README.md`
- Modify: `src/index.ts`

- [ ] **Step 1: Document compatibility monitoring and `warn` vs `strict` policy**
- [ ] **Step 2: Export compatibility helpers from `src/index.ts`**
- [ ] **Step 3: Run `pnpm test && pnpm check && pnpm build`**
- [ ] **Step 4: Run `git diff --stat` and confirm the change stays focused on compatibility monitoring**

- [ ] **Step 5: Commit**
  ```bash
  git add .agents/superpowers/specs/2026-04-09-oh-my-superagents-compatibility-monitor-plan.md docs/superpowers/specs/2026-04-09-superpowers-compatibility-monitor-design.md README.md schemas/oh-my-superagents.schema.json src/config.ts src/cli.ts src/codex-bootstrap.ts src/plugin.ts src/index.ts src/superpowers-compatibility.ts src/superpowers-detectors.ts test/config.test.ts test/cli.test.ts test/codex-bootstrap.test.ts test/plugin.test.ts test/superpowers-compatibility.test.ts test/superpowers-detectors.test.ts
  git commit -m "feat: add superpowers compatibility monitor"
  ```

  Note: only create this commit if the user explicitly asks for it.
