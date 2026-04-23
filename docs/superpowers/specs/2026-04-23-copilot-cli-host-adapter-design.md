# Copilot CLI Host Adapter Design

## Summary

This spec defines how oh-my-superagents (OMS) adds GitHub Copilot CLI as a first-party thin host adapter. Copilot CLI uses `.agent.md` files, `SKILL.md` skills, JSON hooks, and a `plugin.json` manifest — all of which OMS can project into using its existing route/source/profile resolution pipeline.

The Copilot CLI adapter reuses the same control-plane, materialization, and explainability model as OpenCode, Codex, Qwen, and Claude. It does not introduce new routing logic.

## Problem

OMS currently supports OpenCode, Codex, Qwen Code, and Claude Code as host platforms. GitHub Copilot CLI has emerged as a major AI coding assistant with a rich plugin system (agents, skills, hooks, MCP servers) that maps well to OMS's routing model. Without a Copilot CLI adapter, users must manually configure routing for each phase.

## Goals

- Render Copilot CLI–native `.agent.md` files from resolved OMS routes.
- Render Copilot CLI–native `SKILL.md` wrappers in skill directories.
- Generate `hooks.json` for lifecycle integration (session start, pre/post tool use, user prompt).
- Generate `plugin.json` manifest for Copilot CLI plugin discovery.
- Support `status`, `sync`, `doctor`, and `explain` control plane commands.
- Support both superpowers and direct workflow modes.
- Support lane-aware subagent execution via scoped agents.
- Integrate with the OMS materialization system for ownership tracking and stale artifact cleanup.

## Non-Goals

- Replacing or competing with Copilot CLI's built-in agents (explore, task, code-review, etc.).
- Overriding Copilot CLI's agent loading precedence (first-found-wins).
- Building Copilot CLI marketplace integration in this phase.
- Implementing MCP server or LSP server forwarding (deferred).

## Product Boundary

> Never compete with Copilot CLI on workflow. Only complement it on routing.

- OMS decides which model, profile, and source entry to use per phase.
- OMS generates Copilot CLI–native artifacts that reference upstream workflow entries.
- OMS does not reorder or redefine Copilot CLI's agent loading behavior.
- OMS respects Copilot CLI's first-found-wins precedence for agents and skills.

## Architecture

### Directory Structure

OMS renders Copilot CLI artifacts into `.github/copilot/` within the project:

```
.github/copilot/
├── plugin.json                    # Plugin manifest
├── hooks.json                     # Hooks configuration
├── agents/                        # Agent definitions
│   ├── oms-brainstorm.agent.md
│   ├── oms-plan.agent.md
│   ├── oms-execute.agent.md
│   ├── oms-review.agent.md
│   ├── oms-verify.agent.md
│   ├── oms-visual.agent.md
│   ├── oms-web-test.agent.md
│   └── oms-build--<lane>.agent.md  # Lane-scoped agents
├── skills/                        # Skill directories
│   ├── oms-brainstorm/
│   │   └── SKILL.md
│   ├── oms-plan/
│   │   └── SKILL.md
│   ├── oms-execute/
│   │   └── SKILL.md
│   ├── oms-review/
│   │   └── SKILL.md
│   ├── oms-verify/
│   │   └── SKILL.md
│   ├── oms-visual/
│   │   └── SKILL.md
│   ├── oms-web-test/
│   │   └── SKILL.md
│   └── oms-control-plane/
│       └── SKILL.md               # Control plane skill (sync/status/doctor)
└── commands/                      # Command definitions
    ├── oms-status.md
    ├── oms-sync.md
    ├── oms-use.md
    ├── oms-disable.md
    └── oms-doctor.md
```

### Agent File Format

Copilot CLI agents use `.agent.md` files with YAML frontmatter:

```markdown
---
name: oms-brainstorm
description: OMS brainstorming phase agent
model: gpt-4o
tools: ["bash", "edit", "view", "glob", "rg"]
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->

You are the oms-brainstorm helper agent.
Load and follow the upstream workflow entry `superpowers/brainstorming` for `phase.brainstorm` exactly.
Use the user prompt as the task context.
```

### Skill File Format

Copilot CLI skills use directories with `SKILL.md` files:

```markdown
---
name: oms-brainstorm
description: OMS brainstorming routing skill
model: gpt-4o
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.brainstorm; projection=skill; rendered-name=oms-brainstorm -->

## Purpose
This skill routes the `brainstorming` phase through OMS profile `default`.

## Instructions
Use the workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.
If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.

## Route Metadata
- canonical route: `phase.brainstorm`
- source: `superpowers`
- profile: `default`
- model: `gpt-4o`
```

### Hooks Configuration

OMS generates a `hooks.json` file for lifecycle integration:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "echo 'OMS session active'",
        "timeoutSec": 5
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "bash": "echo 'OMS pre-tool check'",
        "timeoutSec": 10
      }
    ]
  }
}
```

### Plugin Manifest

OMS generates a `plugin.json` manifest:

```json
{
  "name": "oh-my-superagents",
  "description": "AI coding assistant routing and control plane for Copilot CLI",
  "version": "1.0.0",
  "license": "MIT",
  "agents": "agents/",
  "skills": ["skills/"],
  "commands": "commands/",
  "hooks": "hooks.json"
}
```

### Ownership Markers

Every generated file contains ownership markers for the materialization system:

```html
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->
```

Control plane artifacts use:

```html
<!-- oms-control-plane: stage=1; host=copilot; artifact=command; logical-command=status; rendered-name=oms-status -->
```

### Capability Matrix

| Phase | superpowers | gstack | direct |
|-------|:-----------:|:------:|:------:|
| brainstorming | ✅ | ✅ | ✅ |
| writing-plans | ✅ | ✅ | ✅ |
| subagent-driven-development | ✅ | ✅ | ✅ |
| requesting-code-review | ✅ | ✅ | ✅ |
| verification-before-completion | ✅ | ✅ | ✅ |
| frontend-design | ✅ | ✅ | ✅ |
| webapp-testing | ✅ | ✅ | ✅ |

| Control Plane Command | superpowers | direct |
|----------------------|:-----------:|:------:|
| status | ✅ | ✅ |
| sync | ✅ | ✅ |
| use | ✅ | ❌ |
| disable | ✅ | ❌ |
| doctor | ✅ | ✅ |
| explain | ✅ | ✅ |

### Key Decisions

1. **Plugin-first distribution model**: OMS renders a `plugin.json` manifest, making it a proper Copilot CLI plugin. Users can install it via `copilot plugin install ./path/to/project`.

2. **Agent + Skill dual projection**: Both `.agent.md` agents and `SKILL.md` skills are generated. Agents provide direct routing, skills provide workflow integration.

3. **Hooks for lifecycle awareness**: The `hooks.json` file enables OMS to participate in Copilot CLI's session lifecycle events without replacing built-in behavior.

4. **Lane-aware subagent execution**: When lanes are enabled, scoped agents (e.g., `oms-build--frontend.agent.md`) are generated alongside lane-split guidance.

5. **Plugin directory as base**: All artifacts are rendered under `.github/copilot/` to avoid polluting the project root and to align with Copilot CLI's conventional plugin structure.

6. **Model passthrough**: Copilot CLI agents specify `model` in frontmatter, matching OMS's profile resolution output.

## File Structure

### New files
- `src/copilot.ts` — Copilot CLI host adapter (agent/skill/plugin/hook rendering)

### Modified files
- `src/cli.ts` — Register `copilot` as a host
- `src/capabilities.ts` — Add `copilot` to `CapabilityHost`
- `src/config.ts` — Add `copilot` to `SupportedSuperpowersHost`
- `src/materialize.ts` — Add Copilot CLI ownership detection and cleanup
- `src/superpowers-compatibility.ts` — Add `copilot` to `SupportedSuperpowersHost`
- `src/index.ts` — Export Copilot CLI helpers
- `README.md` — Update host matrix
- `README.zh-CN.md` — Update host matrix

### New test files
- `test/copilot.test.ts` — Copilot CLI renderer tests

### Modified test files
- `test/cli.test.ts` — Copilot CLI host tests
- `test/materialize.test.ts` — Copilot CLI ownership cleanup tests
- `test/index.test.ts` — Export verification
- `test/capabilities.test.ts` — Copilot capability decisions
