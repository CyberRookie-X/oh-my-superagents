# OpenCode Host-Local Canary Disabled

## Purpose

Host-local validation is disabled for this plugin repository because the current development host is itself one of the plugin runtime targets, and repository-level verification must not risk mutating the machine's OpenCode environment.

## Required Path

Run the Debian Docker canary instead:

```bash
bash scripts/run-opencode-debian-canary.sh
```

## Why It Is Disabled

- the repository is developed from inside OpenCode, so host-local validation can break the active development host
- isolating `HOME` is not enough when the plugin target and the development agent share the same machine lifecycle
- Debian Docker canaries already provide the safer validation boundary for this repository

## Script Behavior

`scripts/run-opencode-local-canary.sh` now exits immediately with a message that points maintainers to the Debian Docker canary.
