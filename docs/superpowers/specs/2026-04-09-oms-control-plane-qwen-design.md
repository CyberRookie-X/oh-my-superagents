# OMS Control Plane and Qwen Support Design

## Summary

This design adds two tightly related capabilities to `oh-my-superagents`.

Stage 1 adds an OMS control plane:

- configurable command prefix
- configurable command names and aliases
- single-file multi-preset configuration
- project/global config layering
- commands to inspect, switch, disable, and resync OMS itself

Stage 2 adds Qwen Code host support using the same routing and control-plane model.

These stages belong together because Qwen support should consume the same command and preset model instead of inventing a second control surface.

## Problem

`oh-my-superagents` currently exposes host-specific routing behavior but does not yet provide a clean control plane for users who want to:

- avoid command-name collisions
- choose shorter names or aliases
- switch between different routing strategies for different kinds of work
- temporarily disable OMS without disabling upstream `superpowers`
- apply the same OMS control model to a new supported host

At the same time, `Qwen Code` now exposes enough native primitives to support a thin OMS adapter:

- project-local commands
- project-local skills
- project-local agents

That makes Qwen a better next host than Kimi for the current product direction.

## Goals

- Add a first-class OMS control plane.
- Allow users to configure the command prefix and per-command aliases.
- Support multiple named OMS presets in a single config file.
- Support global and project config layering.
- Add `disable` command semantics that disable OMS only, not upstream `superpowers`.
- Add a thin Qwen adapter that reuses the OMS control plane.

## Non-Goals

- Disabling upstream `superpowers` per session.
- Building a cross-host configuration sync layer.
- Supporting Kimi in this implementation cycle.
- Creating a heavy Qwen extension runtime or marketplace distribution layer.

## Product Boundary

OMS controls OMS.
It does not manage upstream `superpowers` installation or runtime lifecycle.

That means:

- the logical `disable` command disables OMS-generated host artifacts and OMS-driven routing behavior
- it does not disable or uninstall upstream `superpowers`
- any host-specific workaround for temporarily suppressing upstream `superpowers` stays out of scope for core OMS commands

## Stage Structure

### Stage 1: OMS Control Plane

Stage 1 adds the shared configuration and command model.

### Stage 2: Qwen Code Support

Stage 2 consumes that model to generate Qwen-native artifacts.

## Key Decisions

### 1. Single-file multi-preset config

Presets live in the same `oh-my-superagents.config.jsonc` file.
There is no extra config directory for preset definitions.

Why:

- lower complexity
- easier discoverability
- aligns with the user requirement that routing/model/effort variants live together while control-plane settings remain global

### 2. Split `settings` from `presets`

Global control-plane settings are not per-preset.
Only routing/model/reasoning choices are per-preset.

That means:

- `commandPrefix` is global
- command aliases are global
- compatibility mode is global
- `activePreset` is global state
- models, effort, fast-mode bias, and phase routing live inside presets

### 2b. Distinguish logical command keys from rendered command names

OMS commands are defined by stable logical keys:

- `status`
- `use`
- `disable`
- `sync`
- `doctor`

Users may customize:

- a global prefix
- the rendered primary name for each logical key
- aliases for each logical key

Hosts render those command definitions using their native syntax, but the logical key set stays stable across hosts.

Normative command vocabulary:

- logical key: one of `status`, `use`, `disable`, `sync`, `doctor`
- rendered primary name: the configured `name` for a logical key
- alias: any configured alternative name for a logical key
- host trigger syntax: the host-native invocation syntax for a rendered primary name or alias

Throughout this spec, `disable` refers to the logical command key unless a host-specific rendered example is shown.

### 3. Cross-host semantic consistency, host-native rendering

Commands must keep the same semantics across supported hosts, but each host may render them through its own native surfaces.

Examples:

- OpenCode renders command files under `.opencode/commands/`
- Codex may render bootstrap skills or host-facing entries differently
- Qwen will render `.qwen/commands/`

The semantic command set is shared even if the wire format differs.

### 4. OMS command set stays small

The initial OMS control-plane command set is:

- `status`
- `use`
- `disable`
- `sync`
- `doctor`

These are logical command keys. Users may rename them and add aliases.

### 5. `disable superpowers` is not a core feature

Temporary per-session disabling of upstream `superpowers` is not included.

Reason:

- impossible to guarantee cross-host consistency
- likely host-specific hacks would exceed OMS’s product boundary
- OMS can satisfy the real user need with the logical `disable` command and preset switching

### 6. Qwen support should be thin

Qwen support should use first-class project-local artifacts:

- `.qwen/agents/`
- `.qwen/commands/`

No heavy extension bootstrap is needed in this stage.

## Config Model

The router config evolves from a single routing object into a layered control-plane config.

Recommended shape:

```jsonc
{
  "$schema": "./node_modules/oh-my-superagents/schemas/oh-my-superagents.schema.json",
  "settings": {
    "enabled": true,
    "activePreset": "default",
    "commandPrefix": "oms",
    "commands": {
      "status": { "name": "status", "aliases": ["st"] },
      "use": { "name": "use", "aliases": ["u"] },
      "disable": { "name": "off", "aliases": ["o"] },
      "sync": { "name": "sync", "aliases": ["sy"] },
      "doctor": { "name": "doctor", "aliases": ["dr"] }
    },
    "superpowersCompatibility": {
      "mode": "warn"
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "description": "General daily development",
      "profiles": {
        "strategy": { "model": "anthropic/claude-sonnet-4-5-20250929", "variant": "high" },
        "build": { "model": "openai/gpt-5", "effort": "balanced" }
      },
      "routes": {
        "brainstorming": "strategy"
      },
      "defaultRoute": "build"
    },
    "fast-fixes": {
      "label": "Fast Fixes",
      "short": "fix",
      "description": "Prefer cheaper or faster models for small edits",
      "profiles": {
        "build": { "model": "gpt-5.3-codex-spark", "effort": "fast" }
      },
      "routes": {},
      "defaultRoute": "build"
    }
  }
}
```

Stage 1 synthesized command defaults are normative:

| Logical key | Default rendered name | Default aliases |
| --- | --- | --- |
| `status` | `status` | `st` |
| `use` | `use` | `u` |
| `disable` | `off` | `o` |
| `sync` | `sync` | `sy` |
| `doctor` | `doctor` | `dr` |

The first-run in-memory default payload is also normative:

- `settings.enabled = true`
- `settings.activePreset = "default"`
- `settings.commandPrefix = "oms"`
- `settings.commands` from the normative defaults table above
- `settings.superpowersCompatibility.mode = "warn"`
- `presets.default.label = "Default"`
- `presets.default.short = "def"`
- `presets.default.description = "General daily development"`
- `presets.default.profiles` and routing use the same starter values shown in the config example in this document

If a layered config omits one or more logical command entries entirely, OMS synthesizes the missing entries from this table after merge.
If a layered config provides a partial command entry for a logical key, missing fields inside that entry are also synthesized from this table after merge.

## Config Resolution and Mutation

### Read order

Supported config sources are:

1. `--config <path>`
2. project config: `./oh-my-superagents.config.jsonc`
3. global config: `~/.config/oh-my-superagents/config.jsonc`

If `--config` is supplied, only that file is loaded.
Otherwise, OMS loads global config first and then overlays project config if present.

This is the complete read algorithm for Stage 1 and Stage 2.

If no config file exists at any supported location:

- `status` and `doctor` may use an in-memory default config
- stateful commands create the selected target file in the new layered shape before persisting state

`sync` requires a real config source and must fail with a non-zero error if no config file exists yet.

### Legacy migration order

Legacy single-shape configs are migrated in memory before layered merge.

That means:

- old top-level `profiles`, `routes`, `defaultRoute` become the implicit `default` preset
- old top-level `superpowersCompatibility` becomes `settings.superpowersCompatibility`
- default control-plane settings are synthesized only after layering and only for fields that still do not exist

Valid legacy minimum shape:

- `profiles` is required
- `defaultRoute` is required
- `routes` may be omitted and then migrates as `{}`

Migration happens independently per loaded file before merge.

Mixed-shape files are invalid in Stage 1 and Stage 2.
A config file may be either legacy shape or new layered shape, but not both at once.

Mixed-shape detection is explicit:

- any file containing `settings` or `presets` is treated as layered shape
- if that same file also contains legacy top-level routing keys (`profiles`, `routes`, `defaultRoute`, or top-level `superpowersCompatibility`), it is invalid mixed shape

Mixed-shape failure contract is normative:

- `status` and `doctor` fail with an explicit mixed-shape error and do not invent an in-memory fallback
- `use`, `disable`, and `sync` fail before any config write or artifact mutation

### Merge rules

- `settings`: field-by-field shallow merge, project overriding global
- `settings.commands`: merge by logical command key; a same-named project command entry replaces the whole global command entry
- `presets`: whole-object replace by preset key, project overriding same-named global preset
- preset internals are not deep-merged; a same-named project preset replaces the whole global preset object
- validation runs after migration and merge

These are the only merge rules used by OMS in Stage 1 and Stage 2.

Validation rules after merge:

- `settings.activePreset` must resolve to an existing preset key after migration and merge
- user-authored presets must provide non-empty `label` and `short`
- `description` is optional but, if present, must be non-empty
- preset `short` values must be unique across the resolved preset set
- every resolved preset must contain `profiles`, `routes`, and `defaultRoute`
- every resolved preset `defaultRoute` must point to an existing profile in that preset
- every resolved preset `routes` target must point to an existing profile in that preset
- rendered command primary names and aliases must be unique across all logical commands
- empty prefix, command names, aliases, labels, or `short` values are invalid
- allowed characters for command prefix, command names, aliases, and preset `short` values are lowercase ASCII letters, digits, and `-`

### Mutation target rules

Stateful OMS commands write back to the highest-priority existing config source that produced the resolved config:

- if `--config` is supplied, write there
- else if project config exists, write there
- else write to global config

No command in Stage 1 or Stage 2 writes to more than one config file.

If the selected write target is not writable, the command fails with a non-zero error.
There is no fallback write to a lower-priority config file.

When a stateful command writes, it updates only the selected source document.
It does not serialize the fully merged config back into that file.

When a stateful command targets a legacy-shape file, it rewrites only that file into the new layered shape before persisting the updated state.
That rewritten file materializes:

- the migrated local preset content
- `settings.enabled`
- `settings.activePreset`
- legacy-local `settings.superpowersCompatibility` if it existed in that file

It does not materialize inherited lower-priority values such as a global `commandPrefix` or global command aliases into the rewritten target file.
Those inherited values continue to come from normal layered resolution.

If the rewritten legacy target has no lower-priority source to inherit from, it must serialize the synthesized defaults required for a valid standalone layered config, including:

- `settings.commandPrefix`
- `settings.commands`
- `settings.superpowersCompatibility`

Commands that mutate config state in Stage 1 are:

- `use`
- `disable`

`status` and `doctor` are read-only.

`sync` mutates host artifacts but does not mutate config state.

## OMS Command Semantics

### `status`

Reports:

- whether OMS is enabled
- the active preset
- available presets with label/short/description
- current host support
- current upstream compatibility state

### `use <preset-or-short>`

Switches the active preset and reconciles host artifacts.
If OMS was disabled, `use` re-enables it.

Write target selection follows the config mutation rules above.

Mutation ordering for `use` is deterministic:

1. resolve and validate the candidate next config in memory
2. persist the updated config state by writing both `settings.activePreset = <selected preset>` and `settings.enabled = true` into the selected target file
3. reconcile OMS-generated host artifacts for the invoking host
4. if artifact generation fails, return non-zero and leave the persisted config in place so `sync` can reconcile host artifacts later

### `disable`

Disables OMS only.

Behavior:

- `settings.enabled = false` is written immediately to the selected config target
- OMS-generated host artifacts are removed as part of the same command execution for the invoking host only
- upstream `superpowers` remains untouched

Recovery surface after disable:

- the OMS CLI remains available
- OMS-generated host-native control-plane entries are removed together with the rest of OMS-generated artifacts
- OMS is re-enabled by `use <preset-or-short>` or by manually setting `settings.enabled = true` and then running `sync`

This is the complete disable lifecycle for Stage 1 and Stage 2.

Host-scoped lifecycle rule:

- config state is shared across hosts
- artifact reconciliation is invoking-host-only
- OMS does not automatically clean up or resync other hosts
- `status` and `doctor` may therefore report stale artifacts on other hosts until the user runs the corresponding host-specific command there

Host selection rules are normative:

- host-native rendered entries imply their own host
- standalone OMS CLI invocations must use explicit host selection whenever the command mutates or inspects host artifacts
- `use`, `disable`, `sync`, `status`, and `doctor` therefore act on the host selected by the invoking host-native entry or the explicit CLI host flag

If a standalone OMS CLI invocation omits `--host` for one of those commands, it fails with a non-zero error.

Mutation ordering for `disable` is deterministic:

1. resolve and validate the candidate next config in memory
2. persist `settings.enabled = false`
3. remove OMS-generated artifacts for the invoking host
4. if artifact removal fails, return non-zero and leave the persisted disabled state in place so `sync` can reconcile host artifacts later

There is no deferred “disable now, clean up later” mode in Stage 1.

### `sync`

Regenerates and reconciles the OMS-owned artifact set for the active preset on the invoking host.

Mutation ordering for enabled-mode `sync` is deterministic:

1. resolve and validate the current config in memory
2. reconcile OMS-owned artifacts for the invoking host using the active preset
3. remove stale OMS-owned artifacts for that host created by old prefixes, rendered names, aliases, or prior OMS output
4. if artifact reconciliation fails, return non-zero and leave config state unchanged

When OMS is disabled, `sync` is still valid.
In disabled mode it removes OMS-generated artifacts for the invoking host only and exits successfully without re-enabling OMS.

If disabled-mode artifact removal fails, `sync` returns non-zero and leaves OMS disabled in config.

### `doctor`

Reports:

- active preset
- command names and aliases
- generated host artifacts present/missing
- upstream compatibility result

## Host Rendering Rules

### Host Artifact Contract

| Host | OMS-generated artifacts for Stage 1/2 | Upstream `superpowers` must already provide |
| --- | --- | --- |
| OpenCode | `.opencode/commands/*`, `.opencode/agents/*` | usable upstream skills via the user’s chosen install path |
| Codex | existing `.codex/agents/*` routing artifacts remain OMS-managed, and Stage 1 adds control-plane files: `.agents/plugins/marketplace.json`, `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`, `plugins/oh-my-superagents-codex/skills/*` | usable upstream skills via the user’s chosen install path |
| Qwen Code | `.qwen/commands/*`, `.qwen/agents/*` | usable upstream skills already installed through the user’s chosen upstream path |

If the required upstream skills are absent, OMS-generated host entries must fail closed with an explicit message.

### OMS Ownership Contract

All OMS-generated host artifacts must be safely discoverable for reconciliation and cleanup.

The ownership contract is normative:

- OpenCode command and agent files must contain an OMS-generated marker in their content and use the configured rendered names owned by OMS
- Codex OMS skill directories and plugin files are OMS-owned by fixed path under `plugins/oh-my-superagents-codex/` plus the OMS entry in `.agents/plugins/marketplace.json`
- Qwen command and agent files must contain an OMS-generated marker in their content and use OMS-owned filenames

`sync`, `use`, and disabled-mode cleanup operate only on artifacts that satisfy this ownership contract.

### OpenCode

Stage 1 extends OpenCode generation with OMS control-plane commands.

Examples:

- `/<prefix>-<rendered-name>`
- `/<prefix>-<alias>`

For the example config above, OpenCode would render:

- `/oms-status`
- `/oms-st`
- `/oms-use`
- `/oms-u`
- `/oms-off`
- `/oms-o`
- `/oms-sync`
- `/oms-sy`
- `/oms-doctor`
- `/oms-dr`

Aliases are emitted as additional generated commands if configured.

### Codex

Stage 1 reuses the existing Codex bootstrap layer and plugin bundle.

Codex command semantics are carried by generated OMS skills inside the local plugin bundle.
Those skills map the stable logical keys to host-native skill names.

Required Stage 1 Codex control-plane entries are the Codex-hosted rendered forms of the five logical command keys.
With the example config above, Codex would expose rendered entries equivalent to:

- `oms-status`
- `oms-st`
- `oms-use`
- `oms-u`
- `oms-off`
- `oms-o`
- `oms-sync`
- `oms-sy`
- `oms-doctor`
- `oms-dr`

The rendered Codex skill names and prompts must honor the configured command prefix, primary names, and aliases.
Stage 1 completion for Codex requires these control-plane skills to exist and remain semantically consistent with the shared OMS command model.

Codex host trigger syntax is the rendered skill name exposed through the local OMS plugin bundle.

Codex Stage 1 generated resources are normative:

All Codex Stage 1 paths in this section are relative to the project root.

- existing OMS-managed routing artifacts remain in `.codex/agents/*`
- the required Codex routing artifact inventory is:
  - `.codex/agents/oms-brainstorm.toml`
  - `.codex/agents/oms-plan.toml`
  - `.codex/agents/oms-execute.toml`
  - `.codex/agents/oms-review.toml`
  - `.codex/agents/oms-verify.toml`
  - `.codex/agents/oms-visual.toml`
  - `.codex/agents/oms-web-test.toml`
- plugin manifest:
  - `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`
- marketplace entry:
  - `.agents/plugins/marketplace.json`
- one skill file per rendered primary command and alias:
  - `plugins/oh-my-superagents-codex/skills/<prefix>-<rendered-name>/SKILL.md`
  - `plugins/oh-my-superagents-codex/skills/<prefix>-<alias>/SKILL.md`

Codex Stage 1 content contract is also normative:

- `.agents/plugins/marketplace.json` must contain an OMS-owned entry for `oh-my-superagents-codex`
- `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json` must identify the local OMS Codex bundle and its bundled skills
- each generated Codex skill file must map to exactly one logical OMS command key
- each generated Codex skill prompt must delegate to the OMS CLI for that logical command instead of embedding separate control-plane logic
- OMS updates only its own marketplace entry and its own plugin bundle files
- `sync` and `use` reconcile stale OMS-owned Codex skill entries produced by old prefixes, rendered names, or aliases
- `disable` and disabled-mode `sync` remove OMS-owned Codex skill entries while leaving unrelated marketplace entries untouched
- the OMS-owned marketplace entry must keep plugin name `oh-my-superagents-codex` and local path `./plugins/oh-my-superagents-codex` relative to the project root
- the OMS-owned plugin manifest must identify the same plugin name and reference the bundled skills directory

Normative Codex JSON examples:

The full `.agents/plugins/marketplace.json` file contract is:

- the file is a JSON object
- it may contain unrelated non-OMS entries
- OMS inserts or updates exactly one entry named `oh-my-superagents-codex`
- OMS removes only that same entry during Codex disable cleanup
- malformed JSON causes non-zero failure before mutation

` .agents/plugins/marketplace.json ` contains an OMS-owned entry equivalent to:

```json
{
  "plugins": [
    {
      "name": "oh-my-superagents-codex",
      "source": {
        "source": "local",
        "path": "./plugins/oh-my-superagents-codex"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
```

` plugins/oh-my-superagents-codex/.codex-plugin/plugin.json ` is equivalent to:

```json
{
  "name": "oh-my-superagents-codex",
  "skills": "./skills/"
}
```
- the OMS-owned marketplace entry must keep plugin name `oh-my-superagents-codex` and local path `./plugins/oh-my-superagents-codex`
- the OMS-owned plugin manifest must identify the same plugin name and reference the bundled skills directory

Normative Codex `SKILL.md` example:

```md
---
name: oms-off
description: Disable OMS for Codex in this project.
---

Run `oh-my-superagents disable --host codex` from the repository root.
Forward any command arguments as-is.
Treat this skill as the Codex host entry for the logical `disable` command key.
```

### Qwen Code

Stage 2 generates:

- `.qwen/agents/*.md`
- `.qwen/commands/*.md`

Qwen routing should mirror the same preset and command semantics already used by OpenCode and Codex.
Stage 2 does not require a heavy extension bootstrap layer.
It relies on Qwen’s project-local command and agent surfaces only.
Stage 2 does not generate `.qwen/skills/`.
Generated Qwen phase agents assume upstream `superpowers` skills are already installed through the user’s chosen upstream path.
If upstream Qwen-usable `superpowers` skills are not available, OMS-generated Qwen phase agents must fail closed with an explicit message instead of inventing a replacement workflow.

Qwen host trigger syntax is the rendered command name or alias under `.qwen/commands/`.
Those generated `.qwen/commands/*` files are OMS CLI wrappers and do not depend on upstream skill availability.

For Stage 2, a Qwen-usable upstream skill install means the required skill names are discoverable in one of:

- `.qwen/skills/`
- `~/.qwen/skills/`
- `.agents/skills/`
- `~/.agents/skills/`

A Qwen-usable upstream skill is present iff a file or directory basename exactly matches the required upstream skill name in one of those locations.

## Qwen Adapter Design

Qwen phase agents should mirror the existing host-neutral routing model.
They are direct OMS-generated wrapper agents, not dynamically discovered upstream skill files and not a Qwen extension bootstrap layer.
Qwen wrapper agent names are fixed and not affected by the command prefix.
Only OMS control-plane command names and aliases are prefix-configurable.

Required generated agents:

- `oms-brainstorm`
- `oms-plan`
- `oms-execute`
- `oms-review`
- `oms-verify`
- `oms-visual`
- `oms-web-test`

Each agent should include:

- phase-specific description
- model selection derived from the active preset
- host-native instructions to use the matching upstream `superpowers` skill if available
- explicit “stop and report missing upstream superpowers skills” behavior when those skills are unavailable

The required Qwen phase-agent to upstream-skill mapping is:

- `oms-brainstorm` -> `brainstorming`
- `oms-plan` -> `writing-plans`
- `oms-execute` -> `subagent-driven-development`
- `oms-review` -> `requesting-code-review`
- `oms-verify` -> `verification-before-completion`
- `oms-visual` -> `frontend-design`
- `oms-web-test` -> `webapp-testing`

For each Qwen wrapper agent, route resolution is normative:

- take the mapped upstream skill name above as the route key
- resolve that key through the active preset’s `routes`
- if the key has no explicit route, fall back to the active preset’s `defaultRoute`
- render the wrapper agent with the resolved profile

Qwen resolved-profile rendering rules are normative for Stage 2:

- render `model` from the resolved profile into the Qwen wrapper agent
- do not render `variant`, `effort`, fast-mode bias, or host-specific extras into `.qwen/agents/*.md` in Stage 2
- those unsupported fields remain in OMS config state but are ignored by the Qwen adapter until a later design explicitly extends Qwen host capabilities

Required generated commands:

- `<prefix>-<rendered-status-name>`
- `<prefix>-<rendered-use-name>`
- `<prefix>-<rendered-disable-name>`
- `<prefix>-<rendered-sync-name>`
- `<prefix>-<rendered-doctor-name>`

Configured aliases generate additional `.qwen/commands` entries for the same logical command.
Stage 2 completion for Qwen requires these command entries to exist and honor the configured prefix and aliases.

These commands are OMS control-plane commands, not direct replacements for upstream `superpowers` flows.

Qwen Stage 2 generated resources are normative:

- one agent file per required phase agent under `.qwen/agents/`
- one command file per rendered primary command and alias under `.qwen/commands/`

Normative Qwen generated-agent example:

```md
---
name: oms-review
description: Qwen wrapper agent for the requesting-code-review phase
model: <resolved model from active preset>
---

Use the upstream `requesting-code-review` superpowers skill if it is available.
If that upstream skill is unavailable, stop and report that Qwen-usable superpowers skills are not installed.
```

Normative Qwen command-wrapper example:

```md
---
description: Switch OMS to the selected preset for Qwen.
---

Run `oh-my-superagents use --host qwen $ARGUMENTS` from the repository root.
```

Qwen Stage 2 execution contract is normative:

- generated `.qwen/commands/*` files are OMS control-plane wrappers
- they shell out to the OMS CLI for the corresponding logical command
- they do not embed independent control-plane state mutation logic
- generated `.qwen/agents/*` files are phase-routing wrappers, not control-plane command implementations

## Migration Strategy

Existing configs must continue to work.

If a config file uses the old single-routing shape:

- treat top-level `profiles`, `routes`, and `defaultRoute` as the implicit `default` preset
- carry forward legacy top-level `superpowersCompatibility` as `settings.superpowersCompatibility`
- create default `settings` in memory:
  - `enabled: true`
  - `activePreset: "default"`
  - `commandPrefix: "oms"`
  - command names and aliases from the normative defaults table above
- synthesize the implicit `default` preset fields:
  - `label: "Default"`
  - `short: "def"`
  - `description: "Migrated legacy OMS configuration"`

No automatic file rewrite is required in Stage 1.

Preset short-name conflict rules are mandatory:

- each resolved preset `short` must be unique
- `use <preset-or-short>` first matches exact preset key, then unique `short`
- ambiguous `short` matches are validation errors, not runtime tie-breaks

## Failure Handling

- unknown preset in `use` returns a non-zero error
- alias conflicts in command config fail validation
- empty prefix or command names fail validation
- disabling OMS must never remove upstream `superpowers` artifacts
- Qwen host generation must fail clearly if preset resolution succeeds but host-specific rendering cannot be produced

## Testing Strategy

Stage 1 requires coverage for:

- config migration from old shape to new in-memory shape
- global/project config merge behavior
- prefix and alias validation
- active preset selection
- `disable` semantics
- generated OMS command names for OpenCode

Stage 2 requires coverage for:

- Qwen artifact generation
- Qwen phase agent naming and routing
- Qwen command rendering using configured prefix and aliases
- active preset effect on model/reasoning mapping

## MVP Scope

Stage 1 is complete when:

- the new config model works
- OMS control-plane commands exist in OpenCode
- OMS control-plane entries also exist for Codex through the existing bootstrap/plugin layer
- OMS can switch presets and disable itself

Stage 2 is complete when:

- Qwen Code receives a thin adapter based on the same config and command model
- no Qwen extension/bootstrap layer has been introduced

## Acceptance Criteria

- No upstream `superpowers` disable feature is added.
- OMS control-plane semantics are host-consistent.
- Users can rename command prefix and aliases without editing generated artifacts manually.
- Multiple routing presets can coexist in one config file.
- Qwen support reuses the Stage 1 control-plane model rather than inventing a parallel system.
