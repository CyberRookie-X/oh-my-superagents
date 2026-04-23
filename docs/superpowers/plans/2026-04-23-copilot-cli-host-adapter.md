# Copilot CLI Host Adapter Implementation Plan

## Overview

Implement Copilot CLI as a first-party host adapter in oh-my-superagents, following the same architecture pattern as existing hosts (OpenCode, Codex, Qwen, Claude Code).

## Phase 1: Foundation

### 1.1 Host Registry Addition
- Add `copilot` to host enum in `src/types.ts` or equivalent
- Add Copilot CLI to capability matrix in `src/capabilities.ts`
- Create basic host detection in `src/superpowers-detectors.ts`

### 1.2 Basic Adapter Structure
- Create `src/copilot.ts` with basic adapter interface
- Implement host info reporting
- Add minimal required exports

**Files to modify/create:**
- `src/copilot.ts` (new)
- `src/capabilities.ts` (modify)
- `src/superpowers-detectors.ts` (modify)

## Phase 2: Control Plane Integration

### 2.1 Status Command
- Implement `status` for Copilot CLI in control-plane
- Check for `gh` CLI installation
- Check for Copilot CLI extension
- Report subscription status

### 2.2 Doctor Command
- Implement diagnostic checks
- Verify required commands available
- Check configuration state

**Files to modify:**
- `src/control-plane.ts`
- `src/cli.ts`
- `src/copilot.ts`

## Phase 3: Artifact Materialization

### 3.1 Sync Command Implementation
- Implement `sync --host copilot`
- Generate project-specific configuration
- Create wrapper scripts for common operations

### 3.2 Direct Mode Support
- Support `status`, `doctor`, `sync` intents
- Generate appropriate artifacts

### 3.3 Materialize Integration
- Add Copilot CLI rules to `src/materialize.ts`
- Implement artifact ownership tracking

**Files to modify/create:**
- `src/materialize.ts` (modify)
- `src/workflow-direct.ts` (modify)

## Phase 4: Workflow Integration

### 4.1 Superpowers Mapping
- Map phases to Copilot CLI commands
- Create phase-specific wrapper generation

### 4.2 Explain Command
- Add `--host copilot` support to explain
- Route tracing for Copilot CLI

**Files to modify:**
- `src/workflow-superpowers.ts` (modify)
- `src/cli.ts` (modify)

## Phase 5: Testing & Documentation

### 5.1 Unit Tests
- Test host detection
- Test control-plane commands
- Test artifact generation

### 5.2 Integration Tests
- Test full sync workflow
- Test artifact cleanup
- Test compatibility matrix

### 5.3 Documentation
- Update README with Copilot CLI support matrix
- Add usage examples to documentation
- Update architecture diagrams

## Technical Implementation Details

### Host Detection

```typescript
// Detection logic
async function detectCopilotCLI(): Promise<boolean> {
  const ghVersion = await execCommand('gh --version');
  const copilotVersion = await execCommand('gh copilot --version');
  return ghVersion && copilotVersion;
}
```

### Artifact Generation

Generate shell wrappers like:
```bash
#!/bin/bash
# OMS Copilot CLI wrapper for brainstorming
gh copilot suggest "$@"
```

### Configuration

Support `oh-my-superagents.config.jsonc` with:
```jsonc
{
  "settings": {
    "hosts": {
      "copilot": {
        "enabled": true
      }
    }
  }
}
```

## Dependencies

- `gh` CLI must be installed
- `gh copilot` extension must be available
- No additional npm dependencies required

## Success Criteria

1. `oh-my-superagents status --host copilot` reports accurate status
2. `oh-my-superagents sync --host copilot` generates valid artifacts
3. `oh-my-superagents doctor --host copilot` provides diagnostics
4. Direct mode intents work for Copilot CLI
5. Superpowers workflow mapping functions correctly

## Timeline Estimate

- Phase 1-2: 2-3 hours
- Phase 3: 2-3 hours
- Phase 4: 2-3 hours
- Phase 5: 1-2 hours

Total: ~8-12 hours
