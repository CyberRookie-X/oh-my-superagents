# Hybrid Context Orchestration Design

## Summary

This design defines the long-term context orchestration architecture for OMS before release.

The repository is still pre-launch.
There is no backward-compatibility requirement, no migration burden to preserve, and no reason to leave context orchestration in a half-designed state.
The correct move is to front-load the full target architecture now.

The target state is an expanded OMS that still owns canonical routing and model/profile selection, but also becomes a first-class context orchestration layer for mixed workflow usage across:

- `superpowers`
- `gstack`
- OMS-native direct workflows
- a narrow, deliberately selected subset of GSD-inspired context techniques
- external context-management tools over file, CLI, MCP, manifest, and event surfaces

The core recommendation is a `Hybrid+` architecture with six durable layers:

1. canonical routing and source resolution
2. lifecycle stage modeling
3. read-only context index and artifact model
4. session-aware context pack selection (`D2`)
5. compression readiness and policy
6. hybrid compression execution via OMS-native lightweight engines plus external integrations

OMS is no longer constrained by a thinness goal for its own sake.
The governing rule is not "stay thin" or "avoid orchestration".
The governing rule is: own the layers that materially improve mixed workflow reuse, routing, context quality, and token efficiency, while avoiding low-value duplication of full upstream runtimes.

## Problem

OMS already has a strong route model:

- canonical route
- source
- profile
- host projection

That model is necessary, but it is not sufficient for mixed workflow context control.

Four structural gaps remain.

### Gap 1: route semantics are not enough to manage context boundaries

The current routing core can answer:

- which canonical route is active
- which source owns it
- which source entry implements it
- which profile and host projection apply

It does not yet answer:

- whether this is a safe handoff boundary
- whether prior context is now stale
- whether a durable artifact exists that can replace raw conversation history
- whether the session should compact, summarize, checkpoint, or resume from a smaller packet

In practice, the strongest compression moments are often lifecycle boundaries rather than route names.

Examples:

- spec approved after `brainstorming`
- plan saved after `writing-plans`
- task packet emitted before a subagent starts
- review log written after `/review`
- checkpoint saved after `/checkpoint`
- branch integration completed after `finishing-a-development-branch` or `/ship`

Those are not modeled today.

### Gap 2: mixed workflow users need more than route-to-source fusion

The current architecture intentionally defines workflow fusion as route-to-source mapping rather than runtime chaining.
That remains correct.

However, users combining `superpowers`, `gstack`, and selective context-management tooling still need OMS to own more than route selection.

They need OMS to help answer:

- what context should the next stage carry
- what prior context can be collapsed into artifacts
- when is auto-compression safe
- which built-in versus external compression path should run
- how multiple context tools can coexist without hidden collisions

Without that layer, route fusion works, but context still bloats and drifts.

### Gap 3: GSD is useful as an idea source but a poor product-compatibility target

GSD contains several valuable ideas for context handling, including:

- phase-specific file manifests
- milestone narrowing
- structured markdown truncation
- handoff anchors
- fresh-session-per-unit execution
- context budgeting

But GSD as a product owns a much broader surface:

- full workflow semantics
- planning state
- session lifecycle
- compaction
- memory extraction
- runtime and provider hooks
- broader orchestration machinery

Trying to make OMS "compatible with GSD" as a full product would drag OMS toward GSD's runtime shape instead of OMS's own product goals.

The correct move is more selective:

- absorb the high-value subset that OMS genuinely needs
- interoperate with key GSD artifacts and semantics where useful
- do not treat full GSD compatibility as a design goal

### Gap 4: the external context-tool ecosystem is broader than GSD

Many context-management tools are easier interoperability targets than GSD because they occupy narrower surfaces such as:

- repo packing
- repo maps
- memory MCP
- file-based project memory
- prompt/export CLIs

OMS should not overfit to one large upstream product when the broader ecosystem can often integrate cleanly through smaller contracts.

## Goals

- Define a long-term context orchestration architecture that is complete enough to implement before release.
- Preserve canonical route and source resolution as the routing truth layer.
- Add lifecycle-stage modeling as an orthogonal axis for context boundaries.
- Add a read-only context index and artifact model (`D1`).
- Upgrade that model to session-aware context pack selection (`D2`).
- Support rule-first context compression with summary-enhanced augmentation.
- Support automatic compression at selected safe moments, with per-moment enablement and strong safety gates.
- Reuse `superpowers` and `gstack` as workflow sources while optimizing how OMS carries context around them.
- Absorb only the useful subset of GSD-inspired context techniques instead of targeting whole-product GSD compatibility.
- Provide broad interoperability over file, CLI, MCP, manifest, and event surfaces.
- Keep `status`, `doctor`, and `explain` as first-class explainability surfaces for all context decisions.

## Non-Goals

- Making OMS fully product-compatible with GSD.
- Recreating GSD's entire session tree, memory system, database state model, or provider hook stack inside OMS.
- Turning context pack selection into a new routing truth layer.
- Letting host adapters define context policy independently.
- Requiring all hosts to support identical runtime context behavior.
- Prioritizing thinness over product usefulness.
- Prioritizing orchestration for its own sake when a smaller contract is sufficient.

## Architectural Options

### Option 1: conservative suggest-only layer

OMS adds lifecycle modeling plus compression opportunities, but only suggests actions.

Strengths:

- lowest implementation risk
- strong explainability
- preserves a thin OMS core

Weaknesses:

- leaves too much value unrealized
- does not directly reduce token use in mixed workflows
- under-responds to the user's goal of full long-term optimization

### Option 2: full GSD-compatibility target

OMS attempts to make GSD a compatibility target or emulate its broader runtime and context semantics.

Strengths:

- superficially comprehensive

Weaknesses:

- imports the wrong product center
- greatly expands scope into lower-value runtime duplication
- couples OMS to an upstream product shape that is larger than the required problem

### Option 3: `Hybrid+` context orchestration layer

OMS keeps route/source/profile/host truth, adds lifecycle and context selection, ships a built-in lightweight compression engine, and also interoperates broadly with external tools.

Strengths:

- directly addresses mixed workflow context needs
- captures the highest-value subset of GSD-inspired ideas without adopting full GSD semantics
- keeps `superpowers` and `gstack` reusable as workflow sources
- supports broad ecosystem interoperability

Weaknesses:

- broader than a pure router/control-plane product
- requires careful boundaries so context orchestration does not leak into routing truth or arbitrary runtime ownership

## Recommendation

Adopt Option 3.

Specifically:

- keep `superpowers` and `gstack` as workflow sources
- do not make full GSD compatibility a target
- absorb the narrow GSD-inspired context techniques that demonstrably improve OMS
- let OMS become thicker where that directly improves mixed workflow reuse, context quality, and token efficiency
- keep routing truth, lifecycle context, and external interoperability as three explicit architectural layers rather than one merged concept

## Product Positioning

OMS should now be positioned as:

- a canonical routing core
- a model/profile routing layer
- a host-native projection layer
- a mixed-workflow context orchestration layer

It should not be positioned as:

- a clone of `superpowers`
- a clone of `gstack`
- a clone of GSD
- a generic agent runtime that owns every host and provider concern

The key distinction is not thin versus thick.
The key distinction is high-value context orchestration versus low-value full-runtime duplication.

## Design Principles

### Principle 1: routing truth remains canonical

Canonical route, source, profile, and host projection remain the durable routing truth.
Context policy must consume that truth, not redefine it.

### Principle 2: lifecycle stage is a separate axis

Context boundaries should be modeled through lifecycle stages rather than inferred only from route names.

### Principle 3: context packs are derived state

`D2` context pack selection is a session-scoped derived output.
It is not part of canonical route identity.

### Principle 4: auto-compression must be fail-closed

Automatic compression should run only when OMS can prove that a durable artifact boundary exists and that resume safety is acceptable.

### Principle 5: own the common, integrate the specialized

OMS should build in the common, high-value context behaviors needed across mixed workflows.
OMS should integrate with external tools for broader or more specialized context services.

### Principle 6: selective GSD absorption is correct

The repository should absorb GSD-inspired techniques only where they serve OMS directly.
It should not inherit GSD's broader product center.

### Principle 7: explainability is part of the product

Every meaningful context decision should be explainable through shared diagnostics.

### Principle 8: pre-launch correction beats transitional compromise

Because the repository is still pre-launch, the architecture should land in its target state now instead of preserving temporary compromise layers.

## Layer Model

OMS should have six context-related layers.

### Layer 1: canonical routing and source resolution

Existing truth:

- canonical route
- resolved source
- source entry
- resolved profile
- host projection target

This layer stays authoritative for routing.

### Layer 2: lifecycle stage model

New shared lifecycle stages should include at least:

- `bootstrap`
- `design`
- `prepare_workspace`
- `plan`
- `execute_task`
- `review`
- `verify`
- `integrate_branch`
- `checkpoint`
- `resume`

These stages are not replacements for canonical routes.
They are shared context-boundary semantics.

### Layer 3: context index and artifact model (`D1`)

OMS should build a read-only index over durable artifacts such as:

- spec
- plan
- decision log
- knowledge document
- summary
- checkpoint
- review log
- verification evidence
- handoff anchor
- continue packet
- repo pack export
- external memory snapshot metadata

This layer should know:

- artifact kind
- location
- authority level
- freshness metadata
- source of origin
- associated route and lifecycle stage where applicable

### Layer 4: session-aware context pack selection (`D2`)

OMS should derive an `effectiveContextPackSelection` from:

- canonical route
- resolved source and source entry
- active preset
- effective lane
- lifecycle stage
- host and command
- session-local overrides
- context index state
- compression policy

This is a post-routing derived layer.

### Layer 5: compression readiness and policy

OMS should evaluate whether compression is safe, conditional, or unsafe for the current boundary.

This layer owns:

- safety classification
- required anchors
- freshness checks
- moment-specific enablement
- engine selection
- resume packet requirements

### Layer 6: hybrid compression execution

OMS should support both:

- built-in lightweight compression engines
- external compression or memory providers

The system should support `builtin`, `external`, and `hybrid` execution modes.

## Lifecycle Model

The lifecycle layer exists because context control is driven by durable handoff boundaries, not only route names.

Examples:

- a plan being written is `phase.plan`, but the durable boundary is `plan` once the artifact is saved and approved
- a `superpowers` task execution and a `gstack` QA loop may both map onto broad execution semantics, but their compression boundaries differ materially
- branch integration moments such as `/ship` or `finishing-a-development-branch` are not just another `phase.execute`

OMS should therefore model lifecycle stages explicitly and let source adapters, context providers, and diagnostics attach meaning to them.

## Context Artifacts

### Artifact authority levels

Artifacts should be classified by authority.

Suggested levels:

- `authoritative`: approved spec, accepted plan, saved checkpoint, committed review log, verification evidence
- `derived`: summary, anchor, repo pack, narrowed milestone excerpt
- `advisory`: external recall result, memory snapshot, heuristic summary

### Artifact freshness

Artifacts should track freshness using metadata such as:

- `headCommit`
- `reviewedCommit`
- `commitsSinceArtifact`
- `updatedAt`
- `staleAfter`

This supports safe auto-compression.

## `D1` and `D2`

### `D1`

`D1` is the read-only context index and artifact model.

It can answer:

- what durable artifacts exist
- which ones are authoritative
- which lifecycle stage they came from
- whether they are likely stale

### `D2`

`D2` upgrades OMS from passive indexing to session-aware context selection.

`D2` should mean:

`resolved OMS route state -> session-scoped effective context pack selection`

It should not mean:

- new route truth
- host-local hidden context behavior
- pack-specific canonical route identity

### `D2` variants

The target state should support a medium-strength `D2` architecture from the start:

- route/source/profile truth remains unchanged
- selection is session-scoped
- configuration can define defaults and presets
- diagnostics expose effective selection
- host/runtime layers may consume shared hints

OMS should not stop at a purely suggest-only `D2`, and it should not jump directly to a pack-specific artifact identity model.

## Compression Model

### Compression moments

Compression opportunities should attach to lifecycle moments such as:

- spec approved
- plan saved
- task packet emitted
- task completed and reviewed
- review log written
- verification evidence captured
- checkpoint saved
- resume started
- source switch completed
- branch integration completed

### Compression readiness

OMS should evaluate a `CompressionReadiness` result with states such as:

- `safe`
- `conditional`
- `unsafe`

That result should consider at least:

- whether an authoritative artifact exists
- whether a user decision gate is still open
- whether freshness has been invalidated
- whether a deterministic resume packet can be built

### Resume packet

Every safe or conditional compression should produce a durable minimal resume packet containing at least:

- current lifecycle stage
- next step
- authoritative artifacts to reopen
- freshness-critical metadata
- unresolved decisions
- required rechecks if any

## Compression Engines

### Recommended engine strategy: hybrid, rule-first, summary-enhanced

OMS should adopt a hybrid engine strategy.

Default behavior should be rule-first:

- phase or lifecycle manifests choose relevant artifacts
- large documents are structurally truncated
- current milestone or current task slices are narrowed
- durable handoff anchors are preferred over raw history

Summary-based compression should be an enhancement layer:

- summarize when rule-based narrowing alone is insufficient
- carry forward structured summaries instead of dumping long prose
- treat summary output as derived rather than authoritative

### Built-in techniques OMS should own

OMS should directly implement the following techniques:

- lifecycle or operation-specific artifact manifests
- structured markdown truncation
- milestone and task narrowing
- handoff anchor generation
- resume packet generation
- inline levels such as `minimal`, `standard`, and `full`
- context budget allocation for built-in pack assembly

### Techniques OMS should not copy wholesale from GSD

OMS should not treat the following as target-state requirements:

- full session tree persistence
- provider-request hook rewriting as the main architecture
- DB-backed orchestration state as a prerequisite for context control
- broad autonomous memory extraction as core scope

## GSD Stance

OMS should treat GSD in three ways.

### GSD as an idea source

OMS should absorb techniques such as:

- phase-specific context file selection
- structured truncation
- milestone narrowing
- handoff anchors
- fresh-session-per-unit thinking
- context budgets and inline levels

### GSD as an interoperability source

OMS should support selective interoperability with useful GSD artifacts and semantics such as:

- summary files
- decision and knowledge documents
- roadmap slices
- continue packets
- handoff anchors

### GSD as a non-goal compatibility target

OMS should not define success as:

- reproducing GSD's whole workflow engine
- reproducing GSD's full session model
- guaranteeing whole-product behavioral compatibility

The repository should optimize for OMS's own mixed-workflow context goals instead.

## External Interoperability Model

OMS should support broad interoperability over four main surfaces.

### File and document interoperability

OMS should read and write portable artifacts such as:

- summaries
- checkpoints
- decisions
- knowledge
- context packs
- repo pack outputs

### CLI and packer interoperability

OMS should integrate with external CLIs that produce compact project context, token-aware exports, or index-like artifacts.

### MCP interoperability

OMS should support external providers over MCP for capabilities such as:

- recall
- search
- summarize
- pack
- memory status

### Manifest and event interoperability

OMS should define a small compatibility contract for:

- provider capabilities
- supported artifact kinds
- lifecycle events
- freshness and trust metadata

## Settings Direction

Automatic context control should follow existing OMS control-plane configuration style.

The preferred baseline is a shared `settings.contextCompression` block rather than preset-local duplication.

The target-state control surface should include at least:

- `mode`: `manual | suggest | auto`
- `engine`: `builtin | external | hybrid`
- per-moment enablement
- safety thresholds
- inline level
- optional preset-style reusable policy bundles
- session-scoped overrides analogous to lane behavior

If route-specific overrides are later added, they should use canonical route IDs only.

## Diagnostics

`status`, `doctor`, and `explain` should report not only routing truth but also context orchestration truth.

They should eventually expose at least:

- current lifecycle stage
- effective context pack selection
- authoritative artifacts in use
- compression opportunities
- compression readiness
- selected compression engine
- external provider availability where relevant
- freshness risks and blocked gates

This should remain explicit and fail closed.

## Host and Source Boundaries

`superpowers` and `gstack` remain workflow sources.
They do not become hosts or context engines inside OMS.

Host adapters should consume shared context decisions where possible.
They should not own policy.

External context tools should generally be modeled as providers or interoperability surfaces, not as workflow sources.

## Success Criteria

This design is successful only if all of the following become true:

- OMS keeps canonical route and source resolution as routing truth
- OMS gains an explicit lifecycle-stage model
- OMS ships both `D1` and `D2`
- OMS can detect and explain safe compression opportunities
- OMS can run built-in lightweight compression in a rule-first, summary-enhanced manner
- OMS can interoperate broadly with external file, CLI, MCP, and manifest-based context tools
- OMS reuses `superpowers` and `gstack` as workflow sources rather than reimplementing them
- OMS absorbs only the useful subset of GSD-inspired context techniques rather than targeting whole-product GSD compatibility
- the product becomes stronger at mixed-workflow optimization without turning routing truth into a context-specific mess

## Recommended Delivery Direction

This design defines the target state, not a partial compromise.

Implementation can still proceed in dependency order, but the target should remain fixed:

1. add lifecycle-stage and context-artifact foundations
2. add `D1` index and diagnostics
3. add `D2` context pack selection
4. add compression readiness and built-in hybrid engines
5. add broad interoperability over file, CLI, MCP, and manifest surfaces

That ordering is an implementation dependency chain, not a statement of product priority.
The target state includes the whole `Hybrid+` architecture.
