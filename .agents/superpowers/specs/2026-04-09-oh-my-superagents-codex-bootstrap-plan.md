# Oh My Superpowers Codex Bootstrap Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin `bootstrap --host codex` flow that scaffolds a local Codex marketplace/plugin bundle, creates a starter config when missing, and reuses the existing Codex sync path.

**Architecture:** Keep Codex routing in the existing `sync` and `.codex/agents/*.toml` flow. Add a separate bootstrap module that writes convenience artifacts under `.agents/plugins/` and `plugins/oh-my-superagents-codex/`, plus an optional starter config. The bootstrap command then delegates to the existing Codex sync path.

**Tech Stack:** TypeScript, Node.js, Vitest, existing router/materializer code

---

## File Structure

**Create:**

- `src/codex-bootstrap.ts` - bootstrap artifact builders and starter config scaffold
- `test/codex-bootstrap.test.ts` - bootstrap artifact tests

**Modify:**

- `src/cli.ts` - add `bootstrap --host codex`
- `src/index.ts` - export bootstrap helpers
- `README.md` - document bootstrap flow
- `docs/superpowers/specs/2026-04-09-oh-my-superagents-design.md` - clarify Codex bootstrap layer

## Chunk 1: Bootstrap Artifacts

### Task 1: Write failing bootstrap tests

**Files:**
- Create: `test/codex-bootstrap.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing tests for bootstrap marketplace/plugin/config generation**
- [ ] **Step 2: Run `npm test -- test/codex-bootstrap.test.ts test/cli.test.ts` and confirm failure**
- [ ] **Step 3: Cover these expectations:**
  - repo-local marketplace JSON points to `./plugins/oh-my-superagents-codex`
  - plugin manifest points to bundled skills
  - sync skill mentions `oh-my-superagents sync --host codex`
  - doctor skill mentions `oh-my-superagents explain --host codex --all`
  - starter config is created only when missing
  - `bootstrap --host codex` returns JSON including `nextSteps`
- [ ] **Step 4: Re-run the same targeted tests and confirm they pass**

### Task 2: Implement bootstrap builders

**Files:**
- Create: `src/codex-bootstrap.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement bootstrap content builders for marketplace, plugin manifest, skills, and starter config**
- [ ] **Step 2: Use explicit generated markers in scaffolded files**
- [ ] **Step 3: Export the bootstrap helpers from `src/index.ts`**
- [ ] **Step 4: Run `npm test -- test/codex-bootstrap.test.ts` and confirm pass**

## Chunk 2: CLI Flow

### Task 3: Add `bootstrap --host codex`

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests for bootstrap success and unsupported host rejection**
- [ ] **Step 2: Run `npm test -- test/cli.test.ts` and confirm failure**
- [ ] **Step 3: Implement bootstrap command flow:**
  - discover existing config path
  - create starter config if absent
  - write marketplace/plugin scaffold files
  - run the existing Codex sync path
  - return JSON summary with next steps
- [ ] **Step 4: Re-run `npm test -- test/cli.test.ts test/codex-bootstrap.test.ts` and confirm pass**

## Chunk 3: Docs And Verification

### Task 4: Document the bootstrap layer and verify end-to-end

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-09-oh-my-superagents-design.md`

- [ ] **Step 1: Document `bootstrap --host codex` in README**
- [ ] **Step 2: Clarify in the design doc that Codex now has a convenience bootstrap layer on top of the existing routing core**
- [ ] **Step 3: Run `npm test && npm run check && npm run build`**
- [ ] **Step 4: Inspect `git diff --stat` and confirm only Codex bootstrap files changed**

- [ ] **Step 5: Commit**
  ```bash
  git add .agents/superpowers/specs/2026-04-09-oh-my-superagents-codex-bootstrap-plan.md docs/superpowers/specs/2026-04-09-codex-bootstrap-layer.md README.md docs/superpowers/specs/2026-04-09-oh-my-superagents-design.md src/cli.ts src/codex-bootstrap.ts src/index.ts test/cli.test.ts test/codex-bootstrap.test.ts
  git commit -m "feat: add codex bootstrap layer"
  ```

  Note: only create this commit if the user explicitly asks for it.
