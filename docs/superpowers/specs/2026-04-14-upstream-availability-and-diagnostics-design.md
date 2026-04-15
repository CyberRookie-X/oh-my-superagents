# Upstream Availability and Diagnostics Design

## Summary

This design defines a generalized readiness and diagnostics model for OMS.

After this stage, OMS diagnostics should be able to report three separate facts clearly:

1. whether a route/source/host combination is supported
2. whether the required upstream workflow or host prerequisite is available
3. whether OMS-owned artifacts are in the expected synchronized state

This stage builds on the canonical route core and the capability registry.

## Problem

OMS currently has partial diagnostics, but not one unified readiness model.

### Existing strengths

- some unsupported combinations already fail closed
- `superpowers` compatibility is already modeled for OpenCode and Codex
- artifact sync state is already surfaced in `status` and `doctor`

### Existing gaps

- support policy and install availability are not clearly separated
- `superpowers` compatibility logic is more mature than `gstack` and Claude-related readiness
- some readiness constraints only appear inside generated wrapper instructions instead of shared CLI diagnostics

This means OMS can often stop a bad path, but it cannot always explain readiness through one consistent model.

## Goals

- define one diagnostics model for support, availability, compatibility, and sync state
- generalize current `superpowers` compatibility monitoring into a broader upstream readiness system
- improve `status`, `doctor`, and `explain` so they can report route-level readiness clearly
- preserve fail-closed behavior when required upstream prerequisites are missing

## Non-Goals

- automatically installing `superpowers` or `gstack`
- mutating user host configuration automatically in this stage
- promising identical availability detection quality for every host on day one

## Design Principles

### Principle 1: support and availability are different questions

Support answers whether OMS is designed to handle a combination.
Availability answers whether the required upstream dependency is actually present.

Examples:

- `claude + direct` can be unsupported regardless of install state
- `claude + gstack + phase.plan` can be supported in principle but unavailable if `gstack` is not installed in Claude skill roots

### Principle 2: diagnostics report readiness, not guesses

If OMS cannot detect a requirement confidently, diagnostics should say so explicitly.

It must not silently treat unknown state as healthy.

### Principle 3: wrappers and CLI should agree

Generated wrapper instructions and OMS CLI diagnostics should report the same readiness model.
Wrapper messages should not be the only place where a missing upstream dependency is surfaced.

## Readiness Model

The diagnostics layer should report at least four dimensions.

### 1. Support

Support comes from the capability registry.

Examples:

- supported
- unsupported with reason code

### 2. Availability

Availability answers whether the required upstream dependency is present.

Examples:

- `available`
- `not_detected`
- `error`

Availability should be modeled per relevant subject.

### 3. Compatibility

Compatibility is a specialized form of readiness for dependencies where version or revision ranges matter.

Examples:

- `compatible`
- `untested`
- `incompatible`

The existing `superpowers` compatibility model becomes one implementation of this broader readiness layer.

### 4. Artifact sync state

OMS already knows whether generated artifacts are:

- present
- missing
- stale

That state should become part of the overall readiness story rather than a separate silo.

## Diagnostic Subjects

The model should be able to reason about at least these subject types.

### Workflow source subjects

Examples:

- `superpowers`
- `gstack`

These subjects answer whether the workflow source entry required by the resolved route is present for the relevant host context.

### Host prerequisite subjects

Examples:

- project-local skill root exists
- required managed artifact directory exists
- host-specific bootstrap expectations are met

### Artifact subjects

Examples:

- expected OMS-generated wrappers exist
- stale OMS-owned neighbors need cleanup

## Detector Direction

Diagnostics should be powered by detectors that are explicit about both host and subject.

Examples of detector direction in current scope:

- reuse existing `superpowers` install and compatibility detectors for OpenCode and Codex
- add `gstack` detectors for supported host/source combinations where OMS expects `gstack` to be discoverable
- report unsupported combinations from the capability registry before attempting availability checks

The detector contract should allow three outcomes cleanly:

- detected and usable
- not detected
- detection error

## Output Surfaces

### `status`

`status` should report workspace readiness in concise form.

At minimum it should be able to show:

- active preset and lane
- effective route-to-source summary
- host support state
- upstream availability summary
- artifact sync summary

### `doctor`

`doctor` should report the full readiness picture with actionable failures.

At minimum it should distinguish between:

- unsupported combinations
- supported but unavailable upstream dependencies
- compatible versus incompatible detected dependencies
- missing or stale OMS-managed artifacts

### `explain`

`explain` should attach readiness context to route resolution.

For each resolved route it should be able to show at least:

- canonical route
- source
- source entry
- profile
- support decision
- availability or compatibility state where relevant

## Integration with Existing Modules

### Compatibility monitor

The existing `superpowers` compatibility logic should be preserved, but it should no longer be the only special readiness model in the system.

Instead, it becomes one detector and one compatibility evaluator inside a broader diagnostics layer.

### CLI

The CLI should become the main renderer of readiness diagnostics.

It should stop mixing:

- support assertions
- compatibility monitoring
- ad-hoc host messages

without one shared readiness model.

### Generated wrappers

Generated wrappers may still include defensive instructions such as “stop instead of improvising,” but those instructions should match shared OMS readiness semantics.

## Staged Detection Quality

This design does not require every host/source combination to have equally sophisticated detection on day one.

It does require every combination to fall into one clear category:

- unsupported
- supported and detectable
- supported but detection not yet implemented

Even the third category is better than silently pretending everything is healthy.

## Success Criteria

This design is successful only if all of the following become true:

- OMS can distinguish support from availability cleanly
- existing `superpowers` compatibility logic is generalized rather than left isolated
- `status`, `doctor`, and `explain` report readiness using one coherent model
- missing upstream dependencies are surfaced by shared diagnostics, not only by wrapper text
- unknown state is reported explicitly instead of being treated as healthy by default
