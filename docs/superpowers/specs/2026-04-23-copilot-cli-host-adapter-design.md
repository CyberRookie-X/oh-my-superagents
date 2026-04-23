# Copilot CLI Host Adapter Design

## Summary

This design adds GitHub Copilot CLI as a first-party host adapter in the generic routing architecture of `oh-my-superagents`.

Copilot CLI support should:

- consume the same resolved route, source, and profile decisions as other hosts
- project them into Copilot-native artifacts (skills and agents)
- preserve OMS as a thin routing and control-plane product
- follow the established pattern from Claude Code adapter (skills-based projection)

## Problem

GitHub Copilot CLI is a significant host surface for AI-native development workflows, but it is not yet supported by OMS.

The project already has sufficient core abstraction to support another host cleanly:

- canonical route model
- workflow source adapters
- capability policy registry
- artifact reconciliation layer

However, Copilot CLI support carries design risks if implemented carelessly:

- persona-heavy agent rosters
- hook-driven orchestration
- product behavior specific to Copilot, not to OMS

## Goals

- Add Copilot CLI as a first-party host adapter
- Keep Copilot support inside the same routing-core architecture as other hosts
- Prefer Copilot-native artifact projection that stays thin and explainable
- Define a clear Stage 1 scope with explicit Stage 2 expansion path

## Non-Goals

- Building a thick orchestration layer specific to Copilot CLI
- Making hook-driven orchestration the center of Copilot support
- Building a large persona-based Copilot-specific agent catalog
- Replicating Copilot's native features that already exist upstream

## Product Positioning

Copilot CLI should be a host adapter sitting beside:

- OpenCode
- Codex
- Qwen
- Claude Code

and consuming the same resolved routing result.

Copilot CLI should not redefine:

- route semantics
- source semantics
- profile semantics

## Preferred Projection Strategy

Copilot CLI support should center on **skills-based projection** (similar to Claude Code adapter).

This means Copilot support should favor:

- project-scoped artifacts
- thin skill wrappers
- source-aware and route-aware descriptions
- markdown-based skill files

over heavier mechanisms such as:

- thick orchestration layers
- runtime state machines
- environment takeover behavior

### Artifact Structure

```
.github-copilot/
├── skills/
│   ├── oms-brainstorm.md
│   ├── oms-plan.md
│   ├── oms-execute.md
│   ├── oms-review.md
│   ├── oms-verify.md
│   └── oms-visual.md
├── agents/
│   └── (reserved for future direct mode)
└── commands/
    ├── oms-status.md
    ├── oms-sync.md
    └── oms-doctor.md
```

## Scope

### Stage 1 (This Implementation)

**Workflow Support:**
- `superpowers` workflow source only
- Direct mode: not yet supported (Stage 2)
- `gstack` workflow source: not yet supported (Stage 2)

**Phase Routing:**
| Phase | Agent Name | Skill File |
|-------|-----------|------------|
| `writing-plans` | `copilot-plan` | `oms-plan.md` |
| `doing` | `copilot-execute` | `oms-execute.md` |
| `reviewing` | `copilot-review` | `oms-review.md` |
| `verifying` | `copilot-verify` | `oms-verify.md` |
| `visual` | `copilot-visual` | `oms-visual.md` |
| `brainstorming` | `copilot-brainstorm` | `oms-brainstorm.md` |

**CLI Commands:**
| Command | Support Level | Notes |
|---------|--------------|-------|
| `status` | Full | Read-only diagnostic |
| `sync` | Full | Generate/update artifacts |
| `doctor` | Full | Read-only diagnostic |
| `use` | Not supported | No preset switching in Stage 1 |
| `disable` | Not supported | No disable helper in Stage 1 |

**Capability Policy:**
```typescript
// Copilot CLI Stage 1 capability decisions
{
  host: "copilot-cli",
  workflowKind: "superpowers": supported
  workflowKind: "direct": unsupported (Stage 2)
  
  commands: {
    "status": supported,
    "sync": supported,
    "doctor": supported,
    "use": unsupported (Stage 1),
    "disable": unsupported (Stage 1)
  }
}
```

### Stage 2 (Future Expansion)

**Planned Additions:**
- Direct mode support (user-defined intents)
- `gstack` workflow source support
- Full CLI command set (`use`, `disable`)
- Temporary disable helper
- Copilot-specific fast mode (similar to `codexFast`)

**Explicitly Out of Scope:**
- Thick orchestration layer
- Environment takeover behavior
- Persona-heavy agent systems

## Architecture

### Layer Placement

```
┌─────────────────────────────────────────────────────────┐
│  Control Plane Core (control-plane.ts, config.ts)       │
├─────────────────────────────────────────────────────────┤
│  Workflow Adapters (router.ts, workflow-*.ts)           │
├─────────────────────────────────────────────────────────┤
│  Capability Policy (capabilities.ts)                    │
├─────────────────────────────────────────────────────────┤
│  Host Adapters                                          │
│  ├── opencode.ts                                       │
│  ├── codex.ts                                          │
│  ├── qwen.ts                                           │
│  ├── claude.ts                                         │
│  └── copilot-cli.ts  ← NEW                             │
├─────────────────────────────────────────────────────────┤
│  Compatibility Monitor                                  │
├─────────────────────────────────────────────────────────┤
│  Artifact Reconciliation (materialize.ts)               │
└─────────────────────────────────────────────────────────┘
```

### Module Structure

**New Files:**
- `src/copilot-cli.ts` - Main host adapter (~400-500 LOC)
- `src/copilot-cli-bootstrap.ts` - Bootstrap utilities (optional, ~200 LOC)
- `src/copilot-cli-detectors.ts` - Copilot CLI detection (optional, ~150 LOC)

**Modified Files:**
- `src/cli.ts` - Add Copilot CLI host case
- `src/capabilities.ts` - Add Copilot CLI capability rules
- `src/materialize.ts` - Add Copilot CLI artifact ownership detection
- `docs/README-architecture.md` - Update support matrix

### Data Flow

```
User invokes: copilot-cli status
    ↓
CLI loads config → resolveControlPlane()
    ↓
Get effectiveSources, activePreset, laneState
    ↓
For each phase in BUILT_IN_PHASES:
    resolveRoute(config, phase) → ResolvedRoute
    ↓
buildCopilotArtifacts(config) → GeneratedArtifact[]
    ↓
materializeArtifacts() → Write .github-copilot/skills/*.md
    ↓
Output status JSON / human-readable format
```

## Component Design

### Copilot CLI Adapter (`src/copilot-cli.ts`)

**Responsibilities:**
- Render Copilot-native skill files from resolved routes
- Render Copilot-native command files for CLI commands
- Apply Copilot-specific constraints without changing OMS semantics

**Key Functions:**
```typescript
// Render a skill file for a phase
export function renderCopilotSkill(input: {
  skillName: string
  description: string
  model: string
  variant?: string
  temperature?: number
  sourceEntry?: WorkflowSourceEntry
}): string

// Render a command file for CLI commands
export function renderCopilotCommand(input: {
  commandName: string
  description: string
  script: string
}): string

// Build all artifacts for a given config
export function buildCopilotArtifacts(config: RouterConfig): GeneratedArtifact[]

// Explain phase routing for Copilot CLI
export function explainCopilotPhase(config: RouterConfig, phase: BuiltInPhase): unknown

// Explain all phases for Copilot CLI
export function explainAllCopilot(config: RouterConfig): unknown[]
```

**Artifact Ownership Markers:**
```markdown
<!-- oms-route: stage=1; host=copilot-cli; source=superpowers; route=phase.plan; projection=skill; rendered-name=oms-plan -->
```

### Capability Policy (`src/capabilities.ts`)

**Add Copilot CLI to `CapabilityHost`:**
```typescript
export type CapabilityHost = 
  | SupportedSuperpowersHost  // "opencode" | "codex"
  | "qwen" 
  | "claude"
  | "copilot-cli"  // NEW
```

**Add Stage 1 capability decisions:**
```typescript
export function getCopilotProjectionDecision(input: {
  workflowKind: WorkflowKind
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  if (input.workflowKind === "direct") {
    return unsupportedDecision("unsupported_host_direct_projection")
  }
  if (input.workflowKind === "superpowers" && input.sourceEntry.source === "gstack") {
    return unsupportedDecision("unsupported_host_source_projection")
  }
  return supportedDecision()
}
```

### CLI Integration (`src/cli.ts`)

**Add Copilot CLI host case:**
```typescript
type CliHost = 
  | SupportedSuperpowersHost 
  | "qwen" 
  | "claude"
  | "copilot-cli"  // NEW

const COPILOT_SKILLS_ROOT = ".github-copilot/skills"
const COPILOT_COMMANDS_ROOT = ".github-copilot/commands"
```

**Add Copilot CLI build functions:**
```typescript
buildCopilotArtifacts: typeof buildCopilotArtifacts
explainAllCopilot: typeof explainAllCopilot
explainCopilotPhase: typeof explainCopilotPhase
```

### Artifact Reconciliation (`src/materialize.ts`)

**Add Copilot CLI ownership detection:**
```typescript
function isCopilotRouterOwnedFile(directory: string, fileName: string, content: string) {
  if (directory.endsWith(`${path.sep}.github-copilot${path.sep}skills`)) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_SKILL_PREFIXES)
  }
  if (directory.endsWith(`${path.sep}.github-copilot${path.sep}commands`)) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_COMMAND_PREFIXES)
  }
  return false
}
```

## Error Handling

**Config Errors:**
- Missing config: warn user to run `copilot-cli sync`
- Invalid config: error with specific validation message

**Artifact Errors:**
- Unwritable directory: error with permission guidance
- Stale artifacts: auto-clean during materialize

**Capability Errors:**
- Unsupported workflow mode: clear error message with Stage 2 roadmap reference
- Unsupported command: suggest alternative commands

## Testing Strategy

**Unit Tests:**
- `test/copilot-cli.test.ts` - Adapter rendering tests
- `test/copilot-cli-capabilities.test.ts` - Capability policy tests

**Integration Tests:**
- End-to-end artifact generation
- CLI command execution (`status`, `sync`, `doctor`)

**Type Tests:**
- Public API type checks (similar to existing `test/public-api-*.ts`)

## Documentation

**New Files:**
- `docs/superpowers/specs/2026-04-23-copilot-cli-host-adapter-design.md` (this document)
- `docs/superpowers/plans/2026-04-23-copilot-cli-host-adapter.md` (implementation plan)

**Updated Files:**
- `README.md` - Update support matrix table
- `README.zh-CN.md` - Update support matrix table (Chinese)
- `docs/README-architecture.md` - Update host adapter section

## Readiness Surfaces

Copilot CLI Stage 1 readiness reporting:

| Surface | Stage 1 Status | Notes |
|---------|---------------|-------|
| `support` | Partial | superpowers only, no direct/gstack |
| `availability` | Not implemented | No Copilot CLI detection in Stage 1 |
| `compatibility` | Not implemented | No version matrix in Stage 1 |
| `sync state` | Full | Artifact inspection via materialize.ts |

## Trade-offs

### Skills-Only Projection (Stage 1)

**Pros:**
- Consistent with Claude Code adapter pattern
- Lower implementation complexity
- Clear separation from direct mode (Stage 2)

**Cons:**
- Limited flexibility compared to agents + commands
- May require Stage 2 sooner if users need direct mode

### No Detection/Compatibility in Stage 1

**Pros:**
- Faster time to initial implementation
- Can ship Stage 1 without upstream detection complexity

**Cons:**
- Less diagnostic capability than OpenCode/Codex
- Users may be confused about Copilot CLI install state

**Mitigation:** Document Stage 2 plans clearly

## Success Criteria

**Stage 1 Completion:**
- [ ] `copilot-cli sync` generates all 6 phase skills
- [ ] `copilot-cli status` returns valid JSON with sync state
- [ ] `copilot-cli doctor` provides actionable diagnostics
- [ ] Capability policy correctly rejects direct mode and gstack
- [ ] README support matrix updated
- [ ] All existing tests pass

**Stage 2 Entry Criteria:**
- Stage 1 stable for 2+ weeks
- User feedback validates demand for direct mode
- Clear Copilot CLI detection strategy identified

## Future Considerations

### Copilot CLI Detection

Future Stage 2 work may add:
- Detect Copilot CLI installation
- Version detection for compatibility matrix
- Fast mode detection (similar to `codexFast`)

### Direct Mode Projection

Future Stage 2 work may add:
- User-defined intents in config
- `.github-copilot/agents/` for intent projections
- `.github-copilot/commands/` for intent commands

### Gstack Integration

Future Stage 2 work may add:
- `gstack` workflow source support
- Claude Gstack availability detection (reuse from `gstack-detectors.ts`)

---

*Design approved: [pending user review]*
*Next step: Invoke writing-plans skill for implementation plan*
