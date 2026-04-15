# OpenCode Zero-to-Working and Routing Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenCode the flagship OMS experience by improving first-run onboarding, OpenCode-facing status/diagnostics, and lightweight routing control without expanding host scope.

**Architecture:** Keep OpenCode-specific rendering thin in `src/opencode.ts` and `src/plugin.ts`, while moving state modeling, guidance, and routing reuse validation into the shared OMS core. Deliver in two slices: Phase A for Zero-to-Working onboarding and Phase B for Routing Console capabilities.

**Tech Stack:** TypeScript, Vitest, jsonc-parser, Zod, OpenCode plugin API

---

## File Structure

### Shared control-plane and CLI core

- `src/config.ts`
  - owns control-plane config schema, default config synthesis, layered merges, and future preset/profile reuse schema additions
- `src/control-plane.ts`
  - owns validated control-plane resolution, next-state writes, and should own shared state-model and reuse-resolution logic
- `src/cli.ts`
  - owns `status`, `doctor`, `use`, `sync`, and `explain` output shaping for all hosts; OpenCode flagship UX should be expressed here rather than buried in adapters

### OpenCode-specific surface

- `src/opencode.ts`
  - owns generated `.opencode/agents/*.md` and `.opencode/commands/*.md` artifacts and command ownership metadata
- `src/plugin.ts`
  - owns OpenCode startup diagnostics and should surface first-run and compatibility guidance without blocking startup

### Tests

- `test/cli.test.ts`
  - add new OpenCode `status`, `doctor`, `use`, and `explain` scenarios
- `test/plugin.test.ts`
  - add startup diagnostics scenarios for missing config, degraded artifact state, and guided next-step messages
- `test/control-plane.test.ts`
  - add reuse-resolution and validation coverage in Phase B
- `test/opencode.test.ts`
  - add command/artifact visibility helpers as needed

### Design docs already written

- `docs/superpowers/specs/2026-04-11-opencode-zero-to-working-routing-console-design.md`

## Execution Notes

- Keep commits small and phase-scoped.
- Prefer shared helpers in `src/control-plane.ts` or `src/cli.ts` over adding OpenCode-only policy to `src/opencode.ts`.
- Run focused Vitest commands while iterating, then run `pnpm test` and `pnpm check` before claiming a slice is complete.
- Parallelize only when tasks do not touch the same files.

### Task 1: Phase A State Model and CLI Status Surface

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write the failing tests for OpenCode first-run and degraded status states**

Add tests near the existing `status` coverage in `test/cli.test.ts` for these cases:

```ts
it("classifies default no-config status as first-run guidance for opencode", async () => {
  const result = await runCli([
    "status",
    "--host",
    "opencode",
  ], createCliDeps({
    resolveControlPlane: async () => ({
      source: { kind: "default", hasRealSource: false, sources: [] },
      config: controlPlaneConfig,
      activePreset: { key: "default", preset: controlPlaneConfig.presets.default },
    }),
  }))

  const output = JSON.parse(result.stdout)
  expect(output.host).toBe("opencode")
  expect(output.state.code).toBe("missing_config")
  expect(output.state.category).toBe("oms")
  expect(output.nextAction.command).toBe("oh-my-superagents sync --host opencode")
})

it("reports missing expected OpenCode artifacts as a sync-needed state", async () => {
  const result = await runCli([
    "status",
    "--host",
    "opencode",
  ], createCliDeps({
    artifactExists: async (filePath: string) => filePath.endsWith("spr-build.md"),
  }))

  const output = JSON.parse(result.stdout)
  expect(output.state.code).toBe("artifacts_out_of_sync")
  expect(output.nextAction.command).toBe("oh-my-superagents sync --host opencode")
  expect(output.artifactSummary.missing.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run the focused CLI tests and verify failure**

Run: `pnpm test -- --run test/cli.test.ts`

Expected: FAIL because `status` output does not yet include `state`, `nextAction`, or `artifactSummary`.

- [ ] **Step 3: Implement a shared OpenCode status-state model in `src/control-plane.ts` and `src/cli.ts`**

Add a small resolved-state shape in `src/control-plane.ts` and use it from `buildControlPlaneStatus` in `src/cli.ts`.
Keep the logic host-aware but shared.

Implementation target:

```ts
export type OpenCodeStatusState = {
  code:
    | "healthy"
    | "missing_config"
    | "disabled"
    | "artifacts_out_of_sync"
    | "upstream_not_detected"
    | "upstream_incompatible"
  category: "oms" | "upstream" | "host"
  reason: string
}

function buildOpenCodeNextAction(input: {
  state: OpenCodeStatusState
  commandPrefix: string
}) {
  switch (input.state.code) {
    case "missing_config":
    case "artifacts_out_of_sync":
      return {
        command: "oh-my-superagents sync --host opencode",
        reason: "Materialize the expected OMS-managed OpenCode artifacts.",
      }
    case "disabled":
      return {
        command: "oh-my-superagents use default --host opencode",
        reason: "Re-enable OMS by selecting an active preset.",
      }
    default:
      return null
  }
}
```

Update `buildControlPlaneStatus` to include:

```ts
return {
  enabled: resolved.config.settings.enabled,
  activePreset: { ... },
  source: formatControlPlaneSource(resolved),
  host,
  compatibility,
  artifacts,
  state,
  nextAction,
  artifactSummary,
}
```

- [ ] **Step 4: Run the focused CLI tests and verify they pass**

Run: `pnpm test -- --run test/cli.test.ts`

Expected: PASS for the new `status` state-model tests and the existing CLI suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/cli.ts src/control-plane.ts test/cli.test.ts
git commit -m "feat: add OpenCode status guidance states"
```

### Task 2: Phase A Doctor Output, Command Discovery, and Artifact Visibility

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/opencode.ts`
- Test: `test/cli.test.ts`
- Test: `test/opencode.test.ts`

- [ ] **Step 1: Write failing tests for richer OpenCode doctor output and command discovery**

Add tests in `test/cli.test.ts`:

```ts
it("shows rendered OpenCode OMS command discovery in doctor output", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], createCliDeps())
  const output = JSON.parse(result.stdout)

  expect(output.commands.prefix).toBe("oms")
  expect(output.commands.rendered.status).toEqual(["oms-status", "oms-st"])
  expect(output.commands.rendered.sync).toEqual(["oms-sync", "oms-sy"])
})

it("summarizes expected, present, missing, and stale OpenCode artifacts", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
    artifactExists: async (filePath: string) => !filePath.endsWith("oms-sync.md"),
  }))
  const output = JSON.parse(result.stdout)

  expect(output.artifactSummary.expected).toBeGreaterThan(0)
  expect(output.artifactSummary.missing).toContain(".opencode/commands/oms-sync.md")
})
```

Add or extend a test in `test/opencode.test.ts` for a helper that computes rendered OMS command names from command prefix and aliases.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm test -- --run test/cli.test.ts test/opencode.test.ts`

Expected: FAIL because the doctor output does not yet include rendered command discovery or artifact summaries.

- [ ] **Step 3: Implement rendered command discovery and artifact summary helpers**

In `src/opencode.ts`, add a small helper that stays rendering-oriented:

```ts
export function listRenderedOpenCodeControlPlaneCommands(settings: ControlPlaneConfig["settings"]) {
  return Object.fromEntries(
    CONTROL_PLANE_COMMAND_KEYS.map((key) => [
      key,
      [settings.commands[key].name, ...settings.commands[key].aliases].map(
        (name) => `${settings.commandPrefix}-${name}`,
      ),
    ]),
  )
}
```

In `src/cli.ts`, extend doctor output:

```ts
return {
  activePreset: { ... },
  source: formatControlPlaneSource(resolved),
  host,
  commands: {
    prefix: resolved.config.settings.commandPrefix,
    rendered: listRenderedOpenCodeControlPlaneCommands(resolved.config.settings),
  },
  compatibility,
  artifacts,
  artifactSummary,
}
```

Keep stale-artifact detection based on owned OMS markers and expected file lists already available to the CLI.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm test -- --run test/cli.test.ts test/opencode.test.ts`

Expected: PASS for the new doctor/discovery coverage and the existing test set.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/cli.ts src/opencode.ts test/cli.test.ts test/opencode.test.ts
git commit -m "feat: surface OpenCode command and artifact visibility"
```

### Task 3: Phase A OpenCode Plugin Guidance

**Files:**
- Modify: `src/plugin.ts`
- Test: `test/plugin.test.ts`

- [ ] **Step 1: Write failing plugin tests for actionable first-run guidance**

Add tests in `test/plugin.test.ts`:

```ts
it("logs explicit first-run guidance when config is missing", async () => {
  const logs: unknown[] = []
  mocks.loadRouterConfig.mockRejectedValueOnce(
    new Error("Could not find oh-my-superagents.config.jsonc"),
  )

  await OhMySuperpowersPlugin(createPluginInput(logs))

  expect(JSON.stringify(logs)).toContain("Current state: missing_config")
  expect(JSON.stringify(logs)).toContain("Next step: oh-my-superagents sync --host opencode")
})

it("logs targeted guidance when upstream is incompatible", async () => {
  const logs: unknown[] = []
  mocks.evaluateSuperpowersCompatibility.mockReturnValueOnce(
    createCompatibilityResult({
      status: "incompatible",
      detectedVersion: "4.9.0",
      reason: "Version is below minimum supported version 5.0.0.",
    }),
  )

  await OhMySuperpowersPlugin(createPluginInput(logs))

  expect(JSON.stringify(logs)).toContain("Current state: upstream_incompatible")
  expect(JSON.stringify(logs)).toContain("Next step: oh-my-superagents doctor --host opencode")
})
```

- [ ] **Step 2: Run the focused plugin tests and verify failure**

Run: `pnpm test -- --run test/plugin.test.ts`

Expected: FAIL because plugin logs do not yet include explicit state labels and next-step messages.

- [ ] **Step 3: Implement shared guidance formatting in `src/plugin.ts`**

Keep startup non-blocking, but make the logs operationally precise.

Implementation target:

```ts
function formatStartupGuidance(input: {
  state: "missing_config" | "upstream_not_detected" | "upstream_incompatible" | "healthy"
  reason: string
  nextStep?: string
}) {
  return [
    `Current state: ${input.state}`,
    `Reason: ${input.reason}`,
    ...(input.nextStep ? [`Next step: ${input.nextStep}`] : []),
  ].join(" ")
}
```

Use `warn` or `error` based on the existing severity model, but keep the messaging shape stable.

- [ ] **Step 4: Run the focused plugin tests and verify they pass**

Run: `pnpm test -- --run test/plugin.test.ts`

Expected: PASS for the new guidance tests and the existing plugin suite.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/plugin.ts test/plugin.test.ts
git commit -m "feat: improve OpenCode startup guidance"
```

### Task 4: Phase B Lightweight Preset Reuse

**Files:**
- Modify: `src/config.ts`
- Modify: `src/control-plane.ts`
- Test: `test/control-plane.test.ts`

- [ ] **Step 1: Write failing tests for explicit preset reuse resolution**

Add tests in `test/control-plane.test.ts` for a single-parent preset reuse shape:

```ts
it("resolves a preset that extends one parent preset", async () => {
  const result = await resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => true,
    readFile: async () => `{
      "settings": { "activePreset": "review" },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": {},
          "defaultRoute": "build"
        },
        "review": {
          "extends": "default",
          "label": "Review",
          "short": "rev",
          "profiles": { "review": { "model": "anthropic/claude-sonnet-4-5", "variant": "high" } },
          "routes": { "requesting-code-review": "review" },
          "defaultRoute": "review"
        }
      }
    }`,
  })

  expect(result.activePreset.key).toBe("review")
  expect(result.activePreset.preset.profiles.build.model).toBe("openai/gpt-5")
  expect(result.activePreset.preset.profiles.review.variant).toBe("high")
})

it("rejects cyclic preset reuse", async () => {
  await expect(resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => true,
    readFile: async () => `{
      "settings": { "activePreset": "default" },
      "presets": {
        "default": {
          "extends": "review",
          "label": "Default",
          "short": "def",
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": {},
          "defaultRoute": "build"
        },
        "review": {
          "extends": "default",
          "label": "Review",
          "short": "rev",
          "profiles": { "review": { "model": "anthropic/claude-sonnet-4-5" } },
          "routes": {},
          "defaultRoute": "review"
        }
      }
    }`,
  })).rejects.toThrow(/cycle|extends/i)
})
```

- [ ] **Step 2: Run the focused control-plane tests and verify failure**

Run: `pnpm test -- --run test/control-plane.test.ts`

Expected: FAIL because `extends` is not yet part of the config schema or resolution model.

- [ ] **Step 3: Implement minimal preset reuse in `src/config.ts` and `src/control-plane.ts`**

Extend the schema with an optional `extends` field and resolve it before validation.
Keep the model explicit and single-parent.

Implementation target:

```ts
type ControlPlanePresetInput = {
  extends?: string
  label: string
  short: string
  description?: string
  profiles: Record<string, ProfileSelection>
  routes: Record<string, string>
  defaultRoute: string
}

function resolvePresetInheritance(config: ControlPlaneConfig) {
  // depth-first single-parent merge with cycle detection
}
```

Rules:

- child preset inherits missing profiles and routes from parent
- child `routes` override parent `routes`
- child `defaultRoute` remains explicit
- cycle detection must reject invalid graphs

- [ ] **Step 4: Run the focused control-plane tests and verify they pass**

Run: `pnpm test -- --run test/control-plane.test.ts`

Expected: PASS for the new inheritance tests and the existing control-plane suite.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/config.ts src/control-plane.ts test/control-plane.test.ts
git commit -m "feat: add lightweight preset reuse"
```

### Task 5: Phase B Explain, Source Tracing, and Preset-Switch Feedback

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write failing tests for stronger explain output and preset-switch feedback**

Add tests in `test/cli.test.ts`:

```ts
it("adds source tracing to explain output for opencode", async () => {
  const result = await runCli([
    "explain",
    "--host",
    "opencode",
    "--phase",
    "brainstorming",
  ], createCliDeps({
    explainPhaseForHost: () => ({
      phase: "brainstorming",
      profileId: "strategy",
      model: "anthropic/claude-sonnet-4-5-20250929",
      variant: "high",
      commandName: "/sp-brainstorm",
      agentName: "spr-strategy",
      routeSource: "explicit_route",
      configSource: "project",
    }),
  }))

  const output = JSON.parse(result.stdout)
  expect(output.routeSource).toBe("explicit_route")
  expect(output.configSource).toBe("project")
})

it("reports that use changed the active preset and now recommends sync", async () => {
  const result = await runCli([
    "use",
    "review",
    "--host",
    "opencode",
  ], createCliDeps())

  const output = JSON.parse(result.stdout)
  expect(output.activePreset.key).toBe("review")
  expect(output.nextAction.command).toBe("oh-my-superagents sync --host opencode")
})
```

- [ ] **Step 2: Run the focused CLI tests and verify failure**

Run: `pnpm test -- --run test/cli.test.ts`

Expected: FAIL because `explain` and `use` outputs do not yet include tracing or feedback-loop fields.

- [ ] **Step 3: Implement route/source tracing and `use` feedback in the CLI surface**

Keep route tracing shared and lightweight.

Implementation target:

```ts
type ExplainTrace = {
  routeSource: "explicit_route" | "default_route"
  configSource: "project" | "global" | "default" | "inherited"
}

return {
  ...existingExplainOutput,
  routeSource,
  configSource,
}
```

For `use`, return a richer result:

```ts
return {
  source: formatControlPlaneSource(resolved),
  activePreset: { key: nextPreset, ... },
  changed: true,
  nextAction: {
    command: "oh-my-superagents sync --host opencode",
    reason: "Refresh OpenCode artifacts for the newly active preset.",
  },
}
```

- [ ] **Step 4: Run the focused CLI tests and verify they pass**

Run: `pnpm test -- --run test/cli.test.ts`

Expected: PASS for the new explain and `use` feedback coverage and the existing CLI suite.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/cli.ts src/control-plane.ts test/cli.test.ts
git commit -m "feat: add OpenCode routing trace feedback"
```

### Task 6: Phase B Lightweight Validation View and Final Verification

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Test: `test/cli.test.ts`
- Test: `test/control-plane.test.ts`

- [ ] **Step 1: Write failing tests for a lightweight validation-oriented routing view**

Add tests for `doctor --host opencode` or an equivalent existing surface:

```ts
it("reports unused profiles and default-routed phases in OpenCode doctor output", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], createCliDeps())
  const output = JSON.parse(result.stdout)

  expect(output.routing.defaultRoutedPhases).toContain("requesting-code-review")
  expect(output.routing.unusedProfiles).toContain("strategy")
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm test -- --run test/cli.test.ts test/control-plane.test.ts`

Expected: FAIL because doctor output does not yet include routing validation details.

- [ ] **Step 3: Implement a lightweight routing validation view**

In `src/control-plane.ts`, add a small helper that computes:

```ts
export function summarizeRoutingValidation(config: ControlPlaneConfig, presetKey: string) {
  return {
    defaultRoutedPhases: [],
    explicitRoutedPhases: [],
    unusedProfiles: [],
  }
}
```

Expose it from `doctor` in `src/cli.ts` under a `routing` key.
Do not add a new command.

- [ ] **Step 4: Run full verification**

Run: `pnpm test && pnpm check`

Expected: PASS for the full test suite and TypeScript check.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/cli.ts src/control-plane.ts test/cli.test.ts test/control-plane.test.ts
git commit -m "feat: add OpenCode routing validation view"
```

## Self-Review Notes

- Spec coverage:
  - Phase A state model, next-step guidance, command discovery, artifact visibility, and plugin guidance are covered by Tasks 1-3.
  - Phase B lightweight preset reuse, stronger explain, source tracing, preset-switch feedback, and validation view are covered by Tasks 4-6.
- Placeholder scan:
  - No placeholder markers or deferred-test language remain.
- Type consistency:
  - The plan consistently uses `state`, `nextAction`, `artifactSummary`, `extends`, `routeSource`, `configSource`, and `routing` as the new outward-facing shapes.

## Parallelization Notes For Subagents

- Task 1 and Task 3 should run sequentially because both shape user-facing guidance terminology.
- Task 2 can start after Task 1 lands because it depends on the richer CLI status/doctor surface.
- Task 4 should start only after Phase A lands, because Phase B schema changes should not overlap with Phase A CLI churn.
- Task 5 and Task 6 can be parallelized after Task 4 if they coordinate on `src/cli.ts` ownership carefully; otherwise keep them sequential.
