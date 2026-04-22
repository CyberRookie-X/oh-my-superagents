# Copilot CLI Host Support Design Specification

> **Goal:** Add complete GitHub Copilot CLI host support using Agent + Plugin + Hooks scheme, enabling OMS to route superpowers workflow phases to Copilot CLI agents, skills, and lifecycle hooks.

## Overview

GitHub Copilot CLI (`gh copilot`) is a CLI-based AI assistant from GitHub that supports a plugin system with custom agents, skills, hooks, and MCP server integrations. This spec defines how `oh-my-superagents` will support Copilot CLI as a new host adapter alongside OpenCode, Codex, Qwen, and Claude Code.

## Copilot CLI Architecture

### Plugin System

Copilot CLI plugins are structured directories containing:

1. **Manifest** (`plugin.json`): Required file defining plugin metadata and component paths
2. **Agents** (`agents/*.agent.md`): Custom specialized AI assistants
3. **Skills** (`skills/*/SKILL.md`): Discrete callable capabilities
4. **Hooks** (`hooks.json` or `hooks/hooks.json`): Event handlers for agent lifecycle
5. **MCP Servers** (`.mcp.json`): Model Context Protocol integrations

### Plugin Manifest Schema

```json
{
  "name": "oh-my-superagents-copilot",
  "version": "0.1.0",
  "description": "OMS routing and control plane for GitHub Copilot CLI",
  "agents": "agents",
  "skills": "skills",
  "hooks": "hooks.json",
  "mcpServers": ".mcp.json",
  "commands": ["commands"]
}
```

### Agent Format

Agents are Markdown files with YAML frontmatter:

```markdown
---
name: oms-brainstorm
description: Brainstorm phase agent for superpowers workflow
model: gpt-4
tools: ["*"]
---

# Instructions

Load and follow the upstream workflow entry `superpowers/brainstorming` for `phase.brainstorm` exactly.
...
```

### Skill Format

Skills are directories containing `SKILL.md`:

```markdown
---
name: oms-status
description: Show OMS status for Copilot CLI
model: gpt-4o
tools: ["bash", "read", "write"]
---

Run `oh-my-superagents status --host copilot $ARGUMENTS` from the repository root.
```

### Hooks System

Hooks intercept agent lifecycle events:

- `sessionStart`: Fires when a new session begins
- `sessionEnd`: Fires when a session ends
- `userPromptSubmitted`: Fires when user submits a prompt
- `preToolUse`: Fires before tool execution
- `postToolUse`: Fires after tool execution
- `errorOccurred`: Fires when an error occurs

Hook configuration:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "./scripts/oms-session-init.sh",
        "env": { "OMS_HOST": "copilot" }
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "bash": "./scripts/oms-tool-guard.sh"
      }
    ]
  }
}
```

## Host Adapter Design

### File Structure

**Create:**
- `src/copilot.ts` - Copilot CLI artifact generation and host-specific mapping
- `src/copilot-hooks.ts` - Hooks configuration builder
- `test/copilot.test.ts` - Copilot adapter tests
- `test/copilot-hooks.test.ts` - Hooks tests

**Modify:**
- `src/cli.ts` - Add `--host copilot` support
- `src/capabilities.ts` - Add Copilot CLI capability decisions
- `src/index.ts` - Export Copilot adapter
- `src/materialize.ts` - Add Copilot ownership markers
- `README.md` - Document Copilot CLI host usage

### Capabilities Matrix

| Capability | Copilot CLI |
|------------|-------------|
| superpowers workflow routing | Full |
| Direct mode | Planned |
| OMS control plane | Full |
| Host bootstrap | Plugin marketplace |
| Compatibility monitor | Planned |
| Generated artifacts | Agents + Skills + Hooks |
| Temporary disable helper | Via hooks |

### Phase-to-Agent Mapping

| Phase | Copilot Agent |
|-------|---------------|
| brainstorming | `oms-brainstorm.agent.md` |
| writing-plans | `oms-plan.agent.md` |
| subagent-driven-development | `oms-execute.agent.md` |
| requesting-code-review | `oms-review.agent.md` |
| verification-before-completion | `oms-verify.agent.md` |
| frontend-design | `oms-visual.agent.md` |
| webapp-testing | `oms-web-test.agent.md` |

### Control Plane Skills

| Command | Skill Name |
|---------|------------|
| status | `oms-status` |
| use | `oms-use` |
| disable | `oms-disable` |
| sync | `oms-sync` |
| doctor | `oms-doctor` |

### Hooks Integration

OMS will generate hooks for:

1. **sessionStart**: Load OMS config and check compatibility
2. **preToolUse**: Apply tool policy rules if configured
3. **postToolUse**: Update context compression state
4. **sessionEnd**: Snapshot control plane state

## Plugin Package Structure

```
plugins/oh-my-superagents-copilot/
├── plugin.json
├── hooks.json
├── .mcp.json (optional)
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
│   │   └── SKILL.md
│   └── oms-no-superpowers/
│   │   └── SKILL.md
└── scripts/
    ├── oms-session-init.sh
    ├── oms-tool-guard.sh
    └── oms-session-end.sh
```

## Marketplace Integration

Copilot CLI plugins can be installed from:
- GitHub repositories (`user/repo`)
- Local paths
- URLs

OMS will provide:
- Local plugin bundle for development
- Marketplace entry for distribution
- Bootstrap command for initial setup

## Bootstrap Flow

```bash
oh-my-superagents bootstrap --host copilot
```

This will:
1. Create starter `oh-my-superagents.config.jsonc` if missing
2. Scaffold plugin directory at `plugins/oh-my-superagents-copilot/`
3. Generate agents and skills
4. Create hooks configuration
5. Create marketplace entry for plugin discovery

## Ownership Markers

Copilot artifacts use ownership markers:

**Agent:**
```markdown
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->
```

**Skill:**
```markdown
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-control-plane: stage=1; host=copilot; artifact=skill; logical-command=status; rendered-name=oms-status -->
```

## Implementation Phases

### Phase 1: Core Adapter
- Implement `src/copilot.ts` with agent/skill rendering
- Add Copilot CLI to capabilities registry
- Implement ownership marker parsing

### Phase 2: Hooks System
- Implement `src/copilot-hooks.ts`
- Create hook scripts for lifecycle events
- Add hooks.json generation

### Phase 3: Bootstrap & Marketplace
- Implement `src/copilot-bootstrap.ts`
- Create plugin.json manifest
- Add marketplace.json entry

### Phase 4: CLI Integration
- Add `--host copilot` to CLI commands
- Implement sync and doctor commands
- Add compatibility monitoring

### Phase 5: Documentation
- Update README.md
- Create Copilot CLI specific docs
- Add usage examples

## Testing Strategy

- Unit tests for artifact rendering
- Integration tests for CLI commands
- Ownership marker validation tests
- Hooks configuration tests

## Compatibility Considerations

- Copilot CLI uses different model IDs than OpenCode/Codex
- Need model ID translation layer
- Hooks execution differs from OpenCode plugin hooks
- Session lifecycle management differs

## Success Criteria

1. `oh-my-superagents sync --host copilot` generates valid plugin bundle
2. `oh-my-superagents explain --host copilot --phase brainstorming` returns correct routing
3. Generated plugin passes Copilot CLI validation
4. Hooks execute correctly on agent lifecycle events
5. Control plane commands work through skill wrappers

## Dependencies

- No new production dependencies
- Hook scripts use standard shell commands
- Plugin format is pure JSON/Markdown

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Copilot CLI API changes | Use stable plugin schema, monitor GitHub docs |
| Model ID differences | Add model mapping layer |
| Hooks execution errors | Add fallback behavior, log warnings |
| Plugin conflicts | Use unique naming, ownership markers |