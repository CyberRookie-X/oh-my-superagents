# Copilot CLI Host Adapter Design — Agent + Plugin + Hooks

## Summary

This design adds GitHub Copilot CLI as a first-party host adapter in the OMS generic routing architecture, with deep integration through three Copilot-native mechanisms:

1. **Agents** — `.agent.md` files for phase routing
2. **Plugin** — `plugin.json` manifest for distribution and installation
3. **Hooks** — `hooks.json` for automated OMS lifecycle integration

Copilot CLI support should consume the same resolved route, source, and profile decisions as other hosts, project them into Copilot-native artifacts, and preserve OMS as a thin routing and control-plane product.

## Problem

The repository already supports four hosts (OpenCode, Codex, Qwen, Claude Code), but Copilot CLI is missing.

Copilot CLI is significant because:

- It is the most widely deployed AI coding CLI (GitHub/Microsoft ecosystem)
- It has a mature plugin system with agents, skills, hooks, MCP servers, and LSP servers
- Its plugin architecture is well-documented and stable
- It supports both interactive and cloud agent modes
- The hooks system enables deep lifecycle integration not available in other hosts

The gap matters because:

- Users in the GitHub ecosystem cannot use OMS routing
- Copilot CLI's hook system offers unique integration opportunities (pre/post tool use, session lifecycle)
- The plugin distribution model enables OMS to be installed as a single `copilot plugin install` command

## Goals

- Add Copilot CLI as a first-party host adapter with the richest integration of any host
- Generate Copilot-native `.agent.md` files for phase/intent routing
- Generate a `plugin.json` manifest for one-command installation
- Generate `hooks.json` for OMS lifecycle automation (artifact sync, status checks)
- Support control-plane commands: `status`, `sync`, `doctor`, `explain`, `use`, `disable`
- Keep all projection inside the same routing-core architecture as other hosts
- Enable `copilot plugin install` as the primary installation path

## Non-Goals

- Building Copilot-specific orchestration beyond what the routing core provides
- Implementing MCP server generation (may come later)
- Implementing LSP server generation
- Overriding built-in Copilot agents or tools
- Creating a Copilot-specific agent persona catalog

## Copilot CLI Architecture Analysis

### Agent Format

Copilot CLI agents use `.agent.md` files with YAML front matter:

```markdown
---
name: my-agent
description: Helps with specific tasks
tools: ["bash", "edit", "view"]
---

You are a specialized assistant that...
```

Key fields:
- `name` — agent display name
- `description` — shown in `/agent` listing
- `tools` — array of allowed tools (bash, edit, view, glob, rg, task, etc.)

Agents are loaded from (first-found-wins by ID, derived from filename):
1. `~/.copilot/agents/` (user)
2. `<project>/.github/agents/` (project)
3. `<project>/.claude/agents/` (project, Claude convention)
4. Plugin `agents/` directories

### Skill Format

Copilot CLI skills use `SKILL.md` files in skill directories:

```markdown
---
name: deploy
description: Deploy the current project to...
---

Instructions for the skill...
```

Skills are loaded from (first-found-wins by name):
1. `<project>/.github/skills/` (project)
2. `<project>/.agents/skills/` (project)
3. `<project>/.claude/skills/` (project)
4. Plugin `skills/` directories

### Hooks System

Hooks are defined in `.github/hooks/*.json` with triggers:

| Trigger | Description |
|---------|-------------|
| `sessionStart` | When an agent session starts |
| `sessionEnd` | When an agent session ends |
| `userPromptSubmitted` | When user submits a prompt |
| `preToolUse` | Before any tool is executed |
| `postToolUse` | After any tool is executed |
| `errorOccurred` | When an error occurs |

Hook format:
```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "scripts/oms-sync.sh",
        "timeoutSec": 15
      }
    ]
  }
}
```

### Plugin System

A plugin is a directory with `plugin.json` manifest:

```
oh-my-superagents-copilot/
├── plugin.json
├── agents/
│   ├── oms-brainstorm.agent.md
│   ├── oms-plan.agent.md
│   └── ...
├── skills/
│   ├── oms-brainstorm/
│   │   └── SKILL.md
│   └── ...
└── hooks.json
```

Installation: `copilot plugin install oh-my-superagents-copilot`

## Architecture

### New Module: `src/copilot.ts`

A new host adapter following the same pattern as `claude.ts`, `codex.ts`, and `qwen.ts`.

Responsibilities:
- Generate `.agent.md` files for each phase/intent
- Generate `SKILL.md` files in skill directories
- Generate `hooks.json` for OMS lifecycle automation
- Generate `plugin.json` manifest
- Generate control-plane command scripts
- Assert capability policy for unsupported combinations

### Artifact Layout

```
.copilot-plugin/                          # OMS Copilot plugin directory
├── plugin.json                           # Plugin manifest
├── agents/                               # Phase routing agents
│   ├── oms-brainstorm.agent.md
│   ├── oms-plan.agent.md
│   ├── oms-execute.agent.md
│   ├── oms-review.agent.md
│   ├── oms-verify.agent.md
│   ├── oms-visual.agent.md
│   └── oms-web-test.agent.md
├── skills/                               # Phase routing skills
│   ├── oms-brainstorm/
│   │   └── SKILL.md
│   ├── oms-plan/
│   │   └── SKILL.md
│   └── ...
└── hooks.json                            # OMS lifecycle hooks
```

For direct mode:
```
.copilot-plugin/
├── plugin.json
├── agents/
│   ├── rt-<intent>.agent.md
│   └── ...
└── hooks.json
```

### Agent File Rendering

Each agent file follows Copilot CLI's `.agent.md` format:

```markdown
---
name: oms-brainstorm
description: Route brainstorming phase through OMS profile <profileId>
tools: ["bash", "view", "edit", "glob", "rg"]
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=3; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->

You are the oms-brainstorm phase agent for oh-my-superagents.
Load and follow the upstream workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.
If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.
Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.

## Route Metadata
- canonical route: `phase.brainstorm`
- source: `superpowers`
- profile: `<profileId>`
- model: `<model>`
```

### Skill File Rendering

Each skill follows the same `SKILL.md` format as Claude Code:

```markdown
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=3; host=copilot; source=superpowers; route=phase.brainstorm; projection=skill; rendered-name=oms-brainstorm -->

# Skill: oms-brainstorm

## Purpose
This project-scoped Copilot CLI wrapper routes the `brainstorming` phase through OMS profile `<profileId>`.

## Instructions
Use the workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.
If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.
Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.

## Route Metadata
- canonical route: `phase.brainstorm`
- source: `superpowers`
- profile: `<profileId>`
- model: `<model>`
```

### Plugin Manifest Rendering

```json
{
  "name": "oh-my-superagents",
  "description": "OMS routing and control-plane for Copilot CLI",
  "version": "0.1.0",
  "author": {
    "name": "oh-my-superagents contributors"
  },
  "license": "MIT",
  "keywords": ["routing", "superpowers", "workflow", "agent"],
  "category": "development",
  "agents": "agents/",
  "skills": "skills/",
  "hooks": "hooks.json"
}
```

### Hooks Configuration

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "npx oh-my-superagents sync --host copilot --quiet",
        "timeoutSec": 15
      }
    ],
    "postToolUse": [
      {
        "type": "command",
        "bash": "npx oh-my-superagents status --host copilot --quiet 2>/dev/null || true",
        "timeoutSec": 5
      }
    ]
  }
}
```

The `sessionStart` hook ensures artifacts are synced when a Copilot session begins. The `postToolUse` hook provides lightweight status awareness (optional, non-blocking).

### Ownership Marker System

Use `stage=3` for Copilot CLI (stage=1 for OpenCode/Codex, stage=2 for Qwen, stage=1 for Claude).

Route ownership metadata format:
```
<!-- oms-route: stage=3; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->
```

Control plane ownership metadata format:
```
<!-- oms-control-plane: stage=3; host=copilot; artifact=command; logical-command=status; rendered-name=oms-status -->
```

### Capability Policy

Update `capabilities.ts`:

```typescript
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

Capability rules for Copilot CLI:
- Supports all superpowers phases (agent + skill projection)
- Supports direct mode (agent projection)
- Supports all control-plane commands: `status`, `use`, `disable`, `sync`, `doctor`, `explain`
- Supports gstack source
- No restrictions needed initially (Copilot CLI is the most capable host)

### Materialization Updates

Update `materialize.ts` to handle:
- `.copilot-plugin/` directory structure
- `plugin.json` manifest file
- `hooks.json` file
- Agent ownership detection (`oms-`, `rt-` prefixes in `.copilot-plugin/agents/`)
- Skill ownership detection (SKILL.md in `.copilot-plugin/skills/`)

### CLI Updates

Update `cli.ts`:
- Add `"copilot"` to the `--host` validation list
- Add `getArtifactsForHost("copilot", ...)` dispatch to `buildCopilotArtifacts()`
- Add Copilot-specific `explain` output
- Add plugin path to `status` output

## Data Flow

```
User Config (JSONC)
    │
    ▼
loadControlPlaneConfig()
    │
    ▼
resolveControlPlane()
    │
    ▼
RouterConfig (resolved routes, sources, profiles)
    │
    ├──────────────────┬──────────────────┬──────────────────┐
    ▼                  ▼                  ▼                  ▼
buildArtifacts()  buildCodexArtifacts()  buildQwenArtifacts()  buildCopilotArtifacts()
(OpenCode)        (Codex)               (Qwen)                (Copilot CLI)
    │                  │                  │                  │
    ▼                  ▼                  ▼                  ▼
GeneratedArtifact[] (all hosts)          │                  │
    │                                    │                  │
    ▼                                    ▼                  ▼
materializeArtifacts() ──────────────── write to disk
```

## Testing Strategy

### Unit Tests

Following the TDD pattern used by other host adapters:

1. **`test/copilot-agent-rendering.test.ts`** — Test `.agent.md` file rendering for all phases
2. **`test/copilot-skill-rendering.test.ts`** — Test `SKILL.md` file rendering for all phases
3. **`test/copilot-plugin-manifest.test.ts`** — Test `plugin.json` generation
4. **`test/copilot-hooks.test.ts`** — Test `hooks.json` generation
5. **`test/copilot-direct-mode.test.ts`** — Test direct mode agent rendering
6. **`test/copilot-capabilities.test.ts`** — Test capability policy for copilot host
7. **`test/copilot-materialize.test.ts`** — Test ownership detection and materialization
8. **`test/copilot-control-plane.test.ts`** — Test CLI commands for copilot host

### Integration Tests

9. **`test/copilot-artifacts-integration.test.ts`** — Test full artifact generation from RouterConfig to all artifacts

## File Changes Summary

| File | Change |
|------|--------|
| `src/copilot.ts` | **NEW** — Copilot CLI host adapter |
| `src/capabilities.ts` | Add `"copilot"` to `CapabilityHost` type |
| `src/opencode.ts` | Add `"copilot"` to `renderRouteOwnershipMetadata` host union |
| `src/materialize.ts` | Add Copilot ownership detection functions |
| `src/cli.ts` | Add `"copilot"` to host validation, dispatch to copilot adapter |
| `src/index.ts` | Export new copilot module |
| `src/control-plane.ts` | Add copilot to host-specific summary functions |
| `test/copilot-*.test.ts` | **NEW** — Test files |
| `docs/superpowers/specs/` | **NEW** — This design document |

## Delivery Phases

### Phase 1: Core Adapter
- `src/copilot.ts` with agent and skill rendering
- Capability policy updates
- Basic unit tests

### Phase 2: Plugin + Hooks
- `plugin.json` manifest generation
- `hooks.json` generation
- Materialization support for `.copilot-plugin/` directory

### Phase 3: CLI Integration
- CLI `--host copilot` support
- `status`, `sync`, `doctor`, `explain` for Copilot
- Integration tests

### Phase 4: Direct Mode
- Direct intent agent rendering
- Direct mode capability policy
- Direct mode tests

## Open Questions

1. Should the plugin directory be `.copilot-plugin/` (project-local) or should OMS also support generating a standalone plugin directory for `copilot plugin install`? — **Decision**: Both. Generate artifacts in `.copilot-plugin/` for project-local use, and provide a `copilot bootstrap` command (similar to the existing Codex bootstrap) that creates a standalone installable plugin directory.

2. Should hooks be mandatory or opt-in? — **Decision**: Opt-in via config. The `hooks.json` should only be generated when the user enables hooks in their OMS config. Default: hooks enabled for `sessionStart` only.

3. Should OMS agents use `tools: ["bash", "edit", "view", "glob", "rg", "task"]` or a minimal set? — **Decision**: Use the full set matching the phase's needs. Planning phases get `["bash", "view", "glob", "rg"]`. Execution phases get all tools.
