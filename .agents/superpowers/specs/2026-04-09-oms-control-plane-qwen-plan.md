# OMS Control Plane and Qwen Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stage 1 OMS control-plane commands and layered multi-preset config, then implement Stage 2 Qwen Code support using the same config and command model.

**Architecture:** Stage 1 introduces a shared control-plane layer for config migration, layered config resolution, logical command keys, rendered names, aliases, and OMS enabled/disabled state. Existing OpenCode and Codex adapters then consume that model. Stage 2 adds a thin Qwen adapter that renders `.qwen/agents` and `.qwen/commands` wrappers with no heavy Qwen extension/bootstrap layer.

**Tech Stack:** TypeScript, Node.js, Vitest, existing CLI/config/materializer/host-adapter code

---

## File Structure

**Create:**
- `src/control-plane.ts`
- `src/qwen.ts`
- `test/control-plane.test.ts`
- `test/qwen.test.ts`

**Modify:**
- `src/config.ts`
- `schemas/oh-my-superagents.schema.json`
- `src/cli.ts`
- `src/opencode.ts`
- `src/codex-bootstrap.ts`
- `src/materialize.ts`
- `src/index.ts`
- `README.md`
- `test/config.test.ts`
- `test/cli.test.ts`
- `test/materialize.test.ts`
- `test/opencode.test.ts`
- `test/codex-bootstrap.test.ts`

## Task 1: Config migration and layered resolution

**Files:**
- Create: `test/control-plane.test.ts`
- Modify: `test/config.test.ts`
- Create: `src/control-plane.ts`
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`

- [ ] **Step 1: Write failing tests for legacy migration and layered reads**
  Required failing cases:
  - legacy config -> implicit `default` preset
  - mixed-shape config rejects
  - `--config` is exclusive
  - project layered config overrides global layered config
  - same-named project preset replaces whole global preset
  - same-named project command entry replaces whole global command entry
  - no-config default is available only for `status` and `doctor`
  - `sync` with no config source rejects

- [ ] **Step 2: Run `npm test -- test/config.test.ts test/control-plane.test.ts`**
  Expected: FAIL because Stage 1 config behavior does not exist.

- [ ] **Step 3: Implement minimal config resolution**
  Implement only:
  - layered read order
  - legacy migration
  - mixed-shape rejection
  - preset and command merge rules
  - first-run in-memory defaults

- [ ] **Step 4: Re-run `npm test -- test/config.test.ts test/control-plane.test.ts`**
  Expected: PASS

## Task 2: Validation rules and write-target semantics

**Files:**
- Modify: `test/control-plane.test.ts`
- Modify: `src/control-plane.ts`
- Modify: `schemas/oh-my-superagents.schema.json`

- [ ] **Step 1: Write failing tests for validation and writes**
  Required failing cases:
  - `activePreset` must exist
  - `defaultRoute` must point to a profile
  - every `routes` target must point to a profile
  - unique preset `short`
  - unique rendered command names/aliases
  - allowed character validation
  - selected write target is `--config`, else project, else global
  - non-writable selected target fails without fallback
  - legacy target rewrite writes only local migrated content plus required stateful fields

- [ ] **Step 2: Run `npm test -- test/control-plane.test.ts test/config.test.ts`**
  Expected: FAIL because validation and write-target helpers are incomplete.

- [ ] **Step 3: Implement minimal validation and write-target helpers**

- [ ] **Step 4: Re-run `npm test -- test/control-plane.test.ts test/config.test.ts`**
  Expected: PASS

## Task 3: OMS `status` and `doctor`

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`
- Modify: `src/control-plane.ts`

- [ ] **Step 1: Write failing tests for `status` and `doctor`**
  Required failing cases:
  - standalone invocation requires `--host`
  - `status` returns enabled state, active preset, presets, host, compatibility, artifacts
  - `doctor` returns command names, aliases, artifacts present/missing, compatibility

- [ ] **Step 2: Run `npm test -- test/cli.test.ts test/control-plane.test.ts`**
  Expected: FAIL because OMS read-only commands do not exist.

- [ ] **Step 3: Implement minimal `status` and `doctor` flows**

- [ ] **Step 4: Re-run `npm test -- test/cli.test.ts test/control-plane.test.ts`**
  Expected: PASS

## Task 4: OMS `use`, `disable`, and disabled `sync`

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`
- Modify: `src/control-plane.ts`

- [ ] **Step 1: Write failing tests for stateful OMS commands**
  Required failing cases:
  - standalone `use` / `disable` / `sync` require `--host`
  - `use` matches preset key first, then unique `short`
  - `use` rejects unknown preset
  - `use` writes `activePreset` and `enabled = true`
  - `disable` writes `enabled = false`
  - disabled `sync` removes OMS-owned artifacts for invoking host only
  - write happens before artifact reconciliation

- [ ] **Step 2: Run `npm test -- test/cli.test.ts test/control-plane.test.ts`**
  Expected: FAIL because stateful OMS commands do not exist.

- [ ] **Step 3: Implement minimal `use`, `disable`, and disabled `sync`**

- [ ] **Step 4: Re-run `npm test -- test/cli.test.ts test/control-plane.test.ts`**
  Expected: PASS

## Task 5: OpenCode OMS command rendering

**Files:**
- Modify: `src/opencode.ts`
- Modify: `test/opencode.test.ts`

- [ ] **Step 1: Write failing OpenCode rendering tests**
  Required failing cases:
  - one `.opencode/commands` file per rendered primary OMS command
  - one extra `.opencode/commands` file per alias
  - configured prefix respected
  - generated command delegates to OMS CLI logical command

- [ ] **Step 2: Run `npm test -- test/opencode.test.ts`**
  Expected: FAIL because OMS control-plane rendering is missing.

- [ ] **Step 3: Implement minimal OpenCode OMS rendering**

- [ ] **Step 4: Re-run `npm test -- test/opencode.test.ts`**
  Expected: PASS

## Task 6: Codex OMS control-plane rendering

**Files:**
- Modify: `src/codex-bootstrap.ts`
- Modify: `test/codex-bootstrap.test.ts`

- [ ] **Step 1: Write failing Codex tests**
  Required failing cases:
  - one skill per rendered primary name and alias
  - each skill maps to one logical command key
  - skill shells out to OMS CLI
  - marketplace preserves unrelated entries
  - malformed marketplace JSON fails before mutation
  - duplicate OMS entry normalizes to one canonical entry

- [ ] **Step 2: Run `npm test -- test/codex-bootstrap.test.ts`**
  Expected: FAIL because OMS Codex control-plane rendering is incomplete.

- [ ] **Step 3: Implement minimal Codex OMS rendering**

- [ ] **Step 4: Re-run `npm test -- test/codex-bootstrap.test.ts`**
  Expected: PASS

## Task 7: Ownership and stale artifact cleanup

**Files:**
- Modify: `src/materialize.ts`
- Modify: `test/materialize.test.ts`

- [ ] **Step 1: Write failing stale-cleanup tests**
  Required failing cases:
  - stale OpenCode OMS command files after prefix/name change are removed
  - stale Codex OMS skill files after prefix/name change are removed
  - non-OMS files are preserved
  - cleanup only touches artifacts satisfying the OMS ownership contract

- [ ] **Step 2: Run `npm test -- test/materialize.test.ts`**
  Expected: FAIL because stale OMS control-plane artifacts are not fully reconciled.

- [ ] **Step 3: Implement minimal ownership and cleanup logic**

- [ ] **Step 4: Re-run `npm test -- test/materialize.test.ts test/opencode.test.ts test/codex-bootstrap.test.ts`**
  Expected: PASS

## Task 8: Qwen wrapper-agent core

**Files:**
- Create: `test/qwen.test.ts`
- Create: `src/qwen.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing Qwen agent tests**
  Required failing cases:
  - fixed wrapper agent names
  - upstream skill discovery by basename in allowed locations
  - fail-closed behavior when required upstream skills are missing
  - route resolution uses mapped upstream skill key and `defaultRoute`
  - unsupported profile fields are ignored

- [ ] **Step 2: Run `npm test -- test/qwen.test.ts`**
  Expected: FAIL because Qwen adapter does not exist.

- [ ] **Step 3: Implement minimal Qwen wrapper-agent logic**

- [ ] **Step 4: Re-run `npm test -- test/qwen.test.ts`**
  Expected: PASS

## Task 9: Qwen command rendering and CLI integration

**Files:**
- Modify: `src/qwen.ts`
- Modify: `src/cli.ts`
- Modify: `test/qwen.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing Qwen command/CLI tests**
  Required failing cases:
  - required Qwen OMS commands generated from prefix and rendered names
  - aliases generate extra command files
  - no `.qwen/skills` output
  - `status --host qwen`
  - `doctor --host qwen`
  - `sync --host qwen`

- [ ] **Step 2: Run `npm test -- test/qwen.test.ts test/cli.test.ts`**
  Expected: FAIL because Qwen command rendering and CLI integration are missing.

- [ ] **Step 3: Implement minimal Qwen commands and CLI integration**

- [ ] **Step 4: Re-run `npm test -- test/qwen.test.ts test/cli.test.ts`**
  Expected: PASS

## Task 10: Final docs and verification

**Files:**
- Modify: `README.md`
- Modify: `src/index.ts`

- [ ] **Step 1: Update README for Stage 1 and Stage 2 only**
- [ ] **Step 2: Ensure exports are complete in `src/index.ts`**
- [ ] **Step 3: Run `npm test && npm run check && npm run build`**
  Expected: all tests pass, typecheck passes, build succeeds.
- [ ] **Step 4: Run `git diff --stat`**
  Expected: only OMS control-plane and Qwen files changed; no Kimi support and no upstream `superpowers` disable feature.
- [ ] **Step 5: Commit**
  ```bash
  git add .agents/superpowers/specs/2026-04-09-oms-control-plane-qwen-plan.md docs/superpowers/specs/2026-04-09-oms-control-plane-qwen-design.md README.md schemas/oh-my-superagents.schema.json src/cli.ts src/config.ts src/control-plane.ts src/codex-bootstrap.ts src/index.ts src/materialize.ts src/opencode.ts src/qwen.ts test/cli.test.ts test/config.test.ts test/control-plane.test.ts test/codex-bootstrap.test.ts test/materialize.test.ts test/opencode.test.ts test/qwen.test.ts
  git commit -m "feat: add OMS control plane and Qwen support"
  ```

  Note: only create this commit if the user explicitly asks for it.
