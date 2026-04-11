# Temporary Disable Helper and Codex Fast Design

## Summary

This design adds two related but distinct capabilities to `oh-my-superagents`:

1. a temporary "do not use superpowers in this conversation" helper
2. a `codexFast` profile capability

These should not be implemented as one monolithic feature.
They share some user motivation, but they belong to different product layers.

- the temporary disable helper is a host-local prompt convenience feature
- `codexFast` is a profile-level routing capability with host-specific execution

The first implementation phase should target OpenCode and Codex only.

## Problem

Two workflow gaps exist today.

### Gap 1: Temporary disable is manual and error-prone

Upstream `superpowers` guidance allows a user to directly tell the assistant not to use superpowers in a single conversation.
That works, but it is still manual.

The current OMS control plane does not help the user inject that prompt consistently.
Users must remember and retype the wording themselves.

### Gap 2: Codex fast semantics are not modeled explicitly

Today the codebase already knows how to map Codex `effort: "fast"` into native Codex fast behavior:

- `model_reasoning_effort`
- `service_tier = "fast"`

But that is still implicit host behavior tied to the current `effort` mapping.
It does not provide a separate, explicit capability for users who want to opt into Codex-class fast behavior with finer routing control.

## Goals

- Add a stable, host-native helper that quickly injects a temporary “do not use superpowers” instruction for the current conversation.
- Keep that helper outside the OMS persistent control-plane state model.
- Add a simple public configuration shape for `codexFast`.
- Treat `codexFast` and `effort` as independent dimensions.
- Let each host use its own best implementation rather than forcing identical internals.
- Preserve the current OMS architecture: shared routing core, thin host adapters, explicit behavior.
- Make README support-matrix differences explicit when some hosts cannot support a feature.

## Non-Goals

- Adding provider or model auto-detection.
- Building a generic “fast mode” abstraction for all vendors.
- Exposing low-level request patching details to users.
- Making temporary disable a shared control-plane command or persistent OMS state.
- Requiring all hosts to support every feature in the same way.
- Promising first-phase Qwen support for these features.

## Product Boundary

This design stays inside the existing OMS product boundary.

OMS remains:

- a routing and control-plane layer around `superpowers`
- host-local in rendered artifacts and integration details
- explicit in configuration

This design does not turn OMS into:

- a transport proxy
- a provider detection engine
- a hidden request mutation platform

## Host Scope

### First implementation phase

- OpenCode
- Codex

### Deferred

- Qwen

Qwen may eventually support one or both features, but it should not block the first implementation phase.

## Feature 1: Temporary Disable Helper

### Product definition

The temporary disable helper is not a real OMS state transition.

It is:

- host-local
- conversation-scoped
- prompt-based
- convenience-focused

It exists to quickly inject a standard instruction telling the assistant not to use `superpowers` in the current conversation unless the user explicitly asks to re-enable it.

### What it is not

It must not:

- call `disable`
- modify `settings.enabled`
- change `activePreset`
- change generated routing state
- appear as a persistent OMS disabled state in `status`

### Host implementations

#### OpenCode

Implement as a generated helper command in `.opencode/commands`.

Why this fits:

- OpenCode already has generated command artifacts
- helper-command UX is natural in that host
- the feature is prompt-oriented, not config-oriented

This helper should be a fixed OMS helper artifact, not a new logical control-plane command key.

#### Codex

Implement as a bootstrap-installed skill.

Why this fits:

- Codex support already uses agent and bootstrap skill surfaces
- Codex does not currently use the same generated command-file pattern as OpenCode

This preserves host-native behavior instead of forcing OpenCode’s command shape onto Codex.

### Prompt shape

The helper prompt should stay narrow.

It should communicate:

1. do not use `superpowers` in this conversation
2. do not proactively load `superpowers` skills, workflows, or phase agents
3. only use `superpowers` again if the user explicitly asks

It may append user-provided freeform arguments as an extra instruction block.

### Naming model

The temporary disable helper should not be part of `CONTROL_PLANE_COMMAND_KEYS`.

Reason:

- it is not persistent OMS state
- it is not a lifecycle command
- adding it to the shared control-plane key set would widen the control-plane model for a host-local convenience helper

It should instead be modeled as a fixed auxiliary host artifact.

### Success criteria

- OpenCode users get a generated helper command for temporary disable prompt injection.
- Codex users get a generated helper skill for the same purpose.
- Using the helper does not change OMS persistent state.
- README support matrix clearly marks this as host-local helper functionality.

## Feature 2: `codexFast`

### Product definition

`codexFast` is an explicit profile-level capability.

It should be exposed publicly as:

```jsonc
{
  "presets": {
    "default": {
      "profiles": {
        "build": {
          "model": "openai/gpt-5",
          "codexFast": true
        }
      },
      "routes": {},
      "defaultRoute": "build"
    }
  }
}
```

That public shape should remain simple.

### Public semantics

`codexFast: true` means:

- this profile opts into Codex-class fast behavior where the host supports it
- OMS will not try to detect whether the selected provider or model “is Codex”
- the user is responsible for enabling it only where it makes sense

### `effort` relationship

`codexFast` and `effort` are independent dimensions.

That means:

- `effort` continues to express reasoning depth
- `codexFast` expresses whether Codex-style fast behavior should be requested

This is intentional.
It preserves the finer control granularity the user wants.

### Why the public config must stay simple

The user should not need to configure low-level transport details such as:

- host-specific request-patch objects
- request body patch shapes
- provider-specific payload fields

Those are implementation details.

If OMS eventually needs richer host-specific internal structures, it should derive them internally from the simple public declaration.

### Host implementations

#### Codex

Codex should use its native fast implementation.

This already aligns with the current adapter model, where Codex-specific fields are rendered in TOML agent files.

In Codex, `codexFast: true` should enable Codex fast-tier behavior without redefining `effort`.

That means the implementation should preserve the user’s independent depth choice while still turning on the native Codex fast path.

#### OpenCode

OpenCode should not rely on an OpenCode-native “fast mode” abstraction.

Instead, OMS should eventually implement a host-specific Codex-fast execution path internally.

Important constraints:

- the decision to use Codex fast must come from OMS route/profile resolution
- it must not depend on base-URL prefix matching as the user-facing configuration model
- host/runtime request mutation details, if needed, remain internal

The first implementation phase does not need to promise a full OpenCode runtime implementation if that path proves too large.
It is acceptable to stage support.

### Why not a generic fast abstraction

The ecosystem does not provide one consistent cross-provider fast mechanism.

Observed reality:

- Codex-style fast can be expressed as a request/service-tier behavior
- other providers often expose speed differences as distinct model names or distinct product offerings

OMS should not pretend these are all the same thing.

Therefore:

- `codexFast` stays explicitly Codex-scoped in meaning
- OMS does not generalize it into a vendor-agnostic transport feature

### Granularity model

The correct granularity remains profile-level.

Users already get finer control through existing OMS structure:

- per phase, by routing phases to different profiles
- per workflow mode, by switching presets
- per agent surface indirectly, via phase/profile assignment

OMS should not add a second phase-specific override system for this feature.

### OpenCode implementation staging

Two delivery stages are acceptable.

#### Stage 1

- public config shape exists
- schema exists
- explain/doctor/status can understand the field where relevant
- Codex has full native support
- README marks OpenCode support accurately

#### Stage 2

- OpenCode gains a real runtime Codex-fast execution path

This staging is preferable to over-promising a runtime path before the host integration is proven.

### Success criteria

- `codexFast: true` is a valid public profile property.
- Codex uses native fast behavior when that property is enabled.
- `effort` remains an independent dimension.
- OMS does not expose transport patch internals in user config.
- README support matrix clearly distinguishes:
  - Codex: full support
  - OpenCode: staged or partial support depending on phase

## Support Matrix Guidance

The README support matrix should explicitly distinguish feature support by host.

For the first design phase, expected matrix direction is:

### Temporary Disable Helper

- OpenCode: full
- Codex: full
- Qwen: not yet supported

### `codexFast`

- Codex: full
- OpenCode: staged / partial until runtime implementation lands
- Qwen: not yet supported

The wording can evolve, but the matrix must state the difference plainly.

## Architectural Impact

### Temporary Disable Helper

Likely impact:

- `src/opencode.ts`
- `src/codex-bootstrap.ts`
- host-specific tests

Avoid:

- `CONTROL_PLANE_COMMAND_KEYS`
- shared control-plane schema expansion for this helper

### `codexFast`

Likely impact:

- `src/config.ts`
- `schemas/oh-my-superagents.schema.json`
- `src/router.ts`
- `src/codex.ts`
- possibly OpenCode runtime/plugin layers in a second stage

### Shared principle

The shared core should own:

- public configuration semantics
- routing meaning
- explainability

Host layers should own:

- artifact rendering
- host-native runtime behavior
- host-specific helper surfaces

## Testing Strategy

### Temporary Disable Helper

Add tests that verify:

- OpenCode helper artifact generation
- Codex helper skill generation
- ownership/cleanup behavior for those helper artifacts
- no persistent OMS state change from using the helper

### `codexFast`

Add tests that verify:

- schema acceptance for `codexFast: true`
- route resolution keeps `effort` and `codexFast` independent
- Codex rendering enables native fast behavior when configured
- OpenCode support-matrix and explain behavior remain truthful while runtime support is partial or staged

## Recommendation

Proceed with two separate but coordinated implementation slices:

1. temporary disable helper for OpenCode and Codex
2. `codexFast` public config plus Codex full support and OpenCode staged support

This keeps the user-facing model simple, preserves current architecture, and avoids leaking low-level transport details into the public configuration surface.
