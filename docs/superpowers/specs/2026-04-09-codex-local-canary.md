# Codex Host-Local Isolated Canary

## Purpose

This canary validates the packaged `oh-my-superagents` artifact against an isolated local Codex installation without touching any existing `~/.codex` setup.

## Isolation Strategy

The script creates a dedicated `.tmp/codex-local-canary/` sandbox and isolates:

- `HOME`
- `CODEX_HOME`
- npm global prefix and `PATH`

It installs both `@openai/codex` and the local `oh-my-superagents` tarball into that isolated npm prefix.

## What It Covers

- verifies invalid `oh-my-superagents.config.jsonc` fails with a clear JSONC error through `bootstrap --host codex`
- verifies `oh-my-superagents bootstrap --host codex`
- verifies `oh-my-superagents explain --host codex --all`
- verifies generated `.codex/agents/*.toml` files exist
- verifies generated local marketplace/plugin files exist
- verifies a second `bootstrap` succeeds
- runs `codex exec` against a dead provider endpoint and confirms Codex reaches provider connection failure instead of crashing on generated agent/config parsing

## How To Run

```bash
bash scripts/run-codex-local-canary.sh
```
