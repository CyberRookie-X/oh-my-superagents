# Codex Debian Docker Canary

## Purpose

This canary verifies that the packaged `oh-my-superagents` artifact can be exercised inside a clean Debian container together with the Codex CLI, without relying on any host-local Codex installation.

## What It Covers

- installs `@openai/codex` in a clean Debian environment
- installs the locally packed `oh-my-superagents` tarball
- verifies invalid `oh-my-superagents.config.jsonc` fails with a clear JSONC error through `bootstrap --host codex`
- verifies `oh-my-superagents bootstrap --host codex`
- verifies `oh-my-superagents explain --host codex --all`
- verifies generated `.codex/agents/*.toml` files exist
- verifies generated local marketplace/plugin files exist
- verifies a second `bootstrap` succeeds, proving Codex convenience scaffolding is idempotent
- runs `codex exec` against a dead local provider endpoint and confirms Codex reaches provider connection failure instead of crashing on generated agent/config parsing

## Why The Dead Provider Is Intentional

The canary points Codex at `http://127.0.0.1:9/v1` with a dummy API key.
This gives a reliable smoke signal:

- if generated Codex config or agents are invalid, Codex fails earlier with parsing/config errors
- if the host integration is healthy, Codex starts a thread and then fails only when it tries to contact the dead provider

That keeps the canary independent of real credentials while still validating the Codex startup and execution path.

## How To Run

```bash
bash scripts/run-codex-debian-canary.sh
```
