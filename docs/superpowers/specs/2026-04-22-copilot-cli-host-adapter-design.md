# Copilot CLI Host Adapter Design

## Summary

This design adds GitHub Copilot CLI as a first-party host adapter in oh-my-superagents (OMS), using the **Agent + Plugin + Hooks** architecture pattern.

Copilot CLI support should:

- consume the same resolved route, source, and profile decisions as other hosts
- project them into Copilot-native artifacts (commands, configuration, hooks)
- preserve OMS as a thin routing and control-plane product
- integrate with Copilot's existing CLI extension mechanisms

## Problem

GitHub Copilot CLI is a widely used AI-powered command-line tool that provides intelligent code suggestions, chat capabilities, and workspace context awareness. However, it currently lacks:

1. **Unified workflow routing**: No standard way to route different development phases (brainstorming, planning, execution, review) to appropriate models and configurations
2. **Configuration management**: No centralized preset/profile system for different work modes
3. **Host-native integration**: No OMS-compatible control plane commands
4. **Extensibility hooks**: Limited ability to inject custom workflows into Copilot's lifecycle

The gap mirrors what OMS solved for OpenCode, Codex, Qwen, and Claude Code.

## Goals

- Add Copilot CLI as a first-party host adapter
- Implement **Agent + Plugin + Hooks** architecture:
  - **Agent**: OMS routing decision agent for Copilot
  - **Plugin**: Copilot CLI extension entrypoint
  - **Hooks**: Workflow lifecycle hooks (pre-execution, post-execution, phase transitions)
- Support `superpowers` workflow routing for Copilot
- Generate Copilot-native artifacts (configuration, commands, hooks)
- Support OMS control plane: `status`, `use`, `disable`, `sync`, `doctor`

## Non-Goals

- Reimplementing Copilot CLI's core functionality
- Replacing Copilot's native chat and completion systems
- Building Copilot-specific model providers (use existing profile model IDs)
- Heavy orchestration layer beyond routing decisions

## Architecture: Agent + Plugin + Hooks

### 3-Layer Integration Model

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Hooks Layer                                        │
│  - Pre-execution hooks (context preparation)                 │
│  - Post-execution hooks (artifact handling)                  │
│  - Phase transition hooks (workflow state management)        │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Plugin Layer                                       │
│  - Copilot CLI extension entrypoint                          │
│  - Command registration (oms-status, oms-use, etc.)          │
│  - Configuration integration with Copilot settings            │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Agent Layer                                        │
│  - OMS routing decision agent                                │
│  - Profile/preset resolution                                 │
│  - Source selection (superpowers/gstack/direct)              │
└─────────────────────────────────────────────────────────────┘
```

### Component Details

#### 1. Agent Layer

The **Agent** is the core OMS routing decision component for Copilot:

**Responsibilities**:
- Resolve canonical routes from phase inputs
- Select appropriate profiles based on preset configuration
- Determine effective workflow sources
- Provide routing metadata to Copilot context

**Implementation**:
```typescript
// src/copilot.ts - Core agent functionality
export function buildCopilotAgent(config: RouterConfig): CopilotAgent {
  return {
    resolveRoute: (phase: BuiltInPhase) => resolvePhase(config, phase),
    getActivePreset: () => config.settings.activePreset,
    getProfile: (profileId: string) => config.profiles[profileId],
  }
}
```

#### 2. Plugin Layer

The **Plugin** provides Copilot CLI extension capabilities:

**Entry Points**:
- Copilot settings integration (`.github/copilot/settings.json`)
- Custom command registration via Copilot's extension API
- OMS control plane command wrappers

**Generated Commands**:
- `copilot oms status` - Show current OMS state
- `copilot oms use <preset>` - Switch preset
- `copilot oms disable` - Temporarily disable OMS
- `copilot oms sync` - Sync artifacts
- `copilot oms doctor` - Diagnostics

**Configuration Integration**:
```json
// .github/copilot/settings.json (OMS-managed section)
{
  "oms": {
    "version": "0.1.0",
    "activePreset": "default",
    "enabled": true,
    "routing": {
      "brainstorming": "strategy",
      "writing-plans": "build"
    }
  }
}
```

#### 3. Hooks Layer

The **Hooks** layer provides lifecycle integration points:

**Hook Types**:

1. **Pre-execution Hook**:
   - Prepare context packs
   - Inject routing metadata
   - Set up lane-specific configurations

2. **Post-execution Hook**:
   - Capture artifacts
   - Update context index
   - Trigger compression if needed

3. **Phase Transition Hook**:
   - Track workflow progression
   - Update lifecycle stage
   - Persist session state

**Hook Registration**:
```typescript
// Hooks are registered in Copilot's lifecycle
export interface CopilotHooks {
  preExecute: (context: ExecutionContext) => Promise<void>
  postExecute: (result: ExecutionResult) => Promise<void>
  onPhaseTransition: (from: Phase, to: Phase) => Promise<void>
}
```

## Copilot-Native Artifacts

### Generated Files

1. **Copilot Settings** (`.github/copilot/settings.json`):
   - OMS configuration section
   - Command aliases
   - Routing preferences

2. **Copilot Instructions** (`.github/copilot/instructions.md`):
   - OMS routing guidelines
   - Phase-specific instructions
   - Profile selection hints

3. **OMS Agent Manifest** (`.github/copilot/oms-agent.json`):
   - Agent capabilities declaration
   - Supported phases and routes
   - Hook registrations

4. **Hook Scripts** (`.github/copilot/hooks/`):
   - `pre-execute.js` - Pre-execution hook
   - `post-execute.js` - Post-execution hook
   - `phase-transition.js` - Phase transition hook

### Artifact Ownership

OMS owns and manages:
- `.github/copilot/settings.json` (OMS section only)
- `.github/copilot/instructions.md` (OMS-generated content)
- `.github/copilot/oms-agent.json`
- `.github/copilot/hooks/oms-*`

## Control Plane Commands

### `sync --host copilot`

Materializes all Copilot-native artifacts:

1. Reads `oh-my-superagents.config.jsonc`
2. Resolves active preset and profiles
3. Generates Copilot settings
4. Writes instruction files
5. Creates agent manifest
6. Installs hook scripts

### `status --host copilot`

Reports Copilot-specific state:

- Active preset
- Current phase (if in workflow)
- Hook registration status
- Artifact sync state

### `doctor --host copilot`

Diagnostics for Copilot integration:

- OMS section presence in Copilot settings
- Hook script existence and permissions
- Agent manifest validity
- Routing configuration correctness

### `use <preset> --host copilot`

Switches preset and updates Copilot settings:

1. Validates preset exists
2. Updates `activePreset` in Copilot settings
3. Regenerates instructions for new preset
4. Syncs hooks if lane configuration changed

### `disable --host copilot`

Temporarily disables OMS for Copilot:

1. Sets `enabled: false` in Copilot settings
2. Removes OMS hooks (preserves backups)
3. Updates instructions to indicate disabled state

## Capability Mapping

### Supported Workflow Sources

| Source | Support Level | Notes |
|--------|--------------|-------|
| `superpowers` | Full | Primary workflow source |
| `gstack` | Partial | Subject to Copilot context limits |
| `direct` | Experimental | User-defined intents |

### Phase to Copilot Mapping

| OMS Phase | Copilot Context | Instruction File |
|-----------|-----------------|------------------|
| `brainstorming` | `copilot-brainstorm` | `instructions-brainstorm.md` |
| `writing-plans` | `copilot-plan` | `instructions-plan.md` |
| `subagent-driven-development` | `copilot-execute` | `instructions-execute.md` |
| `requesting-code-review` | `copilot-review` | `instructions-review.md` |
| `verification-before-completion` | `copilot-verify` | `instructions-verify.md` |
| `frontend-design` | `copilot-visual` | `instructions-visual.md` |
| `webapp-testing` | `copilot-web-test` | `instructions-web-test.md` |

## Implementation Phases

### Phase 1: Core Agent (MVP)

**Deliverables**:
- `src/copilot.ts` - Core agent implementation
- Copilot settings generator
- Basic `sync` support
- `status` and `doctor` commands

**Artifacts**:
- `.github/copilot/settings.json` (OMS section)
- `.github/copilot/oms-agent.json`

### Phase 2: Plugin Integration

**Deliverables**:
- Copilot CLI command registration
- `oms-*` command wrappers
- Configuration hot-reload

**Artifacts**:
- Command definitions in Copilot settings
- Command alias mappings

### Phase 3: Hooks System

**Deliverables**:
- Pre-execution hook implementation
- Post-execution hook implementation
- Phase transition tracking
- Context pack integration

**Artifacts**:
- `.github/copilot/hooks/oms-pre-execute.js`
- `.github/copilot/hooks/oms-post-execute.js`
- `.github/copilot/hooks/oms-phase-transition.js`

### Phase 4: Advanced Features

**Deliverables**:
- Lane-aware routing for Copilot
- Subagent execution support
- Compression integration
- Context provider support

## Configuration Example

```jsonc
// oh-my-superagents.config.jsonc
{
  "$schema": "./node_modules/oh-my-superagents/schemas/oh-my-superagents.schema.json",
  "settings": {
    "enabled": true,
    "activePreset": "default",
    "commandPrefix": "oms",
    "superpowersCompatibility": {
      "mode": "warn"
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "description": "General development with Copilot",
      "profiles": {
        "strategy": {
          "model": "github/copilot-gpt-4o",
          "effort": "deep"
        },
        "build": {
          "model": "github/copilot-gpt-4o",
          "effort": "balanced"
        }
      },
      "routes": {
        "brainstorming": "strategy",
        "writing-plans": "build"
      },
      "defaultRoute": "build"
    }
  }
}
```

## Explicit Red Lines

To maintain OMS architectural integrity:

1. **No Copilot-native model providers**: Use existing profile model IDs
2. **No chat UI customization**: Work within Copilot's existing interface
3. **No heavy orchestration**: Keep routing decisions thin
4. **No state machine**: Don't build complex workflow state management
5. **No Copilot core replacement**: Complement, never compete

## Compatibility Considerations

### Copilot CLI Versions

Target Copilot CLI versions:
- Copilot CLI 1.x (current)
- Copilot for CLI 2.x (when available)

### GitHub Requirements

- GitHub account with Copilot subscription
- Repository with `.github/` directory access
- Appropriate permissions for Copilot settings

## Success Criteria

1. `sync --host copilot` generates valid Copilot artifacts
2. `oms-status` shows correct preset and routing
3. `oms-use <preset>` switches presets seamlessly
4. Hooks execute at appropriate lifecycle points
5. All 7 superpowers phases routable via Copilot
6. Tests pass with >80% coverage for copilot module

## Recommendation

Implement Copilot CLI support using the **Agent + Plugin + Hooks** architecture:

1. **Agent**: OMS routing decision layer (`src/copilot.ts`)
2. **Plugin**: Copilot settings and command integration
3. **Hooks**: Lifecycle integration for context and artifact management

This approach maintains OMS's thin-adapter philosophy while providing deep Copilot CLI integration.
