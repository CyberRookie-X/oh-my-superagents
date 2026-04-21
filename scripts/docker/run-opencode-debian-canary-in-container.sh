#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${1:?workspace root required}"
ARTIFACT_DIR="${2:?artifact dir required}"
CANARY_ROOT="$(mktemp -d /tmp/opencode-canary.XXXXXX)"
GLOBAL_OPENCODE_DIR=/root/.config/opencode

log() {
  printf '[canary] %s\n' "$*"
}

fail() {
  printf '[canary] FAIL: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

export DEBIAN_FRONTEND=noninteractive
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

log "installing system packages"
apt-get update >/dev/null
apt-get install -y --no-install-recommends curl ca-certificates git bash xz-utils unzip >/dev/null

log "installing Node.js"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
apt-get install -y --no-install-recommends nodejs >/dev/null

log "enabling Corepack and pnpm"
corepack enable >/dev/null

log "building package inside container"
(cd "$WORKSPACE_ROOT" && pnpm run build >/dev/null)

pack_output="$(cd "$WORKSPACE_ROOT" && pnpm pack --pack-destination "$ARTIFACT_DIR")"
package_file="${pack_output##*$'\n'}"
PACKAGE_TGZ="$ARTIFACT_DIR/$package_file"

log "installing Bun"
curl -fsSL https://bun.sh/install | bash >/dev/null
export BUN_INSTALL=/root/.bun
export PATH="$BUN_INSTALL/bin:$PATH"

log "installing OpenCode and packaged plugin tarball"
npm install -g opencode-ai "$PACKAGE_TGZ" >/dev/null

opencode --version >/dev/null
command -v oh-my-superagents >/dev/null

write_opencode_config() {
  mkdir -p "$GLOBAL_OPENCODE_DIR"

  cat >"$GLOBAL_OPENCODE_DIR/opencode.json" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["file:${PACKAGE_TGZ}"],
  "autoupdate": false,
  "model": "openai/gpt-4o-mini",
  "provider": {
    "openai": {
      "options": {
        "apiKey": "dummy",
        "baseURL": "http://127.0.0.1:9/v1"
      }
    }
  },
  "watcher": {
    "ignore": ["node_modules/**", "dist/**", ".git/**"]
  }
}
EOF
}

start_opencode_case() {
  local case_name="$1"
  local case_dir="$2"
  local expected_log="$3"

  cleanup

  log "starting OpenCode case: $case_name"
  local status=0
  (
    cd "$case_dir/project"
    OPENCODE_DISABLE_AUTOUPDATE=true \
    OPENCODE_DISABLE_MODELS_FETCH=true \
    OPENCODE_DISABLE_LSP_DOWNLOAD=true \
    timeout 30s opencode --print-logs --log-level INFO run --format json "plugin smoke test" \
      >"$case_dir/stdout.log" \
      2>"$case_dir/stderr.log"
  ) || status=$?

  if [ "$status" -gt 128 ] && [ "$status" -ne 124 ]; then
    cat "$case_dir/stderr.log" >&2 || true
    fail "OpenCode terminated abnormally for $case_name (status $status)"
  fi

  if ! grep -q "$expected_log" "$case_dir/stderr.log"; then
    cat "$case_dir/stderr.log" >&2 || true
    fail "expected log '$expected_log' was not observed for $case_name"
  fi
}

run_cli_checks() {
  local case_dir="$1"

  log "running router CLI checks"
  (
    cd "$case_dir/project"
    oh-my-superagents explain --host opencode --all >"$case_dir/explain.json"
    oh-my-superagents sync --host opencode >"$case_dir/sync.json"
  )

  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!Array.isArray(data) || data.length !== 7) process.exit(1);" "$case_dir/explain.json" \
    || fail "explain output did not contain the full phase set"

  [ -f "$case_dir/project/.opencode/agents/spr-build.md" ] || fail "missing generated agent file"
  [ -f "$case_dir/project/.opencode/commands/sp-review.md" ] || fail "missing generated command file"
}

make_case_dir() {
  local case_name="$1"
  local case_dir="$CANARY_ROOT/$case_name"
  mkdir -p "$case_dir/project"
  git -C "$case_dir/project" init -q
  write_opencode_config
  printf '%s\n' "$case_dir"
}

missing_case="$(make_case_dir missing-router-config)"
start_opencode_case "missing router config" "$missing_case" "Missing config. Run: oh-my-superagents sync --host opencode"

invalid_case="$(make_case_dir invalid-router-config)"
cat >"$invalid_case/project/oh-my-superagents.config.jsonc" <<'EOF'
{
  "profiles": { "build": { "model": "openai/gpt-5" } },
  "routes": { "brainstorming": "build" }
EOF
start_opencode_case "invalid router config" "$invalid_case" "Invalid config. Invalid JSONC"

valid_case="$(make_case_dir valid-router-config)"
cat >"$valid_case/project/oh-my-superagents.config.jsonc" <<'EOF'
{
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
EOF
start_opencode_case "valid router config" "$valid_case" "router config loaded"
run_cli_checks "$valid_case"
start_opencode_case "valid router config after sync" "$valid_case" "router config loaded"

log "Debian canary completed successfully"
