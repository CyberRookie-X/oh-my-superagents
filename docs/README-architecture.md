# Architecture

This document explains the architectural shape of `oh-my-superagents`.
It is intentionally focused on structure and tradeoffs, not installation or command reference.

## Design Goal

`oh-my-superagents` exists to fill the gaps a host still has when running `superpowers`.

It is not:

- a replacement for upstream `superpowers`
- a cross-host config sync system
- a heavy multi-agent orchestration framework

The project follows one simple rule:

> Keep the shared OMS core thicker than any single host adapter.

That keeps host-specific code replaceable while preserving one consistent model for routing, presets, compatibility checks, and OMS control-plane behavior.

## Layering

The current architecture has five layers.

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

Why it is thicker:

- this is where product semantics live
- all supported hosts depend on it
- config and lifecycle rules must stay consistent across hosts

### 2. Host Adapters

Main files:

- `src/opencode.ts`
- `src/codex.ts`
- `src/codex-bootstrap.ts`
- `src/qwen.ts`

Responsibilities:

- render host-native artifacts
- map OMS phases and commands into host-native entrypoints
- apply host-specific constraints without changing OMS semantics

Why these stay thinner:

- they should be mostly rendering and translation layers
- host-specific differences should not leak back into the core model unless unavoidable

### 3. Compatibility Monitor

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

### 4. Artifact Reconciliation

Main file:

- `src/materialize.ts`

Responsibilities:

- write generated artifacts safely
- detect OMS-owned artifacts
- reconcile stale host artifacts after renames or prefix changes

Why it stays separate:

- every host eventually needs the same ownership and cleanup guarantees
- it is easier to reason about cleanup centrally than inside each adapter

### 5. Docs and Plans

Key locations:

- `docs/superpowers/specs/`
- `.agents/superpowers/specs/`

Responsibilities:

- capture decisions before implementation
- keep staged work explicit
- preserve boundaries between phases and hosts

## Host Differences

The host adapters are not symmetrical because the hosts are not symmetrical.

### OpenCode

Main characteristics:

- native plugin entrypoint
- project-local agents and commands
- good fit for thin generated wrappers

Architectural consequence:

- OpenCode gets a thin plugin plus generated artifacts
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

## Thickness By Source Size

These counts are approximate source lines of code from the implementation files only.
They exclude tests and documentation.

| Layer | Main files | Approx. source LOC | Thickness |
| --- | --- | ---: | --- |
| OMS control plane core | `src/control-plane.ts`, `src/config.ts`, `src/cli.ts` | 1853 | Medium |
| OpenCode adapter | `src/opencode.ts` | 242 | Thin |
| Codex adapter + bootstrap | `src/codex.ts`, `src/codex-bootstrap.ts` | 565 | Medium |
| Qwen adapter | `src/qwen.ts` | 220 | Thin |
| Compatibility monitor | `src/superpowers-compatibility.ts`, `src/superpowers-detectors.ts` | 1051 | Medium |
| Shared artifact reconciliation | `src/materialize.ts` | 345 | Thin-to-medium |

Interpretation:

- `Thin`: mostly rendering or host-specific glue
- `Medium`: shared policy, config, lifecycle, or bootstrap behavior
- `Thin-to-medium`: infrastructure shared by multiple adapters but still operationally focused

The important signal is not the exact number.
The important signal is that the shared OMS core is intentionally thicker than any one host adapter.

## Why This Shape

This shape gives the project three useful properties:

1. Host adapters can stay replaceable.
2. OMS semantics stay consistent across supported hosts.
3. New host support can be evaluated by asking one question:

> Does this host still have a real gap that OMS can fill without turning OMS into a host-specific framework?

That question is why some hosts are supported, some are partial, and some are intentionally out of scope.
