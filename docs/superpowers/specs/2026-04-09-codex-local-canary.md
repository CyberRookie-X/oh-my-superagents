# Codex Host-Local Canary Disabled

## Purpose

Host-local validation is disabled for this plugin repository because repository-level verification must not execute plugin validation directly on the same machine that is running the development agent.

## Required Path

Run the Debian Docker canary instead:

```bash
bash scripts/run-codex-debian-canary.sh
```

## Why It Is Disabled

- host-local isolation is no longer considered sufficient protection for this plugin repository
- repository verification must stay inside a disposable Debian container boundary
- the Debian Docker canary remains the supported validation path for Codex integration

## Script Behavior

`scripts/run-codex-local-canary.sh` now exits immediately with a message that points maintainers to the Debian Docker canary.
