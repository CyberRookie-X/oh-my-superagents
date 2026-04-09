# Oh My Superpowers for OpenCode and Codex Design

## Summary

This project builds a thin routing layer for `superpowers`, not a competing workflow system.
`superpowers` remains responsible for deciding what process to run. The router decides which host-native agent, model, and reasoning intensity should execute each phase.

The current release targets OpenCode and Codex while keeping the core routing logic host-agnostic so future adapters can support Claude Code, Gemini CLI, and other CLI agents.

## Problem

`superpowers` provides a strong methodology and skill library, but it does not solve host-specific execution routing in a portable way:

- Different phases benefit from different model families and reasoning levels.
- Different hosts expose different routing primitives such as agents, model variants, or fast modes.
- Heavy orchestration frameworks like `oh-my-opencode` solve more than this project needs and become tightly coupled to a host's workflow.

The missing piece is a thin compatibility layer that complements `superpowers` without forking or re-implementing it.

## Goals

- Route `superpowers` phases to different agent profiles.
- Support different models and reasoning intensities per phase.
- Stay compatible with upstream `superpowers` updates without copying skill content.
- Keep the first release lightweight and host-native.
- Preserve a host-agnostic core so future adapters can target Claude Code and Codex.

## Non-Goals

- Rewriting or replacing `superpowers` workflows.
- Building a large orchestration harness similar to `oh-my-opencode`.
- Shipping a general multi-agent planner with autonomous fan-out as a first-release requirement.
- Owning `superpowers` skill content or creating a forked skill tree.

## Product Boundary

The core design rule for this project is:

> Never compete with `superpowers` on workflow. Only complement it on routing.

This means:

- `superpowers` decides what to do next.
- The router decides who should do it and with what execution profile.
- The router may generate host-native entrypoints and helper agents.
- The router must not reorder or redefine `superpowers` methodology.

## Key Decisions

### 1. Thin router, not orchestrator

The project will act as a phase-aware router.
It may expose host-native commands and helper agents, but it will not introduce a second top-level workflow.

### 2. Host-agnostic routing core

The routing engine will operate on abstract concepts:

- phase
- profile
- effort
- host capability

Adapters will translate those abstractions into host-native configuration.

### 3. Materialized host artifacts for host adapters

OpenCode supports markdown-backed agents and commands as first-class configuration.
Codex supports project-scoped custom agents in `.codex/agents/` plus host-level config for model and reasoning controls.
The current release generates host-native artifacts instead of relying entirely on fragile runtime hooks.

This decision reduces exposure to current OpenCode plugin risks such as:

- multi-plugin load-order issues
- plugin `config()` visibility problems
- hook timing edge cases

### 4. Upstream-compatible `superpowers` integration

The router will treat `superpowers` as an upstream dependency.
It will reference upstream skill names and expect the user to install `superpowers` normally.
It will not vendor or rewrite upstream skills.

### 5. Host-specific execution models

For OpenCode, the router generates hidden helper agents that are optimized for specific `superpowers` phases.
For Codex, the router generates one custom agent per `superpowers` phase with phase-specific instructions and per-profile model settings.
User-facing entrypoints remain host-native.

## High-Level Architecture

The system has four layers.

### 1. Routing Core

The routing core is pure application logic.
It parses router configuration, validates profiles and routes, and resolves a route for a given phase.

Responsibilities:

- load and validate router config
- normalize profiles and routes
- resolve exact and default matches
- expose a host-neutral execution plan

### 2. OpenCode Adapter

The OpenCode adapter converts resolved profiles into generated OpenCode artifacts.

Responsibilities:

- generate hidden subagent markdown files
- generate command markdown files
- map abstract effort to OpenCode model variants or provider options
- set task permissions so build agents can invoke review and verify helpers

The adapter does not decide which profile wins.
It only translates a resolved route from the core into OpenCode artifacts.

### 2b. Codex Adapter

The Codex adapter converts resolved profiles into project-scoped custom agent TOML files.

Responsibilities:

- generate one `.codex/agents/*.toml` file per supported `superpowers` phase
- map host-neutral `effort` to Codex `model_reasoning_effort`
- map `fast` effort to Codex `service_tier = "fast"`
- bind each generated Codex agent to the corresponding upstream `superpowers` skill in its developer instructions

### 3. Materializer

The materializer writes generated files into standard host locations.
For the currently supported hosts, the generated locations are fixed and not configurable:

- `.opencode/agents/`
- `.opencode/commands/`
- `.codex/agents/`

The materializer also handles idempotent regeneration so config changes can be synced safely.

### 4. Thin Plugin Runtime

The package will still ship an OpenCode plugin entrypoint, but the runtime remains intentionally small.

Responsibilities:

- provide startup diagnostics and config validation
- avoid owning routing state that can live in generated host artifacts

Concrete v1 runtime contract:

- OpenCode invokes the plugin entrypoint during plugin initialization
- the runtime looks up config using the same discovery rules as the CLI
- if config is missing, it logs a concise warning with the recommended `oh-my-superagents sync --host opencode` command
- if config exists but cannot be parsed as valid JSONC, it logs a concise error
- it does not write files, mutate prompts, or register routing hooks in v1

The required user-facing surfaces for the current release are:

- CLI: `oh-my-superagents sync --host opencode`
- CLI: `oh-my-superagents explain --host opencode --phase <skill-name> | --all`
- CLI: `oh-my-superagents sync --host codex`
- CLI: `oh-my-superagents explain --host codex --phase <skill-name> | --all`

`explain` must output JSON in v1.
For a single phase it returns one object. With `--all` it returns an array of those objects.

Each object must include:

- requested phase
- matched profile
- resolved model
- resolved variant, if any
- generated host-native command name, if the host uses commands
- generated host-native agent name

## Routing Model

### Phase

A phase is the stable routing input.
For v1, phases are keyed only by exact `superpowers` skill names.

Initial built-in phase coverage:

- `brainstorming`
- `writing-plans`
- `subagent-driven-development`
- `requesting-code-review`
- `verification-before-completion`
- `frontend-design`
- `webapp-testing`

The first release only supports these built-in phases.
Any route key outside this set fails schema validation.

### Profile

A profile describes how a phase should execute.
Profiles are named, reusable units.

Each profile may define:

- `model`
- `variant`
- `effort` (`fast`, `balanced`, `deep`, `max`)
- optional `temperature`

The profile is host-neutral even if some fields map more directly to OpenCode.

For OpenCode v1, precedence is explicit:

- if `variant` is present, the adapter emits that exact variant
- if `variant` is absent and `effort` is present, the adapter maps `effort` to an OpenCode variant using fixed OpenCode defaults
- if neither `variant` nor `effort` is present, the adapter emits the bare model selection

If both `variant` and `effort` are present, `variant` wins and `effort` is retained only as host-neutral metadata for future adapters.

The fixed OpenCode default mapping for v1 is:

- `fast` -> `low`
- `balanced` -> `medium`
- `deep` -> `high`
- `max` -> `max`

### Route

A route maps a phase to a profile.
The v1 matching order is intentionally minimal:

1. exact skill name
2. `defaultRoute`

Aliases are explicitly out of scope for the first release.
If a phase does not match an exact route and `defaultRoute` is not defined, route resolution fails with a validation error during sync.

### Unsupported Selections

Named fallback chains are post-MVP.
The first release does not support automatic fallback traversal.
If the chosen OpenCode model or variant is syntactically invalid according to router config rules, sync fails.
Whether a host actually supports that model or variant at runtime is delegated to OpenCode itself in v1.

## OpenCode v1 Execution Design

### Generated Agents

The OpenCode adapter will generate hidden subagents for phase-specialized work.
The initial built-in set is:

- `spr-strategy`
- `spr-plan`
- `spr-build`
- `spr-review`
- `spr-verify`
- `spr-visual`

These agents are implementation details of the router, not a new workflow system.
Their prompts remain thin and host-native. They mainly define role focus, tool permissions, and model selection.

Each generated agent markdown file must contain:

- valid YAML frontmatter
- `description`
- `mode: subagent`
- `hidden: true`
- `model`
- optional `variant`
- optional `temperature`

The agent body must contain a thin role prompt plus one instruction to load and follow the upstream `superpowers` skill supplied by the invoking command.

### Phase-to-Artifact Mapping

The built-in OpenCode mapping for v1 is fixed and explicit:

| `superpowers` phase | Generated command | Generated subagent | Notes |
| --- | --- | --- | --- |
| `brainstorming` | `/sp-brainstorm` | `spr-strategy` | Deep planning and tradeoff analysis |
| `writing-plans` | `/sp-plan` | `spr-plan` | Detailed implementation planning |
| `subagent-driven-development` | `/sp-execute` | `spr-build` | Main implementation execution lane |
| `requesting-code-review` | `/sp-review` | `spr-review` | Review and defect finding |
| `verification-before-completion` | `/sp-verify` | `spr-verify` | Final evidence-based verification |
| `frontend-design` | `/sp-visual` | `spr-visual` | UI and design-heavy work |
| `webapp-testing` | `/sp-web-test` | `spr-visual` | Browser and UI test workflows |

### Generated Commands

The OpenCode adapter will generate commands that launch the correct helper agent and then invoke the relevant upstream `superpowers` skill.

`sync` always materializes the full fixed v1 command set.
Each command resolves its target profile using the exact route for its phase or `defaultRoute`.
If neither exists for a built-in phase, sync fails.

The initial built-in command set is:

- `/sp-brainstorm`
- `/sp-plan`
- `/sp-execute`
- `/sp-review`
- `/sp-verify`
- `/sp-visual`
- `/sp-web-test`

Each command keeps the main user experience simple:

- choose the phase
- route to the correct helper agent
- load the upstream skill
- continue in a focused subtask session

Each generated command markdown file must contain:

- valid YAML frontmatter
- `description`
- `agent`
- `subtask: true`

The command body must:

- state the exact upstream skill name to load
- forward `$ARGUMENTS` verbatim under a labeled context section
- instruct the helper agent to follow the loaded skill exactly

The concrete handoff payload for v1 is plain text inside the generated command body:

```text
Load and follow the upstream skill `superpowers/<skill-name>` exactly.

## Router Context
- phase: <phase-name>
- arguments: $ARGUMENTS
```

Generated helper agents read this message, load the named upstream skill, and continue using the forwarded arguments.

### Why commands plus hidden subagents

This design keeps the router thin while still helping the model choose the right execution profile.
It also gives `subagent-driven-development` access to a palette of specialized subagents without requiring the router to become a heavyweight orchestrator.

### Task Permissions

The generated build-oriented subagent will explicitly allow invocation of review and verify helper agents.
Exploration remains the responsibility of OpenCode's built-in exploration tools and agents.

The permission contract is fixed in v1:

- `spr-build` includes `permission.task` rules that allow `spr-review` and `spr-verify`
- all other generated router subagents omit `permission.task` rules

In generated OpenCode markdown, that wiring is represented in frontmatter.

## Core-to-Adapter Interface

The boundary between the routing core and the OpenCode adapter must stay explicit.

The routing core returns a host-neutral `ResolvedRoute` value with:

- `phaseId`
- `profileId`
- `selection` containing model, variant, effort, and temperature
- `description` for diagnostics

The OpenCode adapter consumes `ResolvedRoute` and produces:

- generated subagent definitions
- generated command definitions
- OpenCode-specific task permission rules

OpenCode-specific settings do not belong in the host-neutral profile shape.
That includes task-permission wiring, generated file names, and markdown frontmatter details.

## Configuration Model

The first release will use a project-local JSONC configuration file.

Recommended filename:

- `oh-my-superagents.config.jsonc`

Config discovery for v1:

- default: `./oh-my-superagents.config.jsonc` relative to the current working directory
- override: `--config <path>` on both `sync` and `explain`

The config contains:

- profile definitions
- route definitions
- optional `defaultRoute`

The v1 schema does not include aliases or host-agnostic fallback chains.

Example shape:

```jsonc
{
  "$schema": "./schemas/oh-my-superagents.schema.json",
  "profiles": {
    "strategy": {
      "model": "anthropic/claude-sonnet-4-5-20250929",
      "effort": "deep",
      "variant": "high"
    },
    "build": {
      "model": "openai/gpt-5",
      "effort": "balanced",
      "variant": "medium"
    }
  },
  "routes": {
    "brainstorming": "strategy",
    "subagent-driven-development": "build"
  },
  "defaultRoute": "build"
}
```

Validation rules for v1:

- every route target must reference an existing profile
- `defaultRoute`, if present, must reference an existing profile
- every route key must be one of the built-in v1 phases
- every profile must define `model`
- `variant` is optional
- if both `variant` and `effort` are present, `variant` takes precedence
- unknown top-level keys fail validation unless explicitly allowed by the schema

Path rules for v1:

- artifacts are always written relative to the current working directory
- the only write targets are `.opencode/agents` and `.opencode/commands`
- writing outside the working directory is out of scope for v1

## Future Host Adapters

The routing core must not assume OpenCode-specific primitives.
Future adapters may map the same profile to different host mechanisms:

- Claude Code fast mode
- Codex model and reasoning presets
- other CLI-specific agent or command systems

The extension model is:

- keep the routing core stable
- add a host adapter package
- materialize that host's native artifacts

## Artifact Ownership and Sync Semantics

Generated OpenCode artifacts are router-owned only when both conditions are true:

- the filename starts with the fixed v1 router prefix (`spr-` for agents, `sp-` for commands)
- the file contains the generated header marker on the first non-frontmatter line

The generated header marker format for v1 is:

```text
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
```

The marker must appear on the first non-frontmatter line so OpenCode parsing remains unaffected and stale-file detection can read it deterministically.

Sync behavior for v1:

1. Generate the full desired artifact set in memory.
2. Validate the whole set before writing anything.
3. Write each artifact to a temporary file in the target directory.
4. Atomically rename the temporary file into place.
5. After all target artifacts are written successfully, remove stale router-owned files with the same fixed v1 prefix and marker that are no longer in the desired set.

The sync process must create missing target directories before writing.
The sync process must never delete or overwrite user-authored files that lack the marker, even if they share a similar name.
If a generated target path already exists as a non-router-owned file, sync fails before any writes occur.
If stale-file cleanup fails after new artifacts are activated, sync returns a warning-level failure and leaves the newly written artifacts in place.
If an individual activation write fails after earlier files were already activated, sync exits non-zero and leaves already activated router-owned files in place; v1 guarantees per-file atomicity, not whole-set rollback.

CLI exit semantics for v1:

- `sync` exits `0` on full success
- `sync` exits `2` when artifact writes succeed but stale cleanup reports warnings
- `sync` exits `1` on config load, validation, collision, or write failure
- `explain` exits `0` on successful resolution
- `explain` exits `1` on config load, validation, or phase resolution failure

## Failure Handling

The router must fail clearly and safely.

Failure scenarios:

- router config is missing or invalid
- a route references an unknown profile
- materialization paths cannot be written

Required behavior:

- surface actionable diagnostics
- do not write partially rendered individual files
- preserve pre-existing router-owned files if validation or write stages fail before activation

Upstream `superpowers` skill discovery is out of scope for v1 sync.
The router assumes the user has installed upstream `superpowers` separately.
If a generated command is executed without the upstream skill being available, the command fails at runtime with the host's normal skill-loading error.

## Testing Strategy

The first release will use unit tests and snapshot-style content assertions.

Required coverage:

- config parsing and validation
- route resolution precedence
- effort and variant mapping for OpenCode
- generated agent markdown
- generated command markdown
- command-to-agent handoff payload
- materializer idempotence
- stale generated file cleanup
- atomic write behavior at the unit level
- CLI exit semantics for `sync` and `explain`
- diagnostics for missing config and invalid references

Full end-to-end OpenCode runtime tests are out of scope for v1 unless they can be added cheaply.

## MVP Scope

The first release is complete when it can:

- load router config
- resolve built-in `superpowers` phases to named profiles
- generate OpenCode helper agents and commands
- write generated files deterministically
- provide a thin plugin runtime with route diagnostics
- document how to use the generated `/sp-*` commands with an upstream `superpowers` install

## Acceptance Criteria

- The v1 implementation generates only commands, helper agents, config, tests, and minimal plugin runtime needed for routing.
- No upstream `superpowers` skills are copied into this repository.
- OpenCode users can install `superpowers`, sync router artifacts, and run phase-specific commands.
- The design leaves a clean seam for future Claude Code and Codex adapters.
