# OpenCode Zero-to-Working and Routing Console Design

## Summary

This design defines the next flagship product slice for `oh-my-superagents` on OpenCode.

The work is intentionally split into two phases:

- Phase A: `Zero-to-Working`
- Phase B: `Routing Console`

The purpose is not to expand host breadth.
The purpose is to make OpenCode the clearest, strongest, lowest-friction OMS experience.

## Problem

`oh-my-superagents` already supports OpenCode, Codex, and Qwen, but OpenCode is currently the most complete host integration.

That creates a product choice.
The project can either:

- keep expanding into more hosts, or
- turn the strongest host into a flagship user experience

The project direction should favor the second option.

OpenCode support is already thin and structurally aligned with OMS:

- generated `.opencode/agents/*.md`
- generated `.opencode/commands/*.md`
- a minimal OpenCode plugin entrypoint
- OMS control-plane commands for `status`, `use`, `disable`, `sync`, and `doctor`

What it still lacks is not raw capability coverage.
What it lacks is a stronger user experience in three areas:

1. first-run onboarding
2. daily routing control
3. clear, host-local explanation of current OMS state

## Goals

- Make OpenCode the flagship OMS host for first-run success.
- Reduce the amount of README-reading required to get a project working.
- Make OMS state, ownership, and next actions obvious in OpenCode projects.
- Improve day-to-day preset and route management without turning OMS into a general routing platform.
- Keep the shared OMS core thicker than the OpenCode adapter.
- Preserve host-local semantics: OMS should still manage OMS, not upstream `superpowers` lifecycle.

## Non-Goals

- Adding a new host in this implementation cycle.
- Building a cross-host configuration sync system.
- Adding a heavy graphical console or browser UI.
- Introducing a general-purpose rules engine or routing DSL.
- Managing upstream `superpowers` installation, upgrade, or runtime lifecycle.
- Replacing the current thin OpenCode adapter with a host-specific framework.

## Product Boundary

This design stays inside the existing OMS product boundary.

OMS remains:

- a thin routing/control-plane layer on top of `superpowers`
- host-local in how it renders artifacts and diagnostics
- centered on one configuration truth source: `oh-my-superagents.config.jsonc`

This design does not allow OpenCode-specific convenience work to redefine OMS semantics for other hosts.

## Why OpenCode First

OpenCode is the right place to go deeper first because:

- it already has the strongest OMS support surface
- the OpenCode adapter is intentionally thin and easy to extend at the UX layer
- the plugin entrypoint already gives OMS a host-native place for startup diagnostics
- improving OpenCode experience strengthens the shared control-plane model instead of diluting it across new hosts

The decision rule is simple:

> Prefer depth on the strongest host over breadth into weaker hosts unless a new host has a unique OMS-critical gap.

## Phase Structure

### Phase A: Zero-to-Working

Phase A focuses on first-run success.

The target outcome is:

> A user should be able to enter an OpenCode project, understand whether OMS is active, understand why it is not active if broken, and know the next command to run without consulting the README.

### Phase B: Routing Console

Phase B focuses on daily control of routing behavior.

The target outcome is:

> A user should be able to understand, switch, and lightly refactor OpenCode routing behavior across multiple presets without losing clarity.

## Phase A Design

### A1. First-run state model

Phase A adds an explicit first-run state model for OpenCode-facing OMS status.

The model should distinguish at least the following states:

- no OMS config found
- OMS config exists but OMS artifacts have not been materialized for OpenCode
- OMS is enabled and expected OpenCode artifacts are present
- OMS is disabled for OpenCode
- upstream `superpowers` is not detected
- upstream `superpowers` is incompatible
- expected OpenCode artifacts are partially missing or stale

This state model should be shared enough to live in the OMS core, while allowing host-specific inspection inputs.

### A2. Next-step guidance

Phase A upgrades `status` and OpenCode plugin startup diagnostics from passive reporting to actionable guidance.

Every important degraded state should provide:

- the detected current state
- the reason OMS believes that state is true
- the single best next action
- a small number of follow-up actions when the primary action fails

Examples of desired guidance behavior:

- missing config -> suggest `oh-my-superagents sync --host opencode`
- incompatible upstream -> explain incompatibility and direct user to `doctor`
- missing artifacts -> direct user to `sync --host opencode`
- disabled OMS -> explain that OMS is intentionally off and how to re-enable it with `use`

The tone should stay direct and operational, not conversational.

### A3. Default first-run path

Phase A should make the default path from no config to working OpenCode artifacts feel deliberate and understandable.

The recommended approach is to strengthen the existing control-plane behavior rather than add a separate `init` command.

That means:

- reuse the existing default control-plane config shape
- keep `sync`, `status`, `use`, and plugin diagnostics as the first-run surface
- make the first generated or synthesized default state easier to understand

This keeps OMS small and avoids introducing parallel onboarding surfaces.

### A4. Command discovery

Phase A should make OMS control-plane commands easier to discover in OpenCode projects.

Users should be able to quickly see:

- the active command prefix
- the rendered primary names for `status`, `use`, `disable`, `sync`, `doctor`
- configured aliases
- the generated OpenCode command files owned by OMS

This matters because command-prefix and alias customization already exists, but users currently have to infer the rendered surface.

### A5. OpenCode artifact visibility

Phase A should make OMS ownership and artifact completeness easier to inspect.

The OpenCode-facing status surface should make it clear:

- which `.opencode/agents/*.md` files are expected
- which `.opencode/commands/*.md` files are expected
- which of those files are present
- which OMS-owned files are stale or missing
- whether command renames or prefix changes left behind OMS-owned residue

This does not require a full artifact database.
It only requires clearer presentation of what OMS already knows how to generate and own.

### A6. Error attribution

Phase A should classify degraded states into three buckets:

- OMS configuration/control-plane problems
- upstream `superpowers` detection/compatibility problems
- OpenCode artifact/materialization problems

The point is not to create a formal error taxonomy for its own sake.
The point is to tell the user where to look next.

### Phase A Success Criteria

Phase A is successful when:

- `status --host opencode` can identify first-run and degraded states with specific next actions
- OpenCode plugin startup logs can explain missing config, missing artifacts, and upstream compatibility issues more precisely than they do today
- a user can discover the rendered OMS command surface without reading source files manually
- OpenCode artifact completeness and ownership are visible enough to explain why `sync` is or is not needed

## Phase B Design

### B1. Lightweight preset reuse

Phase B should introduce a lightweight preset reuse model.

The purpose is to reduce duplication across presets without introducing deep inheritance chains.

Design constraints:

- readability is more important than raw expressiveness
- reuse must remain explicit
- resolution order must be easy to explain
- cycles and long override chains must be impossible

The favored direction is a single-parent or equivalent minimal reuse model, not a general inheritance tree.

### B2. Lightweight profile reuse

Phase B should reduce repeated model-selection definitions inside or across presets.

The purpose is not to normalize everything.
The purpose is to keep common model choices from being copied everywhere.

Design constraints:

- profile selection must still resolve to a simple, explainable final shape
- reuse should not force users to learn a second abstraction language

### B3. Stronger routing explain

Phase B should make route resolution much easier to inspect.

For any phase, OMS should be able to explain:

- which preset is active
- whether the phase hit an explicit route or the preset default route
- which profile was selected
- which final model/variant/effort values were selected
- where each important value came from

This should strengthen `explain` and the OpenCode-facing control-plane experience, not replace them.

### B4. Configuration source tracing

Phase B should expose the origin of important resolved values.

At minimum, users should be able to distinguish whether a value came from:

- explicit project config
- explicit global config
- a preset-local definition
- a reuse relationship
- synthesized defaults

The purpose is not debugging for its own sake.
The purpose is to make layered config and routing reuse remain understandable as the model grows.

### B5. Preset-switch feedback loop

Phase B should make `use <preset>` feel like a routing control operation, not just a state write.

After switching presets, OMS should be able to show:

- which preset is now active
- whether OpenCode artifacts now differ from the expected state
- whether a `sync` is now recommended
- which parts of the OpenCode route surface are likely to change

This keeps preset switching grounded in observable impact.

### B6. Validation-oriented routing view

Phase B should add a lightweight validation-oriented view of current routing.

Examples of useful signals:

- which phases are explicitly overridden
- which phases fall back to the preset default route
- which profiles are currently unused
- whether a reuse relationship is valid and resolvable

This should stay small and operational.
It should not become a general linter framework.

### Phase B Success Criteria

Phase B is successful when:

- users can maintain multiple presets with much less duplication
- users can explain why any built-in phase resolves to its current OpenCode model selection
- users can switch presets and understand the practical effect of that switch
- routing complexity stays understandable without introducing a new DSL

## What We Explicitly Do Not Add

This design intentionally excludes:

- Kimi or other new host support
- OpenCode-specific runtime orchestration
- graphical dashboards
- dynamic route rules based on file paths, directories, or arbitrary predicates
- automatic per-context preset switching
- cross-host preset synchronization
- unbounded inheritance or multi-level override trees

These ideas may be interesting later, but they are currently more likely to dilute OMS than strengthen it.

## Architectural Impact

This work should primarily affect:

- `src/plugin.ts`
  - stronger startup diagnostics and next-step guidance for OpenCode
- `src/cli.ts`
  - richer `status`, `doctor`, and related OpenCode-facing outputs
- `src/control-plane.ts`
  - stronger resolved-state reasoning and, in Phase B, preset/profile reuse validation
- `src/config.ts`
  - any schema/model changes needed for reuse while preserving clarity
- `src/opencode.ts`
  - improved visibility into rendered command and artifact ownership surfaces

The OpenCode adapter should remain mostly a rendering layer.
If logic starts to accumulate there that is actually shared policy, it should move into the OMS core.

## Testing Strategy

### Phase A

Add tests that cover:

- first-run status with no config
- status with synthesized default control-plane state
- status and doctor with missing OpenCode artifacts
- disabled OMS state for OpenCode
- plugin startup diagnostics for missing config
- plugin startup diagnostics for incompatible upstream `superpowers`
- command discovery surfaces for customized prefix/name/aliases
- stale OMS-owned OpenCode command cleanup visibility

### Phase B

Add tests that cover:

- preset reuse resolution
- profile reuse resolution
- invalid reuse graphs
- explain output with explicit route hits and default-route fallbacks
- layered config source tracing
- `use` feedback when a preset switch changes expected artifact state
- validation output for unused profiles and fallback-routed phases

## Implementation Shape

Implementation should proceed as two separate slices.

The order is:

1. Phase A spec -> plan -> implementation
2. Phase B spec refinement if needed -> plan -> implementation

This is intentional.
Phase B depends on the product clarity established by Phase A, but Phase A does not depend on Phase B.

## Recommendation

Proceed with the balanced path:

- first make OpenCode onboarding excellent
- then add lightweight routing reuse and stronger explainability
- keep diagnostics in support of those two goals

This path best matches the current codebase, current product boundary, and the chosen priority order:

1. first-run success
2. stronger routing control
3. stronger diagnostics
