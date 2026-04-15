# Canonical Route Core Cutover Design

## Summary

This design defines a one-shot cutover from the current transitional route model to a true canonical route core.

After this cutover, the internal routing truth layer must use only source-neutral canonical route IDs such as `phase.plan` and `phase.review`.
Legacy `superpowers` phase IDs such as `phase.writing-plans` must stop existing as internal canonical identities and move entirely behind the `superpowers` adapter boundary.

This is an intentional once-only correction.
It is not a bridge design and it does not permit a long-lived dual truth layer.

## Problem

The current architecture is pointed in the right direction, but the internal truth layer is still polluted by `superpowers`-specific route IDs.

That creates four architectural problems:

1. `superpowers` still behaves like the implicit native route system while `gstack` is normalized through aliases.
2. `gstack` is not modeled as a truly symmetric workflow source.
3. `status`, `doctor`, `explain`, and artifact ownership metadata inherit route identities that are not actually source-neutral.
4. Future capability modeling will be forced to grow on top of unstable route identities.

This makes the current system workable but still transitional.
If left in place, it will calcify the wrong center of gravity into the long-term architecture.

## Goals

- Make true canonical route IDs the only internal truth layer.
- Make `superpowers` and `gstack` symmetric workflow sources from the routing core's point of view.
- Ensure all routing, diagnostics, and ownership metadata resolve against the same canonical route identity.
- Keep host adapters as projection layers that consume resolved routing results.
- Preserve current supported functionality while removing the architectural dependency on `superpowers` route IDs.
- Complete the cutover in one implementation slice without introducing a durable compatibility layer in the core.

## Non-Goals

- Designing the long-term capability registry in this document.
- Designing upstream install and availability diagnostics in this document.
- Expanding the current source matrix beyond `superpowers`, `gstack`, and `direct`.
- Renaming existing user-facing OMS commands such as `/sp-plan` or generated host wrapper names.
- Reworking direct mode beyond what is required to keep it consistent with the new canonical route model.

## Core Decision

The internal route truth layer becomes:

`canonical route -> source -> profile -> host projection`

The route identity in that chain must be genuinely source-neutral.

That means:

- the core does not treat `superpowers` phase names as canonical route IDs
- the core does not normalize non-`superpowers` sources into `superpowers` route space
- adapters own source-native entry names
- hosts consume resolved results and do not reinterpret route meaning

## Canonical Route Registry

### Canonical route families

The canonical route space remains organized by family.

Initial families in scope for this cutover are:

- `phase`
- `intent`

### Canonical phase routes

The built-in phase family must use these canonical route IDs:

- `phase.brainstorm`
- `phase.plan`
- `phase.execute`
- `phase.review`
- `phase.verify`
- `phase.visual`
- `phase.web-test`

These are the only canonical phase route IDs the core may use after the cutover.

### Canonical intent routes

Direct-mode route IDs remain `intent.*`.

Examples:

- `intent.plan`
- `intent.build`
- `intent.debug`
- `intent.review`

This document does not change the direct-mode route family model.
It only requires that phase-family routing become equally source-neutral.

## Built-In Phase Normalization

Existing built-in phase inputs remain valid at the OMS boundary, but they are no longer canonical route IDs.

The normalization table is:

| Built-in phase input | Canonical route |
| --- | --- |
| `brainstorming` | `phase.brainstorm` |
| `writing-plans` | `phase.plan` |
| `subagent-driven-development` | `phase.execute` |
| `requesting-code-review` | `phase.review` |
| `verification-before-completion` | `phase.verify` |
| `frontend-design` | `phase.visual` |
| `webapp-testing` | `phase.web-test` |

This mapping is not transitional glue.
It is the permanent adapter between the OMS built-in phase vocabulary and the canonical route vocabulary.

Once a built-in phase input enters route resolution, the core must immediately convert it to the canonical route ID and stop carrying the source-specific form as truth.

## Source Adapter Boundaries

### `superpowers` adapter

The `superpowers` adapter becomes a pure source adapter.

It owns:

- canonical route to upstream `superpowers` entry mapping
- built-in phase input to canonical route mapping
- any `superpowers`-specific rendered naming helpers needed by hosts

It does not own:

- the canonical route registry
- source resolution rules
- control-plane route identity
- host-specific fallback behavior

The canonical-to-upstream mapping for `superpowers` is:

| Canonical route | Upstream `superpowers` entry |
| --- | --- |
| `phase.brainstorm` | `brainstorming` |
| `phase.plan` | `writing-plans` |
| `phase.execute` | `subagent-driven-development` |
| `phase.review` | `requesting-code-review` |
| `phase.verify` | `verification-before-completion` |
| `phase.visual` | `frontend-design` |
| `phase.web-test` | `webapp-testing` |

### `gstack` adapter

The `gstack` adapter must consume the same canonical route space directly.

It must not normalize its canonical routes through `superpowers` aliases.

The canonical-to-upstream mapping for the currently supported `gstack` slice is:

| Canonical route | Upstream `gstack` entry |
| --- | --- |
| `phase.plan` | `plan-eng-review` |
| `phase.execute` | `ship` |
| `phase.review` | `review` |
| `phase.verify` | `qa` |

If a canonical route is not supported by `gstack`, the adapter returns no source entry for that route.
Support must remain explicit and fail closed.

### `direct` source

`direct` remains the source for `intent.*` routes.

This cutover does not change the existing rule set:

- `intent.*` routes resolve to `direct`
- direct-mode workflows do not own phase-family routes
- non-direct sources do not own direct intents

## Core Routing Invariants

After the cutover, the following invariants must hold.

### Invariant 1: resolved canonical routes are true canonical routes

`ResolvedRoute.canonicalRoute` must always return one of:

- a true canonical phase route from the registry above
- a true direct-mode `intent.*` route

It must never return `phase.writing-plans`, `phase.requesting-code-review`, or any other `superpowers`-specific internal route ID.

### Invariant 2: source routing tables use true canonical routes only

The following configuration and computed tables must use true canonical route IDs only:

- `sourcePresets.routes`
- `preset.sourceRoutes`
- `effectiveSources`
- source resolution traces
- source summary tables

The core must reject source route tables that rely on legacy `superpowers` canonical IDs.

### Invariant 3: `WorkflowSourceEntry.canonicalRoute` stays canonical

`WorkflowSourceEntry` continues to carry:

- `canonicalRoute`
- `source`
- `entryName`

But its `canonicalRoute` field must always hold the true canonical route ID, never a source-native alias.

### Invariant 4: no cross-source alias normalization in the core

The routing core must stop performing route alias normalization that turns one source's canonical route expectation into another source's internal vocabulary.

Concretely, logic like `phase.plan -> phase.writing-plans` belongs in the `superpowers` adapter, not in shared source normalization.

### Invariant 5: the core has one route truth layer only

The core must not preserve both:

- true canonical route IDs
- legacy `superpowers` canonical IDs

as co-equal internal representations.

If both continue to exist as core truth, the cutover has failed.

## Host Adapter Rules

All host adapters must consume the resolved routing result.

That resolved result includes at least:

- `canonicalRoute`
- `resolvedSource`
- `sourceEntry`
- `profileId`
- `selection`

Host adapters may still render host-native wrapper names such as `sp-plan`, `spr-plan`, or `oms-plan`.
That does not violate the model.

What they must not do is:

- reinterpret `phase.plan` as `writing-plans` inside host code
- perform route alias lookups outside the source adapter
- silently fall back to a different source-native entry because a canonical route is unsupported

Host code is allowed to render, not to redefine route meaning.

## Diagnostics and Ownership

This cutover includes all route-identity-bearing diagnostics and ownership metadata.

The following outputs must use true canonical route IDs:

- `status`
- `doctor`
- `explain`
- `ExplainTrace.sourceEntry`
- effective source summaries
- generated ownership metadata such as `<!-- oms-route: ... route=... -->`

The route portion of ownership metadata must therefore move from values such as `phase.writing-plans` to `phase.plan`.

Artifact reconciliation must continue to support:

- same-name artifact rewrite when the source changes
- stale OMS-owned artifact cleanup
- collision protection against user-owned files

But it must do so under the new canonical route identity.

## One-Shot Cutover Rules

This implementation is explicitly a one-shot cutover.

That means:

- no long-lived bridge table in the core
- no durable support for legacy `superpowers` canonical IDs in shared route resolution
- no phased rollout where diagnostics and ownership lag behind the router

The only allowed durable compatibility boundary is:

- user-facing built-in phase inputs at the OMS edge
- source-native entry names inside the relevant source adapter

Everything else must switch in the same implementation slice.

## Implementation Sequence

The cutover should happen in this order, but land as one coherent change set.

1. Rewrite route and source tests so they assert the new canonical truth layer.
2. Redefine the canonical phase route registry and built-in phase normalization.
3. Refactor `superpowers` and `gstack` source adapters to map from true canonical routes.
4. Update shared route resolution and source normalization so only true canonical route IDs remain.
5. Update control-plane explainability, summaries, and ownership metadata.
6. Update all host adapters to consume the new resolved route shape without legacy route reinterpretation.
7. Update schema examples, architecture docs, and command output expectations.

The implementation may be sequenced internally, but the repository must not be left in a state where both route truth layers are considered valid.

## Testing and Verification

The cutover is only complete if the new truth layer is enforced by tests.

### Route core tests

These tests must prove:

- built-in phase inputs normalize to true canonical routes
- `ResolvedRoute.canonicalRoute` uses the new route IDs
- effective source resolution keys use the new route IDs
- direct-mode intent routing remains unchanged

### Source adapter tests

These tests must prove:

- `superpowers` maps true canonical routes to upstream `superpowers` entries
- `gstack` maps true canonical routes to supported upstream entries directly
- unsupported canonical routes stay unsupported instead of aliasing through another source vocabulary

### Host projection tests

These tests must prove:

- generated host artifacts consume the new canonical route identity
- hosts do not rely on `superpowers`-specific route IDs for internal routing semantics
- rendered wrappers still point to the correct upstream entry name for the resolved source

### Reconciliation and ownership tests

These tests must prove:

- route metadata rewrites correctly under the new canonical route IDs
- source-switch rewrites still work for same-name artifacts
- stale cleanup still removes OMS-owned neighbors without touching user files

### Fail-closed tests

These tests must continue to prove:

- direct-mode restrictions still hold
- Claude direct mode still rejects unsupported combinations
- Qwen still rejects unsupported source combinations for the current scope
- invalid source route combinations fail at config validation instead of degrading silently

### Repository verification

Before the work is considered complete:

- unit and integration tests must pass
- `check` must pass
- `build` must pass
- documentation and schema examples must no longer describe `superpowers`-specific internal route IDs as canonical

## Risks

### Risk 1: broad blast radius

This cutover touches core routing, source adapters, diagnostics, host projections, artifact reconciliation, and docs.

That breadth is intentional, but it raises the risk of incomplete migration.

Mitigation:

- treat this as one cohesive cutover
- change tests first
- refuse partial truth-layer compatibility in the core

### Risk 2: accidental fallback logic in hosts

When a host adapter breaks, the easiest local fix is to reintroduce source-specific route logic there.

That would undo the architectural correction.

Mitigation:

- require host code to consume source adapter output
- push all route meaning back toward the adapters and router

### Risk 3: stale artifact recognition drift

Ownership metadata route values are changing.
If reconciliation logic is not updated together, stale cleanup or collision behavior may regress.

Mitigation:

- update materialize ownership handling in the same cutover
- keep dedicated tests for rewrite, cleanup, and collision protection

## Success Criteria

This design is successful only if all of the following are true at the same time:

- the core route truth layer uses only true canonical route IDs
- `superpowers`-specific internal route IDs no longer exist outside the `superpowers` adapter boundary
- `gstack` no longer relies on alias normalization into `superpowers` route space
- diagnostics and ownership metadata report true canonical route IDs
- host adapters continue to function while consuming the corrected resolved route model
- unsupported combinations continue to fail closed

## Follow-On Work

This cutover intentionally prepares, but does not itself solve:

- centralized source and host capability modeling
- richer upstream availability diagnostics
- future route families beyond the current phase and intent slices

Those should build on the corrected canonical route core rather than trying to coexist with the current transitional route model.
