# oh-my-superagents

Thin routing for `superpowers` on OpenCode and Codex.

## What It Does

- Reads `oh-my-superagents.config.jsonc`
- Resolves built-in `superpowers` phases to profiles
- Generates `.opencode/agents/*.md` and `.opencode/commands/*.md`
- Generates `.codex/agents/*.toml`
- Exposes `sync` and `explain` CLIs
- Ships a minimal OpenCode plugin entrypoint for startup diagnostics

## Install

Install upstream `superpowers` separately, then add `oh-my-superagents` to your OpenCode plugin list.

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

## Generated Commands

- `/sp-brainstorm`
- `/sp-plan`
- `/sp-execute`
- `/sp-review`
- `/sp-verify`
- `/sp-visual`
- `/sp-web-test`

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
