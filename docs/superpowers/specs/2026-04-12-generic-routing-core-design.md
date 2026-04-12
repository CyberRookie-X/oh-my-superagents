# Generic Routing Core Design

## Summary

This design evolves the repository in place from a `superpowers`-first router into a broader routing product with:

- a generic routing core
- a first-party `superpowers` workflow adapter
- a first-party direct mode that does not require any workflow tool

The product still keeps `superpowers` as an important integration, but it is no longer the only valid entry point.

The main strategic goal is to occupy the niche of a thinner, more freedom-preserving alternative to heavy agent-roster tools such as `oh-my-opencode` and `oh-my-opencode-slim`.

The product should route by explicit configuration and routing logic, not by role-playing personas.

## Problem

The repository now contains two truths at once.

### Truth 1: The current product framing is still `superpowers`-bound

Documentation and host rendering still define the project as a thin routing and control-plane layer around `superpowers`.

That framing has been useful and remains valuable.

### Truth 2: The routing core has grown beyond that framing

The repository now contains meaningful generic capabilities that already have value beyond `superpowers`:

- layered config
- reusable profiles
- presets
- lanes
- control-plane state
- artifact materialization and cleanup

This means the codebase is no longer just a thin skill wrapper.
It is starting to become a more general routing system.

At the same time, the current market gap is not just “better support for superpowers.”
There is also space for a thinner, less roleplay-heavy routing layer than products that predefine many fixed “specialist” agents and rely on persona prompts.

## Goals

- Evolve the repository in place instead of splitting into a separate core product immediately.
- Keep `superpowers` as a first-party integration, not a discarded legacy mode.
- Introduce a broader generic routing core that can support both workflow-driven and direct usage.
- Preserve the existing strengths of the project:
  - thin host-native artifacts
  - explicit routing
  - strong explainability
  - user freedom in model and configuration choices
- Avoid persona-heavy agent systems and hard-coded roleplay specialists.
- Create a path for direct usage where users can route by tech stack and development intent without a workflow tool.

## Non-Goals

- Rewriting the whole repository in one step.
- Rebranding or renaming the repository immediately.
- Dropping `superpowers` support.
- Building a heavyweight orchestration platform.
- Recreating Roo/Kilo/oh-my-opencode-style pre-authored specialist rosters.
- Forcing all hosts or all users into the same routing mode.

## Product Direction

The repository should become:

> A host-native routing and control-plane product for AI work, with first-class `superpowers` support and a lightweight direct mode.

This changes the product layering.

### Old framing

- product = `superpowers` router
- everything else is in service of that

### New framing

- product = routing core + host-native control plane
- `superpowers` = one first-party workflow adapter
- direct mode = one first-party generic mode

## Why This Direction

The design aims to solve a real product mismatch.

Heavy agent products often assume:

- fixed specialist personas
- large pre-authored agent catalogs
- role prompts as the main source of specialization

That does not align well with modern model behavior or with the desired level of user freedom.

This repository should instead prefer:

- explicit routing
- explicit model/config selection
- host-native surfaces
- reusable configuration building blocks
- thin execution surfaces

The value should come from routing and composition, not from fictional specialist identities.

## Core Abstractions

### Profile

`profile` remains the leaf execution target.

It answers:

> Which model/config should actually be used?

Examples of profile fields:

- `model`
- `variant`
- `effort`
- `codexFast`
- `temperature`

Profiles stay central in both modes.

### Lane

`lane` remains a tech-stack routing bundle.

It answers:

> Under this technical context, how should work be routed?

Examples:

- `frontend`
- `backend`
- `infra`
- `data`

Lane is not a persona and not a workflow.

### Preset

`preset` remains the work-mode combiner.

It answers:

> Which routing resources are active in this overall mode, and what are the defaults?

Examples:

- `default`
- `review`
- `fast-iteration`

### Intent

`intent` becomes the preferred optional abstraction above lane routing.

It answers:

> What kind of work is this?

Examples:

- `plan`
- `build`
- `debug`
- `review`
- `test`

Important:

- `intent` is optional
- direct-mode users do not need it if lane-only routing is enough
- workflow adapters may produce it from their own upstream vocabulary

### Workflow Adapter

A workflow adapter supplies an upstream task/workflow vocabulary.

For `superpowers`, that vocabulary is currently the built-in phases.
In the broader product, those phases become adapter-specific, not the product-wide universal key space.

### Host Adapter

A host adapter renders resolved routing decisions into host-native artifacts and runtime surfaces.

Examples:

- OpenCode adapter
- Codex adapter
- Qwen adapter

## Two Supported Modes

### 1. Workflow Mode

Workflow mode is used when an upstream workflow or skill system already exists.

Current first-party example:

- `superpowers`

In this mode, the adapter provides the high-level work signal.

Conceptually:

`workflow signal -> optional intent -> lane -> profile`

For `superpowers`, this may initially remain:

`phase -> lane -> profile`

while the product direction gradually treats that as one adapter-specific case.

### 2. Direct Mode

Direct mode is used when no workflow tool is present.

Two levels should exist:

#### Direct Mode, lane-only

`preset -> lane -> profile`

This is the smallest useful generic mode.

#### Direct Mode, lane + intent

`preset -> lane -> intent -> profile`

This covers users who want distinctions such as:

- frontend build
- frontend review
- backend debug
- backend test

without requiring an external workflow framework.

## Why `intent` Is Better Than Mandatory `routeKey`

The product should not assume every user already has a workflow-level route vocabulary.

Some users will have:

- tech stack (`frontend`, `backend`)
- development stage (`review`, `debug`, `test`)

but no external workflow system and no reason to define named routes first.

Therefore:

- `intent` should be optional
- `routeKey` should not be a mandatory top-level universal abstraction
- workflow adapters can still provide route-like inputs when they exist

## First Generic Product Slice

The first generic slice should be deliberately small.

### Recommendation

- OpenCode-first
- direct mode supported
- direct mode supports:
  - `preset`
  - `lane`
  - optional `intent`
- no heavy orchestration
- no persona roster
- no pre-authored specialist prompt system

This is the smallest credible experiment that can test whether the routing core has standalone value.

## Relationship to `superpowers`

`superpowers` remains first-party and important.

It should become:

- a workflow adapter
- a compatibility surface
- a mature integration mode

not the only product identity.

This means the repository can truthfully say both:

- “we support superpowers very well”
- “we also support direct routing for users who do not use workflow tools”

## What Must Stay Thin

To avoid becoming a heavy agent framework, the product should continue to reject:

- persona-heavy specialist agents
- mandatory roleplay prompts as the core routing mechanism
- large fixed agent catalogs
- thick orchestration logic in the core

The core should stay focused on:

- selection
- routing
- explanation
- host-native projection

## What Changes in the Architecture

### Current architecture shape

- config and control plane
- host adapters
- `superpowers`-specific phase/skill assumptions mixed into the core

### Target architecture shape

1. generic routing core
2. workflow adapters
3. host adapters

Conceptually:

`routing core -> workflow adapter -> host adapter`

where direct mode is simply a first-party mode with no workflow adapter dependency.

## Migration Strategy

The transition should be gradual.

### Step 1: Reframe, do not rewrite

Change top-level product framing so the repository is described as a broader routing/control-plane product with first-class `superpowers` support.

### Step 2: Extract workflow-specific assumptions from the core

The following should become adapter-specific over time:

- fixed built-in phase catalog
- `/sp-*` and `spr-*` mappings
- upstream skill delegation requirements
- `superpowersCompatibility` as the only compatibility axis

### Step 3: Introduce direct mode in one host

Recommended first slice:

- OpenCode
- direct mode
- lane-first routing
- optional intent

### Step 4: Keep full backward compatibility during the transition

The current `superpowers` behavior remains the default and should keep working unchanged while the generic mode is added.

## Documentation Strategy

The repository should eventually document two layers:

1. core product docs
2. `superpowers` integration docs

The current `docs/superpowers/...` tree can remain, but it should become clearly integration-specific instead of defining the entire product identity.

## Risks

### Scope risk

If generic mode and adapter extraction are attempted all at once, the repository could lose focus.

### Naming risk

The current name and many current docs still imply a superpowers-only product.
That can remain for continuity in the short term, but the top-level framing must be updated carefully.

### Architectural risk

If the core keeps too many `superpowers` assumptions, direct mode will remain awkward.
If the core is generalized too aggressively, current users may feel the product lost its identity.

## Recommendation

Proceed with an in-repo upgrade path.

The product direction should be:

- generic routing core
- first-party `superpowers` adapter
- first-party direct mode

The first concrete generic slice should be:

- OpenCode-first
- direct mode
- lane + optional intent
- no roleplay-heavy specialist system

This preserves the current strengths of the repository while opening the path toward a thinner, more flexible alternative to current heavy agent-routing tools.
