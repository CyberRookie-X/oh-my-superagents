# Copilot CLI Host Adapter Design

## Summary

This design adds GitHub Copilot CLI as a first-party host adapter in the OMS generic routing architecture, leveraging Copilot CLI's Agent + Plugin + Hooks extensibility model to deliver deep integration.

Copilot CLI support should:

- consume the same resolved route, source, and profile decisions as other hosts
- project them into Copilot-native artifacts (`.agent.md` agents, `SKILL.md` skills, `hooks.json` hooks, `plugin.json` plugin manifest)
- preserve OMS as a thin routing and control-plane product
- leverage the three Copilot CLI extension pillars—Agents, Plugins, and Hooks—to achieve deep host support

It should not turn the repository into a thick orchestration product specific to Copilot CLI.

## Problem

The repository already supports OpenCode, Codex, Qwen, and Claude Code, but GitHub Copilot CLI is missing.

That leaves a real gap because:

- Copilot CLI is a rapidly growing host surface for AI-native development workflows
- Copilot CLI provides a mature three-pillar extensibility model (Agents, Plugins, Hooks) that maps well to OMS's control-plane model
- the project already has enough core abstraction to support another host cleanly
- the `.agent.md` format, skill system, and hooks system give OMS rich projection targets that can express OMS routing, control-plane, and lifecycle semantics natively

However, Copilot CLI support carries design risks similar to Claude Code.

If implemented carelessly, it could drag the repository toward:

- persona-heavy agent catalogs
- hook-driven orchestration as the primary execution model
- global config or `AGENTS.md` takeover
- product behavior that is specific to a Copilot CLI orchestration layer, not to OMS

## Goals

- Add Copilot CLI as a first-party host adapter.
- Keep Copilot support inside the same routing-core architecture as other hosts.
- Leverage all three Copilot CLI extension pillars natively:
  - **Agents** (`*.agent.md`): project OMS phase execution as specialized agents
  - **Plugins** (`plugin.json` + bundled agents/skills/hooks): package OMS as an installable Copilot CLI plugin
  - **Hooks** (`hooks.json`): inject OMS control-plane behavior into Copilot CLI lifecycle events
- Prefer Copilot-native artifact projection that stays thin and explainable.
- Define clear support levels per workflow mode (superpowers, direct, gstack).

## Non-Goals

- Recreating a thick orchestration layer inside this repository.
- Making hook-driven orchestration the center of Copilot support.
- Making `AGENTS.md` management or injection the primary integration mechanism.
- Building a large persona-based Copilot-specific agent catalog.
- Supporting Copilot cloud agent or VS Code surfaces in this slice.

## Copilot CLI Extensibility Model

Copilot CLI provides three primary extension mechanisms that OMS can leverage:

### 1. Custom Agents (`*.agent.md`)

- Location: `.github/agents/` (project) or `~/.copilot/agents/` (user)
- Format: Markdown with YAML frontmatter
- Frontmatter fields: `name`, `description`, `tools` (array of allowed tool names)
- Usage: Selected via `/agent` slash command or automatic delegation
- Subagents: Custom agents can spawn subagents; `subagentStart` hook fires on spawn

### 2. Plugins (`plugin.json`)

- Location: Installable package directory with `plugin.json` manifest
- Structure:
  ```
  plugin/
  ├── plugin.json           # Required manifest
  ├── agents/               # Custom agents
  ├── skills/               # Skills (SKILL.md per skill)
  ├── hooks.json            # Hook configuration
  └── .mcp.json             # MCP server config (optional)
  ```
- `plugin.json` fields: `name`, `description`, `version`, `author`, `license`, `keywords`, `agents`, `skills`, `hooks`, `mcpServers`
- Installation: `copilot plugin install <source>` from GitHub repo, URL, or local path
- Discovery: Loaded from `~/.copilot/plugins/` or `--plugin-dir`

### 3. Hooks (`hooks.json`)

- Location: `.github/hooks/` (project) or inside plugin
- Format: JSON with `version` and `hooks` object
- Hook events:
  - `sessionStart`: fires when session begins, can inject `additionalContext`
  - `sessionEnd`: fires when session ends
  - `userPromptSubmitted`: fires on user input, can modify or deny
  - `preToolUse`: fires before tool execution, can deny or modify arguments
  - `postToolUse`: fires after tool execution
  - `errorOccurred`: fires on errors
- Hook entries: `type: "command"`, `bash`/`powershell` scripts, `cwd`, `env`, `timeoutSec`
- Hooks receive JSON input on stdin and can return JSON on stdout

## Product Positioning

Copilot CLI should be a host adapter.

It should sit beside:

- OpenCode
- Codex
- Qwen
- Claude Code

and consume the same resolved routing result.

Copilot CLI should not redefine:

- route semantics
- source semantics
- profile semantics

## Projection Strategy

### Agent Projection

Each OMS phase should map to a Copilot CLI custom agent:

| OMS Phase | Agent File | Agent Name | Description |
|-----------|-----------|------------|-------------|
| brainstorming | `oms-brainstorm.agent.md` | `oms-brainstorm` | Brainstorming and ideation specialist |
| writing-plans | `oms-plan.agent.md` | `oms-plan` | Implementation planning specialist |
| subagent-driven-development | `oms-execute.agent.md` | `oms-execute` | Subagent-driven execution specialist |
| requesting-code-review | `oms-review.agent.md` | `oms-review` | Code review specialist |
| verification-before-completion | `oms-verify.agent.md` | `oms-verify` | Verification and completion specialist |
| frontend-design | `oms-visual.agent.md` | `oms-visual` | Frontend design specialist |
| webapp-testing | `oms-web-test.agent.md` | `oms-web-test` | Web application testing specialist |

For direct mode, each intent maps to an `rt-<intent>.agent.md` agent.

Agent frontmatter format:

```markdown
---
name: oms-brainstorm
description: OMS brainstorming specialist — uses superpowers/writing-plans workflow entry
tools: ["bash", "edit", "view"]
---

You are an OMS brainstorming specialist...
```

### Plugin Projection

OMS should project as a Copilot CLI plugin bundle:

```
oh-my-superagents-copilot/
├── plugin.json
├── agents/
│   ├── oms-brainstorm.agent.md
│   ├── oms-plan.agent.md
│   ├── oms-execute.agent.md
│   ├── oms-review.agent.md
│   ├── oms-verify.agent.md
│   ├── oms-visual.agent.md
│   └── oms-web-test.agent.md
├── skills/
│   ├── oms-status/
│   │   └── SKILL.md
│   ├── oms-use/
│   │   └── SKILL.md
│   ├── oms-disable/
│   │   └── SKILL.md
│   ├── oms-sync/
│   │   └── SKILL.md
│   └── oms-doctor/
│       └── SKILL.md
├── hooks.json
└── .mcp.json (optional, future)
```

### Hook Projection

OMS should use Copilot CLI hooks to inject control-plane behavior:

#### `sessionStart` Hook

Injects OMS status context into every new session:

```json
{
  "type": "command",
  "bash": "npx oh-my-superagents status --host copilot --json 2>/dev/null || echo '{}'",
  "timeoutSec": 10
}
```

The hook output provides `additionalContext` that informs the session about the current OMS preset, lane, and compatibility state.

#### `preToolUse` Hook (Future)

Can enforce policy decisions before tool execution (e.g., block certain tools based on OMS policy rules).

#### `subagentStart` Hook (Future)

Can inject lane-specific context when OMS agents spawn subagents.

## Control-Plane Expectations

Copilot CLI should join the same high-level control-plane contract as other hosts:

- `sync --host copilot`: materialize agents, plugin bundle, skills, and hooks
- `status --host copilot`: report effective state, compatibility, and artifact sync state
- `doctor --host copilot`: diagnose missing-artifact or capability issues
- `use <preset> --host copilot`: switch presets and re-sync
- `disable --host copilot`: disable OMS and clean up Copilot artifacts
- `explain --host copilot`: trace route, source, and profile resolution

## Capability Decisions

### Supported Combinations

| Workflow Mode | Source | Projection | Command Support |
|--------------|--------|------------|-----------------|
| superpowers | superpowers | Full agents + plugin + hooks | status, use, disable, sync, doctor, explain |
| superpowers | gstack | Full agents + plugin | status, use, disable, sync, doctor, explain |
| direct | direct | Agents only | status, doctor, sync |

### Unsupported in First Slice

- Direct mode `explain --intent` (add after first slice)
- `postToolUse` hooks for policy enforcement (add after first slice)
- `subagentStart` hooks for lane context injection (add after first slice)
- MCP server projection (future, when OMS context providers map cleanly)

## Artifact Locations

| Artifact | Path | Scope |
|----------|------|-------|
| Standalone agents (project) | `.github/agents/oms-*.agent.md` | Project |
| Standalone agents (user) | `~/.copilot/agents/oms-*.agent.md` | User |
| Plugin bundle | `plugins/oh-my-superagents-copilot/` | Project |
| Plugin manifest | `plugins/oh-my-superagents-copilot/plugin.json` | Project |
| Plugin agents | `plugins/oh-my-superagents-copilot/agents/*.agent.md` | Project |
| Plugin skills | `plugins/oh-my-superagents-copilot/skills/*/SKILL.md` | Project |
| Plugin hooks | `plugins/oh-my-superagents-copilot/hooks.json` | Project |
| Project hooks | `.github/hooks/oms-hooks.json` | Project |

## Compatibility Monitoring

Copilot CLI should eventually have its own compatibility monitor.

Detection strategy:

- Check for `superpowers` install in `~/.copilot/plugins/` or `.github/agents/`
- Read `plugin.json` manifests for version metadata
- Evaluate against the same compatibility matrix as other hosts

First-slice scope: detection without blocking. Add blocking in a later slice.

## Bootstrap Flow

`bootstrap --host copilot` should:

1. Create a starter `oh-my-superagents.config.jsonc` if none exists
2. Scaffold the plugin bundle in `plugins/oh-my-superagents-copilot/`
3. Create the plugin manifest (`plugin.json`)
4. Generate phase agents in `agents/`
5. Generate control-plane skills in `skills/`
6. Generate hooks configuration in `hooks.json`
7. Print install instructions: `copilot plugin install ./plugins/oh-my-superagents-copilot`

After bootstrap, the user:

1. Restarts Copilot CLI
2. Runs `copilot plugin install ./plugins/oh-my-superagents-copilot` (or `--plugin-dir`)
3. Verifies with `/agent` and `/skills list`

## Temporary Disable

`disable --host copilot` should:

1. Remove OMS-owned `.github/agents/oms-*.agent.md` files
2. Remove the plugin bundle directory `plugins/oh-my-superagents-copilot/`
3. Remove OMS-owned `.github/hooks/oms-hooks.json`
4. Not modify `AGENTS.md` or user-owned Copilot configuration

## Testing Strategy

### Unit Tests

- `copilot.test.ts`: Agent rendering, plugin manifest generation, skill rendering, hooks generation
- Capability decisions for Copilot host
- Profile-to-agent mapping
- Ownership marker format

### Integration Tests

- Full `sync --host copilot` round-trip
- Bootstrap flow
- Disable and cleanup
- Mode switching (superpowers ↔ direct)

### Test Artifacts

Verify generated:

- `*.agent.md` files have valid YAML frontmatter
- `plugin.json` has correct structure and references
- `hooks.json` is valid JSON with correct version
- `SKILL.md` files have correct format

## Recommended Delivery Direction

Implementation should proceed in focused slices:

1. **Slice 1**: Core `copilot.ts` adapter with agent projection + capability decisions + CLI integration
2. **Slice 2**: Plugin bundle projection + bootstrap flow + control-plane skills
3. **Slice 3**: Hooks projection (`sessionStart` for status injection)
4. **Slice 4**: Compatibility monitor for Copilot CLI
5. **Slice 5**: Direct mode support on Copilot CLI

## Explicit Red Lines

The following should remain outside the default Copilot support model:

- persona-first agent catalogs
- hook-centric orchestration as the primary execution model
- `AGENTS.md` takeover or large-scale mutation
- opaque runtime behavior that bypasses OMS explainability
- MCP server projection that duplicates OMS context provider logic

These boundaries protect the project's core identity.

## Recommendation

Add Copilot CLI as a first-party thin host adapter using the Agent + Plugin + Hooks model.

Leverage Copilot CLI's native extensibility pillars to express OMS semantics natively, but keep OMS aligned with its own architecture:

- generic routing core
- explicit source and profile resolution
- thin host-native projection
- no slide into a thick orchestration product
