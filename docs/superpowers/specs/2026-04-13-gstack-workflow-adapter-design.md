# Gstack Workflow Adapter Design

## Summary

This design adds `gstack` as a first-party workflow source inside the repository's generic routing architecture.

`gstack` should be integrated as:

- a source
- a route-mapping provider
- a participant in workflow fusion

It should not be integrated as:

- a host
- a replacement for the routing core
- a heavy runtime subsystem owned by this repository

## Problem

The repository currently has one workflow-like first-party source, `superpowers`, plus direct mode.

That leaves two gaps:

1. users who prefer `gstack`'s planning and review ergonomics cannot use it as a first-class source
2. workflow fusion between `gstack` and `superpowers` cannot be represented cleanly in the current global workflow model

## Goals

- Add `gstack` as a first-party source in the unified routing model.
- Define how `gstack` maps onto canonical routes.
- Make `gstack` eligible for workflow fusion.
- Preserve OMS as the routing and host-projection layer rather than cloning `gstack`'s internal runtime.
- Define what belongs in the official target state versus what stays outside the core scope.

## Non-Goals

- Reimplementing the full `gstack` installer, setup flow, or runtime sidecars.
- Mirroring every `gstack` command as a first-class OMS route.
- Making OMS responsible for browser daemons, deployment helpers, or other heavy `gstack` runtime features.
- Treating `gstack` as the new universal center of the product.

## Product Positioning

`gstack` should sit beside `superpowers` and `direct` as a source.

That means:

- `superpowers` remains a first-party source
- `gstack` becomes a first-party source
- direct mode remains a first-party source-like mode in the same unified model

The architectural center stays in OMS, not in any upstream workflow pack.

## Route Mapping Strategy

### Default bias: map onto canonical routes

Most `gstack` workflow entries should map onto existing canonical routes instead of creating a parallel permanent route universe.

Examples of likely mappings:

- planning-oriented `gstack` entries -> `phase.plan` or `intent.plan`
- execution-oriented entries -> `phase.execute` or `intent.build`
- review-oriented entries -> `phase.review` or `intent.review`
- test or QA oriented entries -> `phase.verify` or `intent.test`
- retrospective entries -> a future canonical route only if the concept proves durable enough to justify one

### Source-native route additions should be rare

If `gstack` contributes a workflow concept that cannot be expressed well in the existing route space and has clear long-term value, a dedicated canonical route can be added later.

That should be the exception, not the default.

## Workflow Fusion Role

`gstack` should be a normal source option in route-to-source mapping.

Typical long-term combinations may include:

- planning via `gstack`
- execution via `superpowers`
- review via `gstack`
- verification via `superpowers`

These combinations should be expressed through fusion configuration, not through hard-coded product special cases.

## Integration Boundary

OMS should own:

- route mapping
- source selection
- explainability
- control-plane integration
- host-native wrapper generation

OMS should not own:

- installing `gstack`
- reproducing `gstack`'s internal tooling platform
- carrying `gstack` runtime sidecars inside OMS itself

## Official Target State

The long-term target state for `gstack` support should include:

- source registration in the unified routing model
- canonical route mapping
- source-aware diagnostics
- host projection for supported hosts
- participation in workflow fusion presets and route overrides

Supported host projection should grow over time, but the source model should be complete enough that `gstack` is a true first-party source, not a narrow experiment.

## Explicitly Out of Core Scope

The following should remain outside the core target state unless later evidence justifies them:

- OMS-managed `gstack` installation flows
- OMS-managed browser or daemon processes required by some `gstack` features
- OMS-managed deploy or environment automation embedded from `gstack`
- a one-to-one mirror of every upstream `gstack` surface

If a `gstack` feature cannot be expressed as a thin source-and-wrapper integration without pulling OMS into heavy runtime ownership, it should not be part of the core target state.

## Diagnostics Expectations

`status`, `doctor`, and `explain` should eventually be able to report at least:

- which canonical routes resolve to `gstack`
- which source entries they use
- whether the selected host has the required projected surfaces
- whether the necessary upstream `gstack` assets appear available

The system should fail clearly when a selected `gstack` route cannot be projected safely for the current host.

## Recommended Delivery Direction

Even though this document defines the full target state, implementation should proceed in stable slices.

Recommended sequence:

1. finish the workflow source and fusion foundation
2. add a curated `gstack` route catalog and mapping layer
3. project `gstack` routes into the most stable supported host first
4. expand host coverage and diagnostics after the core source model proves stable

## Recommendation

Integrate `gstack` as a first-party source with strong route mapping discipline and a strict thin-boundary policy.

That gives users access to `gstack`'s workflow strengths while preserving OMS as:

- the routing core
- the fusion layer
- the host-native control plane

rather than letting OMS become a partial clone of `gstack` itself.
