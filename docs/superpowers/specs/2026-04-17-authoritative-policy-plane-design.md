# Authoritative Policy Plane Design

## Summary

This design refines and partially supersedes `docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md`.

The 2026-04-15 design established that OMS should become a real context-orchestration layer instead of remaining only a thin router.
That direction remains correct.

What changes in this design is the governing boundary.

OMS should not become the workflow brain.
`superpowers`, `gstack`, and future workflow systems remain the brains.
OMS becomes the authoritative policy plane around them:

- selector-aware model routing
- selector-aware context strategy
- selector-aware external capability policy
- AI-guided configuration authoring
- deterministic runtime resolution from persisted authority
- safe fallback when authority is broken

The product center is no longer "route plus a few extras" and it is also not "runtime intelligence everywhere".
The product center is:

- workflow-brain reuse upstream
- policy and context precision in OMS
- explicit, reviewable, authoritative configuration
- stronger explainability than hidden runtime heuristics

## Relationship To Earlier Work

The 2026-04-15 Hybrid Context Orchestration design still stands on these points:

- OMS should own real context orchestration before launch.
- OMS should keep canonical routing truth.
- OMS should keep `superpowers` and `gstack` as workflow sources.
- OMS should absorb only the valuable subset of GSD-inspired ideas.
- OMS should interoperate broadly over file, CLI, MCP, manifest, and event surfaces.

This new design adds five constraints that were not yet settled clearly enough:

1. OMS must not become the workflow brain.
2. User-installed skills, plugins, and MCPs may be policy targets, but OMS must not control upstream workflow-internal skills.
3. Configuration depth is horizontal and sparse, not a simple basic-versus-advanced product split.
4. AI should act as a configuration authoring assistant, not a hidden runtime decision-maker.
5. OMS should not ship a heavy hot-reload runtime yet; startup/session reload plus last-known-good fallback is the right first reliability target.

## Problem

The current OMS architecture has strong routing and an increasingly strong context layer, but the remaining design risks are now different from the ones in the earlier spec.

### Risk 1: OMS can drift into the wrong product center

If OMS keeps expanding without a sharper boundary, it can slide into owning too much of the workflow brain:

- deciding upstream-internal skill flows
- encoding host-specific workflow semantics too deeply
- turning hidden runtime inference into the real decision engine

That would increase maintenance cost, reduce reliability, and make OMS vulnerable to upstream workflow changes.

### Risk 2: the current config shape is not expressive enough for the long-term target

The earlier control-plane model is strong for:

- workflow selection
- profile selection
- lane routing
- context compression presets

It is not yet shaped around the new long-term requirement:

- rules that activate based on scope and workload context
- multiple policy families sharing one selector system
- sparse overrides where users can deeply configure one horizontal axis but leave other axes at defaults

Without a selector-first foundation, OMS will either duplicate conditions across multiple policy families or collapse unrelated concerns into one config blob.

### Risk 3: AI-assisted onboarding can become a hidden second control plane

OMS now clearly needs AI-assisted onboarding because there are too many settings to ask users to configure manually.

However, there are two very different ways to do that:

- AI silently generates config and keeps inferring behavior later
- AI and user discuss, then produce one authoritative config

The first path creates hidden truth sources and makes explainability brittle.
The second path keeps runtime deterministic.

### Risk 4: project understanding needs evidence, but evidence must not become authority

OMS will often detect facts such as:

- `frontend/**` and `backend/**` layout
- presence of browser testing code
- docs-heavy versus backend-heavy workloads
- likely workload tags or modality needs

That detection is useful.
It should inform authoring, diagnostics, and explanation.
It should not bypass user confirmation and become hidden authority.

### Risk 5: configuration safety matters more than runtime reload sophistication

Because OMS is a parasite plugin/control plane inside multiple hosts, heavy hot reload is not the right first investment.
What matters first is:

- safe config authoring
- candidate validation before activation
- atomic file replacement
- startup or new-session reload only
- automatic last-known-good fallback when the current authority is broken
- explicit visibility when fallback is active

## Goals

- Keep workflow brains upstream and keep OMS outside their internal skill logic.
- Make OMS the authoritative policy plane around workflow systems.
- Introduce a selector-first configuration model that can drive multiple policy families.
- Support sparse horizontal configuration depth rather than a global basic-versus-advanced split.
- Split durable configuration into layered responsibilities:
  - user-global inventory and preferences
  - project authority
  - non-authoritative evidence and diagnostics
- Make AI onboarding proposal-driven and discussion-driven, with explicit user confirmation before writing authority.
- Treat workload tags as jointly derived by AI and user, with user override authority.
- Treat multimodal capability as one model-routing dimension, not as the architectural center.
- Keep `superpowers` and `gstack` as workflow sources.
- Treat OpenSpec as an artifact/process dialect, not as a peer workflow source.
- Delay true hot reload and instead implement startup/session reload with last-known-good fallback.
- Preserve first-class `status`, `doctor`, and `explain` surfaces for policy decisions and fallback state.

## Non-Goals

- Making OMS a general-purpose agent runtime brain.
- Controlling `superpowers` or `gstack` internal skill logic.
- Automatically changing the current session's behavior through heavy runtime hot reload.
- Allowing AI-generated but unconfirmed project understanding to become authoritative behavior.
- Making OpenSpec a first-class workflow source equal to `superpowers` and `gstack`.
- Forcing all users into one fixed configuration depth or one fixed preset style.

## Architectural Options

### Option 1: hidden runtime AI control

OMS lets AI infer workload, choose tools, and adapt behavior continuously at runtime.

Strengths:

- minimal explicit configuration surface
- superficially very smart

Weaknesses:

- hidden truth sources
- weak explainability
- more maintenance drift between docs, prompts, and runtime
- greater chance of interfering with workflow brains
- poor fit for long-term reliability

### Option 2: thin context-only OMS

OMS keeps context indexing and compression, but broader model, tool, and scope-aware policy stays mostly elsewhere.

Strengths:

- simpler local boundary
- lower short-term implementation cost

Weaknesses:

- weak global control over model/context/tool precision
- poor fit for cost-aware multimodel composition
- configuration remains fragmented across systems
- under-delivers on the product's purpose

### Option 3: authoritative policy plane with proposal-driven authoring

OMS owns selector-aware policy, authoritative config, inventory/catalogs, and explainability, while upstream workflow systems continue to own workflow brains.

Strengths:

- sharp product boundary
- deterministic runtime behavior
- strong support for sparse, horizontal configuration depth
- good fit for AI-assisted onboarding without hidden authority
- supports multimodel and multimodal pairing cleanly
- supports context precision without owning upstream brains

Weaknesses:

- broader than a simple router
- requires disciplined separation between authority, evidence, and upstream workflow semantics
- requires more documentation infrastructure

## Recommendation

Adopt Option 3.

OMS should be positioned as:

- a canonical routing core
- a selector-aware policy plane
- a context orchestration and compression layer
- a capability and inventory interpreter
- an AI-assisted configuration authoring system
- a deterministic explainability and diagnostics surface

OMS should not be positioned as:

- a hidden runtime AI brain
- an upstream workflow replacement
- a general-purpose live config daemon

## Core Design Principles

### Principle 1: selector system first, policy families second

The foundation of the config system should be a shared selector/scope language.
Policy families consume that selector language.

This avoids repeating the same conditions independently across model, context, and external tool rules.

### Principle 2: authority and evidence must remain separate

Only confirmed configuration should drive runtime behavior.

Detected facts, AI suggestions, inferred workload tags, and diagnostics are evidence.
They may inform authoring and explanation.
They must not become hidden authority.

### Principle 3: AI authoring is collaborative, not silent

AI should:

- inspect current facts
- propose structure and defaults
- explain trade-offs
- ask clarifying questions
- produce one authority document only after user confirmation

AI should not silently create a config that later needs user override to regain control.

### Principle 4: configuration depth is per-axis and sparse

There is no single "basic mode" versus "advanced mode" split.
Users may deeply configure one horizontal axis and leave others mostly inherited.

Examples:

- deep model routing policy but shallow context policy
- shallow tool policy but deep path and workload scoping
- strong review-time restrictions but mostly default execution-time behavior

### Principle 5: startup/session reload before hot reload

OMS should first support:

- safe authoring
- safe writes
- startup and new-session loading
- last-known-good fallback

Only after these are stable should OMS revisit true hot reload.

### Principle 6: multimodality is a dimension, not the center

Model capability matching should include:

- reasoning strength
- coding strength
- cost
- latency
- context window
- visual input or browser observation needs

This enables cost-effective combinations such as:

- strong text-only backend model
- cheaper or narrower visual model for UI tasks

But multimodality itself is not the architectural center.

## Architecture Overview

The recommended OMS stack has five durable layers.

### Layer 1: upstream workflow brains

These remain outside OMS authority:

- `superpowers`
- `gstack`
- future workflow systems

OMS may route toward them, prefer them for selected scopes, and carry context around them.
OMS must not try to own their internal skill logic.

### Layer 2: selector and scope system

Selectors answer one question:

"When does this rule apply?"

Recommended selector dimensions:

- config scope: user-global versus project
- path patterns
- lifecycle stage
- workflow source
- agent role: primary versus subagent
- workload tags
- modality requirements
- optional host constraints where host behavior truly differs

This layer is the base coordinate system for policy.

### Layer 3: policy families

Policy families answer a different question:

"Within this scope, what should OMS do?"

Recommended policy families:

- `modelPolicy`
- `contextPolicy`
- `toolPolicy`
- `sourceCoordinationPolicy`

Each family must support sparse overrides.

### Layer 4: inventory, catalogs, and evidence

OMS needs machine-readable descriptions of available resources and observed facts.

Recommended categories:

- user-global inventory
- capability catalogs
- project evidence and diagnostics
- model capability profiles
- tool and provider metadata

These inputs support authoring, diagnostics, and explanation.
They do not replace authority.

### Layer 5: deterministic runtime resolution

At runtime, OMS resolves behavior from:

- confirmed authority config
- inventory and catalog data
- explicit runtime facts like current stage or path

Not from hidden AI inference.

## Selector System

### Context snapshot

Before policy evaluation, OMS should build a runtime context snapshot with fields such as:

- `cwd`
- `configScope`
- `pathTags`
- `lifecycleStage`
- `workflowSource`
- `agentRole`
- `workloadTags`
- `modalityRequirements`
- `host`

### Workload tags

Workload tags should be produced jointly by AI and user.

The process should be:

1. OMS inspects repo structure and known evidence.
2. AI proposes workload tags and path mappings.
3. User confirms, edits, or rejects them.
4. Confirmed tags enter authority config.

Typical tags may include:

- `backend`
- `frontend`
- `ui-polish`
- `web-test`
- `docs`
- `research`
- `review-heavy`

### Modality requirements

Selectors should express required or preferred modality needs as workload facts, not model identities.

Examples:

- `text-only-ok`
- `vision-input`
- `browser-observation`

This lets policy choose among models without hard-coding one model into every selector.

## Policy Families

### Model policy

Model policy should express:

- preferred profiles or model classes
- reasoning depth or effort
- cost bias
- context-window bias
- capability requirements and exclusions

### Context policy

Context policy should express:

- pack selection
- compression thresholds
- packet-first handoff rules
- resume behavior
- context carry rules between primary and subagent work

### Tool policy

Tool policy should express:

- which user-installed skills are allowed, preferred, or blocked
- which MCP classes are allowed, preferred, or blocked
- which plugins or providers can participate

This applies to external capabilities that OMS is allowed to reason about.
It does not apply to upstream workflow-internal skill logic.

### Source coordination policy

OMS may still need source preferences at the selector level.

Examples:

- prefer `superpowers` during planning scopes
- prefer `gstack` during review-heavy scopes

This is coordination around workflow systems, not ownership of their internal brains.

## Layered Configuration Model

### User-global layer

This layer should hold durable cross-project information such as:

- available models
- installed external skills
- installed plugins and MCPs
- trust and risk preferences
- budget or latency preferences
- reusable default policy fragments

### Project authority layer

This is the single runtime truth for project behavior.

It should hold:

- confirmed workload tags and path mappings
- project selectors
- project policy rules
- project-specific overrides

### Non-authoritative evidence layer

This layer is acceptable and useful, but it must not drive runtime decisions directly.

It may hold:

- detector output
- onboarding notes
- rejected recommendations
- last load failure diagnostics
- fallback metadata

Users may delete it without changing the actual project authority behavior.

## AI-Guided Authoring

### Authoring workflow

The desired authoring flow is:

1. load user-global inventory and project facts
2. inspect repo structure and current host context
3. ask targeted clarifying questions
4. propose selectors, workload tags, and policy defaults
5. explain trade-offs
6. present a reviewable diff or rendered config
7. get user confirmation
8. write the authority config atomically

### AI-readable documentation stack

OMS should maintain a dedicated AI-readable documentation stack made from:

- authoritative schema and contracts
- capability catalogs
- recommendation playbooks
- scenario examples
- onboarding question graph
- migration and deprecation registry
- generated LLM digest pages derived from authoritative sources

### Hard boundary

AI-authored recommendations are not runtime truth until the user confirms them and OMS writes authority.

## Runtime Loading And Reliability

### No heavy hot reload in the current target

For now, OMS should not design around heavy in-session hot reload.

Config should become active at safe boundaries such as:

- host startup
- new session start
- explicit apply or sync commands where supported

### Candidate validation before activation

Even without hot reload, OMS must still validate candidate config before writing or activating it.

Recommended lifecycle:

1. render candidate authority
2. parse and normalize it
3. validate schema and semantics
4. resolve a full control-plane snapshot
5. write atomically only if that succeeds

### Last-known-good fallback

If OMS starts and the current authority config is broken, it should:

1. attempt to load authority
2. if authority fails, attempt to load last-known-good
3. if last-known-good succeeds, continue with clear warnings
4. if both fail, enter degraded mode and block dangerous behavior

### User visibility

When fallback is active, OMS should clearly surface:

- that authority failed to load
- which error occurred
- which last-known-good revision is active
- how to repair the broken authority config

`status`, `doctor`, and `explain` should all surface that state.

## OpenSpec And Workflow Fusion

### OpenSpec stance

OpenSpec should not become a peer workflow source.

It is better treated as:

- a spec and change artifact dialect
- an indexing target
- a context-pack input
- a possible explanation and resume anchor source

### Three-system relationship

The recommended long-term relationship is:

- `superpowers`: workflow source
- `gstack`: workflow source
- `openspec`: artifact/process dialect
- OMS: routing, policy, context, and diagnostics plane around them

This avoids product-center drift while still capturing real interop value.

## Explainability Requirements

OMS should be able to answer all of these clearly:

- which selectors matched
- which policy families contributed to the result
- which inventory or catalog facts were consulted
- whether any evidence suggested an alternative
- whether fallback is active
- whether any tool or model was filtered because of capability or policy constraints

## Consequences

### Positive consequences

- sharper product boundary
- cleaner long-term config model
- better support for cost-aware multimodel pairing
- clearer role for AI onboarding
- lower risk of upstream-workflow interference
- stronger startup reliability

### Costs

- more schema and catalog work
- more documentation infrastructure
- more discipline required in separating authority from evidence
- more up-front design effort before the remaining implementation work

## Final Position

OMS should now be designed as a selector-first, authoritative policy plane around upstream workflow brains.

Its runtime should be deterministic.
Its onboarding should be AI-assisted and discussion-driven.
Its authority should be explicit and reviewable.
Its startup behavior should be safe and reversible through last-known-good fallback.

That is the correct long-term shape for a pre-launch OMS that wants precision without hidden magic.
