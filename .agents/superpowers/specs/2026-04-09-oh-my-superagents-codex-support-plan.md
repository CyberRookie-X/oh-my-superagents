# Oh My Superpowers Codex Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Codex host adapter so `oh-my-superagents` can resolve the same phase/profile config to Codex-specific generated agents and expose `sync` and `explain` for `--host codex`.

**Architecture:** Keep the existing host-neutral router core and add a Codex adapter beside the OpenCode adapter. Generate one Codex custom agent per supported superpowers phase, bind each agent to the phase's workflow instructions, map host-neutral effort to Codex `model_reasoning_effort` and `service_tier`, and reuse the materializer by making artifact directories host-driven instead of OpenCode-specific.

**Tech Stack:** TypeScript, Node.js, Vitest, existing router/materializer code

---

## File Structure

**Create:**

- `src/codex.ts` - Codex artifact generation and host-specific phase mapping
- `test/codex.test.ts` - Codex adapter tests

**Modify:**

- `src/cli.ts` - support `--host codex`
- `src/materialize.ts` - generalize artifact directories and router-owned cleanup rules
- `src/index.ts` - export Codex adapter
- `README.md` - document Codex host usage
- `docs/superpowers/specs/2026-04-09-oh-my-superagents-design.md` - note Codex as the next supported host

## Chunk 1: Codex Adapter

### Task 1: Write failing Codex adapter tests

**Files:**
- Create: `test/codex.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run `pnpm test -- --run test/codex.test.ts test/cli.test.ts` and confirm failure**
- [ ] **Step 3: Implement minimal Codex expectations in tests for:**
  - one generated agent per built-in phase
  - TOML content with `name`, `description`, `developer_instructions`, `model`
  - `fast -> low + service_tier = "fast"`
  - `deep -> high`
  - `max -> xhigh`
  - `runCli(... --host codex ...)` explain/sync support
- [ ] **Step 4: Re-run the same targeted tests and confirm they pass**

### Task 2: Implement `src/codex.ts`

**Files:**
- Create: `src/codex.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement Codex phase-to-agent mapping and effort mapping**
- [ ] **Step 2: Render Codex TOML agent files with phase-specific workflow instructions**
- [ ] **Step 3: Export Codex builder from `src/index.ts`**
- [ ] **Step 4: Run `pnpm test -- --run test/codex.test.ts` and confirm pass**

## Chunk 2: Host-Generalized Sync Path

### Task 3: Generalize artifact materialization

**Files:**
- Modify: `src/materialize.ts`
- Modify: `src/opencode.ts`
- Modify: `test/materialize.test.ts`

- [ ] **Step 1: Write/adjust failing tests for per-artifact target directories and prefix-aware cleanup**
- [ ] **Step 2: Run `pnpm test -- --run test/materialize.test.ts` and confirm failure**
- [ ] **Step 3: Refactor generated artifacts to carry target directory and ownership prefix metadata**
- [ ] **Step 4: Update materializer to use artifact-provided directories instead of hard-coded OpenCode paths**
- [ ] **Step 5: Re-run `pnpm test -- --run test/materialize.test.ts test/opencode.test.ts test/codex.test.ts` and confirm pass**

### Task 4: Extend CLI for `--host codex`

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests for `explain --host codex --all` and `sync --host codex`**
- [ ] **Step 2: Run `pnpm test -- --run test/cli.test.ts` and confirm failure**
- [ ] **Step 3: Implement host dispatch between OpenCode and Codex adapters**
- [ ] **Step 4: Re-run `pnpm test -- --run test/cli.test.ts` and confirm pass**

## Chunk 3: Docs And Full Verification

### Task 5: Update docs and verify end-to-end

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-09-oh-my-superagents-design.md`

- [ ] **Step 1: Document Codex host support and basic usage**
- [ ] **Step 2: Add a note in the design doc that Codex is now the second implemented host**
- [ ] **Step 3: Run `pnpm test && pnpm check && pnpm build`**
- [ ] **Step 4: Run `node -e "import('./dist/index.js').then(()=>console.log('library-ok'))"`**
- [ ] **Step 5: Inspect `git diff --stat` and confirm only Codex-support files changed**

- [ ] **Step 6: Commit**
  ```bash
  git add .agents/superpowers/specs/2026-04-09-oh-my-superagents-codex-support-plan.md README.md docs/superpowers/specs/2026-04-09-oh-my-superagents-design.md src/cli.ts src/codex.ts src/index.ts src/materialize.ts src/opencode.ts test/cli.test.ts test/codex.test.ts test/materialize.test.ts
  git commit -m "feat: add codex host support"
  ```

  Note: only create this commit if the user explicitly asks for it.
