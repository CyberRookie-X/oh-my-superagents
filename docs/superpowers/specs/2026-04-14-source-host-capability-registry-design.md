# Source and Host Capability Registry Design

## Summary

This design defines a centralized capability registry for OMS.

The registry is the single shared policy layer that answers support questions such as:

- can this source own this canonical route
- can this host project this resolved source entry
- is this command supported for this workflow mode and host
- if unsupported, what exact fail-closed reason applies

The goal is not to move workflow behavior into one giant table.
The goal is to centralize support policy while leaving route meaning and source-native entry mapping inside the source adapters.

## Problem

OMS already has important fail-closed behavior, but the rules are scattered.

Examples of currently scattered decisions include:

- config-time checks for which sources may own which routes
- CLI checks for which hosts support which commands
- host-local checks such as Qwen rejecting `gstack`
- host-local checks such as Claude rejecting direct mode

This causes three problems:

1. the same support decision may be encoded in more than one place
2. the path from unsupported combination to user-visible reason is inconsistent
3. new source or host additions must rediscover where policy is currently hidden

## Goals

- define one shared policy layer for support and fail-closed decisions
- keep route meaning and source entry mapping in source adapters
- give the CLI and host adapters structured capability decisions with stable reason codes
- centralize support logic without weakening existing fail-closed behavior
- prepare a clean foundation for generalized readiness diagnostics in the next stage

## Non-Goals

- replacing source adapters with a table-driven workflow engine
- duplicating source-native route catalogs inside the capability registry
- performing upstream install detection in this stage
- auto-installing missing workflow sources or host prerequisites

## Design Principles

### Principle 1: source adapters own route catalogs

The capability registry does not replace:

- `workflow-superpowers.ts`
- `workflow-gstack.ts`
- `workflow-direct.ts`

Those modules remain responsible for source-native entry mapping.

The capability registry consumes their output and answers support-policy questions about it.

### Principle 2: support is different from availability

This stage defines whether something is supported.
It does not yet define whether the required upstream installation is present.

Examples:

- `qwen + gstack + phase.review` may be unsupported even if `gstack` is installed
- `claude + superpowers + phase.plan` may be supported even if the required upstream entry is currently missing

Availability is the next stage.

### Principle 3: fail closed with structured reasons

Support decisions should produce structured results rather than ad-hoc error strings.

That means the registry should return reason codes such as:

- `unsupported_source_route`
- `unsupported_host_source_projection`
- `unsupported_host_workflow_mode`
- `unsupported_control_plane_command`

The human-readable message can still vary by output surface, but the reason identity should stay stable.

## Capability Model

### Support dimensions

The registry should answer at least four kinds of support question.

#### 1. Source route support

Can source `S` own canonical route `R`?

Examples:

- `gstack` supports `phase.plan`
- `gstack` does not support `phase.visual`
- `direct` supports `intent.plan`
- `direct` does not support `phase.plan`

This support should be derived from source adapter catalogs rather than duplicated manually.

#### 2. Host projection support

Can host `H` project a resolved source entry for canonical route `R` and source `S`?

Examples:

- OpenCode can project `gstack` for `phase.plan`
- Codex can project `gstack` for `phase.review`
- Qwen cannot project `gstack` in the current supported slice
- Claude cannot project direct workflow in the current supported slice

#### 3. Workflow-mode support

Can host `H` support workflow mode `W` for a given OMS command or projection request?

Examples:

- direct mode supports only the current OMS control-plane command subset
- explain may be available for some hosts before others

#### 4. Control-plane command support

Can command `C` run for host `H` and current workflow mode `W`?

Examples:

- `status` may be valid for a host/workflow combination
- `sync` may be valid while `explain` is not

## Registry Shape

The registry should be expressed in code as shared data plus shared evaluators.

The data layer should include:

- supported host list
- supported projection types per host
- supported workflow mode and command combinations
- host-source projection constraints

The evaluator layer should include functions shaped like:

- `isSourceRouteSupported(source, canonicalRoute)`
- `getHostProjectionDecision({ host, sourceEntry, workflowKind })`
- `getControlPlaneCommandDecision({ host, command, workflowKind })`

The output shape should include at least:

- `supported: boolean`
- `reasonCode?: string`
- `reason?: string`

## Boundary with Existing Modules

### Config validation

Config validation should continue to reject invalid route-to-source combinations.

After this stage, those rejections should consult the shared capability registry instead of re-encoding source support logic inline.

### CLI

The CLI should stop using ad-hoc support checks such as host-specific assertion helpers where those helpers encode support policy.

Instead, the CLI should ask the capability registry and then render the exact unsupported-reason or readiness message dictated by that shared decision.

### Host adapters

Host adapters should stop carrying support-policy logic locally when the logic is really shared policy.

A host adapter may still contain rendering code and host-native file-shape decisions.
It should not be the authority on whether a combination is supported.

## Initial Reason Codes

The initial stable reason-code set should cover at least:

- `unsupported_source_route`
- `unsupported_host_source_projection`
- `unsupported_host_direct_projection`
- `unsupported_control_plane_command`
- `unsupported_workflow_mode`

The exact strings may evolve, but the point is to create a small, stable vocabulary for unsupported combinations.

## Expected Refactors

This stage should absorb policy currently scattered across modules such as:

- `src/config.ts`
- `src/cli.ts`
- `src/qwen.ts`
- `src/claude.ts`

Some modules may still perform local assertions, but those assertions should delegate to shared capability decisions.

## Relationship to Diagnostics

This stage does not yet detect installs or versions.
It only answers whether OMS supports a combination in principle.

That separation is intentional.

The next stage should be able to say:

- supported but unavailable
- supported and available
- unsupported regardless of install state

That is only clean if support policy is centralized first.

## Success Criteria

This design is successful only if all of the following become true:

- source and host support decisions are centralized in one shared policy layer
- config, CLI, and host adapters stop re-encoding the same support decisions independently
- unsupported combinations resolve to stable reason codes
- current fail-closed behavior is preserved or tightened, never weakened
- the capability layer remains policy-only and does not absorb source-native workflow semantics
