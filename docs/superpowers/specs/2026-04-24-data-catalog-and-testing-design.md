# Phase 6: Data, Catalog & Testing Improvements Design

**Date:** 2026-04-24
**Status:** Design approved
**Parent:** oh-my-superagents architecture improvement (28 issues)

## Motivation

Data and testing infrastructure lag behind the code:
- Capability catalog is a stub (2 models, 1 tool)
- Onboarding questionnaire uses fragile array-index writes
- MCP client identity is hardcoded
- No end-to-end integration tests exist

## Design

### 1. Populate capability catalog

**Current:** `catalogs/oms-capabilities.json` contains 2 models and 1 tool.

**Target:** Expand to a representative production catalog with commonly used models and tools.

**Models to add:**
```json
{
  "models": {
    "backend-text": {
      "tags": ["backend", "reasoning-heavy"],
      "supports": ["text", "code"]
    },
    "vision-review": {
      "tags": ["frontend", "review"],
      "supports": ["text", "vision-input"]
    },
    "fast-iteration": {
      "tags": ["frontend", "backend", "fast"],
      "supports": ["text", "code"]
    },
    "planning-heavy": {
      "tags": ["planning", "architecture"],
      "supports": ["text", "code"]
    },
    "multimodal-analysis": {
      "tags": ["analysis", "data"],
      "supports": ["text", "vision-input", "code"]
    }
  },
  "tools": {
    "playwright": {
      "kind": "mcp",
      "tags": ["browser", "visual", "testing"]
    },
    "git-worktree": {
      "kind": "skill",
      "tags": ["version-control", "isolation"]
    },
    "filesystem": {
      "kind": "provider",
      "tags": ["io", "project-context"]
    }
  }
}
```

Each entry must pass schema validation against `schemas/oms-capability-catalog.schema.json`.

**Acceptance criteria:**
- At least 5 models and 3 tools in catalog
- Schema validation passes
- Existing catalog-dependent tests pass
- `docs-catalog.test.ts` updated for new entries

### 2. Onboarding question stable keys

**Current:** `oms-onboarding-question-graph.json` uses `"path": "policyRules[0]"` — positional
array writes that overwrite existing rules.

**Fix:** Change to ID-based addressing:

```json
{
  "questions": [
    {
      "id": "frontend-visual-verification",
      "prompt": "Do verify flows need screenshots or visual comparisons?",
      "writes": [
        {
          "path": "policyRules.visual-verification",
          "value": {
            "id": "visual-verification",
            "selector": {
              "lifecycleStage": "verify",
              "workloadTags": ["frontend"]
            },
            "policy": {
              "requiredCapabilities": ["vision-input"]
            }
          }
        }
      ]
    }
  ]
}
```

Update the `write` resolution logic in `docs-catalog.ts` (or wherever onboarding writes are
processed) to support dotted-path addressing for maps/records, not just array indices.

The `writes` processor:
1. Parse path like `policyRules.visual-verification`
2. Navigate config: `config.policyRules["visual-verification"] = value`
3. If the key exists, warn about overwrite; if absent, add

**Acceptance criteria:**
- Onboarding writes use stable key-based addressing
- Existing onboarding tests updated
- Duplicate keys warn instead of silently overwriting
- Schema updated to reflect new path format

### 3. MCP client version from package.json

**Current:** `context-provider-mcp.ts:129-130` hardcodes:
```typescript
const CLIENT_IDENTITY = { name: "oh-my-superagents", version: "0.1.0" };
```

**Fix:** Read version dynamically:

```typescript
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function getPackageVersion(): string {
  try {
    const pkgPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const CLIENT_IDENTITY = { name: "oh-my-superagents", version: getPackageVersion() };
```

Also make MCP protocol version configurable (with default `"2025-03-26"`):
```typescript
const MCP_PROTOCOL_VERSION = process.env.OMS_MCP_PROTOCOL_VERSION ?? "2025-03-26";
```

**Acceptance criteria:**
- MCP client reports actual package version
- Fallback to `"0.0.0"` if package.json unreadable
- Protocol version overridable via env var
- Existing MCP tests pass (mock package.json in test setup)

### 4. End-to-end integration tests

**Target:** Create `test/integration/` directory with tests that exercise the full CLI pipeline.

**Test scenarios:**

1. **Fresh bootstrap flow:**
   - Start with empty project directory
   - Run `oh-my-superagents sync --host opencode`
   - Verify `.opencode/agents/*.md` and `.opencode/commands/*.md` are created
   - Verify `oh-my-superagents.config.jsonc` is created with defaults
   - Run `oh-my-superagents status --host opencode` → valid JSON output
   - Run `oh-my-superagents doctor --host opencode` → exit code 0

2. **Preset switching flow:**
   - Write config with two presets
   - Run `oh-my-superagents use --host opencode my-preset`
   - Verify artifacts reflect new preset's profiles
   - Run `oh-my-superagents explain --host opencode brainstorming`
   - Verify output references correct profile

3. **Disable/reenable flow:**
   - Run `oh-my-superagents disable --host opencode`
   - Verify all OMS-owned artifacts are removed
   - Verify config has `enabled: false`
   - Run `oh-my-superagents use --host opencode default`
   - Verify artifacts are regenerated

4. **Artifact collision detection:**
   - Create a user-owned file at `.opencode/agents/spr-plan.md`
   - Run sync → verify collision warning, exit code 1
   - Remove user file → sync succeeds

5. **Config error recovery:**
   - Write malformed JSONC config
   - Run status → verify fallback to last-known-good or default
   - Verify warning emitted

**Implementation:** Use `vitest` with a real temporary directory (`fs.mkdtempSync`). Mock
external dependencies (git, network) but use real file system and subprocess execution where
possible.

**Acceptance criteria:**
- All 5 scenarios pass
- Tests clean up after themselves (temp dirs)
- Tests run in CI via `pnpm test`
- Each scenario < 2 seconds

## Non-Goals

- Browser/UI testing
- Network-dependent tests (Codex marketplace, remote fetches)
- Performance benchmarks

## Impact

- Capability catalog becomes useful for AI-assisted routing authoring
- Onboarding writes are safe and predictable
- MCP client reports correct version
- Integration tests catch regressions across the full pipeline
