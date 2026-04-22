# Copilot CLI Host Adapter Implementation Plan

## Overview

This plan implements the Copilot CLI host adapter as designed in `2026-04-22-copilot-cli-host-adapter-design.md`. The implementation follows the same pattern as existing host adapters (OpenCode, Codex, Claude, Qwen) and adds Copilot CLI as a first-class host.

## Delivery Slices

### Slice 1: Core Adapter + Capability + CLI Integration

**Files to create:**
- `src/copilot.ts` — Copilot CLI host adapter (agent rendering, plugin manifest, skills, hooks)

**Files to modify:**
- `src/capabilities.ts` — Add `"copilot"` to `CapabilityHost`, add projection/command decisions
- `src/superpowers-compatibility.ts` — Add `"copilot"` to `SupportedSuperpowersHost`
- `src/cli.ts` — Add `"copilot"` to `CliHost`, add Copilot-specific sync/status/doctor/use/disable/explain logic
- `src/index.ts` — Export from `copilot.js`

**Tests to create:**
- `test/copilot.test.ts` — Agent rendering, plugin manifest, capability decisions

**Tests to modify:**
- `test/capabilities.test.ts` — Add Copilot capability decision tests
- `test/cli.test.ts` — Add Copilot CLI command tests

### Slice 2: Plugin Bundle + Bootstrap + Skills

**Files to modify:**
- `src/copilot.ts` — Add `buildCopilotPluginManifest()`, `buildCopilotBootstrapFiles()`, skill rendering
- `src/cli.ts` — Add `bootstrap --host copilot` command path

**New file (optional):**
- `src/copilot-bootstrap.ts` — Copilot bootstrap/scaffolding (if logic is substantial enough)

**Tests to create:**
- `test/copilot-bootstrap.test.ts` — Bootstrap flow tests

### Slice 3: Hooks Projection

**Files to modify:**
- `src/copilot.ts` — Add `renderCopilotHooksFile()`, `sessionStart` hook generation

**Tests to modify:**
- `test/copilot.test.ts` — Add hook rendering tests

### Slice 4: Compatibility Monitor

**Files to modify:**
- `src/superpowers-compatibility.ts` — Add copilot entry to `SUPERPOWERS_COMPATIBILITY`
- `src/superpowers-detectors.ts` — Add `detectCopilotSuperpowers()`, `detectCopilotSuperpowersAvailability()`

**Tests to modify:**
- `test/superpowers-compatibility.test.ts` — Add copilot matrix tests
- `test/superpowers-detectors.test.ts` — Add copilot detection tests

### Slice 5: Direct Mode Support

**Files to modify:**
- `src/copilot.ts` — Add direct-mode agent rendering (`rt-<intent>.agent.md`)

**Tests to modify:**
- `test/copilot.test.ts` — Add direct-mode tests

## Task Breakdown

### Task 1: Create `src/copilot.ts` — Agent Rendering

Create the core Copilot adapter module with:

1. Type definitions:
   - `CopilotAgentArtifact` — rendered agent file
   - `RenderCopilotAgentFileInput` — input for agent rendering
   - `CopilotPluginManifest` — plugin.json structure
   - `CopilotHooksFile` — hooks.json structure
   - `CopilotSkillArtifact` — rendered skill file
   - `BuildCopilotArtifactsInput` — full artifact build input
   - `BuildCopilotArtifactsResult` — full artifact build result

2. Agent rendering functions:
   - `renderCopilotAgentFile(input)` — renders a `*.agent.md` file with YAML frontmatter
   - Agent frontmatter: `name`, `description`, `tools`
   - Agent body: phase-specific instructions referencing OMS workflow entry

3. Plugin manifest functions:
   - `renderCopilotPluginManifest(input)` — renders `plugin.json`

4. Skill rendering functions:
   - `renderCopilotSkillFile(input)` — renders `SKILL.md` for control-plane commands

5. Hooks rendering functions:
   - `renderCopilotHooksFile(input)` — renders `hooks.json` with `sessionStart` hook

6. Main artifact builder:
   - `buildCopilotArtifacts(input)` — builds all Copilot artifacts from resolved control plane state

### Task 2: Update `src/capabilities.ts`

1. Add `"copilot"` to `CapabilityHost` type union
2. Add Copilot-specific projection decisions:
   - Copilot supports superpowers + gstack source projection (like OpenCode/Codex)
   - Copilot supports direct mode projection
   - Copilot supports all control-plane commands (status, use, disable, sync, doctor, explain)
3. Add Copilot-specific command decisions if needed

### Task 3: Update `src/superpowers-compatibility.ts`

1. Add `"copilot"` to `SupportedSuperpowersHost` type
2. Add copilot entry to `SUPERPOWERS_COMPATIBILITY` matrix

### Task 4: Update `src/cli.ts`

1. Add `"copilot"` to `CliHost` type
2. Add Copilot artifact building in `sync` command
3. Add Copilot artifact inspection in `status`/`doctor` commands
4. Add Copilot artifact cleanup in `disable` command
5. Add Copilot explain support
6. Add Copilot `bootstrap` command path

### Task 5: Update `src/materialize.ts`

1. Add Copilot ownership markers
2. Add Copilot-specific stale artifact cleanup patterns

### Task 6: Update `src/index.ts`

1. Export from `copilot.js`

### Task 7: Create comprehensive tests

1. `test/copilot.test.ts` — Full adapter test suite
2. Update existing capability, compatibility, and CLI tests

### Task 8: Create bootstrap module

1. `src/copilot-bootstrap.ts` (if needed as separate module)
2. `buildCopilotBootstrapFiles()`
3. `runCopilotBootstrap()`

### Task 9: Update `src/superpowers-detectors.ts`

1. Add `detectCopilotSuperpowers()` — detect superpowers in Copilot CLI plugin locations
2. Add `detectCopilotSuperpowersAvailability()`

## Dependency Order

```
Task 1 (copilot.ts core) ← no src/ deps beyond config, router, opencode, workflow-sources
Task 2 (capabilities) ← depends on Task 1 types
Task 3 (compatibility) ← independent
Task 4 (cli.ts) ← depends on Tasks 1, 2, 3
Task 5 (materialize) ← depends on Task 1
Task 6 (index.ts) ← depends on Task 1
Task 7 (tests) ← depends on Tasks 1-6
Task 8 (bootstrap) ← depends on Task 1
Task 9 (detectors) ← depends on Task 3
```

Tasks 2, 3 can run in parallel.
Tasks 5, 6, 8, 9 can run in parallel after Task 1.

## Success Criteria

1. All existing tests continue to pass
2. `copilot.test.ts` covers agent, plugin, skill, and hooks rendering
3. `sync --host copilot` produces valid Copilot artifacts
4. `status --host copilot` reports correct state
5. `bootstrap --host copilot` scaffolds the plugin bundle
6. `disable --host copilot` cleans up all OMS-owned Copilot artifacts
7. Type checking passes (`pnpm run check`)
8. No regression in OpenCode, Codex, Qwen, or Claude support
