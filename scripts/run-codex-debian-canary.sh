#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.tmp/codex-docker-canary"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required for the Codex Debian canary\n' >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR"/oh-my-superagents-*.tgz

printf '[codex-canary-host] building package\n'
(cd "$ROOT_DIR" && npm run build >/dev/null)

pack_output="$(cd "$ROOT_DIR" && npm pack --pack-destination "$ARTIFACT_DIR")"
package_file="${pack_output##*$'\n'}"
package_path="/artifacts/$package_file"

printf '[codex-canary-host] package: %s\n' "$package_file"
printf '[codex-canary-host] starting Debian container\n'

docker run --rm \
  -v "$ROOT_DIR:/workspace:ro" \
  -v "$ARTIFACT_DIR:/artifacts:rw" \
  debian:bookworm-slim \
  bash /workspace/scripts/docker/run-codex-debian-canary-in-container.sh "$package_path"
