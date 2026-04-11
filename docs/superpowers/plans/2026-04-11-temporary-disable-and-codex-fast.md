# Temporary Disable Helper and Codex Fast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-local temporary-disable helper for OpenCode and Codex, and add a simple profile-level `codexFast: true` configuration with Codex full support and OpenCode staged support.

**Architecture:** Keep the temporary disable helper outside the shared control-plane command model and implement it as host-native auxiliary artifacts: an OpenCode helper command and a Codex bootstrap skill. Add `codexFast` as a profile-level boolean in the shared config/router core, then map it to native Codex fast behavior while keeping `effort` independent and documenting OpenCode as staged support.

**Tech Stack:** TypeScript, Vitest, jsonc-parser, Zod, JSON Schema, OpenCode generated artifacts, Codex bootstrap/plugin files

---

## File Structure

### Shared config and routing core

- `src/config.ts`
  - extend profile schema with `codexFast?: boolean`
  - keep public config shape minimal and explicit
- `src/router.ts`
  - thread `codexFast` through resolved route selections without changing phase routing semantics
- `schemas/oh-my-superagents.schema.json`
  - reflect the new public schema contract

### OpenCode helper artifact surface

- `src/opencode.ts`
  - add a fixed auxiliary helper command for temporary disable prompt injection

### Codex bootstrap and native fast surface

- `src/codex-bootstrap.ts`
  - add a fixed auxiliary Codex helper skill for temporary disable prompt injection
  - update starter config to prefer the new explicit `codexFast` configuration style
- `src/codex.ts`
  - map `codexFast` to native Codex fast behavior while keeping `effort` independent

### Documentation

- `README.md`
- `README.zh-CN.md`

### Tests

- `test/opencode.test.ts`
- `test/codex-bootstrap.test.ts`
- `test/config.test.ts`
- `test/router.test.ts`
- `test/codex.test.ts`

## Execution Notes

- Preserve the current control-plane key set; do not add a new logical command key for the helper.
- Use fixed helper artifact names instead of exposing new command/skill configuration for this first slice.
- Treat `codexFast` as a public boolean, but preserve existing Codex `effort: "fast"` behavior for backward compatibility.
- Update the README support matrix to make host differences explicit rather than forcing identical behavior.

### Task 1: OpenCode Temporary Disable Helper Command

**Files:**
- Modify: `src/opencode.ts`
- Test: `test/opencode.test.ts`

- [ ] **Step 1: Write the failing OpenCode helper-artifact tests**

Add tests in `test/opencode.test.ts`:

```ts
it("renders a fixed OpenCode helper command for temporarily disabling superpowers", () => {
  const artifacts = buildArtifactsWithControlPlane(createRouterConfig(), createDefaultControlPlaneConfig().settings)

  const helper = artifacts.commands.find((item) => item.fileName === "oms-no-superpowers.md")
  expect(helper).toBeDefined()
  expect(helper?.content).toContain("do not use superpowers in this conversation")
  expect(helper?.content).toContain("Only use superpowers again if I explicitly ask")
})

it("keeps the temporary-disable helper outside the configurable control-plane command set", () => {
  const defaults = createDefaultControlPlaneConfig().settings
  const artifacts = buildArtifactsWithControlPlane(createRouterConfig(), {
    ...defaults,
    commandPrefix: "team",
  })

  expect(artifacts.commands.map((item) => item.fileName)).toContain("oms-no-superpowers.md")
  expect(artifacts.commands.map((item) => item.fileName)).not.toContain("team-no-superpowers.md")
})
```

- [ ] **Step 2: Run the focused OpenCode tests and verify failure**

Run: `npm test -- --run test/opencode.test.ts`

Expected: FAIL because no auxiliary helper command is generated yet.

- [ ] **Step 3: Implement the fixed OpenCode helper command**

In `src/opencode.ts`, add a small dedicated renderer and append one extra command artifact when control-plane settings are present:

```ts
const TEMPORARY_DISABLE_COMMAND_FILE = "oms-no-superpowers.md"

function renderTemporaryDisableHelperFile() {
  return [
    "---",
    `description: ${yamlScalar("Temporarily disable superpowers for this conversation.")}`,
    "---",
    "",
    MARKER,
    "",
    "Tell the assistant:",
    "- do not use superpowers in this conversation",
    "- do not proactively load superpowers skills, workflows, or phase agents",
    "- only use superpowers again if I explicitly ask",
    "",
    "Extra instruction: $ARGUMENTS",
    "",
  ].join("\n")
}
```

Append this artifact from `buildArtifacts()` as a fixed auxiliary `.opencode/commands` file with `ownerPrefix: "oms-"`.

- [ ] **Step 4: Run the focused OpenCode tests and verify they pass**

Run: `npm test -- --run test/opencode.test.ts`

Expected: PASS for the new helper-artifact tests and the existing OpenCode suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/opencode.ts test/opencode.test.ts
git commit -m "feat: add OpenCode temporary disable helper"
```

### Task 2: Codex Temporary Disable Helper Skill

**Files:**
- Modify: `src/codex-bootstrap.ts`
- Test: `test/codex-bootstrap.test.ts`

- [ ] **Step 1: Write the failing Codex helper-skill tests**

Add tests in `test/codex-bootstrap.test.ts`:

```ts
it("adds a fixed Codex helper skill for temporarily disabling superpowers", () => {
  const result = buildCodexBootstrapFiles({
    packageVersion: "0.1.0",
    includeConfig: false,
    controlPlaneSettings: createDefaultControlPlaneConfig().settings,
  })

  const helper = result.files.find(
    (file) => file.path === "plugins/oh-my-superagents-codex/skills/oms-no-superpowers/SKILL.md",
  )

  expect(helper?.content).toContain("name: oms-no-superpowers")
  expect(helper?.content).toContain("do not use superpowers in this conversation")
  expect(helper?.content).not.toContain("oh-my-superagents disable --host codex")
})
```

- [ ] **Step 2: Run the focused Codex bootstrap tests and verify failure**

Run: `npm test -- --run test/codex-bootstrap.test.ts`

Expected: FAIL because no auxiliary helper skill exists yet.

- [ ] **Step 3: Implement the fixed Codex helper skill**

In `src/codex-bootstrap.ts`, add a small helper skill builder separate from `CONTROL_PLANE_COMMAND_KEYS`:

```ts
function buildTemporaryDisableSkill() {
  return {
    path: "plugins/oh-my-superagents-codex/skills/oms-no-superpowers/SKILL.md",
    content: `---
name: oms-no-superpowers
description: Temporarily disable superpowers for this conversation.
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
Tell the assistant:
- do not use superpowers in this conversation
- do not proactively load superpowers skills, workflows, or phase agents
- only use superpowers again if I explicitly ask

Extra instruction: $ARGUMENTS
`,
  }
}
```

Append that file in `buildCodexBootstrapFiles()` next to the generated control-plane skills.

- [ ] **Step 4: Run the focused Codex bootstrap tests and verify they pass**

Run: `npm test -- --run test/codex-bootstrap.test.ts`

Expected: PASS for the new helper-skill coverage and the existing bootstrap suite.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/codex-bootstrap.ts test/codex-bootstrap.test.ts
git commit -m "feat: add Codex temporary disable helper"
```

### Task 3: `codexFast` Public Config and Router Core

**Files:**
- Modify: `src/config.ts`
- Modify: `src/router.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Test: `test/config.test.ts`
- Test: `test/router.test.ts`

- [ ] **Step 1: Write the failing config and router tests**

Add tests in `test/config.test.ts` and `test/router.test.ts`:

```ts
it("accepts codexFast in a profile loaded from config", async () => {
  const result = await loadRouterConfig({
    cwd: "/workspace/project",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "profiles": {
        "build": { "model": "gpt-5.4", "effort": "deep", "codexFast": true }
      },
      "routes": {},
      "defaultRoute": "build"
    }`,
  })

  expect(result.config.profiles.build.codexFast).toBe(true)
})

it("keeps effort and codexFast as independent resolved route properties", () => {
  const resolved = resolvePhase({
    profiles: {
      build: { model: "gpt-5.4", effort: "deep", codexFast: true },
    },
    routes: {},
    defaultRoute: "build",
  }, "writing-plans")

  expect(resolved.selection).toMatchObject({
    model: "gpt-5.4",
    effort: "deep",
    codexFast: true,
    variant: "high",
  })
})
```

- [ ] **Step 2: Run the focused config and router tests and verify failure**

Run: `npm test -- --run test/config.test.ts test/router.test.ts`

Expected: FAIL because `codexFast` is not yet part of the schema or resolved selection.

- [ ] **Step 3: Implement the public `codexFast` profile field**

Update `src/config.ts` and the JSON schema:

```ts
const ProfileSchema = z
  .object({
    model: z.string().min(1),
    variant: z.string().min(1).optional(),
    effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
    codexFast: z.boolean().optional(),
    temperature: z.number().optional(),
  })
  .strict()
```

Thread it through `ResolvedRoute.selection` in `src/router.ts`:

```ts
selection: {
  model: profile.model,
  effort: profile.effort,
  codexFast: profile.codexFast,
  temperature: profile.temperature,
  variant: profile.variant ?? (profile.effort ? EFFORT_TO_VARIANT[profile.effort] : undefined),
}
```

- [ ] **Step 4: Run the focused config and router tests and verify they pass**

Run: `npm test -- --run test/config.test.ts test/router.test.ts`

Expected: PASS for the new config/router coverage and the existing suites.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/config.ts src/router.ts schemas/oh-my-superagents.schema.json test/config.test.ts test/router.test.ts
git commit -m "feat: add codexFast profile config"
```

### Task 4: Codex Native Fast Support and Starter Config Refresh

**Files:**
- Modify: `src/codex.ts`
- Modify: `src/codex-bootstrap.ts`
- Test: `test/codex.test.ts`
- Test: `test/codex-bootstrap.test.ts`

- [ ] **Step 1: Write the failing Codex adapter tests**

Add tests in `test/codex.test.ts`:

```ts
it("enables native Codex fast tier when codexFast is true without changing deep effort", () => {
  const artifacts = buildCodexArtifacts({
    profiles: { build: { model: "gpt-5.4", effort: "deep", codexFast: true } },
    routes: {},
    defaultRoute: "build",
  })

  const agent = artifacts.agents.find((item) => item.fileName === "oms-plan.toml")
  expect(agent?.content).toContain('model_reasoning_effort = "high"')
  expect(agent?.content).toContain('service_tier = "fast"')
})

it("preserves existing Codex fast behavior for legacy effort-fast profiles", () => {
  const artifacts = buildCodexArtifacts({
    profiles: { build: { model: "gpt-5.4", effort: "fast" } },
    routes: {},
    defaultRoute: "build",
  })

  const agent = artifacts.agents.find((item) => item.fileName === "oms-plan.toml")
  expect(agent?.content).toContain('model_reasoning_effort = "low"')
  expect(agent?.content).toContain('service_tier = "fast"')
})
```

Update `test/codex-bootstrap.test.ts` so the starter config demonstrates the new explicit style:

```ts
expect(result.content).toContain('"codexFast": true')
expect(result.content).not.toContain('"effort": "fast"')
```

- [ ] **Step 2: Run the focused Codex tests and verify failure**

Run: `npm test -- --run test/codex.test.ts test/codex-bootstrap.test.ts`

Expected: FAIL because Codex does not yet read `codexFast`, and the starter config still uses `effort: "fast"` as the only fast signal.

- [ ] **Step 3: Implement native Codex fast support with backward compatibility**

In `src/codex.ts`, change the Codex fast mapping helper so `codexFast` and `effort` are independent, while preserving old `effort: "fast"` behavior:

```ts
function getCodexEffortConfig(selection: {
  effort?: "fast" | "balanced" | "deep" | "max"
  codexFast?: boolean
}) {
  const reasoningEffort = selection.effort
    ? EFFORT_TO_CODEX[selection.effort].reasoningEffort
    : undefined

  return {
    reasoningEffort,
    serviceTier: selection.codexFast || selection.effort === "fast" ? "fast" : undefined,
  }
}
```

Update `buildStarterCodexConfig()` in `src/codex-bootstrap.ts` to use the explicit new shape:

```ts
build: {
  model: "gpt-5.3-codex-spark",
  effort: "balanced",
  codexFast: true,
}
```

- [ ] **Step 4: Run the focused Codex tests and verify they pass**

Run: `npm test -- --run test/codex.test.ts test/codex-bootstrap.test.ts`

Expected: PASS for the new Codex fast behavior and starter-config coverage.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/codex.ts src/codex-bootstrap.ts test/codex.test.ts test/codex-bootstrap.test.ts
git commit -m "feat: add native Codex codexFast support"
```

### Task 5: Support Matrix and Config Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing documentation diff expectation**

Before editing, confirm the new docs targets are absent:

Run: `rg -n "Temporary disable helper|codexFast" README.md README.zh-CN.md`

Expected: no current support-matrix rows or config notes for these features.

- [ ] **Step 2: Update the support matrix and configuration docs**

In `README.md`, add support rows near the existing support matrix:

```md
| Temporary disable helper | Full | Full | None yet | Not planned |
| codexFast | Partial | Full | None yet | Not planned |
```

Add a short note below the matrix:

```md
- `codexFast` is currently full on Codex and staged on OpenCode.
- The temporary disable helper is a host-local conversation helper and does not change persistent OMS state.
```

Add a config example note near the profile example:

```jsonc
"build": {
  "model": "gpt-5.3-codex-spark",
  "effort": "balanced",
  "codexFast": true
}
```

Mirror the same additions in `README.zh-CN.md`.

- [ ] **Step 3: Verify the documentation update landed**

Run: `rg -n "Temporary disable helper|临时禁用|codexFast" README.md README.zh-CN.md`

Expected: matches in both README files for the new support-matrix rows and config notes.

- [ ] **Step 4: Run final verification**

Run: `npm test && npm run check && npm run build`

Expected: PASS for the full test suite, TypeScript check, and build.

- [ ] **Step 5: Commit Task 5**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add helper and codexFast support notes"
```

## Self-Review Notes

- Spec coverage:
  - Temporary disable helper is covered by Tasks 1 and 2.
  - `codexFast` public config and independent semantics are covered by Tasks 3 and 4.
  - Host support differences and README matrix updates are covered by Task 5.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses the public field name `codexFast`, fixed helper name `oms-no-superpowers`, and preserves `effort` as a separate dimension.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-11-temporary-disable-and-codex-fast.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user already requested subagent-driven TDD execution earlier in this session, so proceed with Option 1 unless they explicitly want to change it.
