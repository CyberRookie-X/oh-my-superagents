# Lane-Aware Subagent Execution Design

## Summary

This design adds lane-aware multi-subagent execution as an execution-layer enhancement.

The feature allows a mixed task to be split into multiple subagents, each with a different lane context, so different technical domains can use different model/config selections.

This should not become a new top-level workflow system.
It should remain an execution strategy layered under existing workflows, starting with the `superpowers` integration.

## Problem

Lane routing today can select different profiles for different technical contexts, but the current baseline still assumes one effective lane at a time.

That is enough for many workflows, but not all.

For example, a full-stack task may naturally split into:

- frontend work
- backend work
- review work

If all of that remains in one lane, the product loses the main benefit of lane routing.

## Goals

- Allow one execution to fan out into multiple lane-scoped subagents.
- Keep lane-aware fan-out an execution-layer feature, not a new top-level routing abstraction.
- Reuse the existing `subagent-driven-development` workflow where appropriate.
- Avoid building a heavyweight orchestrator.
- Keep user control over split strategy.

## Non-Goals

- Replacing `superpowers` workflow ownership.
- Introducing new top-level routed phases such as `frontend-build-phase`.
- Turning OMS into a general autonomous planner.
- Making multi-subagent fan-out mandatory.

## Product Definition

The feature is:

> A lane-aware execution strategy that can split one higher-level task into multiple lane-scoped subagent units.

Each unit carries:

- a lane
- a task scope
- optionally an intent
- normal host/runtime context

## First Integration Surface

The first slice should live under the `superpowers` integration, specifically under the execution path around `subagent-driven-development`.

This is the best fit because:

- the workflow already models subagent execution explicitly
- it avoids inventing a parallel orchestration system

## Runtime Model

### Current single-lane model

Today, one execution generally has one effective lane.

### New fan-out model

The new execution model introduces lane-scoped work units.

Example:

- work unit A -> `lane=frontend`
- work unit B -> `lane=backend`
- work unit C -> `lane=review`

Each subagent resolves its phases with its own runtime lane override.

That means the core routing model stays the same:

`phase -> lane -> profile`

but the execution layer may create multiple simultaneous lane contexts.

## Split Planning

There are three possible split styles.

### 1. Manual

The user explicitly asks to split work by lane.

### 2. Suggest

The system proposes a split plan and the user confirms.

### 3. Auto

The system applies a split plan automatically for the current execution.

For the first slice, `suggest` should be the recommended default.

## Split Plan Shape

A split plan should contain a list of work units, for example:

```jsonc
[
  {
    "id": "frontend-1",
    "lane": "frontend",
    "summary": "Implement the settings page UI",
    "intent": "build"
  },
  {
    "id": "backend-1",
    "lane": "backend",
    "summary": "Add the settings API endpoint",
    "intent": "build"
  }
]
```

This should be an execution artifact, not persistent config.

## Good Fit vs Bad Fit

### Good fit

- execution-layer enhancement
- runtime lane override per subagent
- still uses existing workflow phases
- still resolves through the same routing core

### Bad fit

- new global route taxonomy just for execution splitting
- generic always-on orchestrator
- roleplay-based specialist roster

## Host Model

The execution layer should remain host-aware.

For OpenCode, later execution may require lane-specific agent families or runtime lane override handling.

For other hosts, the same logical split plan can exist even if the rendering/execution mechanism differs.

## Testing Strategy

The first slice should cover:

- split-plan validation
- lane-scoped runtime override propagation
- explainability of each subagent’s effective lane
- no accidental persistent lane writes during fan-out

## Recommendation

Implement lane-aware multi-subagent execution as a later execution-layer feature under the `superpowers` integration.

The first slice should:

- produce explicit lane-scoped split plans
- default to suggest/confirm behavior
- pass runtime lane overrides into subagents
- keep the routing core unchanged

This preserves the thin-routing philosophy while enabling multi-model multi-domain execution.
