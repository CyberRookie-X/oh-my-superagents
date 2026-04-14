# Workflow Source and Host Expansion Roadmap Design

## Summary

This design defines the long-term target architecture for the next stage of the repository.

It covers four connected goals:

- evolving from global `workflow.kind` toward canonical route based source resolution
- supporting workflow fusion across sources such as `superpowers` and `gstack`
- adding `gstack` as a first-party workflow source
- adding Claude Code as a first-party host adapter

The design is intentionally long-range.
It defines the target state first, then describes how implementation can arrive there in phases.

## Problem

The current repository has already evolved into a generic routing core, but one major part of the model is still too narrow:

- one config has one global `workflow.kind`

That model was sufficient for:

- `superpowers`
- direct mode

It is no longer sufficient for the desired future state.

The new requirements introduce three kinds of expansion pressure at once:

1. More than one workflow source should exist in the product.
2. Different routes may need different workflow sources.
3. More hosts should consume the same resolved routing decisions.

At the same time, the project must preserve its core identity:

- thin routing and control-plane logic
- host-native artifacts
- explicit configuration over persona-heavy prompt systems
- no slide into a heavy orchestration product

## Goals

- Define a durable target architecture for source-aware routing.
- Keep `superpowers`, `gstack`, and direct mode inside one coherent routing model.
- Support workflow fusion without turning the project into a runtime orchestrator.
- Preserve `profile` as the leaf model configuration abstraction.
- Preserve host adapters as thin projection layers.
- Add a path for Claude Code host support that does not copy `oh-my-claudecode`'s product shape.
- Record known capability limits, especially around long-lived subagent sessions and phase-level model switching.

## Non-Goals

- Rebuilding the whole product in one release.
- Making all hosts expose identical runtime behavior.
- Recreating `oh-my-opencode` or `oh-my-claudecode` style persona-heavy orchestration systems.
- Reimplementing `gstack`'s full runtime, installer, or sidecar ecosystem inside this repository.
- Assuming every source or host supports dynamic profile changes inside one long-lived agent session.

## Product Direction

The long-term layering should be:

`canonical route -> source -> profile -> host projection`

Where:

- `canonical route` answers what kind of work is being routed
- `source` answers which workflow semantics should realize that route
- `profile` answers which model configuration should be used
- `host projection` answers how the resolved route is rendered into host-native artifacts

This is the core long-term shift.

### Old center of gravity

- one global workflow mode
- route vocabulary depends on that mode
- host adapters partly encode workflow assumptions

### New center of gravity

- one stable canonical route space
- route-to-source resolution is explicit and explainable
- profiles remain independent leaf configuration
- host adapters consume resolved results instead of re-deciding workflow behavior

## Terminology

### Canonical Route

The internal stable routing key.

It is the smallest unit that the routing core resolves.

Examples:

- `phase.brainstorm`
- `phase.plan`
- `phase.execute`
- `intent.build`
- `intent.review`

### Route Family

A grouping for canonical routes.

Initial families should include:

- `phase`
- `intent`
- future source-native families only when a source contributes route concepts that have durable standalone value

### Source

The workflow semantics provider for a canonical route.

Examples:

- `superpowers`
- `gstack`
- `direct`

`source` is the long-term internal term.

### Workflow

`workflow` remains a user-facing and documentation-facing term.

In long-term architecture, a workflow is best understood as a human-friendly view over one or more source mappings.

This lets the product keep natural language such as:

- `superpowers workflow`
- `gstack workflow`
- `workflow fusion`

without making `workflow.kind` the core architectural truth forever.

### Profile

The leaf model configuration object.

It may include fields such as:

- `model`
- `variant`
- `effort`
- `temperature`
- host-specific fast or service-tier style fields

Profiles do not choose routes and do not choose sources.

### Host Projection

The host-native representation of a fully resolved route.

Examples:

- OpenCode commands, agents, and plugin metadata
- Codex agent TOMLs and bootstrap skills
- Qwen commands and agents
- Claude Code skills

## Core Architectural Principles

### Principle 1: Source is not Host

`superpowers`, `gstack`, and direct mode are sources.

OpenCode, Codex, Qwen, and Claude Code are hosts.

Those layers stay separate.

### Principle 2: Source is not Profile

Source decides workflow semantics.

Profile decides model configuration.

The product must not collapse those two responsibilities into a single object.

### Principle 3: Fusion is Source Mapping, not Orchestration

Workflow fusion should be modeled as:

- different canonical routes resolving to different sources

not as:

- OMS becoming a runtime orchestrator that chains multiple workflow engines together internally

### Principle 4: Host Adapters Consume Resolved Results

The core should resolve to a result object that includes at least:

- `canonicalRoute`
- `resolvedSource`
- `sourceEntry`
- `resolvedProfile`
- `hostProjectionKey`

Host adapters should consume that result.
They should not privately recompute route or source behavior.

## Capability Caveat: Long-Lived Subagents and Phase-Level Model Switching

This risk must be made explicit.

The current host integrations mostly bake model selection into generated host-native agent artifacts.
That works well when different phases or intents map to distinct host-native wrappers.

It may not work cleanly if an upstream source tries to improve cache reuse by sending multiple phase-like prompts through the same long-lived subagent or session.

In that scenario:

- the routing core can still express different target profiles per canonical route
- but the host or runtime may not be able to switch profile dynamically inside that reused session

This is not a reason to weaken the core model.
It is a capability boundary that should be:

- documented
- surfaced in `doctor` and `explain` where relevant
- handled as host or source capability mismatch, not hidden by architecture

## Document Set Defined by This Roadmap

This roadmap governs three child design documents:

1. `workflow source / fusion foundation`
2. `gstack workflow adapter`
3. `claude code host adapter`

### Dependency order

The architectural dependency order is:

1. workflow source and fusion foundation
2. `gstack` source adapter
3. Claude Code host adapter

`gstack` depends on the new source model.
Claude Code does not conceptually depend on `gstack`, but it should follow the same resolved-result projection rules.

## Recommended Delivery Strategy

The target state should be designed in full first, then implemented in phases.

Recommended implementation progression:

1. Introduce the source-aware routing foundation while keeping current behavior compatible.
2. Add `gstack` as a first-party source using the new routing model.
3. Add Claude Code as a thin host adapter.
4. Expand diagnostics, lifecycle semantics, and capability reporting as the new combinations become real.

## Recommendation

The repository should adopt `canonical route -> source -> profile -> host projection` as its long-term architectural center.

That is the most durable design because it:

- preserves the generic routing-core direction
- keeps sources symmetric
- keeps hosts thin
- supports workflow fusion without becoming a heavy orchestrator
- creates room for future sources and hosts without reopening the center of the model
