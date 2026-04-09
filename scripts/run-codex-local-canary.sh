#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANARY_ROOT="$ROOT_DIR/.tmp/codex-local-canary"
ARTIFACT_DIR="$CANARY_ROOT/artifacts"
CANARY_HOME="$CANARY_ROOT/home"
NPM_PREFIX="$CANARY_ROOT/npm-global"

log() {
  printf '[codex-local-canary] %s\n' "$*"
}

fail() {
  printf '[codex-local-canary] FAIL: %s\n' "$*" >&2
  exit 1
}

rm -rf "$CANARY_ROOT"
mkdir -p "$ARTIFACT_DIR" "$CANARY_HOME/.codex" "$NPM_PREFIX"

log "building package"
(cd "$ROOT_DIR" && npm run build >/dev/null)

pack_output="$(cd "$ROOT_DIR" && npm pack --pack-destination "$ARTIFACT_DIR")"
package_file="${pack_output##*$'\n'}"
package_path="$ARTIFACT_DIR/$package_file"

log "installing isolated Codex and oh-my-superagents"
npm install -g --prefix "$NPM_PREFIX" @openai/codex "$package_path" >/dev/null

export HOME="$CANARY_HOME"
export CODEX_HOME="$CANARY_HOME/.codex"
export PATH="$NPM_PREFIX/bin:$PATH"

cat >"$CODEX_HOME/config.toml" <<'EOF'
model = "gpt-5.4"
openai_base_url = "http://127.0.0.1:9/v1"
approval_policy = "never"
sandbox_mode = "workspace-write"
EOF

command -v codex >/dev/null || fail "isolated codex install failed"
command -v oh-my-superagents >/dev/null || fail "isolated oh-my-superagents install failed"

make_case_dir() {
  local case_name="$1"
  local case_dir="$CANARY_ROOT/cases/$case_name"
  mkdir -p "$case_dir/project"
  git -C "$case_dir/project" init -q
  printf '%s\n' "$case_dir"
}

run_bootstrap_checks() {
  local case_dir="$1"

  log "running oh-my-superagents bootstrap and explain"
  (
    cd "$case_dir/project"
    oh-my-superagents bootstrap --host codex >"$case_dir/bootstrap.json"
    oh-my-superagents explain --host codex --all >"$case_dir/explain.json"
  )

  grep -q '"nextSteps"' "$case_dir/bootstrap.json" \
    || fail "bootstrap output did not include next steps"

  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!Array.isArray(data) || data.length !== 7) process.exit(1);" "$case_dir/explain.json" \
    || fail "explain output did not contain the full phase set"

  [ -f "$case_dir/project/.codex/agents/oms-review.toml" ] || fail "missing generated Codex agent"
  grep -q "generated-by: oh-my-superagents" "$case_dir/project/.codex/agents/oms-review.toml" \
    || fail "generated Codex agent is missing ownership marker"

  [ -f "$case_dir/project/.agents/plugins/marketplace.json" ] || fail "missing generated Codex marketplace"
  [ -f "$case_dir/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json" ] || fail "missing generated Codex plugin manifest"
  [ -f "$case_dir/project/plugins/oh-my-superagents-codex/skills/oh-my-superagents-sync/SKILL.md" ] || fail "missing generated Codex sync skill"
  [ -f "$case_dir/project/plugins/oh-my-superagents-codex/skills/oh-my-superagents-doctor/SKILL.md" ] || fail "missing generated Codex doctor skill"

  node -e "const fs=require('fs'); const market=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const plugin=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const hasEntry=(market.plugins||[]).some((item)=>item.name==='oh-my-superagents-codex'); if(!hasEntry) process.exit(1); if(plugin.name!=='oh-my-superagents-codex') process.exit(2);" "$case_dir/project/.agents/plugins/marketplace.json" "$case_dir/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json" \
    || fail "generated Codex marketplace or plugin manifest could not be parsed"

  grep -q "oh-my-superagents sync --host codex --config" "$case_dir/project/plugins/oh-my-superagents-codex/skills/oh-my-superagents-sync/SKILL.md" \
    || fail "generated Codex sync skill is missing the expected command"

  (
    cd "$case_dir/project"
    oh-my-superagents bootstrap --host codex >"$case_dir/bootstrap-second.json"
  ) || fail "second Codex bootstrap was not idempotent"
}

run_exec_probe() {
  local case_name="$1"
  local case_dir="$2"
  local status=0

  log "starting Codex case: $case_name"
  (
    cd "$case_dir/project"
    OPENAI_API_KEY=dummy \
    timeout 20s codex exec --skip-git-repo-check --json "Use the oms-review agent to review the current repository in one sentence." \
      >"$case_dir/codex.stdout" \
      2>"$case_dir/codex.stderr"
  ) || status=$?

  if [ "$status" -ne 124 ]; then
    cat "$case_dir/codex.stderr" >&2 || true
    cat "$case_dir/codex.stdout" >&2 || true
    fail "expected provider-timeout smoke result for $case_name, got status $status"
  fi

  grep -q '"type":"thread.started"' "$case_dir/codex.stdout" \
    || fail "Codex did not start an execution thread for $case_name"

  grep -q "Connection refused" "$case_dir/codex.stderr" \
    || fail "Codex did not reach the expected dead provider path for $case_name"

  if grep -qiE "unknown agent|parse error|toml" "$case_dir/codex.stderr"; then
    cat "$case_dir/codex.stderr" >&2 || true
    fail "Codex reported an agent/config parsing error for $case_name"
  fi
}

invalid_case="$(make_case_dir invalid-router-config)"
cat >"$invalid_case/project/oh-my-superagents.config.jsonc" <<'EOF'
{
  "profiles": { "review": { "model": "gpt-5.4" } },
  "routes": { "requesting-code-review": "review" }
EOF

if (
  cd "$invalid_case/project"
  oh-my-superagents bootstrap --host codex >"$invalid_case/bootstrap.json" 2>"$invalid_case/bootstrap.stderr"
); then
  fail "invalid Codex config unexpectedly synced"
fi

grep -q "Invalid JSONC" "$invalid_case/bootstrap.stderr" \
  || fail "invalid Codex config did not report JSONC parse failure"

valid_case="$(make_case_dir valid-router-config)"
cat >"$valid_case/project/oh-my-superagents.config.jsonc" <<'EOF'
{
  "profiles": {
    "strategy": {
      "model": "gpt-5.4",
      "effort": "deep"
    },
    "build": {
      "model": "gpt-5.3-codex-spark",
      "effort": "fast"
    }
  },
  "routes": {
    "brainstorming": "strategy"
  },
  "defaultRoute": "build"
}
EOF

run_bootstrap_checks "$valid_case"
run_exec_probe "valid router config after sync" "$valid_case"

log "Codex local isolated canary completed successfully"
