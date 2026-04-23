# Copilot CLI Host Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Copilot CLI as a first-party thin host adapter that consumes OMS route/source/profile resolution and projects it into Copilot CLI–native artifacts (`.agent.md`, `SKILL.md`, `plugin.json`, `hooks.json`) without adopting a thick orchestration model.

**Architecture:** Introduce a dedicated Copilot CLI host builder that renders `.github/copilot/` plugin artifacts from already-resolved OMS routes. Reuse the same control-plane, materialization, and explainability model as other hosts. Keep the adapter thin: plugin-first distribution, agent + skill dual projection, hooks for lifecycle awareness.

**Tech Stack:** TypeScript, Vitest, existing OMS control plane, materializer, source-aware router, Copilot CLI plugin projection

---

## Scope Decomposition

This plan covers the first official Copilot CLI host slice.

It includes:

- Copilot CLI host registration
- Copilot CLI–native agent projection (`.agent.md`)
- Copilot CLI–native skill projection (`SKILL.md`)
- Copilot CLI plugin manifest generation (`plugin.json`)
- Copilot CLI hooks configuration generation (`hooks.json`)
- `status`, `sync`, `use`, `disable`, `doctor`, and `explain` integration
- ownership and cleanup rules for `.github/copilot/`
- Lane-aware subagent execution support
- Direct workflow mode support

Deferred from this plan:

- Copilot CLI marketplace integration
- MCP server forwarding
- LSP server forwarding
- Copilot CLI–specific hooks with real logic (only placeholder hooks)

## File Structure

### Copilot CLI host renderer

- Create: `src/copilot.ts`
  - render Copilot CLI agents, skills, plugin manifest, and hooks from resolved routes

### CLI and materialization

- Modify: `src/cli.ts`
  - register `copilot` as a host for sync/status/doctor/explain/use/disable
- Modify: `src/materialize.ts`
  - detect and safely clean OMS-owned Copilot CLI agent, skill, command, and hook files
- Modify: `src/capabilities.ts`
  - add `copilot` to `CapabilityHost`
- Modify: `src/config.ts`
  - add `copilot` to `SupportedSuperpowersHost`
- Modify: `src/superpowers-compatibility.ts`
  - add `copilot` to `SupportedSuperpowersHost`

### Shared exports and config-facing host types

- Modify: `src/index.ts`
  - export Copilot CLI host helpers

### Docs

- Modify: `README.md`
- Modify: `README.zh-CN.md`
  - add Copilot CLI to the host matrix and explain the thin-adapter boundary

### Tests

- Create: `test/copilot.test.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/materialize.test.ts`
- Modify: `test/index.test.ts`
- Modify: `test/capabilities.test.ts`

## Execution Notes

- Use `.github/copilot/` as the base directory for all Copilot CLI artifacts.
- Generate `plugin.json` and `hooks.json` at the plugin root.
- Agents go to `.github/copilot/agents/` as `.agent.md` files.
- Skills go to `.github/copilot/skills/<name>/SKILL.md`.
- Control plane commands go to `.github/copilot/commands/` as `.md` files.
- Respect Copilot CLI's first-found-wins precedence by not overriding project-level or personal agents/skills.
- The plugin itself uses `agents: "agents/"` and `skills: ["skills/"]` paths relative to the plugin root.

### Task 1: Copilot CLI Agent and Skill Renderer

**Files:**
- Create: `src/copilot.ts`
- Modify: `src/index.ts`
- Create: `test/copilot.test.ts`
- Modify: `test/index.test.ts`

- [ ] **Step 1: Write the failing Copilot CLI renderer tests**

Create `test/copilot.test.ts` with tests for:

- `renderCopilotAgentFile`: verifies agent frontmatter (name, description, model, tools), ownership markers, and workflow entry references
- `renderCopilotSkillFile`: verifies skill frontmatter and route metadata
- `buildCopilotArtifacts`: verifies one agent + one skill per built-in phase, plus plugin manifest and hooks

Add to `test/index.test.ts`:
```ts
expect(library.buildCopilotArtifacts).toBeDefined()
expect(library.renderCopilotAgentFile).toBeDefined()
expect(library.renderCopilotSkillFile).toBeDefined()
```

- [ ] **Step 2: Run the focused Copilot/index tests and verify failure**

Run: `pnpm test -- --run test/copilot.test.ts test/index.test.ts`

Expected: FAIL because `src/copilot.ts` and the Copilot exports do not exist yet.

- [ ] **Step 3: Implement the Copilot CLI renderer**

Create `src/copilot.ts` with:
- `renderCopilotAgentFile(input)`: renders `.agent.md` content with YAML frontmatter and ownership markers
- `renderCopilotSkillFile(input)`: renders `SKILL.md` content with route metadata
- `renderCopilotPluginManifest(input)`: renders `plugin.json` content
- `renderCopilotHooksConfig()`: renders `hooks.json` content with lifecycle hooks
- `buildCopilotArtifacts(config, controlPlaneSettings?)`: builds all artifacts (agents, skills, commands, plugin manifest, hooks)

Also export the new Copilot helpers from `src/index.ts`.

- [ ] **Step 4: Run the focused Copilot/index tests and verify they pass**

Run: `pnpm test -- --run test/copilot.test.ts test/index.test.ts`

Expected: PASS for the new Copilot renderer tests and the existing index exports suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/copilot.ts src/index.ts test/copilot.test.ts test/index.test.ts
git commit -m "feat: add copilot cli agent and skill renderer"
```

### Task 2: Copilot CLI CLI Registration, Capabilities, and Ownership Cleanup

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/capabilities.ts`
- Modify: `src/config.ts`
- Modify: `src/superpowers-compatibility.ts`
- Modify: `src/materialize.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/materialize.test.ts`
- Modify: `test/capabilities.test.ts`

- [ ] **Step 1: Write the failing Copilot CLI CLI and cleanup tests**

Add to `test/cli.test.ts`:
- Test that `sync --host copilot` renders artifacts to `.github/copilot/`
- Test that `status --host copilot` shows Copilot-specific status
- Test that `explain --host copilot` shows Copilot-specific routing

Add to `test/materialize.test.ts`:
- Test ownership marker parsing for `host=copilot`
- Test cleanup of OMS-owned Copilot CLI agent files
- Test cleanup of OMS-owned Copilot CLI skill directories
- Test cleanup of OMS-owned Copilot CLI command files

Add to `test/capabilities.test.ts`:
- Test `getHostProjectionDecision` for `host: "copilot"` with all workflow/source combinations

- [ ] **Step 2: Run the focused CLI/materialize/capabilities tests and verify failure**

Run: `pnpm test -- --run test/cli.test.ts test/materialize.test.ts test/capabilities.test.ts`

Expected: FAIL because `copilot` is not yet a registered host.

- [ ] **Step 3: Implement Copilot CLI host registration and cleanup rules**

Update `src/capabilities.ts`:
- Add `"copilot"` to `CapabilityHost` union
- Add Copilot-specific capability decisions

Update `src/config.ts`:
- Add `"copilot"` to `SupportedSuperpowersHost`

Update `src/superpowers-compatibility.ts`:
- Add `"copilot"` to `SupportedSuperpowersHost`

Update `src/cli.ts`:
- Accept `"copilot"` as a host value
- Wire `buildCopilotArtifacts` as the builder for `host === "copilot"`
- Add Copilot-specific control plane command names

Update `src/materialize.ts`:
- Add `COPILOT_ROUTER_OWNED_AGENT_PREFIXES` set (e.g., `oms-`, `rt-`)
- Add `COPILOT_ROUTER_OWNED_COMMAND_PREFIXES` set (e.g., `oms-`)
- Add `COPILOT_PLUGIN_MANIFEST_MARKER` and `COPILOT_HOOKS_CONFIG_MARKER` for plugin/hooks ownership
- Add `isCopilotRouterOwnedFile()` function
- Add `isCopilotPluginManifestFile()` and `isCopilotHooksConfigFile()` functions
- Add Copilot cases to `isOmsOwnedArtifactFile()` and `isRouteOwnedFile()`
- Add Copilot skill cleanup to the skill directory cleanup loop

- [ ] **Step 4: Run the focused CLI/materialize/capabilities tests and verify they pass**

Run: `pnpm test -- --run test/cli.test.ts test/materialize.test.ts test/capabilities.test.ts`

Expected: PASS for the new Copilot host and cleanup tests and the existing suites.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/cli.ts src/capabilities.ts src/config.ts src/superpowers-compatibility.ts src/materialize.ts test/cli.test.ts test/materialize.test.ts test/capabilities.test.ts
git commit -m "feat: add copilot cli host control plane and cleanup support"
```

### Task 3: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Test: full repository verification

- [ ] **Step 1: Update the host support docs**

Add Copilot CLI to the support tables and architecture docs with wording like:

```md
- GitHub Copilot CLI is supported as a thin host adapter via a plugin rendered to `.github/copilot/`.
- OMS generates `.agent.md` agents, `SKILL.md` skills, `plugin.json` manifest, and `hooks.json` lifecycle hooks.
- Install via `copilot plugin install ./path/to/project` or by adding the marketplace reference.
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`

Expected: PASS with the new Copilot tests included.

- [ ] **Step 3: Run type checking and build**

Run: `pnpm check && pnpm build`

Expected: PASS for both commands.

- [ ] **Step 4: Commit Task 3**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add copilot cli host support notes"
```
