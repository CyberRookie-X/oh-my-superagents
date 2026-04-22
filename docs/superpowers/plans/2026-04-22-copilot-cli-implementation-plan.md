# Copilot CLI Implementation Plan

## Overview

This plan outlines the implementation of GitHub Copilot CLI host support using the **Agent + Plugin + Hooks** architecture.

**Target**: Complete Phase 1-3 (Core Agent, Plugin Integration, Hooks System)  
**Timeline**: Single development session with TDD and subagent-driven development  
**Branch**: MT-5

---

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│  Hooks Layer (Phase 3)                                      │
│  - src/copilot-hooks.ts                                     │
│  - Pre/post execution hooks                                 │
│  - Phase transition tracking                                │
├─────────────────────────────────────────────────────────────┤
│  Plugin Layer (Phase 2)                                     │
│  - src/copilot-plugin.ts                                    │
│  - Copilot settings generator                               │
│  - Command registration                                     │
├─────────────────────────────────────────────────────────────┤
│  Agent Layer (Phase 1)                                      │
│  - src/copilot.ts                                           │
│  - Core routing agent                                       │
│  - Artifact builders                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Agent Implementation

### 1.1 Create `src/copilot.ts`

**Responsibilities**:
- Resolve routes for Copilot context
- Generate Copilot-native artifacts
- Map OMS phases to Copilot instructions

**Exports**:
```typescript
export type CopilotArtifact = 
  | CopilotSettingsArtifact 
  | CopilotInstructionsArtifact 
  | CopilotAgentManifestArtifact

export function buildCopilotArtifacts(config: RouterConfig): CopilotArtifacts
export function renderCopilotSettings(config: RouterConfig): string
export function renderCopilotInstructions(input: RenderInstructionsInput): string
export function renderCopilotAgentManifest(config: RouterConfig): string
```

### 1.2 Update `src/capabilities.ts`

Add Copilot to host support matrix:

```typescript
export const SUPPORTED_COPILOT_SOURCES: WorkflowSourceKind[] = [
  "superpowers",
  // "gstack" - Phase 4
  // "direct" - Phase 4
]
```

### 1.3 Update `src/cli.ts`

Add `--host copilot` support to all commands.

### 1.4 Tests

- `test/copilot.test.ts` - Unit tests for copilot module
- Test coverage >80%

---

## Phase 2: Plugin Integration

### 2.1 Create `src/copilot-plugin.ts`

**Responsibilities**:
- Generate Copilot CLI-compatible settings
- Register OMS commands in Copilot
- Handle configuration hot-reload

**Key Functions**:
```typescript
export function buildCopilotPluginConfig(config: RouterConfig): CopilotPluginConfig
export function generateCopilotCommandAliases(config: RouterConfig): Record<string, string>
```

### 2.2 Settings Integration

Generate `.github/copilot/settings.json` with OMS section:

```json
{
  "oms": {
    "version": "0.1.0",
    "activePreset": "default",
    "enabled": true,
    "commands": {
      "status": "oms-status",
      "use": "oms-use",
      "disable": "oms-disable",
      "sync": "oms-sync",
      "doctor": "oms-doctor"
    }
  }
}
```

### 2.3 Tests

- Plugin config generation
- Command alias mapping
- Settings validation

---

## Phase 3: Hooks System

### 3.1 Create `src/copilot-hooks.ts`

**Responsibilities**:
- Pre-execution context preparation
- Post-execution artifact handling
- Phase transition tracking

**Hook Types**:
```typescript
export interface CopilotHooks {
  preExecute: (context: ExecutionContext) => Promise<HookResult>
  postExecute: (result: ExecutionResult) => Promise<HookResult>
  onPhaseTransition: (from: Phase, to: Phase) => Promise<HookResult>
}
```

### 3.2 Hook Scripts

Generate JavaScript hook files:

- `.github/copilot/hooks/oms-pre-execute.js`
- `.github/copilot/hooks/oms-post-execute.js`
- `.github/copilot/hooks/oms-phase-transition.js`

### 3.3 Tests

- Hook execution flow
- Context injection
- Error handling

---

## Phase 4: Materialization Integration

### 4.1 Update `src/materialize.ts`

Add Copilot artifact materialization:

```typescript
export async function materializeCopilotArtifacts(
  artifacts: CopilotArtifacts,
  options: MaterializeOptions
): Promise<MaterializeResult>
```

### 4.2 Cleanup Support

Add Copilot artifact cleanup for `disable` command.

---

## Implementation Steps

### Step 1: Bootstrap Test Suite

```bash
# Create test file
touch test/copilot.test.ts

# Add basic structure
# Test: buildCopilotArtifacts exists
# Test: Copilot host is registered in capabilities
```

### Step 2: Implement Core Agent (TDD Cycle)

For each function:
1. Write failing test
2. Implement minimal code
3. Verify test passes
4. Refactor

**Order**:
1. `PHASE_TO_COPILOT_INSTRUCTION` mapping
2. `renderCopilotInstructions()`
3. `renderCopilotSettings()`
4. `renderCopilotAgentManifest()`
5. `buildCopilotArtifacts()`

### Step 3: Implement Plugin Layer

1. `buildCopilotPluginConfig()`
2. `generateCopilotCommandAliases()`
3. Settings integration tests

### Step 4: Implement Hooks

1. Hook interface definition
2. Pre-execution hook
3. Post-execution hook
4. Phase transition hook

### Step 5: CLI Integration

1. Add `copilot` to host enum
2. Update command handlers
3. Add copilot-specific options

### Step 6: Materialization

1. Copilot artifact writer
2. File ownership markers
3. Cleanup logic

---

## Test Strategy

### Unit Tests

```typescript
// test/copilot.test.ts
describe("Copilot Agent", () => {
  describe("buildCopilotArtifacts", () => {
    it("should generate settings artifact")
    it("should generate instructions for all phases")
    it("should generate agent manifest")
    it("should respect workflow kind")
  })

  describe("renderCopilotInstructions", () => {
    it("should include phase metadata")
    it("should reference correct workflow entry")
    it("should include profile information")
  })
})
```

### Integration Tests

```typescript
// test/copilot-integration.test.ts
describe("Copilot Integration", () => {
  it("should sync artifacts to .github/copilot/")
  it("should update settings.json with OMS section")
  it("should create hook scripts")
  it("should clean up on disable")
})
```

---

## Subagent Tasks

Use subagents for parallel development:

### Subagent 1: Core Agent
- Implement `src/copilot.ts`
- Write unit tests
- Verify phase mappings

### Subagent 2: Plugin Layer
- Implement `src/copilot-plugin.ts`
- Settings generation
- Command alias mapping

### Subagent 3: Hooks System
- Implement `src/copilot-hooks.ts`
- Hook script generation
- Lifecycle integration

### Subagent 4: Integration
- Update `src/capabilities.ts`
- Update `src/cli.ts`
- Update `src/materialize.ts`

---

## Commits

### Commit 1: Core Agent
```
feat(copilot): add Copilot CLI host adapter - Core Agent

- Add src/copilot.ts with artifact builders
- Implement phase-to-instruction mapping
- Add unit tests
```

### Commit 2: Plugin Layer
```
feat(copilot): add Copilot CLI plugin layer

- Add src/copilot-plugin.ts
- Implement settings generator
- Add command alias mapping
```

### Commit 3: Hooks System
```
feat(copilot): add Copilot CLI hooks system

- Add src/copilot-hooks.ts
- Implement pre/post execution hooks
- Add phase transition tracking
```

### Commit 4: Integration
```
feat(copilot): integrate Copilot CLI with OMS control plane

- Update capabilities.ts with copilot support
- Update cli.ts with --host copilot
- Update materialize.ts for copilot artifacts
- Add integration tests
```

---

## Verification Checklist

- [ ] `src/copilot.ts` exists and exports required functions
- [ ] `src/copilot-plugin.ts` exists
- [ ] `src/copilot-hooks.ts` exists
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] `sync --host copilot` generates artifacts
- [ ] `status --host copilot` reports correct state
- [ ] `doctor --host copilot` validates setup
- [ ] `disable --host copilot` cleans up artifacts
- [ ] All commits signed off

---

## Notes

- Follow existing patterns from `claude.ts` and `qwen.ts`
- Maintain thin adapter philosophy
- Preserve OMS routing semantics
- Test early, test often
