# oh-my-superagents

Thin routing and host-local OMS control-plane support for `superpowers` on OpenCode, Codex, and Qwen.

## Scope

`oh-my-superagents` only targets hosts where `superpowers` still lacks a thin, host-native routing layer.
It is not a cross-host configuration sync tool.
The supported surface for this early release is the CLI, generated host artifacts, packaged plugin entrypoints, the Stage 1 OMS control plane, the Stage 2 Qwen adapter, and the current `oh-my-superagents/library` export surface.

Today that means:

- OpenCode: supported
- Codex: supported
- Qwen: supported with a limited Stage 2 surface
- Claude Code: intentionally out of scope for now because Claude already provides strong native subagents, per-agent model selection, effort controls, and plugin distribution

## What It Does

- Reads layered `oh-my-superagents.config.jsonc` from global and project locations
- Resolves built-in `superpowers` phases to profiles from the active preset
- Generates `.opencode/agents/*.md` and `.opencode/commands/*.md`
- Generates `.codex/agents/*.toml`
- Generates `.qwen/agents/*.md` and `.qwen/commands/*.md`
- Exposes `status`, `use`, `disable`, `sync`, `doctor`, `explain`, and `bootstrap` CLIs
- Ships a minimal OpenCode plugin entrypoint for startup diagnostics

## Install

Install upstream `superpowers` separately, then use the host-specific flow you need:

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

Notes:

- This single file can define multiple presets and switch between them with `status`, `use`, and `disable`.
- Without `--config`, OMS layers global config at `~/.config/oh-my-superagents/config.jsonc` under the project file. Project settings override global settings, project presets replace same-named global presets, and project command entries replace same-named global command entries before missing defaults are synthesized.
- Legacy single-preset router configs are still read and migrated into `presets.default`, but do not mix legacy top-level keys with `settings` or `presets`.
- For `--host codex`, use Codex-compatible model ids in profiles, such as `gpt-5.4` or `gpt-5.3-codex-spark`. The Codex adapter does not translate arbitrary OpenCode provider/model ids.
- For `--host qwen`, use Qwen-compatible model ids in profiles such as `qwen/qwen3-coder-30b` or `qwen/qwen3-coder-480b`.

## OMS Control Plane

Stage 1 adds host-local control-plane commands:

- `oh-my-superagents status --host <opencode|codex|qwen>`
- `oh-my-superagents use <preset-or-short> --host <opencode|codex|qwen>`
- `oh-my-superagents disable --host <opencode|codex|qwen>`
- `oh-my-superagents sync --host <opencode|codex|qwen>`
- `oh-my-superagents doctor --host <opencode|codex|qwen>`

Behavior notes:

- `status` and `doctor` can fall back to the built-in default config when no real config file exists.
- `use` and `disable` can create the first real layered control-plane config when none exists yet. `sync` still requires a real config source unless you pass an explicit `--config` path.
- `use` accepts either the preset key or its unique `short` alias.
- `disable` and disabled `sync` remove OMS-owned artifacts for the invoking host only. For example, `--host opencode` cleans up `.opencode/*` artifacts and leaves `.codex/*` and `.qwen/*` alone.
- For `--host codex`, the OMS-managed surface includes `.codex/agents/*.toml`, the OMS marketplace entry inside `.agents/plugins/marketplace.json`, `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`, and OMS control-plane skills under `plugins/oh-my-superagents-codex/skills/*/SKILL.md`.
- For `--host qwen`, the OMS-managed surface includes both `.qwen/commands/*.md` and `.qwen/agents/*.md`.
- Artifact inspection in `status` and `doctor` is also invoking-host-only.

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

Stage 2 Qwen support is intentionally narrow:

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

Use `--config /absolute/or/relative/path.jsonc` to override config discovery.

For Codex, `sync` and `use` reconcile the full OMS-owned Stage 1 surface: `.codex/agents/*.toml`, the OMS marketplace entry, `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`, and OMS control-plane skills under `plugins/oh-my-superagents-codex/skills/*/SKILL.md`.

For Qwen in Stage 2, `sync` materializes both OMS command wrappers in `.qwen/commands/` and OMS wrapper agents in `.qwen/agents/` when the required upstream skills are available. It does not run a Codex-style bootstrap or install upstream skills for you.

## Explain

```bash
oh-my-superagents explain --host opencode --all
```

```bash
oh-my-superagents explain --host codex --all
```

`explain` is currently limited to `--host opencode` and `--host codex` in v1.

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

Compatibility results surface in JSON output from `sync`, `explain`, and `bootstrap`.
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

- `oms-brainstorm`
- `oms-plan`
- `oms-execute`
- `oms-review`
- `oms-verify`
- `oms-visual`
- `oms-web-test`

Run `oh-my-superagents sync --host codex` to materialize these into `.codex/agents/`, and to reconcile the OMS-owned marketplace entry, plugin manifest, and Codex control-plane skill bundle.
Then ask Codex to use a specific phase agent, for example:

```text
Use the oms-review agent to review the current branch
```

## Generated Qwen Artifacts

Run `oh-my-superagents sync --host qwen` to materialize OMS-owned Qwen command wrappers into `.qwen/commands/` and OMS wrapper agents into `.qwen/agents/`.

This requires the upstream skills to be available in `.qwen/skills` or `.agents/skills`.

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

## Debian Docker Canary

Run the packaged-plugin canary in a clean Debian container:

```bash
bash scripts/run-opencode-debian-canary.sh
```

The detailed validation notes are in `docs/superpowers/specs/2026-04-09-opencode-debian-canary.md`.

## Host-Local Isolated Canary

Run the local-machine isolated canary without touching your normal OpenCode home/config:

```bash
bash scripts/run-opencode-local-canary.sh
```

The detailed validation notes are in `docs/superpowers/specs/2026-04-09-opencode-local-canary.md`.

## Codex Debian Canary

Run the packaged Codex canary in a clean Debian container:

```bash
bash scripts/run-codex-debian-canary.sh
```

The detailed validation notes are in `docs/superpowers/specs/2026-04-09-codex-debian-canary.md`.

## Codex Host-Local Isolated Canary

Run the local-machine isolated Codex canary without touching your normal `~/.codex`:

```bash
bash scripts/run-codex-local-canary.sh
```

The detailed validation notes are in `docs/superpowers/specs/2026-04-09-codex-local-canary.md`.
