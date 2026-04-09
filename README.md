# oh-my-superagents

Thin routing for `superpowers` on OpenCode and Codex.

## Scope

`oh-my-superagents` only targets hosts where `superpowers` still lacks a thin, host-native routing layer.
It is not a cross-host configuration sync tool.
The supported surface for this early release is the CLI, generated host artifacts, packaged plugin entrypoints, and the current `oh-my-superagents/library` export surface.

Today that means:

- OpenCode: supported
- Codex: supported
- Claude Code: intentionally out of scope for now because Claude already provides strong native subagents, per-agent model selection, effort controls, and plugin distribution

## What It Does

- Reads `oh-my-superagents.config.jsonc`
- Resolves built-in `superpowers` phases to profiles
- Generates `.opencode/agents/*.md` and `.opencode/commands/*.md`
- Generates `.codex/agents/*.toml`
- Exposes `sync`, `explain`, and `bootstrap` CLIs
- Ships a minimal OpenCode plugin entrypoint for startup diagnostics

## Install

Install upstream `superpowers` separately, then use the host-specific flow you need:

- OpenCode: add `oh-my-superagents` to your OpenCode plugin list
- Codex: use the packaged CLI to run `bootstrap --host codex`

For ad-hoc local use of the CLI, run it with `npx` or from your local `node_modules/.bin`:

```bash
npx oh-my-superagents sync --host opencode
```

Create `oh-my-superagents.config.jsonc` in your project root:

```jsonc
{
  "$schema": "./node_modules/oh-my-superagents/schemas/oh-my-superagents.schema.json",
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
}
```

For `--host codex`, use Codex-compatible model ids in profiles, such as `gpt-5.4` or `gpt-5.3-codex-spark`.
The Codex adapter does not translate arbitrary OpenCode provider/model ids.

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

After bootstrap completes:

1. restart Codex
2. open the plugin directory
3. install `oh-my-superagents-codex` from the local marketplace

The installed plugin adds Codex-native skill entrypoints for resync and diagnostics, but routing truth still lives in `oh-my-superagents.config.jsonc` plus `sync --host codex`.

## Sync

```bash
oh-my-superagents sync --host opencode
```

```bash
oh-my-superagents sync --host codex
```

Use `--config /absolute/or/relative/path.jsonc` to override config discovery.

## Explain

```bash
oh-my-superagents explain --host opencode --all
```

```bash
oh-my-superagents explain --host codex --all
```

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
  "superpowersCompatibility": {
    "mode": "warn"
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

## Generated Codex Agents

- `oms-brainstorm`
- `oms-plan`
- `oms-execute`
- `oms-review`
- `oms-verify`
- `oms-visual`
- `oms-web-test`

Run `oh-my-superagents sync --host codex` to materialize these into `.codex/agents/`.
Then ask Codex to use a specific phase agent, for example:

```text
Use the oms-review agent to review the current branch
```

## Generated Codex Plugin Bundle

`bootstrap --host codex` also scaffolds:

- `.agents/plugins/marketplace.json`
- `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`
- `plugins/oh-my-superagents-codex/skills/oh-my-superagents-sync/SKILL.md`
- `plugins/oh-my-superagents-codex/skills/oh-my-superagents-doctor/SKILL.md`

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
