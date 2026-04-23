# Copilot CLI Host Deep Support Design

## Summary

This design adds GitHub Copilot CLI as a first-party host adapter with deep integration using the Agent + Plugin + Hooks approach, providing full OMS control-plane support and workflow routing for Copilot CLI.

## Problem

The repository supports OpenCode, Codex, Qwen, and Claude Code as host adapters, but GitHub Copilot CLI is missing. Copilot CLI is a meaningful host surface for AI-native development workflows, and adding it as a first-class host extends OMS's reach to a broader developer audience.

## Goals

- Add GitHub Copilot CLI as a first-party host adapter with deep integration
- Use the Agent + Plugin + Hooks approach for comprehensive host support
- Consume the same resolved route, source, and profile decisions as other hosts
- Project them into Copilot CLI-native artifacts
- Support full OMS control-plane commands: `status`, `sync`, `doctor`, `explain`
- Support both `superpowers` workflow mode and experimental direct mode
- Keep OMS aligned with its thin-adapter architecture

## Non-Goals

- Recreating GitHub Copilot's native functionality inside OMS
- Making hook-driven orchestration the center of Copilot support
- Building a large persona-based Copilot-specific agent catalog
- Taking over the user's Copilot configuration

## Host Analysis: GitHub Copilot CLI

### Host Primitives

GitHub Copilot CLI provides:

1. **Agents**: Markdown-based agent definitions in `.github/copilot/agents/`
2. **Skills**: Markdown-based skill definitions in `.github/copilot/skills/`
3. **Hooks**: Shell script hooks for lifecycle events (pre/post command execution)
4. **Configuration**: `copilot.json` for project-level settings

### Artifact Organization

```
.github/
  copilot/
    agents/
      oms-brainstorm.md
      oms-plan.md
      oms-execute.md
      oms-review.md
      oms-verify.md
      oms-visual.md
      oms-web-test.md
    skills/
      oms-status/SKILL.md
      oms-use/SKILL.md
      oms-disable/SKILL.md
      oms-sync/SKILL.md
      oms-doctor/SKILL.md
    hooks/
      pre-command.sh
      post-command.sh
```

### Host Capabilities

- Project-scoped agents and skills
- Hook-based lifecycle integration
- Natural language command generation
- Model selection support
- Configuration via `copilot.json`

## Architecture

### Agent Layer

Generate Copilot CLI agent files for each OMS phase:

| OMS Phase | Copilot Agent | File |
|-----------|---------------|------|
| brainstorming | oms-brainstorm | `.github/copilot/agents/oms-brainstorm.md` |
| writing-plans | oms-plan | `.github/copilot/agents/oms-plan.md` |
| subagent-driven-development | oms-execute | `.github/copilot/agents/oms-execute.md` |
| requesting-code-review | oms-review | `.github/copilot/agents/oms-review.md` |
| verification-before-completion | oms-verify | `.github/copilot/agents/oms-verify.md` |
| frontend-design | oms-visual | `.github/copilot/agents/oms-visual.md` |
| webapp-testing | oms-web-test | `.github/copilot/agents/oms-web-test.md` |

### Plugin Layer

Generate Copilot CLI skill files for OMS control-plane commands:

| OMS Command | Copilot Skill | File |
|-------------|---------------|------|
| status | oms-status | `.github/copilot/skills/oms-status/SKILL.md` |
| use | oms-use | `.github/copilot/skills/oms-use/SKILL.md` |
| disable | oms-disable | `.github/copilot/skills/oms-disable/SKILL.md` |
| sync | oms-sync | `.github/copilot/skills/oms-sync/SKILL.md` |
| doctor | oms-doctor | `.github/copilot/skills/oms-doctor/SKILL.md` |

### Hooks Layer

Generate Copilot CLI hook scripts for lifecycle integration:

| Hook | File | Purpose |
|------|------|---------|
| pre-command | `.github/copilot/hooks/pre-command.sh` | Pre-execution validation |
| post-command | `.github/copilot/hooks/post-command.sh` | Post-execution cleanup |

## Artifact Format

### Agent File Format

```markdown
# generated-by: oh-my-superagents; do-not-edit: true
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.plan; projection=agent; rendered-name=oms-plan -->

# Agent: oms-plan

## Purpose
This project-scoped Copilot wrapper routes the `writing-plans` phase through OMS profile `planner`.

## Instructions
Use the workflow entry `superpowers/writing-plans` for `phase.plan` whenever it is relevant.
If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.
Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.

## Route Metadata
- canonical route: `phase.plan`
- source: `superpowers`
- profile: `planner`
- model: `anthropic/claude-sonnet-4-5`
```

### Skill File Format

```markdown
# generated-by: oh-my-superagents; do-not-edit: true
<!-- oms-control-plane: stage=1; host=copilot; artifact=skill; logical-command=status; rendered-name=oms-status -->

# Skill: oms-status

## Purpose
Show OMS status for Copilot CLI.

## Instructions
Run `oh-my-superagents status --host copilot` and present the results.
```

### Hook File Format

```bash
#!/bin/bash
# generated-by: oh-my-superagents; do-not-edit: true
<!-- oms-hook: stage=1; host=copilot; hook=pre-command; rendered-name=pre-command.sh -->

# Pre-command hook for OMS Copilot integration
# Validates OMS state before command execution

COMMAND="$1"
if [ -f ".copilot/oh-my-superagents/state.json" ]; then
  STATE=$(cat .copilot/oh-my-superagents/state.json)
  if echo "$STATE" | grep -q '"enabled": false'; then
    echo "OMS is disabled for this project"
    exit 0
  fi
fi
```

## Control-Plane Integration

### Supported Commands

| Command | Support Level | Notes |
|---------|---------------|-------|
| status | Full | Reports OMS state for Copilot |
| use | Full | Switches preset for Copilot |
| disable | Full | Disables OMS for Copilot |
| sync | Full | Materializes Copilot artifacts |
| doctor | Full | Diagnoses Copilot integration |
| explain | Full | Explains route resolution |

### Artifact Ownership

OMS-owned Copilot artifacts use the marker `generated-by: oh-my-superagents; do-not-edit: true` for ownership detection during sync and cleanup.

## Capability Policy

### Host Projection Decision

```typescript
// In capabilities.ts
if (input.host === "copilot" && input.workflowKind === "direct") {
  return unsupportedDecision("unsupported_host_direct_projection")
}
```

### Control-Plane Command Decision

```typescript
// In capabilities.ts
if (input.host === "copilot" && input.command === "explain") {
  return supportedDecision() // explain is supported on copilot
}
```

## File Structure

### New Files

- `src/copilot.ts` - Copilot CLI host adapter
- `test/copilot.test.ts` - Copilot adapter tests

### Modified Files

- `src/capabilities.ts` - Add Copilot to capability host type
- `src/cli.ts` - Add Copilot CLI commands
- `src/control-plane.ts` - Add Copilot control-plane support
- `src/materialize.ts` - Add Copilot artifact ownership detection
- `src/index.ts` - Export Copilot module

## Implementation Slices

### Slice 1: Basic Agent Rendering

- Create `src/copilot.ts` with `buildCopilotArtifacts()`
- Render agent files for all 7 phases
- Add ownership markers

### Slice 2: Control-Plane Skills

- Render skill files for control-plane commands
- Add command prefix and alias support

### Slice 3: Hooks Integration

- Generate pre/post command hooks
- Add lifecycle event handling

### Slice 4: CLI Integration

- Add `--host copilot` to all CLI commands
- Add Copilot-specific diagnostics

### Slice 5: Capability Policy

- Update capability registry for Copilot
- Add host projection decisions

## Testing Strategy

### Unit Tests

- Test agent file rendering
- Test skill file rendering
- Test hook file generation
- Test ownership marker detection

### Integration Tests

- Test full sync flow for Copilot
- Test status/diagnostic output
- Test explain trace for Copilot routes

## Migration Path

No migration needed - this is a new host adapter addition.

## Success Criteria

1. All 7 OMS phases render as Copilot agents
2. All 5 control-plane commands render as Copilot skills
3. Pre/post hooks generate correctly
4. `sync --host copilot` materializes all artifacts
5. `status --host copilot` reports correct state
6. `doctor --host copilot` diagnoses issues
7. `explain --host copilot` traces routes
8. All tests pass
