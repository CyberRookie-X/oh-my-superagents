# OpenCode Debian Docker Canary

## Purpose

This canary verifies that the packaged `oh-my-superagents` artifact can be exercised inside a clean Debian container without crashing OpenCode during startup.

It validates the real packaged tarball, not just source imports.

## What It Covers

- installs `opencode-ai` in a clean Debian environment
- installs the locally packed `oh-my-superagents` tarball
- loads the plugin through OpenCode's npm plugin path using a `file:` package specifier
- verifies OpenCode stays alive for these cases:
  - router config missing
  - router config invalid JSONC
  - router config valid
- runs `oh-my-superagents explain --host opencode --all`
- runs `oh-my-superagents sync --host opencode`
- verifies generated `.opencode/agents` and `.opencode/commands` files exist
- verifies OpenCode still starts after sync materializes generated files

## What It Does Not Cover

- real provider authentication
- model execution via `opencode run`
- host-specific issues from your local machine outside Docker

## How To Run

```bash
bash scripts/run-opencode-debian-canary.sh
```

## Why This Is Useful

The canary reduces risk in three places at once:

- package layout is validated through `npm pack`
- OpenCode plugin loading is validated through the real plugin config path
- router startup behavior is validated inside an isolated filesystem and config directory

## Remaining Final Gate

Even if Docker passes, the final confidence step should still be one host-local isolated run with a dedicated `OPENCODE_CONFIG_DIR`.
