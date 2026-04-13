# Direct Mode Codex and Qwen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend direct mode beyond OpenCode by adding host-native direct-mode artifact generation and supported CLI surfaces for Codex and Qwen while reusing the existing generic routing core.

**Architecture:** Keep the shared direct-mode contract the same across hosts: user-defined intents form the route catalog, each host gets one command/entry surface per intent, and no upstream `superpowers` skill handoff is required. Codex will use direct-mode agent TOML files plus bootstrap skill entries; Qwen will use direct-mode project-local `.qwen/agents` and `.qwen/commands` files. CLI support should stay thin and host-aware, without reintroducing roleplay-heavy agents or workflow-specific hacks.

**Tech Stack:** TypeScript, Vitest, Codex bootstrap/plugin generation, Qwen artifact generation, generic routing core, CLI

---

## Scope Decomposition

This plan covers only the first direct-mode host-expansion slice:

- Codex direct-mode artifact generation and bootstrap entries
- Qwen direct-mode artifact generation
- direct-mode CLI support on Codex and Qwen for supported surfaces
- docs/support-matrix updates

Deferred from this plan:

- advanced host-specific UX beyond the basic direct-mode entry surfaces
- direct-mode runtime features beyond sync/status/doctor/explain-intent
- generic bootstrap abstraction across all hosts

## File Structure

### Codex direct-mode support

- Modify: `src/codex.ts`
  - render direct-mode agent files for intents
  - add direct-mode explain helpers
- Modify: `src/codex-bootstrap.ts`
  - generate direct-mode bootstrap skills/entries for intents
- Tests:
  - `test/codex.test.ts`
  - `test/codex-bootstrap.test.ts`

### Qwen direct-mode support

- Modify: `src/qwen.ts`
  - render direct-mode `.qwen/agents/*.md` and `.qwen/commands/*.md`
  - skip upstream skill discovery and fail-closed checks in direct mode
- Tests:
  - `test/qwen.test.ts`

### CLI support

- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

### Documentation

- Modify: `README.md`
- Modify: `README.zh-CN.md`

## Execution Notes

- Keep direct mode host-native, not identical.
- Do not reintroduce roleplay-heavy specialist prompts.
- Do not require upstream `superpowers` skills in direct mode.
- Preserve current superpowers workflow behavior unchanged.

### Task 1: Codex Direct-Mode Agents

**Files:**
- Modify: `src/codex.ts`
- Modify: `test/codex.test.ts`

- [ ] **Step 1: Write the failing Codex direct-mode artifact tests**

Add tests in `test/codex.test.ts`:

```ts
it("renders direct-mode Codex agents for workflow intents", () => {
  const artifacts = buildCodexArtifacts({
    workflow: {
      kind: "direct",
      intents: {
        plan: { label: "Plan" },
        build: { label: "Build" },
      },
    },
    profiles: {
      planner: { model: "openai/gpt-5" },
      builder: { model: "gpt-5.4" },
    },
    routes: { plan: "planner" },
    defaultRoute: "builder",
  } as never)

  expect(artifacts.agents.map((item) => item.fileName)).toEqual([
    "rt-plan.toml",
    "rt-build.toml",
  ])
})

it("does not delegate to upstream superpowers skills in direct mode", () => {
  const artifacts = buildCodexArtifacts({
    workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
    profiles: { planner: { model: "openai/gpt-5" } },
    routes: { plan: "planner" },
    defaultRoute: "planner",
  } as never)

  expect(artifacts.agents[0]?.content).not.toContain("superpowers")
})
```

- [ ] **Step 2: Run the focused Codex tests and verify failure**

Run: `npm test -- --run test/codex.test.ts`

Expected: FAIL because Codex only renders the current superpowers-mode agents.

- [ ] **Step 3: Implement direct-mode Codex agent rendering**

In `src/codex.ts`:

- branch by `workflow.kind`
- `superpowers`: preserve current behavior
- `direct`: generate one `rt-<intent>.toml` agent per intent
- direct-mode developer instructions should describe the intent, not upstream skill handoff

Keep `explainCodexPhase` behavior unchanged for `superpowers`; add or adapt a direct-mode explain helper if needed for CLI Task 3.

- [ ] **Step 4: Run the focused Codex tests and verify they pass**

Run: `npm test -- --run test/codex.test.ts`

Expected: PASS for the new direct-mode Codex tests and existing Codex coverage.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/codex.ts test/codex.test.ts
git commit -m "feat: add Codex direct mode agents"
```

### Task 2: Codex Direct-Mode Bootstrap Skills

**Files:**
- Modify: `src/codex-bootstrap.ts`
- Modify: `test/codex-bootstrap.test.ts`

- [ ] **Step 1: Write the failing Codex bootstrap tests for direct mode**

Add tests in `test/codex-bootstrap.test.ts`:

```ts
it("generates direct-mode Codex skills for intents", () => {
  const result = buildCodexBootstrapFiles({
    packageVersion: "0.1.0",
    includeConfig: false,
    routerConfig: {
      workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never,
    controlPlaneSettings: createDefaultControlPlaneConfig().settings,
  })

  expect(result.files.some((file) => file.path.includes("skills/ai-plan/SKILL.md"))).toBe(true)
})

it("does not mention upstream superpowers skills in direct-mode Codex skill prompts", () => {
  const result = buildCodexBootstrapFiles({
    packageVersion: "0.1.0",
    includeConfig: false,
    routerConfig: {
      workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never,
    controlPlaneSettings: createDefaultControlPlaneConfig().settings,
  })

  const planSkill = result.files.find((file) => file.path.includes("skills/ai-plan/SKILL.md"))
  expect(planSkill?.content).not.toContain("superpowers")
})
```

- [ ] **Step 2: Run the focused Codex bootstrap tests and verify failure**

Run: `npm test -- --run test/codex-bootstrap.test.ts`

Expected: FAIL because direct-mode bootstrap entries do not exist yet.

- [ ] **Step 3: Implement direct-mode bootstrap skill generation**

In `src/codex-bootstrap.ts`:

- branch on `routerConfig.workflow.kind`
- for direct mode, generate thin `ai-<intent>` skills under the local plugin bundle
- the skill should point users to the corresponding direct-mode Codex agent without mentioning upstream `superpowers`

- [ ] **Step 4: Run the focused Codex bootstrap tests and verify they pass**

Run: `npm test -- --run test/codex-bootstrap.test.ts`

Expected: PASS for the new direct-mode Codex bootstrap tests and existing bootstrap coverage.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/codex-bootstrap.ts test/codex-bootstrap.test.ts
git commit -m "feat: add Codex direct mode bootstrap skills"
```

### Task 3: Qwen Direct-Mode Artifacts

**Files:**
- Modify: `src/qwen.ts`
- Modify: `test/qwen.test.ts`

- [ ] **Step 1: Write the failing Qwen direct-mode tests**

Add tests in `test/qwen.test.ts`:

```ts
it("renders direct-mode Qwen agents and commands for intents", async () => {
  const artifacts = await buildQwenArtifacts({
    workflow: {
      kind: "direct",
      intents: {
        plan: { label: "Plan" },
        build: { label: "Build" },
      },
    },
    profiles: {
      planner: { model: "openai/gpt-5" },
      builder: { model: "gpt-5.4" },
    },
    routes: { plan: "planner" },
    defaultRoute: "builder",
  } as never, {
    cwd: "/workspace/project",
    homeDir: "/home/test",
    controlPlaneSettings,
  })

  expect(artifacts.commands.map((item) => item.fileName)).toEqual(expect.arrayContaining(["ai-plan.md", "ai-build.md"]))
  expect(artifacts.agents.map((item) => item.fileName)).toEqual(expect.arrayContaining(["rt-plan.md", "rt-build.md"]))
})

it("skips upstream skill discovery and fail-closed behavior in direct mode", async () => {
  await expect(
    buildQwenArtifacts({
      workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never, {
      cwd: "/workspace/project",
      homeDir: "/home/test",
      controlPlaneSettings,
      readDirectoryBasenames: async () => [],
    }),
  ).resolves.toBeDefined()
})
```

- [ ] **Step 2: Run the focused Qwen tests and verify failure**

Run: `npm test -- --run test/qwen.test.ts`

Expected: FAIL because Qwen still requires upstream skill discovery and only renders superpowers-mode artifacts.

- [ ] **Step 3: Implement direct-mode Qwen artifacts**

In `src/qwen.ts`:

- branch by `workflow.kind`
- `superpowers`: preserve current behavior
- `direct`: generate `.qwen/commands/ai-<intent>.md` and `.qwen/agents/rt-<intent>.md`
- direct-mode rendering must not require upstream skill discovery

- [ ] **Step 4: Run the focused Qwen tests and verify they pass**

Run: `npm test -- --run test/qwen.test.ts`

Expected: PASS for the new direct-mode Qwen tests and existing Qwen coverage.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/qwen.ts test/qwen.test.ts
git commit -m "feat: add Qwen direct mode artifacts"
```

### Task 4: CLI Direct-Mode Support on Codex and Qwen

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing CLI tests for Codex/Qwen direct mode**

Add tests for:

```ts
it("explains a direct workflow intent on Codex", async () => {
  const result = await runCli([
    "explain",
    "--host",
    "codex",
    "--intent",
    "plan",
  ], createDirectCliDeps({ host: "codex" }))

  const output = JSON.parse(result.stdout)
  expect(output.intent).toBe("plan")
})

it("syncs direct workflow artifacts for Qwen without requiring upstream skills", async () => {
  const result = await runCli([
    "sync",
    "--host",
    "qwen",
  ], createDirectCliDeps({ host: "qwen" }))

  expect(result.exitCode).toBe(0)
})
```

- [ ] **Step 2: Run the focused CLI tests and verify failure**

Run: `npm test -- --run test/cli.test.ts`

Expected: FAIL because direct mode is still OpenCode-only.

- [ ] **Step 3: Implement direct-mode CLI support for Codex and Qwen**

In `src/cli.ts`:

- allow direct-mode explain/sync/status/doctor on Codex and Qwen where the host implementation now exists
- keep unsupported paths fail-closed where still necessary

- [ ] **Step 4: Run the focused CLI tests and verify they pass**

Run: `npm test -- --run test/cli.test.ts`

Expected: PASS for the new direct-mode Codex/Qwen CLI tests and existing coverage.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: add direct mode cli support for Codex and Qwen"
```

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing documentation expectation**

Run: `rg -n "direct mode|OpenCode-first|Codex|Qwen" README.md README.zh-CN.md`

Expected: the current docs still understate direct mode host coverage.

- [ ] **Step 2: Update docs and support matrix**

Update both READMEs to reflect:

- direct mode support on OpenCode, Codex, and Qwen
- host-specific shapes differ
- `superpowers` remains first-party and unchanged

- [ ] **Step 3: Verify docs landed**

Run: `rg -n "direct mode|Codex|Qwen" README.md README.zh-CN.md`

Expected: both READMEs mention the new host coverage.

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run check && npm run build`

Expected: PASS for the full suite, type check, and build.

- [ ] **Step 5: Commit Task 5**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add direct mode host coverage notes"
```

## Self-Review Notes

- Spec coverage:
  - direct-mode Codex artifacts, direct-mode Qwen artifacts, CLI support, and docs are all covered.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses `ai-<intent>` as the direct-mode command surface and `rt-<intent>` as the execution surface across hosts.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-direct-mode-codex-qwen.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user has already requested subagent-driven TDD execution, so proceed with Option 1 unless they explicitly redirect.
