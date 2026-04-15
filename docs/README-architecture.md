# Architecture

This document explains the architectural shape of `oh-my-superagents`.
It is intentionally focused on structure and tradeoffs, not installation or command reference.

## Design Goal

`oh-my-superagents` is evolving from a `superpowers`-first router into a broader routing and control-plane product.
The current architecture keeps first-class `superpowers` support while adding an experimental OpenCode-first direct mode as the first generic slice.

It is not:

- a replacement for upstream `superpowers`
- a cross-host config sync system
- a heavy multi-agent orchestration framework

The project follows one simple rule:

> Keep the shared OMS core thicker than any single host adapter.

That keeps host-specific code replaceable while preserving one consistent model for routing, presets, compatibility checks, shared capability policy, and OMS control-plane behavior.

## Layering

The current architecture has seven layers.

### 1. Control Plane Core

Main files:

- `src/control-plane.ts`
- `src/config.ts`
- `src/cli.ts`

Responsibilities:

- layered config loading
- legacy config migration
- preset selection
- command prefix and alias resolution
- OMS `status/use/disable/sync/doctor` behavior
- compose `status`, `doctor`, and `explain` diagnostics without collapsing support, availability, compatibility, and sync state into one flag

Why it is thicker:

- this is where product semantics live
- all supported hosts depend on it
- config and lifecycle rules must stay consistent across hosts

### 2. Workflow Adapters

Main files:

- `src/router.ts`
- `src/workflow-direct.ts`
- `src/workflow-superpowers.ts`
- `src/workflow-gstack.ts`
- `src/workflow-sources.ts`

Responsibilities:

- keep workflow-specific route vocabularies out of the generic route resolver
- normalize built-in OMS phase inputs to true canonical route ids such as `phase.plan`
- map canonical routes through source adapters to source-native entries such as `writing-plans` or `plan-eng-review`
- preserve `superpowers` as a first-party workflow adapter
- let the OpenCode direct-mode slice resolve user-defined intents without upstream workflow-tool dependencies

Why this layer now exists:

- the router core is broader than one upstream phase catalog
- `superpowers` support remains first-class, but it no longer has to define the entire product identity
- direct mode can stay thin when adapter assumptions are explicit

### 3. Shared Capability Policy

Main file:

- `src/capabilities.ts`

Responsibilities:

- keep source adapters focused on defining what upstream entries exist for a canonical route
- let the capability registry decide whether OMS supports a source-route, host-source projection, or control-plane command combination
- return structured support decisions and reason codes that the CLI and migrated host adapters consume directly
- keep the current remaining host-local command filtering and CLI projection guardrails explicit until later cleanup folds them into the same shared policy path

Why this layer now exists:

- route resolution and support policy are different concerns and need different extension points
- fail-closed support rules stay consistent when new sources, hosts, or commands are added
- adapters can stay thinner because more of the support matrix now lives in one shared policy surface instead of being duplicated ad hoc

### 4. Host Adapters

Main files:

- `src/opencode.ts`
- `src/codex.ts`
- `src/codex-bootstrap.ts`
- `src/qwen.ts`
- `src/claude.ts`

Responsibilities:

- render host-native artifacts from resolved canonical routes and source entries
- map OMS phases and commands into host-native entrypoints without treating source-native workflow names as the internal truth layer
- apply host-specific constraints without changing OMS semantics

Why these stay thinner:

- they should be mostly rendering and translation layers
- the canonical route model lives in shared routing code, not in per-host filename or workflow-entry conventions
- host-specific differences should not leak back into the core model unless unavoidable

### 5. Compatibility Monitor

Main files:

- `src/superpowers-compatibility.ts`
- `src/superpowers-detectors.ts`

Responsibilities:

- detect upstream `superpowers` install state
- evaluate against the local compatibility matrix
- return `compatible`, `untested`, `incompatible`, or `not_detected`

Why it is medium-sized:

- it is shared across hosts
- detection is host-specific, but policy is shared

### 6. Artifact Reconciliation

Main file:

- `src/materialize.ts`

Responsibilities:

- write generated artifacts safely
- detect OMS-owned artifacts
- reconcile stale host artifacts after renames or prefix changes

Why it stays separate:

- every host eventually needs the same ownership and cleanup guarantees
- it is easier to reason about cleanup centrally than inside each adapter

### 7. Docs and Plans

Key locations:

- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
- `.agents/superpowers/specs/`

Responsibilities:

- capture decisions before implementation
- keep staged work explicit
- preserve boundaries between phases and hosts

## Readiness Surfaces

OMS diagnostics intentionally separate four different questions:

- `support`: can OMS project this route or command combination at all? This comes from `src/capabilities.ts` and is fail-closed. Unsupported entries stop here.
- `availability`: if the resolved source depends on an upstream installation, can OMS detect that dependency right now? `src/upstream-readiness.ts` normalizes this into statuses such as `available`, `not_detected`, `error`, or `not_implemented`.
- `compatibility`: if OMS can detect upstream `superpowers`, is that install inside the local tested matrix? This is narrower than availability and comes from `src/superpowers-compatibility.ts`.
- `sync state`: are OMS-owned artifacts present for the invoking host? This comes from artifact inspection and reconciliation, not from support or upstream detection.

The CLI surfaces those distinctions directly:

- `status` and `doctor` return `effectiveSourceEntries` plus `effectiveSourceReadiness`.
- `explain` attaches `readiness` whenever a traced route already carries control-plane explain metadata such as `routeSource`, `configSource`, `reuseRelationship`, `resolvedSource`, and `sourceEntry`.
- OpenCode `status` additionally distills sync state into `state`, `nextAction`, and `artifactSummary`, while all hosts return host-local `artifacts`.

## Host Differences

The host adapters are not symmetrical because the hosts are not symmetrical.

### OpenCode

Main characteristics:

- native plugin entrypoint
- project-local agents and commands
- first host for the experimental direct-mode slice
- good fit for thin generated wrappers

Architectural consequence:

- OpenCode gets a thin plugin plus generated artifacts
- OpenCode is where the first generic direct workflow currently lives
- host integration is relatively direct

### Codex

Main characteristics:

- project-local agents
- local plugin bundle and marketplace entry
- plugin/bootstrap surface is separate from routing artifacts

Architectural consequence:

- Codex needs both routing artifacts and a convenience bootstrap layer
- that makes Codex thicker than OpenCode on the host side

### Qwen

Main characteristics:

- project-local agents and commands
- no heavy bootstrap layer in current OMS scope
- wrapper-based integration is enough for now

Architectural consequence:

- Qwen is implemented as a thin adapter
- current support is intentionally narrower than OpenCode/Codex

### Claude

Main characteristics:

- project-scoped `.claude/skills/*/SKILL.md` wrappers
- no direct-workflow projection in the current slice
- no heavy bootstrap or CLAUDE.md takeover flow

Architectural consequence:

- Claude stays a thin host adapter
- Claude consumes the same canonical route and source-entry model as the other hosts
- current support centers on the `superpowers` workflow slice plus control-plane artifact management

## Thickness By Source Size

These counts are approximate source lines of code from the implementation files only.
They exclude tests and documentation.

| Layer | Main files | Approx. source LOC | Thickness |
| --- | --- | ---: | --- |
| OMS control plane core | `src/control-plane.ts`, `src/config.ts`, `src/cli.ts` | 4316 | Medium |
| Workflow adapters | `src/router.ts`, `src/workflow-direct.ts`, `src/workflow-superpowers.ts`, `src/workflow-gstack.ts`, `src/workflow-sources.ts` | 371 | Thin |
| Shared capability policy | `src/capabilities.ts` | 97 | Thin |
| OpenCode adapter | `src/opencode.ts` | 633 | Thin |
| Codex adapter + bootstrap | `src/codex.ts`, `src/codex-bootstrap.ts` | 760 | Medium |
| Qwen adapter | `src/qwen.ts` | 424 | Thin |
| Claude adapter | `src/claude.ts` | 138 | Thin |
| Compatibility monitor | `src/superpowers-compatibility.ts`, `src/superpowers-detectors.ts` | 1093 | Medium |
| Shared artifact reconciliation | `src/materialize.ts` | 712 | Thin-to-medium |

Interpretation:

- `Thin`: mostly rendering or host-specific glue
- `Medium`: shared policy, config, lifecycle, or bootstrap behavior
- `Thin-to-medium`: infrastructure shared by multiple adapters but still operationally focused

The important signal is not the exact number.
The important signal is that the shared OMS core is intentionally thicker than any one host adapter.

## Why This Shape

This shape gives the project three useful properties:

1. Host adapters can stay replaceable.
2. `superpowers` stays first-class without owning the whole product identity.
3. OMS semantics stay consistent across supported hosts and modes.

New host support can be evaluated by asking one question:

> Does this host still have a real gap that OMS can fill without turning OMS into a host-specific framework?

That question is why some hosts are supported, some are partial, and some are intentionally out of scope.
