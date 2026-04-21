#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.tmp/opencode-docker-canary"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required for the Debian canary\n' >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR"/oh-my-superagents-*.tgz

printf '[canary-host] starting Debian container\n'

docker run --rm \
  -v "$ROOT_DIR:/workspace:ro" \
  -v "$ARTIFACT_DIR:/artifacts:rw" \
  debian:bookworm-slim \
  bash /workspace/scripts/docker/run-opencode-debian-canary-in-container.sh /workspace /artifacts
