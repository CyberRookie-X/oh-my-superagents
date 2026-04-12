# OpenCode CodexFast Runtime Design

## Summary

This design completes the staged OpenCode support for `codexFast`.

The public configuration remains simple:

```jsonc
"codexFast": true
```

Internally, OpenCode should apply Codex-style fast behavior at runtime when the resolved profile enables `codexFast`.

The decision to enable it must come from route/profile resolution, not from host-native fast toggles or base-URL prefix hacks.

## Problem

Today `codexFast` is:

- fully supported on Codex
- only staged/partial on OpenCode

The routing core can resolve `codexFast`, but OpenCode does not yet use that signal to change request behavior.

## Goals

- Make OpenCode honor resolved `codexFast` profiles at runtime.
- Keep the public config shape minimal.
- Avoid exposing low-level request-patch configuration to the user.
- Keep the decision route/profile-driven.

## Non-Goals

- Generic vendor-agnostic fast abstraction.
- Provider/model auto-detection.
- Base-URL prefix routing as the user-facing mechanism.
- Changing `effort` semantics.

## Feasible Runtime Hook

OpenCode’s plugin API provides a `chat.params` hook that can modify parameters sent to the LLM.

This is the correct runtime insertion point for the first slice.

Relevant plugin hook surface:

- `chat.params`
- `command.execute.before`
- `tool.execute.before`

The first slice should use `chat.params` as the main runtime mutation point.

## Runtime Model

The runtime needs a way to know whether the current request belongs to a resolved profile with `codexFast: true`.

### Proposed mechanism

During `sync`, OMS should generate a small OpenCode-side routing manifest that maps host agent names to resolved profile metadata.

For example, conceptually:

```jsonc
{
  "agents": {
    "spr-build": {
      "profile": "backend-build",
      "codexFast": true
    }
  }
}
```

The OpenCode plugin can then:

1. inspect `input.agent` in `chat.params`
2. look up agent metadata in the manifest
3. if `codexFast === true`, patch the outgoing model params/options

## Important Constraint

The plugin should not try to determine whether the provider/model “is really Codex.”

Instead:

- if the active routed profile says `codexFast: true`
- the plugin applies the Codex-fast runtime option patch

The user remains responsible for only enabling it on compatible model/provider combinations.

## Runtime Patch Shape

The public config should not expose transport-level detail.

Internally, the first slice may set the OpenCode request options needed to request Codex-style fast behavior.

The implementation detail remains internal and adapter-owned.

## Scope

### In scope

- manifest generation
- plugin manifest loading
- agent-to-profile codexFast lookup
- `chat.params` patching
- tests for codexFast-enabled and codexFast-disabled profiles

### Out of scope

- exposing host-specific patch configuration
- Qwen fast runtime
- generic fast-mode abstraction

## Testing Strategy

The first slice should cover:

- manifest generation from resolved profiles
- plugin runtime lookup by agent name
- patching only when the resolved profile has `codexFast: true`
- no patching when `codexFast` is false or absent

## Recommendation

Implement OpenCode `codexFast` via plugin-side `chat.params` patching driven by route/profile resolution metadata from sync-generated manifests.

This keeps the user-facing config simple while making staged OpenCode support real.
