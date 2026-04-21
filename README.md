# oh-my-superagents

[English](./README.md) | [简体中文](./README.zh-CN.md)

Architecture: [English](./docs/README-architecture.md) | [简体中文](./docs/README-architecture.zh-CN.md)

Host-native routing and OMS control-plane support for AI work on OpenCode, Codex, Qwen, Claude Code, and Copilot CLI, with first-class `superpowers` support and an experimental host-native direct mode on OpenCode, Codex, and Qwen.

## Support Matrix

| Capability | OpenCode | Codex | Qwen | Claude Code | Copilot CLI |
| --- | --- | --- | --- | --- | --- |
| `superpowers` workflow routing | Full | Full | Partial | Experimental | Full |
| Direct mode | Experimental | Experimental | Experimental | None yet | Experimental |
| OMS control plane | Full | Full | Full | Experimental | Full |
| Host bootstrap | Native plugin entry | Local bootstrap/plugin bundle | None | None | None yet |
| Compatibility monitor | Full | Full | None yet | None yet | None yet |
| Generated host artifacts | Agents + commands | Agents + plugin/skills | Agents + commands | Skills | Agents + skills |
| Temporary disable helper | Full | Full | None yet | None yet | None yet |
| `codexFast` | Full | Full | None yet | None yet | None yet |

Support level notes:

- `Full`: implemented and part of the supported surface
- `Experimental`: implemented for the first generic slice and expected to evolve
- `Partial`: implemented with explicit stage limits documented below
- `None yet`: not implemented in the current release
- `Not planned`: intentionally out of scope for now

Feature notes:

- The temporary disable helper is host-local, conversation-scoped, and does not change persistent OMS state.
- `codexFast` is full on OpenCode and Codex. Qwen does not support it yet.
- Direct mode stays host-native: OpenCode renders commands plus agents, Codex renders agent TOMLs plus local bootstrap skills, and Qwen renders project-local commands plus agents.
- `gstack` is a first-party workflow source. In the current slice, gstack-backed route projection is supported on OpenCode, Codex, Claude Code, and Copilot CLI, but not on Qwen.

## Implementation Footprint

The project is intentionally split into a shared OMS core plus thin workflow and host adapter layers.
The table below uses current source line counts from the implementation files only; it excludes tests and docs.

| Layer | Main files | Approx. source LOC | Thickness |
| --- | --- | ---: | --- |
| OMS control plane core | `src/control-plane.ts`, `src/config.ts`, `src/cli.ts` | 4316 | Medium |
| Workflow adapters | `src/router.ts`, `src/workflow-superpowers.ts`, `src/workflow-gstack.ts`, `src/workflow-sources.ts`, `src/workflow-direct.ts` | 371 | Thin |
| Shared capability policy | `src/capabilities.ts` | 97 | Thin |
| OpenCode adapter | `src/opencode.ts` | 633 | Thin |
| Codex adapter + bootstrap | `src/codex.ts`, `src/codex-bootstrap.ts` | 760 | Medium |
| Qwen adapter | `src/qwen.ts` | 424 | Thin |
| Claude adapter | `src/claude.ts` | 138 | Thin |
| Copilot CLI adapter | `src/copilot.ts` | 274 | Thin |
| Compatibility monitor | `src/superpowers-compatibility.ts`, `src/superpowers-detectors.ts` | 1093 | Medium |
| Shared artifact reconciliation | `src/materialize.ts` | 712 | Thin-to-medium |

How to read this:

- `Thin`: mostly host-specific rendering or lightweight integration glue
- `Thin-to-medium`: shared operational glue or adapters that stay narrower than the core but do more than pure rendering
- `Medium`: shared policy, config resolution, lifecycle, or bootstrap behavior
- OMS is intentionally thicker in the shared core than in any single host adapter

## Scope

`oh-my-superagents` is evolving into a broader routing and control-plane product.
Today it still ships first-class `superpowers` support across the supported hosts, and the first generic slice now includes an experimental host-native direct mode on OpenCode, Codex, and Qwen, while Claude Code currently supports the `superpowers` slice only.

It is not a cross-host configuration sync tool.
The supported surface for this release is the CLI, generated host artifacts, packaged plugin entrypoints, the Stage 1 OMS control plane, the Stage 2 Qwen adapter, the experimental direct-mode slices on OpenCode, Codex, and Qwen, and the current `oh-my-superagents/library` export surface.

Today that means:

- OpenCode: supported for `superpowers` workflow routing and the experimental direct-mode slice
- Codex: supported for `superpowers` workflow routing and the experimental direct-mode slice
- Qwen: supported with a limited Stage 2 surface for `superpowers` workflow routing plus an experimental direct-mode slice
- Claude Code: supported as a thin host adapter for the current `superpowers` slice, including source-aware route projection; direct workflow projection is not supported yet
- Copilot CLI: supported as a thin host adapter for `superpowers` workflow routing and the experimental direct-mode slice, with plugin-based integration via `.copilot/plugins/oh-my-superagents-copilot/`

## What It Does

- Reads layered `oh-my-superagents.config.jsonc` from global and project locations
- Resolves built-in `superpowers` phase inputs into canonical routes such as `phase.plan`, and resolves user-defined direct intents into canonical routes such as `intent.plan`
- Generates `.opencode/agents/*.md` and `.opencode/commands/*.md`
- Generates `.codex/agents/*.toml`
- Generates `.qwen/agents/*.md` and `.qwen/commands/*.md`
- Generates `.claude/skills/*/SKILL.md`
- Generates `.copilot/agents/*.agent.md`, `.copilot/skills/*.md`, `.copilot/plugins/oh-my-superagents-copilot/plugin.json`, and `.copilot/plugins/oh-my-superagents-copilot/hooks.json`
- Proposes routing config changes with `author routing` from repo signals plus a user-supplied model inventory
- Exposes `author routing`, `status`, `use`, `disable`, `sync`, `doctor`, `explain`, and `bootstrap` CLIs
- Ships a minimal OpenCode plugin entrypoint for startup diagnostics

## Canonical Route Model

- Built-in OMS phase inputs stay user-facing as stable phase names such as `writing-plans`, but the shared router normalizes them to true canonical route ids such as `phase.plan`.
- Source adapters map those canonical routes to source-native workflow entries. For example, `phase.plan` maps to `superpowers/writing-plans` by default and can map to `gstack/plan-eng-review` when that source is selected.
- Host adapters consume the resolved canonical route plus its source entry metadata, then render host-native artifacts from that result instead of treating source-native phase names as the internal truth layer.
- Source overrides, explain output, and control-plane diagnostics use canonical route ids like `phase.plan`; legacy aliases like `phase.writing-plans` are not the internal routing contract.

## Direct Mode

The first generic-routing slice is now an experimental direct workflow on OpenCode, Codex, and Qwen.

- It uses user-defined intents and keeps the rendered shape host-native instead of forcing identical files everywhere.
- OpenCode renders `ai-<intent>` commands plus `rt-<intent>` agents.
- Codex renders `rt-<intent>.toml` agents plus repo-local `ai-<intent>` bootstrap skills in `plugins/oh-my-superagents-codex/skills/`.
- Qwen renders project-local `.qwen/commands/ai-<intent>.md` commands plus `.qwen/agents/rt-<intent>.md` agents.
- Direct intent ids must use lowercase letters, digits, and `-` only so the generated host filenames stay valid.
- The supported direct-mode control-plane surface is `status`, `doctor`, and `sync` on OpenCode, Codex, and Qwen.
- `explain --intent` is currently supported on OpenCode and Codex, but not yet on Qwen or Claude Code.
- `explain --host claude --phase <phase>` is supported for the current Claude `superpowers` slice.
- Direct mode does not require upstream `superpowers`, while first-party `superpowers` workflow routing remains supported and unchanged.

## Repository Maintainer Workflow

This repository is maintained with `pnpm`. If you are working on the repo itself, enable Corepack once and use `pnpm install` for dependency management. Consumer-facing package usage examples in the install section can still use `npx`.

Host-local validation is disabled for this plugin repository.
Run repository verification from a Debian Docker container only.

```bash
corepack enable
pnpm install
bash scripts/run-opencode-debian-canary.sh
bash scripts/run-codex-debian-canary.sh
```

## Install

For `superpowers` workflow mode, install upstream `superpowers` separately, then use the host-specific flow you need.
For the experimental direct mode on OpenCode, Codex, or Qwen, upstream `superpowers` is not required.

Host-specific flow:

- OpenCode: add `oh-my-superagents` to your OpenCode plugin list
- Codex: use the packaged CLI to run `bootstrap --host codex`
- Qwen: use `sync --host qwen`; there is no heavy bootstrap flow in Stage 2

For ad-hoc local use of the CLI, run it with `npx` or from your local `node_modules/.bin`:

```bash
npx oh-my-superagents sync --host opencode
```

Create `oh-my-superagents.config.jsonc` in your project root:

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
        "strategy": {
          "model": "anthropic/claude-sonnet-4-5-20250929",
          "variant": "high"
        },
        "build": {
          "model": "openai/gpt-5",
          "effort": "balanced"
        }
      },
      "routes": {
        "brainstorming": "strategy"
      },
      "defaultRoute": "build"
    },
    "review": {
      "label": "Review",
      "short": "rev",
      "description": "Heavier review-oriented preset",
      "profiles": {
        "review": {
          "model": "anthropic/claude-sonnet-4-5-20250929",
          "variant": "high"
        }
      },
      "routes": {},
      "defaultRoute": "review"
    }
  }
}
```

For a Codex-compatible profile inside the modern layered config shape, enable `codexFast` explicitly:

```jsonc
{
  "presets": {
    "default": {
      "profiles": {
        "build": {
          "model": "gpt-5.4",
          "effort": "balanced",
          "codexFast": true
        }
      },
      "routes": {},
      "defaultRoute": "build"
    }
  }
}
```

Notes:

- This single file can define multiple presets and switch between them with `status`, `use`, and `disable`.
- Without `--config`, OMS layers global config at `~/.config/oh-my-superagents/config.jsonc` under the project file. Project settings override global settings, project presets replace same-named global presets, and project command entries replace same-named global command entries before missing defaults are synthesized.
- Legacy single-preset router configs are still read and migrated into `presets.default`, but do not mix legacy top-level keys with `settings` or `presets`.
- For `--host codex`, use Codex-compatible model ids in profiles, such as `gpt-5.4` or `gpt-5.3-codex-spark`. The Codex adapter does not translate arbitrary OpenCode provider/model ids.
- For `--host qwen`, use Qwen-compatible model ids in profiles such as `qwen/qwen3-coder-30b` or `qwen/qwen3-coder-480b`.

## Lane Routing

Lane-aware routing keeps `phase` fixed to the upstream `superpowers` workflow key and adds one routing layer below it:

- `phase` remains the stable `superpowers` workflow key.
- `lane` is a tech-stack route bundle such as `frontend`, `backend`, or `infra`.
- `profile` is the leaf model/config object that carries executable settings.
- `preset` still chooses the work mode, and `usesLanes` limits which global lanes that preset can use.
- `settings.defaultLane` is the persisted baseline lane for the active preset.
- `laneSelection.mode` supports `manual`, `suggest`, and `auto`.
- `--lane <name>` is a per-invocation runtime lane override for `status`, `doctor`, `explain`, and `sync`; it is never written back into config, but `sync` will materialize artifacts for the requested lane until the next sync regenerates them.

`manual` uses only the persisted/default lane path, `suggest` surfaces the runtime lane as a non-applying Stage 1 suggestion, and `auto` may apply a session-scoped `effectiveLane` without persisting it back into config.

Examples:

```bash
oh-my-superagents status --host opencode --lane frontend
oh-my-superagents explain --host opencode --phase brainstorming --lane frontend
```

Compact example:

```jsonc
{
  "settings": {
    "activePreset": "default",
    "defaultLane": "backend",
    "laneSelection": { "mode": "suggest" }
  },
  "profiles": {
    "frontend-build": {
      "model": "openai/gpt-5",
      "effort": "balanced"
    },
    "backend-build": {
      "model": "gpt-5.4",
      "effort": "balanced",
      "codexFast": true
    }
  },
  "lanes": {
    "frontend": {
      "label": "Frontend",
      "routes": {
        "frontend-design": "frontend-build"
      },
      "defaultRoute": "frontend-build"
    },
    "backend": {
      "label": "Backend",
      "routes": {
        "writing-plans": "backend-build"
      },
      "defaultRoute": "backend-build"
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "usesLanes": ["frontend", "backend"],
      "defaultLane": "backend",
      "routes": {},
      "defaultRoute": "backend-build"
    }
  }
}
```

## Lane-Aware Subagent Execution

Lane-aware subagent execution is an execution-layer enhancement under `superpowers`, not a separate workflow family. In the current slice, OMS keeps the main `/sp-execute` path on `superpowers/subagent-driven-development` and adds OpenCode-first lane-scoped wrappers such as `/sp-execute-frontend` with matching `spr-build--frontend` agents when the active preset enables lanes through `usesLanes`.

Set `settings.subagentExecution.mode` to control split behavior:

- `manual`: only use lane-specific execution when the user explicitly asks for it
- `suggest`: propose the split first and wait for confirmation; this is the default
- `auto`: apply the split across the matching lane helpers automatically for the current execution

These lane-scoped helpers stay inside the existing `superpowers` execution flow. They make the selected lane explicit at execution time, but they do not introduce a new top-level workflow system.

## OMS Control Plane

Stage 1 adds host-local control-plane commands:

- `oh-my-superagents status --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents use <preset-or-short> --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents disable --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents sync --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents doctor --host <opencode|codex|qwen|claude|copilot>`

Behavior notes:

- `status` and `doctor` can fall back to the built-in default config when no real config file exists.
- `use` and `disable` can create the first real layered control-plane config when none exists yet. `sync` still requires a real config source unless you pass an explicit `--config` path.
- `use` accepts either the preset key or its unique `short` alias.
- `disable` and disabled `sync` remove OMS-owned artifacts for the invoking host only. For example, `--host opencode` cleans up `.opencode/*` artifacts and leaves `.codex/*` and `.qwen/*` alone.
- For `--host codex`, the OMS-managed surface includes `.codex/agents/*.toml`, the OMS marketplace entry inside `.agents/plugins/marketplace.json`, `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`, and OMS control-plane skills under `plugins/oh-my-superagents-codex/skills/*/SKILL.md`.
- For `--host qwen`, the OMS-managed surface includes both `.qwen/commands/*.md` and `.qwen/agents/*.md`.
- For `--host claude`, the OMS-managed surface includes project-scoped `.claude/skills/*/SKILL.md` wrappers.
- For `--host copilot`, the OMS-managed surface includes `.copilot/agents/*.agent.md`, `.copilot/skills/*.md`, and the plugin bundle at `.copilot/plugins/oh-my-superagents-copilot/` (including `plugin.json` and `hooks.json`).
- Artifact inspection in `status` and `doctor` is also invoking-host-only.

## Readiness Surfaces

OMS diagnostics now separate four different questions instead of flattening everything into one generic readiness bit:

- `support`: whether OMS supports the host/source/route or command combination at all. This comes from shared capability policy and surfaces as `readiness.support`.
- `availability`: whether the required upstream source can be detected right now. This surfaces as `readiness.availability` with statuses such as `available`, `not_detected`, `error`, or `not_implemented`.
- `compatibility`: whether a detected upstream `superpowers` install is inside the tested OMS matrix. This surfaces as top-level `compatibility` on hosts with a monitor, and as `readiness.compatibility` for route-level readiness when that question applies.
- `sync state`: whether OMS-managed artifacts for the invoking host are present, missing, or stale. `status` and `doctor` always return host-local `artifacts`; OpenCode `status` additionally summarizes sync state through `state`, `nextAction`, and `artifactSummary`, while OpenCode `doctor` surfaces `artifactSummary` without those extra status-only fields.

Those signals are intentionally independent. For example, an unsupported Qwen gstack projection stops at `support.supported: false`; a Claude gstack detector failure becomes `availability.status: "error"`; missing OpenCode wrappers are a sync-state problem, not a compatibility problem.

## AI-Assisted Routing Authoring

`author routing` is AI-assisted authoring support for routing config. It proposes lane, profile, preset, and optional direct-mode intent changes from repo signals plus a local model inventory. It does not autonomously rewrite your config or silently persist changes.

First-slice command shape:

```bash
oh-my-superagents author routing --mode direct --models ./models.jsonc
```

Behavior notes:

- `--mode <superpowers|direct>` is required.
- `--models <path>` is required in the first slice and must point to a local JSON or JSONC model inventory.
- Preview is the default behavior: the command prints a summary and diff, returns the proposed patch in JSON output, and leaves config on disk unchanged.
- Add `--write` to apply the proposed config document after the same preview/diff output.
- The first slice is CLI-first and host-independent. It helps bootstrap or evolve routing config faster, but the user remains responsible for reviewing model ids, lane names, and the final write.

Examples:

```bash
oh-my-superagents author routing --mode superpowers --models ./models.jsonc
oh-my-superagents author routing --mode direct --models ./models.jsonc --write
```

## Command Prefix And Aliases

OpenCode and Qwen command filenames come from `settings.commandPrefix` plus each configured command `name` and `aliases`.

Example:

```jsonc
{
  "settings": {
    "commandPrefix": "team",
    "commands": {
      "status": { "name": "state", "aliases": ["health"] },
      "sync": { "name": "refresh", "aliases": ["resync", "sync-now"] }
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "profiles": {
        "build": { "model": "openai/gpt-5" }
      },
      "routes": {},
      "defaultRoute": "build"
    }
  }
}
```

This renders OpenCode/Qwen command files such as `team-state.md`, `team-health.md`, `team-refresh.md`, `team-resync.md`, and `team-sync-now.md`.

## Qwen Support

Stage 2 Qwen support is intentionally narrow in `superpowers` workflow mode:

- no heavy bootstrap flow
- no `.qwen/skills` output from OMS
- wrapper agents in `.qwen/agents/*.md`
- OMS control-plane command wrappers in `.qwen/commands/*.md`
- upstream skills are discovered from existing `.qwen/skills` or `.agents/skills` directories in the project or home directory

Qwen wrapper agent names are fixed:

- `oms-brainstorm`
- `oms-plan`
- `oms-execute`
- `oms-review`
- `oms-verify`
- `oms-visual`
- `oms-web-test`

Qwen command files are generated from the same control-plane prefix and alias settings used by OpenCode.

For direct mode on Qwen, OMS keeps the same project-local host shape but swaps in `ai-<intent>` commands and `rt-<intent>` agents.
That direct-mode path does not require upstream skill discovery, supports `status`, `doctor`, and `sync`, and still leaves `explain` unsupported on Qwen.
For gstack-backed `superpowers` routes, Qwen is not supported in this slice; use OpenCode or Codex for those projections.

## Bootstrap

For Codex, the recommended first-run command is:

```bash
oh-my-superagents bootstrap --host codex
```

This will:

- create a starter `oh-my-superagents.config.jsonc` if the project does not have one yet
- scaffold a repo-local Codex marketplace entry in `.agents/plugins/marketplace.json`
- scaffold a local plugin bundle in `plugins/oh-my-superagents-codex/`
- generate `.codex/agents/*.toml`
- generate OMS Codex control-plane skills in `plugins/oh-my-superagents-codex/skills/*/SKILL.md`

After bootstrap completes:

1. restart Codex
2. open the plugin directory
3. install `oh-my-superagents-codex` from the local marketplace

The installed plugin adds Codex-native skill entrypoints for OMS `status`, `use`, `disable`, `sync`, and `doctor`, but routing truth still lives in `oh-my-superagents.config.jsonc` plus `sync --host codex`.

## Sync

```bash
oh-my-superagents sync --host opencode
```

```bash
oh-my-superagents sync --host codex
```

```bash
oh-my-superagents sync --host qwen
```

```bash
oh-my-superagents sync --host claude
```

```bash
oh-my-superagents sync --host copilot
```

Use `--config /absolute/or/relative/path.jsonc` to override config discovery.

For Codex, `sync` and `use` reconcile the full OMS-owned Stage 1 surface: `.codex/agents/*.toml`, the OMS marketplace entry, `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`, and OMS control-plane skills under `plugins/oh-my-superagents-codex/skills/*/SKILL.md`.

For Qwen in Stage 2, `sync` materializes either OMS command wrappers plus OMS wrapper agents for `superpowers` workflow mode, or direct-mode `ai-<intent>` commands plus `rt-<intent>` agents for direct workflows. Only the `superpowers` workflow path requires upstream skills. It does not run a Codex-style bootstrap or install upstream skills for you. gstack-backed route projection is intentionally unsupported on Qwen in this slice.

For Claude Code in the current slice, `sync` materializes project-scoped `.claude/skills/*/SKILL.md` wrappers for the `superpowers` workflow surface. Direct workflow projection is intentionally unsupported on Claude in this slice.

For Copilot CLI, `sync` materializes `.copilot/agents/*.agent.md` for `superpowers` or direct-mode routing, `.copilot/skills/*.md` for OMS control-plane commands, and the plugin bundle at `.copilot/plugins/oh-my-superagents-copilot/` (including `plugin.json` and `hooks.json`).

## Explain

```bash
oh-my-superagents explain --host opencode --all
```

```bash
oh-my-superagents explain --host codex --all
```

```bash
oh-my-superagents explain --host claude --phase writing-plans
```

```bash
oh-my-superagents explain --host copilot --all
```

`explain` is currently supported for `--host opencode`, `--host codex`, `--host claude`, and `--host copilot` in v1.

When control-plane explainability is available, `explain` adds route-trace fields such as `routeSource`, `configSource`, `reuseRelationship`, `resolvedSource`, and `sourceEntry`, plus route-level `readiness`. Single-item output carries top-level `compatibility`; `--all` preserves array shape and attaches `compatibility` to each item.

## Compatibility Monitoring

`oh-my-superagents` includes a host-aware compatibility monitor for upstream `superpowers`.
In the first release it checks:

- OpenCode upstream install metadata from project or user `opencode.json` plugin entries plus the standard local install paths `.opencode/plugins/superpowers.js` and `${XDG_CONFIG_HOME:-~/.config}/opencode/plugins/superpowers.js`
- Codex upstream install metadata from the standard clone and skills symlink locations

First-release scope does not include Gemini CLI.

The monitor is observational only:

- it reads upstream install metadata to detect the current `superpowers` ref or version when possible
- it does not install, update, rewrite, or relocate upstream `superpowers`

For OpenCode, if project-scope and user-scope detection resolve to different upstream refs or versions, the monitor degrades to a conservative non-versioned result that evaluates as `not_detected` instead of pretending one install won.

Host-wide compatibility results surface in JSON output from `status`, `doctor`, `sync`, `explain`, and `bootstrap` on the hosts that currently have a monitor.
OpenCode startup diagnostics currently log only `incompatible` and `not_detected` outcomes.
The reported status is one of:

- `compatible`: detected version is inside a tested range
- `untested`: detected version is parseable but outside tested ranges
- `incompatible`: detected version is below the minimum supported version or in a known bad range
- `not_detected`: no parseable upstream version could be detected

Configure policy mode in `oh-my-superagents.config.jsonc`:

```jsonc
{
  "settings": {
    "superpowersCompatibility": {
      "mode": "warn"
    }
  }
}
```

Policy behavior:

- `warn`: always continue; `sync` and `bootstrap` include compatibility details in JSON output and emit warning text for `untested`, `incompatible`, and `not_detected`, while `explain` includes compatibility in JSON output only
- `strict`: block `sync` and `bootstrap` only when status is `incompatible`; `compatible`, `untested`, and `not_detected` remain non-blocking

## Generated Commands

- `/sp-brainstorm`
- `/sp-plan`
- `/sp-execute`
- `/sp-review`
- `/sp-verify`
- `/sp-visual`
- `/sp-web-test`

On OpenCode, `/sp-visual` and `/sp-web-test` both target the shared `spr-visual` agent today, so they cannot diverge on model selection in the current implementation.

When the OMS control plane is enabled, OpenCode also generates command wrappers from the configured prefix and aliases, such as `oms-status`, `oms-use`, `oms-off`, `oms-sync`, and `oms-doctor`.

## Generated Codex Agents

For `superpowers` workflow mode, Codex generates these OMS phase agents:

- `oms-brainstorm`
- `oms-plan`
- `oms-execute`
- `oms-review`
- `oms-verify`
- `oms-visual`
- `oms-web-test`

In direct mode, Codex instead generates `rt-<intent>.toml` agents and matching repo-local `ai-<intent>` bootstrap skills under `plugins/oh-my-superagents-codex/skills/`.

Run `oh-my-superagents sync --host codex` to materialize these into `.codex/agents/`, and to reconcile the OMS-owned marketplace entry, plugin manifest, and Codex control-plane skill bundle.
Then ask Codex to use a specific phase agent, for example:

```text
Use the oms-review agent to review the current branch
```

## Generated Qwen Artifacts

Run `oh-my-superagents sync --host qwen` to materialize Qwen artifacts into `.qwen/commands/` and `.qwen/agents/`.

In `superpowers` workflow mode this renders OMS-owned wrapper commands plus wrapper agents and still requires the upstream skills to be available in `.qwen/skills` or `.agents/skills`.
In direct mode this renders `ai-<intent>.md` commands plus `rt-<intent>.md` agents and does not require upstream skills.

Stage 2 boundaries:

- no generated `.qwen/skills`
- no host bootstrap installer
- wrapper commands plus wrapper agents only

## Generated Codex Plugin Bundle

`bootstrap --host codex`, `sync --host codex`, and `use <preset> --host codex` reconcile this OMS-owned Codex plugin surface:

- `.agents/plugins/marketplace.json`
- `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`
- `plugins/oh-my-superagents-codex/skills/<prefix-status-or-alias>/SKILL.md`
- `plugins/oh-my-superagents-codex/skills/<prefix-use-or-alias>/SKILL.md`
- `plugins/oh-my-superagents-codex/skills/<prefix-disable-or-alias>/SKILL.md`
- `plugins/oh-my-superagents-codex/skills/<prefix-sync-or-alias>/SKILL.md`
- `plugins/oh-my-superagents-codex/skills/<prefix-doctor-or-alias>/SKILL.md`

## Generated Copilot CLI Artifacts

Run `oh-my-superagents sync --host copilot` to materialize Copilot CLI artifacts.

In `superpowers` workflow mode this renders OMS phase agents in `.copilot/agents/`:
- `oms-brainstorm.agent.md`
- `oms-plan.agent.md`
- `oms-execute.agent.md`
- `oms-review.agent.md`
- `oms-verify.agent.md`
- `oms-visual.agent.md`
- `oms-web-test.agent.md`

And OMS control-plane skills in `.copilot/skills/`:
- `oms-status.md`
- `oms-use.md`
- `oms-disable.md`
- `oms-sync.md`
- `oms-doctor.md`

In direct mode this renders `rt-<intent>.agent.md` agents in `.copilot/agents/`.

`sync --host copilot` also reconciles the plugin bundle at `.copilot/plugins/oh-my-superagents-copilot/`, including `plugin.json` and `hooks.json`.

## Debian Docker Canary

Run the packaged-plugin canary in a clean Debian container:

```bash
bash scripts/run-opencode-debian-canary.sh
```

The detailed validation notes are in `docs/superpowers/specs/2026-04-09-opencode-debian-canary.md`.

## Host-Local Isolated Canary

Host-local validation is disabled for this plugin repository.
Use the Debian Docker canary instead:

```bash
bash scripts/run-opencode-debian-canary.sh
```

The disabled host-local policy is documented in `docs/superpowers/specs/2026-04-09-opencode-local-canary.md`.

## Codex Debian Canary

Run the packaged Codex canary in a clean Debian container:

```bash
bash scripts/run-codex-debian-canary.sh
```

The detailed validation notes are in `docs/superpowers/specs/2026-04-09-codex-debian-canary.md`.

## Codex Host-Local Isolated Canary

Host-local validation is disabled for this plugin repository.
Use the Debian Docker canary instead:

```bash
bash scripts/run-codex-debian-canary.sh
```

The disabled host-local policy is documented in `docs/superpowers/specs/2026-04-09-codex-local-canary.md`.

## Acknowledgments

This project builds on and is inspired by work from several projects and communities:

- **[superpowers](https://github.com/obra/superpowers)** — The upstream workflow skill system that `oh-my-superagents` routes and complements. The core design rule is to complement, never compete.
- **[oh-my-opencode](https://github.com/anomalyco/oh-my-opencode)** — The original `oh-my-*` orchestration framework in the AI CLI space, which established the naming convention and demonstrated the value of host-native routing. OMS deliberately takes a thinner approach while sharing the same ecosystem.
- **[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)** — A related ecosystem project whose Claude Code host primitives provided useful evidence of host capability. OMS references these capabilities while staying aligned with its own thin-adapter architecture.
- **[oh-my-codex](https://github.com/scalarian/oh-my-codex)** — A related ecosystem project for Codex CLI orchestration, part of the same `oh-my-*` family of AI CLI tools.
- **[OpenCode](https://github.com/anomalyco/opencode)** — The primary host platform, providing the plugin and agent system that OMS targets first.
- **[Codex](https://github.com/openai/codex)** — OpenAI's Codex CLI, a supported host platform with its own agent and plugin primitives.
- **[Qwen Code](https://github.com/QwenLM/qwen-code)** — Alibaba's Qwen Code CLI, a supported host platform.
- **[Claude Code](https://github.com/anthropics/claude-code)** — Anthropic's Claude Code CLI, a supported host platform.
- **[Copilot CLI](https://github.com/github/copilot-cli)** — GitHub Copilot CLI, a supported host platform.
- **[gstack](https://github.com/garrytan/gstack)** — A first-party workflow source with structured specialist agents, used as a workflow source adapter in OMS.

## License

[MIT](./LICENSE)
