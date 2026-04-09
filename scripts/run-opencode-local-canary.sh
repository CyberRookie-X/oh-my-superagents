#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANARY_ROOT="$ROOT_DIR/.tmp/opencode-local-canary"
ARTIFACT_DIR="$CANARY_ROOT/artifacts"
CANARY_HOME="$CANARY_ROOT/home"
NPM_PREFIX="$CANARY_ROOT/npm-global"

log() {
  printf '[local-canary] %s\n' "$*"
}

fail() {
  printf '[local-canary] FAIL: %s\n' "$*" >&2
  exit 1
}

if ! command -v opencode >/dev/null 2>&1; then
  fail "opencode must already be installed on this machine"
fi

rm -rf "$CANARY_ROOT"
mkdir -p "$ARTIFACT_DIR" "$CANARY_HOME" "$NPM_PREFIX"

log "building package"
(cd "$ROOT_DIR" && npm run build >/dev/null)

pack_output="$(cd "$ROOT_DIR" && npm pack --pack-destination "$ARTIFACT_DIR")"
package_file="${pack_output##*$'\n'}"
package_path="$ARTIFACT_DIR/$package_file"

log "installing isolated router CLI"
npm install -g --prefix "$NPM_PREFIX" "$package_path" >/dev/null

export HOME="$CANARY_HOME"
export XDG_CONFIG_HOME="$CANARY_HOME/.config"
export XDG_DATA_HOME="$CANARY_HOME/.local/share"
export PATH="$NPM_PREFIX/bin:$PATH"

mkdir -p "$XDG_CONFIG_HOME/opencode"

cat >"$XDG_CONFIG_HOME/opencode/opencode.json" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["file:${package_path}"],
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

make_case_dir() {
  local case_name="$1"
  local case_dir="$CANARY_ROOT/cases/$case_name"
  mkdir -p "$case_dir/project"
  git -C "$case_dir/project" init -q
  printf '%s\n' "$case_dir"
}

start_opencode_case() {
  local case_name="$1"
  local case_dir="$2"
  local expected_log="$3"
  local status=0

  log "starting OpenCode case: $case_name"
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

log "Local isolated canary completed successfully"
