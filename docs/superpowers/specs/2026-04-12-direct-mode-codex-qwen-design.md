# Direct Mode Codex and Qwen Design

## Summary

This design extends direct mode beyond OpenCode.

The first direct-mode slice is already OpenCode-first.
This document covers how to add direct mode to:

- Codex
- Qwen

while preserving the same generic routing core.

## Problem

Direct mode currently exists only on OpenCode.

That proves the generic routing core can drive host-native artifacts without upstream `superpowers` skills, but the host surface remains incomplete.

To make the broader product direction credible, direct mode must expand to the other supported hosts.

## Goals

- Add direct mode to Codex.
- Add direct mode to Qwen.
- Reuse the same core abstractions:
  - `workflow.kind = "direct"`
  - `intent`
  - `lane`
  - `profile`
- Keep host implementations thin and host-native.

## Non-Goals

- Making every host implementation identical.
- Reintroducing roleplay-heavy agent systems.
- Heavy marketplace/bootstrap flows where they are not needed.

## Shared Direct Mode Contract

Direct mode should keep one contract across hosts:

- the route catalog is user-defined intents
- each host renders one command/entry surface per intent
- each host renders one execution surface per intent
- no upstream skill handoff is required

## Codex Direct Mode

### Host-native shape

Codex should use:

- direct-mode agent TOML files
- direct-mode bootstrap skill entries that invoke those agents

This mirrors the current Codex host style without forcing OpenCode’s file shapes onto Codex.

### Artifact model

Conceptually:

- agents: direct route/intention execution surfaces
- bootstrap skills: thin user entrypoints such as `ai-plan`, `ai-build`

The direct skill should not delegate to upstream `superpowers`.

## Qwen Direct Mode

### Host-native shape

Qwen should continue to use project-local:

- `.qwen/agents/*.md`
- `.qwen/commands/*.md`

Direct mode should simply replace upstream skill handoff with direct intent execution instructions.

### Important difference from current Qwen mode

Current Qwen support is fail-closed on missing upstream skills.

Direct mode must not require upstream skill discovery.

That means direct-mode Qwen paths must skip:

- upstream skill discovery
- fail-closed missing-skill behavior

## CLI Behavior

Direct mode should eventually support the same high-level surfaces as OpenCode where practical:

- `status`
- `doctor`
- `sync`
- `explain --intent`

Host-specific bootstrap behavior can differ.

## Testing Strategy

### Codex

Add tests for:

- direct-mode agent rendering
- direct-mode bootstrap skills
- no upstream skill delegation
- collision and cleanup across mode switches

### Qwen

Add tests for:

- direct-mode agent rendering
- direct-mode command rendering
- no upstream skill discovery requirement
- no fail-closed upstream-skill checks on direct workflows

## Recommendation

Implement direct mode host expansion as two adapter slices:

1. Codex direct mode
2. Qwen direct mode

Both should reuse the existing generic core and keep host-specific projection thin.
