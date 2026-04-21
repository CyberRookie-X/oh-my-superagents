#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' 'Docker-only validation policy: host-local canaries are disabled for this plugin repository.' >&2
printf '%s\n' 'Run bash scripts/run-codex-debian-canary.sh instead.' >&2
exit 1
