# OpenCode Host-Local Isolated Canary

## Purpose

This canary validates the packaged `oh-my-superagents` plugin against the `opencode` binary already installed on the local machine, while isolating all OpenCode config, cache, and plugin installation state away from the user's normal environment.

## Isolation Strategy

The script creates a dedicated `.tmp/opencode-local-canary/` sandbox and overrides:

- `HOME`
- `XDG_CONFIG_HOME`
- `XDG_DATA_HOME`
- `PATH` for an isolated npm global prefix containing the packaged `oh-my-superagents` CLI

This means the canary does not read or write the user's normal `~/.config/opencode` or `~/.local/share/opencode` directories.

## What It Covers

- uses the host machine's existing `opencode` binary
- packs the local `oh-my-superagents` package with `npm pack`
- installs the packed tarball into an isolated npm prefix
- loads the plugin via OpenCode's npm plugin config path using a `file:` tarball reference
- verifies startup does not crash OpenCode for:
  - missing router config
  - invalid router config
  - valid router config
- verifies `oh-my-superagents explain --host opencode --all`
- verifies `oh-my-superagents sync --host opencode`
- verifies generated `.opencode/agents` and `.opencode/commands` files exist
- verifies OpenCode still starts after sync materializes generated files

## How To Run

```bash
bash scripts/run-opencode-local-canary.sh
```

## Notes

- the canary intentionally points the provider base URL at a dead local port so OpenCode initializes plugins and then fails fast on model execution without needing real provider credentials
- this complements the Debian Docker canary rather than replacing it
