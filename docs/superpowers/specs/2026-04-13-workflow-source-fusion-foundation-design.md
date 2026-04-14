# Workflow Source and Fusion Foundation Design

## Summary

This design replaces the long-term architectural role of global `workflow.kind` with a more durable model based on canonical routes and per-route source resolution.

It defines the foundation required for:

- multiple first-party workflow sources
- workflow fusion across sources
- durable explainability and diagnostics
- future host growth without embedding workflow-specific assumptions inside hosts

## Problem

The current model assumes one active workflow for the whole configuration.

That causes three long-term problems:

1. It makes `superpowers`, `gstack`, and direct mode asymmetrical.
2. It prevents one preset from mixing sources across canonical routes.
3. It encourages host adapters to encode workflow assumptions directly.

This becomes an architectural obstacle once the product wants to support:

- more than one workflow source
- workflow fusion
- richer host coverage

## Goals

- Define a canonical route model that is stable across sources.
- Define source resolution as a first-class step in routing.
- Support workflow fusion without introducing a runtime orchestrator.
- Preserve `profile` as an independent leaf configuration.
- Define explainability, diagnostics, and ownership rules for mixed-source routing.
- Keep room for phased implementation without compromising the target architecture.

## Non-Goals

- Solving every host runtime limitation in this foundation document.
- Defining `gstack`'s full route catalog here.
- Defining Claude Code host projection here.
- Designing source-chaining orchestration semantics.

## Canonical Route Model

### Canonical route is the core routing unit

The routing core should resolve stable canonical routes instead of source-specific route vocabularies.

Initial canonical routes should be grouped by family.

### Phase family

Phase routes preserve the current strong `superpowers` mental model while removing its monopoly over the architecture.

Examples:

- `phase.brainstorm`
- `phase.plan`
- `phase.execute`
- `phase.review`
- `phase.verify`

### Intent family

Intent routes express direct work kinds that do not require an upstream workflow tool.

Examples:

- `intent.plan`
- `intent.build`
- `intent.debug`
- `intent.review`
- `intent.test`

### Future source-native routes

If a source introduces a route concept that cannot be expressed well as phase or intent, it may earn a dedicated canonical route later.

That should be rare.
The default bias should be toward mapping source-native entries onto existing canonical routes where possible.

## Source Model

### Source is the route implementation provider

A source provides workflow semantics for a canonical route.

Examples:

- `superpowers`
- `gstack`
- `direct`

The source layer should answer:

- which source owns this route
- which source entry implements it
- what capabilities and caveats apply

### Source entry

Each resolved source should map a canonical route to a source-native entry such as:

- a `superpowers` phase skill
- a `gstack` command or skill
- a direct-mode host-native wrapper

The core should preserve this distinction:

- canonical route is the product-level identity
- source entry is the source-specific implementation pointer

## Fusion Model

### Fusion is route-to-source mapping

The core long-term model for workflow fusion should be:

`canonical route -> source`

Examples:

- `phase.plan -> gstack`
- `phase.execute -> superpowers`
- `phase.review -> gstack`
- `intent.build -> direct`

### Fusion is not source chaining

The product should not define fusion as internal multi-engine runtime choreography.

It should not attempt to become a workflow orchestrator that coordinates stateful execution across multiple workflow products.

Instead, fusion remains a routing decision.

## Configuration Direction

### Long-term truth layer

The core configuration must be able to express effective route-to-source mappings explicitly.

That is the durable truth needed by:

- `explain`
- `doctor`
- diagnostics
- host projection

### Reuse layer

Above that truth layer, the product should support reusable named source combinations.

Examples:

- `fusionPresets.deepPlanning`
- `fusionPresets.fastDelivery`

Those presets should always expand into an effective route-to-source table.

### Precedence

The long-term precedence rules should be:

1. explicit route-to-source overrides
2. selected fusion preset expansion
3. source defaults

This keeps the final routing table deterministic and explainable.

## Profiles Stay Independent

Profiles remain the leaf model configuration.

This document intentionally keeps profile selection separate from source selection.

That means:

- a source does not imply a model choice
- a profile does not imply a workflow source

Long-term effective resolution should remain conceptually separable:

- route resolution
- source resolution
- profile resolution

even if implementations optimize those lookups together later.

## Explainability and Diagnostics

Mixed-source routing is only viable if the product keeps strong explainability.

`status`, `doctor`, and `explain` should converge on an effective table that shows at least:

- canonical route
- resolved source
- source entry
- resolved profile
- host projection target

This is especially important once different routes may come from different sources.

## Ownership and Lifecycle Rules

Once more than one source may back the same host, artifact ownership rules need to tighten.

Long-term ownership metadata should be able to distinguish at least:

- host
- route
- source
- projection type

This avoids stale-file ambiguity during:

- source switches
- fusion preset changes
- host changes
- workflow mode transitions during migration

Lifecycle surfaces such as `status`, `sync`, `doctor`, `use`, and `disable` should also be reinterpreted as control-plane operations over resolved sources, not just over a single global workflow.

## Capability Caveat: Long-Lived Sessions

The architecture should explicitly acknowledge that not every host or source combination can dynamically swap profiles inside one reused agent session.

Therefore:

- the core may express per-route profile differences
- hosts may still report capability limits for some source strategies

The correct system behavior is:

- preserve the intended routing model
- surface capability mismatch explicitly
- avoid pretending that all host runtimes support the same execution model

## Migration Direction

The implementation may arrive in phases, but the target state should remain fixed.

Suggested implementation progression:

1. introduce canonical route aware source resolution alongside current behavior
2. add effective route-to-source explainability and diagnostics
3. migrate host adapters to consume resolved source-aware results
4. retire the architectural centrality of global `workflow.kind`

## Recommendation

Adopt canonical route based source resolution as the long-term foundation of the product.

That gives the repository the most durable path for:

- source symmetry
- workflow fusion
- future host growth
- strong diagnostics

without collapsing into a runtime orchestrator.
