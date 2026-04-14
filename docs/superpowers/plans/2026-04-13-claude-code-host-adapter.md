# Claude Code Host Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude Code as a first-party thin host adapter that consumes OMS route/source/profile resolution and projects it into Claude-native artifacts without adopting `oh-my-claudecode`'s thick orchestration model.

**Architecture:** Introduce a dedicated Claude host builder that renders project-scoped `.claude/skills/*/SKILL.md` wrappers from already-resolved OMS routes. Reuse the same control-plane, materialization, and explainability model as other hosts. Keep the adapter thin: project-native skills first, no CLAUDE.md takeover, no hooks-first orchestration, no persona roster.

**Tech Stack:** TypeScript, Vitest, existing OMS control plane, materializer, source-aware router, Claude Code skill file projection

---

## Scope Decomposition

This plan covers the first official Claude host slice.

It includes:

- Claude host registration
- Claude-native skill projection
- `status`, `sync`, `doctor`, and `explain` integration
- ownership and cleanup rules for `.claude/skills`

Deferred from this plan:

- plugin packaging as the primary distribution mechanism
- hook-driven runtime orchestration
- CLAUDE.md generation or takeover
- a Claude-specific persona or team-agent system

## File Structure

### Claude host renderer

- Create: `src/claude.ts`
  - render Claude Code skills from resolved routes

### CLI and materialization

- Modify: `src/cli.ts`
  - register `claude` as a host for sync/status/doctor/explain
- Modify: `src/materialize.ts`
  - detect and safely clean OMS-owned Claude skill directories

### Shared exports and config-facing host types

- Modify: `src/index.ts`
  - export Claude host helpers

### Docs

- Modify: `README.md`
- Modify: `README.zh-CN.md`
  - add Claude Code to the host matrix and explain the thin-adapter boundary

### Tests

- Create: `test/claude.test.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/materialize.test.ts`
- Modify: `test/index.test.ts`

## Execution Notes

- Use project-scoped `.claude/skills/<skill-name>/SKILL.md` as the default projection target.
- Keep host entrypoints aligned to canonical routes, not persona names.
- Reuse resolved source metadata so the same Claude wrapper can target `superpowers`, `direct`, or `gstack` later.
- Do not add hook or CLAUDE.md side effects in this plan.

### Task 1: Claude Skill Renderer

**Files:**
- Create: `src/claude.ts`
- Modify: `src/index.ts`
- Create: `test/claude.test.ts`
- Modify: `test/index.test.ts`

- [ ] **Step 1: Write the failing Claude renderer tests**

Create `test/claude.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { buildClaudeArtifacts, renderClaudeSkillFile } from "../src/claude.js"

describe("renderClaudeSkillFile", () => {
  it("renders a Claude-native SKILL.md wrapper with source-aware instructions", () => {
    const output = renderClaudeSkillFile({
      skillName: "oms-plan",
      description: "OMS planning skill",
      model: "claude-sonnet-4-5",
      canonicalRoute: "phase.plan",
      source: "superpowers",
      sourceEntry: "writing-plans",
    })

    expect(output).toContain("name: oms-plan")
    expect(output).toContain("model: claude-sonnet-4-5")
    expect(output).toContain("phase.plan")
    expect(output).toContain("writing-plans")
  })
})

describe("buildClaudeArtifacts", () => {
  it("materializes one Claude skill per canonical phase route", () => {
    const artifacts = buildClaudeArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "build",
    } as never)

    expect(artifacts.skills.map((item) => item.directory)).toContain(".claude/skills/oms-plan")
    expect(artifacts.skills.map((item) => item.fileName)).toContain("SKILL.md")
  })
})
```

Add to `test/index.test.ts`:

```ts
expect(library.buildClaudeArtifacts).toBeDefined()
expect(library.renderClaudeSkillFile).toBeDefined()
```

- [ ] **Step 2: Run the focused Claude/index tests and verify failure**

Run: `npm test -- --run test/claude.test.ts test/index.test.ts`

Expected: FAIL because `src/claude.ts` and the Claude exports do not exist yet.

- [ ] **Step 3: Implement the Claude skill renderer**

Create `src/claude.ts` with helpers shaped like:

```ts
export type ClaudeArtifact = {
  kind: "skill"
  directory: string
  fileName: "SKILL.md"
  ownerPrefix: string
  content: string
}

export function renderClaudeSkillFile(input: {
  skillName: string
  description: string
  model: string
  canonicalRoute: string
  source: string
  sourceEntry: string
}) {
  return [
    "---",
    `name: ${input.skillName}`,
    `description: '${input.description}'`,
    `model: ${input.model}`,
    "---",
    "",
    "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
    `<!-- oms-route: stage=3; host=claude; source=${input.source}; route=${input.canonicalRoute}; projection=skill; rendered-name=${input.skillName} -->`,
    "",
    `Use the ${input.source} workflow entry \`${input.sourceEntry}\` for this route whenever it is relevant.`,
    "",
  ].join("\n")
}
```

Also export the new Claude helpers from `src/index.ts`.

- [ ] **Step 4: Run the focused Claude/index tests and verify they pass**

Run: `npm test -- --run test/claude.test.ts test/index.test.ts`

Expected: PASS for the new Claude renderer tests and the existing index exports suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/claude.ts src/index.ts test/claude.test.ts test/index.test.ts
git commit -m "feat: add claude skill renderer"
```

### Task 2: Claude CLI, Explainability, and Ownership Cleanup

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/materialize.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/materialize.test.ts`

- [ ] **Step 1: Write the failing Claude CLI and cleanup tests**

Add to `test/materialize.test.ts`:

```ts
it("cleans OMS-owned Claude skills by source-aware marker", async () => {
  const content = [
    "---",
    "name: oms-plan",
    "description: Generated OMS Claude skill",
    "---",
    "",
    "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
    "<!-- oms-route: stage=3; host=claude; source=superpowers; route=phase.plan; projection=skill; rendered-name=oms-plan -->",
    "",
  ].join("\n")

  const { fs, removedPaths } = createMemoryFs({
    "/workspace/.claude/skills/oms-plan/SKILL.md": content,
  })

  await materializeArtifacts({ cwd: "/workspace", artifacts: [], fs })
  expect(removedPaths).toContain("/workspace/.claude/skills/oms-plan/SKILL.md")
})
```

Add to `test/cli.test.ts`:

```ts
it("supports claude explain output", async () => {
  const result = await runCli(["explain", "--host", "claude", "--phase", "writing-plans"], createCliDeps({
    buildClaudeArtifacts: buildClaudeArtifacts,
  }))

  expect(result.stdout).toContain("Host: claude")
  expect(result.stdout).toContain("Canonical Route: phase.plan")
})
```

- [ ] **Step 2: Run the focused Claude CLI/materialize tests and verify failure**

Run: `npm test -- --run test/cli.test.ts test/materialize.test.ts`

Expected: FAIL because `claude` is not yet a registered host and the materializer does not scan `.claude/skills`.

- [ ] **Step 3: Implement Claude host registration and cleanup rules**

Update `src/cli.ts` to accept `claude` anywhere host selection is validated, and add a dedicated `buildClaudeArtifacts` dependency branch:

```ts
if (host === "claude") {
  return deps.buildClaudeArtifacts(config).skills
}
```

Extend `OWNED_ARTIFACT_RULES` and ownership parsing in `src/materialize.ts` so `.claude/skills/*/SKILL.md` files with the `oms-route` marker are recognized as OMS-owned Claude artifacts.

- [ ] **Step 4: Run the focused Claude CLI/materialize tests and verify they pass**

Run: `npm test -- --run test/cli.test.ts test/materialize.test.ts`

Expected: PASS for the new Claude host and cleanup tests and the existing suites.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/cli.ts src/materialize.ts test/cli.test.ts test/materialize.test.ts
git commit -m "feat: add claude host control plane support"
```

### Task 3: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Test: full repository verification

- [ ] **Step 1: Update the host support docs**

Add Claude Code to the support tables and architecture docs with wording like:

```md
- Claude Code is supported as a thin host adapter via project-scoped `.claude/skills/*/SKILL.md` wrappers.
- OMS does not use Claude hooks, CLAUDE.md takeover, or persona rosters as the default Claude integration model.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS with the new Claude tests included.

- [ ] **Step 3: Run type checking and build**

Run: `npm run check && npm run build`

Expected: PASS for both commands.

- [ ] **Step 4: Commit Task 3**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add claude host support notes"
```
