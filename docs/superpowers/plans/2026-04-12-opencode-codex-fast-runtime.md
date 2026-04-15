# OpenCode CodexFast Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete staged OpenCode support for `codexFast` by generating sync-managed runtime metadata and using the OpenCode plugin `chat.params` hook to apply Codex-fast runtime options for agents whose resolved profiles enable `codexFast`.

**Architecture:** Keep the public config simple (`codexFast: true`) and implement the runtime behavior entirely in the OpenCode adapter/plugin layer. `sync --host opencode` should generate a small runtime metadata artifact keyed by OpenCode agent name. The OpenCode plugin should load that metadata and, when `chat.params` runs for an agent with `codexFast: true`, patch the outgoing provider options. The decision remains route/profile-driven; no provider auto-detection or user-exposed request patch config is added.

**Tech Stack:** TypeScript, Vitest, OpenCode plugin API (`chat.params`), existing artifact materialization, JSON metadata

---

## Scope Decomposition

This plan covers only the first OpenCode `codexFast` runtime slice:

- sync-generated OpenCode runtime metadata
- plugin `chat.params` patching
- diagnostics and docs updates

Deferred from this plan:

- Qwen fast runtime
- generic fast abstraction
- user-exposed host-specific patch config
- non-OpenCode runtime support

## File Structure

### OpenCode artifact generation

- Modify: `src/opencode.ts`
  - generate a sync-managed runtime metadata artifact for OpenCode agents

### Artifact materialization

- Modify: `src/materialize.ts`
  - ensure the runtime metadata file is owned and cleaned up correctly across sync changes

### OpenCode plugin runtime

- Modify: `src/plugin.ts`
  - add `chat.params` hook
  - load/read runtime metadata
  - patch outgoing options when `codexFast` is enabled for the current agent

### Diagnostics / CLI

- Modify: `src/cli.ts`
  - expose runtime metadata visibility in `doctor` / status where useful

### Tests

- Modify: `test/opencode.test.ts`
- Modify: `test/materialize.test.ts`
- Modify: `test/plugin.test.ts`
- Modify: `test/cli.test.ts`

### Documentation

- Modify: `README.md`
- Modify: `README.zh-CN.md`

## Execution Notes

- Keep the user-facing config as `codexFast: true` only.
- Do not expose low-level request patch configuration.
- Keep the runtime patch adapter-owned.
- The first slice should use a fixed internal patch shape; do not add a configuration DSL.
- Do not block startup if runtime metadata is missing or unreadable; degrade cleanly.

### Task 1: Sync-Generated OpenCode CodexFast Metadata

**Files:**
- Modify: `src/opencode.ts`
- Modify: `test/opencode.test.ts`

- [ ] **Step 1: Write the failing OpenCode metadata tests**

Add tests in `test/opencode.test.ts`:

```ts
it("generates an OpenCode runtime metadata artifact for codexFast-enabled agents", () => {
  const artifacts = buildArtifacts({
    workflow: { kind: "superpowers" },
    profiles: {
      build: { model: "gpt-5.4", codexFast: true },
    },
    routes: {},
    defaultRoute: "build",
  } as never)

  const runtimeFile = artifacts.commands.find((item) => item.fileName === "runtime-agent-metadata.json")
  expect(runtimeFile).toBeDefined()
  expect(runtimeFile?.directory).toBe(".opencode/oh-my-superagents")
  expect(runtimeFile?.content).toContain('"spr-build"')
  expect(runtimeFile?.content).toContain('"codexFast": true')
})

it("includes codexFast false/absent agents in the runtime metadata without enabling them", () => {
  const artifacts = buildArtifacts({
    workflow: { kind: "superpowers" },
    profiles: {
      strategy: { model: "openai/gpt-5" },
      build: { model: "gpt-5.4", codexFast: true },
    },
    routes: { brainstorming: "strategy" },
    defaultRoute: "build",
  } as never)

  const runtimeFile = artifacts.commands.find((item) => item.fileName === "runtime-agent-metadata.json")
  expect(runtimeFile?.content).toContain('"spr-strategy"')
  expect(runtimeFile?.content).toContain('"codexFast": false')
})
```

- [ ] **Step 2: Run the focused OpenCode tests and verify failure**

Run: `pnpm test -- --run test/opencode.test.ts`

Expected: FAIL because no runtime metadata artifact exists yet.

- [ ] **Step 3: Implement runtime metadata generation**

In `src/opencode.ts`, add a fixed support artifact in a dedicated directory such as:

- directory: `.opencode/oh-my-superagents`
- file: `runtime-agent-metadata.json`

The file should map each generated agent name to:

```jsonc
{
  "profile": "backend-build",
  "codexFast": true
}
```

Use a distinct owner prefix for the runtime metadata file so cleanup works independently of `sp-*` / `spr-*`.

- [ ] **Step 4: Run the focused OpenCode tests and verify they pass**

Run: `pnpm test -- --run test/opencode.test.ts`

Expected: PASS for the new metadata tests and existing OpenCode coverage.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/opencode.ts test/opencode.test.ts
git commit -m "feat: add OpenCode codexFast metadata"
```

### Task 2: Runtime Metadata Ownership and Cleanup

**Files:**
- Modify: `src/materialize.ts`
- Modify: `test/materialize.test.ts`

- [ ] **Step 1: Write the failing materialization tests**

Add tests in `test/materialize.test.ts`:

```ts
it("writes and later cleans stale OpenCode runtime metadata artifacts", async () => {
  const { fs, removedPaths } = createMemoryFs({
    "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json": "{\"agents\":{}}",
  })

  const result = await materializeArtifacts({
    cwd: "/workspace/project",
    artifacts: [],
    fs,
  })

  expect(result.removed).toContain("/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json")
  expect(removedPaths).toContain("/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json")
})
```

- [ ] **Step 2: Run the focused materialization tests and verify failure**

Run: `pnpm test -- --run test/materialize.test.ts`

Expected: FAIL because the runtime metadata file is not treated as OMS-owned yet.

- [ ] **Step 3: Implement metadata ownership handling**

Update `src/materialize.ts` so the fixed runtime metadata path is recognized as OMS-owned and cleaned up when missing from the current artifact set.

Keep the logic narrow and OpenCode-specific.

- [ ] **Step 4: Run the focused materialization tests and verify they pass**

Run: `pnpm test -- --run test/materialize.test.ts`

Expected: PASS for the new runtime metadata cleanup test and existing materialization coverage.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/materialize.ts test/materialize.test.ts
git commit -m "feat: manage OpenCode codexFast metadata files"
```

### Task 3: OpenCode Plugin `chat.params` Patching

**Files:**
- Modify: `src/plugin.ts`
- Modify: `test/plugin.test.ts`

- [ ] **Step 1: Write the failing plugin tests for codexFast patching**

Add tests in `test/plugin.test.ts`:

```ts
it("patches chat params when the current OpenCode agent has codexFast enabled", async () => {
  const hooks = await OhMySuperpowersPlugin(createPluginInput([]))
  const output = {
    temperature: 0,
    topP: 1,
    topK: 40,
    maxOutputTokens: undefined,
    options: {},
  }

  await hooks["chat.params"]?.({
    sessionID: "s1",
    agent: "spr-build",
    model: {} as never,
    provider: { source: "config", info: {} as never, options: {} },
    message: {} as never,
  }, output)

  expect(output.options.serviceTier).toBe("fast")
})

it("does not patch chat params when the current agent is not codexFast-enabled", async () => {
  const hooks = await OhMySuperpowersPlugin(createPluginInput([]))
  const output = {
    temperature: 0,
    topP: 1,
    topK: 40,
    maxOutputTokens: undefined,
    options: {},
  }

  await hooks["chat.params"]?.({
    sessionID: "s1",
    agent: "spr-strategy",
    model: {} as never,
    provider: { source: "config", info: {} as never, options: {} },
    message: {} as never,
  }, output)

  expect(output.options.serviceTier).toBeUndefined()
})
```

- [ ] **Step 2: Run the focused plugin tests and verify failure**

Run: `pnpm test -- --run test/plugin.test.ts`

Expected: FAIL because the plugin does not yet expose `chat.params` runtime behavior.

- [ ] **Step 3: Implement plugin runtime patching**

In `src/plugin.ts`:

- add a small helper to read and parse the runtime metadata file from `.opencode/oh-my-superagents/runtime-agent-metadata.json`
- return a `chat.params` hook from `OhMySuperpowersPlugin`
- if the current agent metadata says `codexFast: true`, set:

```ts
output.options.serviceTier = "fast"
```

- if metadata is missing or unreadable, do nothing and do not fail startup

- [ ] **Step 4: Run the focused plugin tests and verify they pass**

Run: `pnpm test -- --run test/plugin.test.ts`

Expected: PASS for the new codexFast patching tests and existing plugin coverage.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/plugin.ts test/plugin.test.ts
git commit -m "feat: patch OpenCode chat params for codexFast"
```

### Task 4: Diagnostics, Support Matrix, and Full Verification

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing diagnostics/doc expectation**

Add a CLI regression test such as:

```ts
it("shows codexFast runtime metadata diagnostics on OpenCode doctor", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], createCliDeps())
  const output = JSON.parse(result.stdout)

  expect(output.codexFastRuntime.manifestPath).toContain("runtime-agent-metadata.json")
})
```

Before editing docs, verify the README still marks OpenCode `codexFast` as staged/partial.

- [ ] **Step 2: Implement diagnostics and update docs**

In `src/cli.ts`, add a small OpenCode-only `codexFastRuntime` block to `doctor` or `status` with:

- manifest path
- whether codexFast-enabled agents exist in the current resolved selection

Update both READMEs to move OpenCode `codexFast` from staged/partial to full.

- [ ] **Step 3: Verify docs and diagnostics landed**

Run:

- `pnpm test -- --run test/cli.test.ts`
- `rg -n "codexFast|OpenCode: full|OpenCode：完整|runtime metadata" README.md README.zh-CN.md`

Expected: diagnostics tests pass and docs show the new support level.

- [ ] **Step 4: Run full verification**

Run: `pnpm test && pnpm check && pnpm build`

Expected: PASS for the full suite, type check, and build.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/cli.ts test/cli.test.ts README.md README.zh-CN.md
git commit -m "docs: mark OpenCode codexFast runtime complete"
```

## Self-Review Notes

- Spec coverage:
  - runtime metadata generation, plugin patching, diagnostics, and support-matrix updates are all covered.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses `runtime-agent-metadata.json`, `codexFast`, `serviceTier`, and OpenCode-only runtime patching semantics.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-opencode-codex-fast-runtime.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user has already requested subagent-driven TDD execution, so proceed with Option 1 unless they explicitly redirect.
