# Architecture Remediation Roadmap Design

## Summary

This design defines the full pre-launch architecture remediation program for OMS.

The remediation is intentionally front-loaded before general release.
The project is not yet formally launched, so the correct move is to finish the architectural correction now rather than preserve transitional compromises for compatibility.

The program is organized into three mandatory stages:

1. canonical route core cutover
2. source and host capability registry
3. upstream availability and diagnostics

All three stages are required before the remediation program is considered complete.

## Problem

OMS has already moved toward a generic routing core, but it still carries three structural weaknesses that should be corrected before release.

### Weakness 1: transitional route truth layer

The routing core still relies on `superpowers`-specific route IDs as internal truth.

That makes the current system usable, but not genuinely source-neutral.

### Weakness 2: scattered capability rules

Support decisions such as:

- whether a source can own a route
- whether a host can project a source
- whether a command is supported for a workflow mode
- which combinations must fail closed

are currently split across config validation, CLI checks, and host adapters.

That makes the fail-closed model harder to maintain and extend.

### Weakness 3: incomplete upstream diagnostics

Diagnostics are still uneven.

`superpowers` has a compatibility monitor for some hosts, but source and host readiness are not modeled consistently across:

- `status`
- `doctor`
- `explain`
- generated wrappers

This makes some unsupported combinations explicit, but it does not yet provide one durable readiness model.

## Goals

- Finish the architectural shift to a true generic routing core before release.
- Keep upstream reuse as the default strategy for workflow behavior.
- Preserve stable fail-closed behavior instead of fallback-heavy behavior.
- Ensure future host and source additions build on one coherent route and capability model.
- Complete all planning and design documentation for the remediation program before implementation begins.

## Non-Goals

- Replacing upstream `superpowers` or `gstack` with OMS-owned workflow bodies.
- Turning OMS into a runtime orchestrator that chains multiple workflow engines together internally.
- Making every host behave identically.
- Delaying architectural corrections in order to preserve transitional route identities.

## Program-Level Principles

### Principle 1: route truth comes first

Capability modeling and diagnostics must build on stable route identities.
The route core must be corrected before higher-level policy and readiness modeling are centralized.

### Principle 2: source adapters own source-native semantics

OMS should reuse upstream source behavior through adapters.
The core owns canonical routing and policy.
The adapters own source-native entry naming and source-native vocabulary.

### Principle 3: fail-closed behavior is a first-class product feature

Unsupported combinations must remain explicit.
The remediation program should centralize them, not weaken them.

### Principle 4: all stages land before release

This roadmap is staged for implementation clarity, not for leaving the repository in a half-remediated release state.

The target outcome is one coherent pre-launch architecture, not a series of long-lived transitional milestones.

## Stage 1: Canonical Route Core Cutover

### Purpose

Make true source-neutral canonical route IDs the only internal route truth layer.

### What changes

- built-in phases normalize into canonical route IDs such as `phase.plan`
- source routing tables use true canonical route IDs only
- `superpowers` and `gstack` become symmetric source adapters
- route-bearing diagnostics and artifact metadata use the corrected canonical route IDs

### Why it must come first

Everything else depends on route identity.
If capability and diagnostics work is built on transitional route IDs, the wrong architecture hardens.

### Output

Stage 1 is complete when OMS has one real canonical route truth layer and no longer treats `superpowers` route IDs as internal canonical identities.

## Stage 2: Source and Host Capability Registry

### Purpose

Centralize support rules for route ownership, host projection, command support, and fail-closed policy.

### What changes

- source and host support decisions move into one shared registry
- CLI and host adapters stop hard-coding special-case support rules
- unsupported combinations resolve to structured decisions with stable reason codes

### Why it comes second

The registry must key off the corrected canonical route model from Stage 1.
It should not be forced to support both true canonical routes and transitional route aliases.

### Output

Stage 2 is complete when support and fail-closed decisions are centralized and consumed consistently by the core and host adapters.

## Stage 3: Upstream Availability and Diagnostics

### Purpose

Unify support, install detection, compatibility, and artifact readiness into one diagnostics model.

### What changes

- route/source/host readiness becomes a shared concept across `status`, `doctor`, and `explain`
- existing `superpowers` compatibility checks are generalized into a broader upstream readiness system
- source and host combinations can report support separately from availability and compatibility

### Why it comes third

Diagnostics need both:

- stable canonical route identities from Stage 1
- centralized support policy from Stage 2

Without those two layers, diagnostics would keep duplicating policy logic instead of reporting it.

### Output

Stage 3 is complete when OMS can explain not only what route/source/profile was resolved, but whether the required upstream workflow and host prerequisites are actually ready.

## Stage Dependencies

The dependency chain is strict:

1. Stage 1 defines the route truth layer.
2. Stage 2 defines the support and fail-closed policy on top of that route truth layer.
3. Stage 3 reports readiness using both the corrected route model and the centralized capability policy.

This ordering is architectural, not optional.

## Implementation Strategy

All stage documents should be completed before implementation starts.

Implementation should then proceed stage-by-stage in dependency order, but within one remediation program.

That means:

- do not begin Stage 2 code before Stage 1 is complete
- do not begin Stage 3 code before Stage 2 is complete
- do not declare the remediation complete while only one stage has landed

## Program-Level Success Criteria

The full remediation program is complete only when:

- the core route truth layer is genuinely canonical and source-neutral
- source and host support decisions are centralized
- readiness diagnostics are shared, explicit, and fail closed
- `superpowers` and `gstack` are reused through adapters rather than reimplemented in OMS
- OMS remains a routing and control-plane product rather than becoming a workflow runtime fork

## Deliverables

Before implementation begins, the repository should contain:

- this roadmap design
- a detailed Stage 1 design
- a detailed Stage 2 design
- a detailed Stage 3 design
- stage-specific implementation plans for each stage

That documentation set becomes the contract for the remediation branch.
