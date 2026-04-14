# Claude Code Host Adapter Design

## Summary

This design adds Claude Code as a first-party host adapter in the repository's generic routing architecture.

Claude Code support should:

- consume the same resolved route, source, and profile decisions as other hosts
- project them into Claude-native artifacts
- preserve OMS as a thin routing and control-plane product

It should not turn the repository into an `oh-my-claudecode`-style orchestration product.

## Problem

The repository already supports multiple hosts, but Claude Code is missing.

That leaves a real gap because:

- Claude Code is a meaningful host surface for AI-native development workflows
- the project already has enough core abstraction to support another host cleanly
- a related ecosystem project, `oh-my-claudecode`, shows that Claude Code host primitives are strong enough to support structured integrations

However, Claude Code support carries a design risk.

If implemented carelessly, it could drag the repository toward:

- persona-heavy agent rosters
- hook-driven orchestration
- CLAUDE.md injection systems
- product behavior that is specific to `oh-my-claudecode`, not to OMS

## Goals

- Add Claude Code as a first-party host adapter.
- Keep Claude support inside the same routing-core architecture as other hosts.
- Prefer Claude-native artifact projection that stays thin and explainable.
- Define a clear relationship with `oh-my-claudecode`: reference host primitives, not product philosophy.
- Define long-term control-plane expectations for Claude Code.

## Non-Goals

- Recreating `oh-my-claudecode` inside this repository.
- Making hook-driven orchestration the center of Claude support.
- Making CLAUDE.md management or injection the primary integration mechanism.
- Building a large persona-based Claude-specific agent catalog.

## Product Positioning

Claude Code should be a host adapter.

It should sit beside:

- OpenCode
- Codex
- Qwen

and consume the same resolved routing result.

Claude Code should not redefine:

- route semantics
- source semantics
- profile semantics

## Relationship to oh-my-claudecode

`oh-my-claudecode` is useful as a reference for:

- real Claude Code host primitives
- artifact organization patterns
- plugin, skill, and hook capabilities that exist in practice

It is not a template for OMS product direction.

OMS should not inherit from it:

- a thick orchestration layer
- persona-heavy agent systems
- large runtime state machines
- setup and injection behavior that takes over the user's Claude environment

The correct reuse level is:

- study what Claude Code can express
- then project OMS routing decisions into the thinnest stable Claude-native form

## Preferred Projection Strategy

The long-term preferred Claude projection should be centered on Claude Code native skills.

That means Claude support should favor:

- project-scoped artifacts
- thin skill wrappers
- source-aware and route-aware descriptions

over heavier mechanisms such as:

- hook-heavy orchestration
- global config takeover
- plugin packaging as the only entry path

Plugin packaging may still matter later for distribution or namespacing, but it should not be the architectural center of Claude support.

## Long-Term Target State

Claude Code support should eventually include:

- host registration in the control plane
- host-specific materialization rules
- route, source, and profile aware artifact projection
- support for `status`, `sync`, `doctor`, and `explain`
- capability reporting for Claude-specific runtime constraints

The target state should remain thin:

- OMS decides routing
- Claude adapter renders Claude-native artifacts
- Claude runtime executes those artifacts

## Control-Plane Expectations

Claude Code should join the same high-level control-plane contract as other hosts where practical.

That includes:

- `sync` for artifact materialization
- `status` for effective state reporting
- `doctor` for missing-artifact or capability diagnostics
- `explain` for route, source, and profile tracing

If some lifecycle surfaces need host-specific narrowing, that should be expressed clearly rather than hidden.

## Explicit Red Lines

The following should remain outside the default Claude support model:

- persona-first agent catalogs
- hook-centric orchestration as the primary execution model
- CLAUDE.md takeover or large-scale mutation
- opaque runtime behavior that bypasses OMS explainability

Those boundaries protect the project's core identity.

## Diagnostics and Capability Reporting

Claude support should not pretend all capabilities are identical to other hosts.

The adapter should eventually be able to report at least:

- which projected Claude artifacts should exist
- whether they are owned by OMS
- which source and profile each route resolves to
- which runtime constraints apply to the chosen source strategy

This is especially important if some source strategies rely on host capabilities Claude may express differently from OpenCode, Codex, or Qwen.

## Recommended Delivery Direction

Even though this document defines the long-term target state, implementation should proceed in focused slices.

Recommended progression:

1. add Claude Code as a thin host adapter with project-scoped native artifacts
2. integrate control-plane reporting and diagnostics
3. expand host-specific capability handling only where real gaps require it
4. consider plugin packaging later only if distribution or namespacing pressure justifies it

## Recommendation

Add Claude Code as a first-party thin host adapter.

Reference `oh-my-claudecode` for evidence of host capability, but keep OMS aligned with its own architecture:

- generic routing core
- explicit source and profile resolution
- thin host-native projection
- no slide into a thick orchestration product
