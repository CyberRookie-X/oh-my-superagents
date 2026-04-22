# Copilot CLI Host Support Design

> **Date:** 2026-04-22  
> **Scope:** Add first-class GitHub Copilot CLI (`gh copilot`) as a supported host in oh-my-superagents  
> **Status:** Design approved, ready for implementation

## 1. Goal

Enable oh-my-superagents to generate and manage project-scoped skills/commands for **GitHub Copilot CLI** (`gh copilot`), bringing it to parity with existing hosts (OpenCode, Codex, Qwen, Claude).

## 2. Background

GitHub Copilot CLI (invoked via `gh copilot suggest` or `gh copilot explain`) supports:
- **Prompt files** — reusable prompt templates stored in `.github/prompts/*.md`
- **No native agent/skill model** — unlike OpenCode agents or Codex skills, Copilot CLI uses simple markdown prompt files with frontmatter
- **gh CLI extension ecosystem** — can be extended via `gh extension install`

Copilot CLI prompt files use YAML frontmatter with `name`, `description`, and `model` fields, followed by the prompt body.

## 3. Architecture

### 3.1 Host Projection Model

Copilot CLI will use the **prompt file** projection model:
- Each superpowers phase maps to a `.github/prompts/oms-<phase>.md` file
- Direct mode intents map to `.github/prompts/rt-<intent>.md` files
- Control plane commands map to `.github/prompts/oms-<command>.md` files

### 3.2 File Structure

```
.github/prompts/
  oms-brainstorm.md       # brainstorming phase
  oms-plan.md             # writing-plans phase
  oms-execute.md          # subagent-driven-development phase
  oms-review.md           # requesting-code-review phase
  oms-verify.md           # verification-before-completion phase
  oms-visual.md           # frontend-design phase
  oms-web-test.md         # webapp-testing phase
  oms-status.md           # control plane: status
  oms-use.md              # control plane: use
  oms-disable.md          # control plane: disable
  oms-sync.md             # control plane: sync
  oms-doctor.md           # control plane: doctor
```

### 3.3 Prompt File Format

```markdown
---
name: oms-execute
description: Execute subagent-driven development via oh-my-superagents
model: gpt-4o
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.subagent-driven-development; projection=prompt; rendered-name=oms-execute -->

You are the oms-execute phase agent for oh-my-superagents.

Use the workflow entry `superpowers/subagent-driven-development` for `phase.subagent-driven-development` whenever it is relevant.

If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.

Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.
```

## 4. Component Design

### 4.1 New File: `src/copilot.ts`

Responsibilities:
- Render Copilot CLI prompt files with proper YAML frontmatter
- Generate phase prompts, direct mode prompts, and control plane command prompts
- Follow the same artifact generation pattern as `src/claude.ts` and `src/qwen.ts`

Key functions:
- `renderCopilotPromptFile(input)` — renders a single prompt file
- `buildCopilotArtifacts(config, options)` — builds all artifacts for Copilot CLI

### 4.2 Modified File: `src/capabilities.ts`

- Add `"copilot"` to `CapabilityHost` union type
- Add Copilot-specific projection rules:
  - Copilot supports both `superpowers` and `direct` workflow modes
  - Copilot supports all workflow sources (superpowers, gstack, direct)
  - Copilot does not support `explain` control plane command (no native explain mechanism)

### 4.3 Modified File: `src/cli.ts`

- Add `"copilot"` to `CliHost` union type
- Add Copilot to host validation and error messages
- Add `buildCopilotArtifacts` to `CliDeps`
- Add Copilot artifact rules to `OWNED_ARTIFACT_RULES`
- Add Copilot to `getArtifactsForHost()` and `getExpectedArtifacts()`
- Add Copilot to `explainAllForCliHost()` and `explainPhaseForCliHost()`
- Add Copilot to `buildControlPlaneStatus()` and `buildControlPlaneDoctor()`
- Add Copilot to `materializeArtifacts()` calls

### 4.4 Modified File: `src/superpowers-compatibility.ts`

- Add `"copilot"` to `SupportedSuperpowersHost` union type
- Add Copilot compatibility matrix entry (minimum version, tested ranges)
- Note: Copilot CLI does not have a versioned superpowers plugin model, so compatibility will be "not_detected" by default

### 4.5 Modified File: `src/materialize.ts`

- Add Copilot to artifact ownership detection logic
- Add `.github/prompts/*.md` to owned artifact patterns

## 5. Data Flow

1. User runs `oh-my-superagents sync --host copilot`
2. CLI resolves control plane configuration
3. `getArtifactsForHost()` calls `buildCopilotArtifacts(config)`
4. `buildCopilotArtifacts()` generates prompt files for each phase/command
5. `materializeArtifacts()` writes files to `.github/prompts/`
6. Copilot CLI can now use these prompts via `gh copilot suggest --prompt oms-execute`

## 6. Error Handling

- Missing `.github/prompts/` directory: create it automatically
- Duplicate prompt names: throw error with clear message
- Unsupported workflow mode: blocked by capabilities system
- Missing upstream workflow entries: prompt file includes fallback instructions

## 7. Testing Strategy

- Unit tests for `src/copilot.ts` (render functions, artifact building)
- Integration tests in CLI test suite for `--host copilot`
- Snapshot tests for generated prompt files

## 8. Compatibility & Limitations

- Copilot CLI prompt files are simpler than OpenCode agents or Codex skills
- No subagent execution model — prompts are single-turn
- No native control plane integration — commands are prompts that tell the user to run CLI commands
- Model selection is limited to Copilot-supported models (gpt-4o, gpt-4o-mini, etc.)

## 9. Future Enhancements (out of scope)

- Copilot CLI extension for deeper integration
- Multi-turn conversation support if Copilot CLI adds it
- Dynamic prompt composition based on context

## 10. Implementation Order

1. `src/copilot.ts` — core artifact generation
2. `src/capabilities.ts` — capability rules
3. `src/superpowers-compatibility.ts` — compatibility matrix
4. `src/cli.ts` — CLI integration
5. `src/materialize.ts` — artifact ownership
6. Tests for all new/modified components
