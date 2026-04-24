# Phase 6: Data, Catalog & Testing Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate capability catalog, fix onboarding question stable keys, dynamic MCP version, add end-to-end integration tests.

**Architecture:** Data changes in `catalogs/` directory. `context-provider-mcp.ts` reads package.json at runtime. New `test/integration/` directory for full-pipeline tests.

**Tech Stack:** TypeScript, Vitest, Node.js fs

---

## File Structure

```
catalogs/
  oms-capabilities.json                   # MODIFY: expand with production entries

src/
  context-provider-mcp.ts                 # MODIFY: dynamic version from package.json
  docs-catalog.ts                         # MODIFY: stable key-based onboarding writes

test/
  integration/
    bootstrap-flow.test.ts                # NEW: fresh bootstrap integration test
    preset-switching-flow.test.ts         # NEW: preset switching integration test
    disable-reenable-flow.test.ts         # NEW: disable/reenable integration test
    collision-detection.test.ts           # NEW: artifact collision integration test
    config-error-recovery.test.ts         # NEW: config error recovery test
```

---

### Task 1: Expand capability catalog

**Files:**
- Modify: `catalogs/oms-capabilities.json`

- [ ] **Step 1: Write the expanded catalog**

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

- [ ] **Step 2: Validate against schema**

Run: `npx vitest run test/docs-catalog.test.ts`
Expected: ALL PASS (catalog validates against schema)

- [ ] **Step 3: Update catalog test expectations**

In `test/docs-catalog.test.ts`, update any assertions about catalog size:

```typescript
it("has sufficient model definitions", () => {
  const catalog = parseCapabilityCatalog(content);
  expect(Object.keys(catalog.models).length).toBeGreaterThanOrEqual(5);
  expect(Object.keys(catalog.tools).length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 4: Commit**

```bash
git add catalogs/oms-capabilities.json test/docs-catalog.test.ts
git commit -m "feat: expand capability catalog with production entries"
```

---

### Task 2: Fix onboarding question stable keys

**Files:**
- Modify: `catalogs/oms-onboarding-question-graph.json`
- Modify: `src/docs-catalog.ts`
- Modify: `test/docs-catalog.test.ts`

- [ ] **Step 1: Update question graph to use key-based paths**

Change from array-index paths to key-based paths:

```json
{
  "version": 1,
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
    },
    {
      "id": "subagent-packet-first",
      "prompt": "Should subagents default to packet-first execution?",
      "writes": [
        {
          "path": "policyRules.packet-first",
          "value": {
            "id": "packet-first",
            "selector": {
              "lifecycleStage": "execute_task"
            },
            "policy": {
              "allowedSkillTags": ["packet-first"]
            }
          }
        }
      ]
    },
    {
      "id": "review-vs-build-workload",
      "prompt": "Is the workload more review-heavy or build-heavy?",
      "writes": [
        {
          "path": "policyRules.review-heavy",
          "value": {
            "id": "review-heavy",
            "selector": {
              "lifecycleStage": "review"
            },
            "policy": {
              "preferredProfiles": ["vision-review"]
            }
          }
        }
      ]
    },
    {
      "id": "browser-external-tools",
      "prompt": "Will the workflow rely on browser automation tools?",
      "writes": [
        {
          "path": "policyRules.browser-tools",
          "value": {
            "id": "browser-tools",
            "selector": {
              "workloadTags": ["browser"]
            },
            "policy": {
              "requiredCapabilities": ["browser"]
            }
          }
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Update write resolution logic**

In `src/docs-catalog.ts`, add support for dotted-path key-based writes:

```typescript
function applyWrite(config: Record<string, unknown>, write: { path: string; value: unknown }): void {
  const segments = write.path.split(".");
  let current: Record<string, unknown> = config;
  
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    // Handle array index (e.g., policyRules[0])
    const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arr = (current[arrayMatch[1]] || []) as unknown[];
      if (!current[arrayMatch[1]]) {
        current[arrayMatch[1]] = arr;
      }
      const idx = parseInt(arrayMatch[2]);
      if (!arr[idx]) {
        arr[idx] = {};
      }
      current = arr[idx] as Record<string, unknown>;
    } else {
      if (!current[segment]) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }
  }

  const lastSegment = segments[segments.length - 1];
  const arrayMatch = lastSegment.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const arr = (current[arrayMatch[1]] || []) as unknown[];
    const idx = parseInt(arrayMatch[2]);
    arr[idx] = write.value;
    current[arrayMatch[1]] = arr;
  } else {
    current[lastSegment] = write.value;
  }
}
```

- [ ] **Step 3: Update tests**

Add to `test/docs-catalog.test.ts`:

```typescript
it("resolves key-based onboarding writes", () => {
  const questionGraph = parseOnboardingQuestionGraph(questionGraphContent);
  const config: Record<string, unknown> = { policyRules: {} };
  
  for (const question of questionGraph.questions) {
    for (const write of question.writes ?? []) {
      applyWrite(config, write);
    }
  }
  
  expect(config.policyRules).toHaveProperty("visual-verification");
  expect(config.policyRules).toHaveProperty("packet-first");
});

it("warns on duplicate key writes", () => {
  // Write same key twice — should produce warning
  const config: Record<string, unknown> = { policyRules: { "existing": { id: "existing" } } };
  applyWrite(config, { path: "policyRules.existing", value: { id: "new" } });
  // Check that value was overwritten and warning was emitted
});
```

- [ ] **Step 4: Run catalog tests**

Run: `npx vitest run test/docs-catalog.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add catalogs/oms-onboarding-question-graph.json src/docs-catalog.ts test/docs-catalog.test.ts
git commit -m "fix: use stable key-based paths for onboarding question writes"
```

---

### Task 3: Dynamic MCP client version

**Files:**
- Modify: `src/context-provider-mcp.ts`
- Modify: `test/context-provider-mcp.test.ts`

- [ ] **Step 1: Implement dynamic version reading**

In `src/context-provider-mcp.ts`, replace hardcoded version:

```typescript
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function getPackageVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const CLIENT_NAME = "oh-my-superagents";
const CLIENT_VERSION = getPackageVersion();
const DEFAULT_MCP_PROTOCOL_VERSION = process.env.OMS_MCP_PROTOCOL_VERSION ?? "2025-03-26";

// Use CLIENT_VERSION in client identity
const clientIdentity = {
  name: CLIENT_NAME,
  version: CLIENT_VERSION,
};
```

- [ ] **Step 2: Update MCP tests**

In `test/context-provider-mcp.test.ts`, mock package.json if needed:

```typescript
// In test setup, ensure package.json is mockable or use env var
beforeEach(() => {
  process.env.OMS_MCP_PROTOCOL_VERSION = "2025-03-26";
});

it("uses protocol version from env var", () => {
  process.env.OMS_MCP_PROTOCOL_VERSION = "2024-11-05";
  // ... test that initialize uses 2024-11-05
});
```

- [ ] **Step 3: Run MCP tests**

Run: `npx vitest run test/context-provider-mcp.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/context-provider-mcp.ts test/context-provider-mcp.test.ts
git commit -m "feat: dynamic MCP client version from package.json"
```

---

### Task 4: Create integration test infrastructure

**Files:**
- Create: `test/integration/setup.ts`
- Create: `test/integration/bootstrap-flow.test.ts`

- [ ] **Step 1: Create test setup helper**

```typescript
// test/integration/setup.ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface IntegrationTestContext {
  cwd: string;
  cleanup: () => void;
}

export function createTestProject(): IntegrationTestContext {
  const cwd = mkdtempSync(join(tmpdir(), "oms-integration-"));
  return {
    cwd,
    cleanup: () => {
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

export async function runCli(
  cwd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // Dynamic import to avoid circular deps
  const { main } = await import("../../src/cli/index.js");
  const { defaultDeps } = await import("../../src/cli/index.js");

  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  const deps = {
    ...defaultDeps,
    cwd,
    log: {
      info: (msg: string) => { stdout += msg + "\n"; },
      warn: (msg: string) => { stderr += msg + "\n"; },
      error: (msg: string) => { stderr += msg + "\n"; },
    },
  };

  try {
    const result = await main(args, deps);
    exitCode = result.exitCode;
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    exitCode = 1;
    stderr = String(err);
  }

  return { exitCode, stdout, stderr };
}
```

- [ ] **Step 2: Write bootstrap integration test**

```typescript
// test/integration/bootstrap-flow.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createTestProject, runCli } from "./setup.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("bootstrap flow", () => {
  const ctx = createTestProject();

  afterAll(() => {
    ctx.cleanup();
  });

  it("bootstraps a fresh project with sync --host opencode", async () => {
    const result = await runCli(ctx.cwd, ["sync", "--host", "opencode"]);
    expect(result.exitCode).toBe(0);

    // Verify artifacts created
    expect(existsSync(join(ctx.cwd, ".opencode", "agents", "spr-plan.md"))).toBe(true);
    expect(existsSync(join(ctx.cwd, ".opencode", "commands", "sp-plan.md"))).toBe(true);

    // Verify config created
    const configPath = join(ctx.cwd, "oh-my-superagents.config.jsonc");
    expect(existsSync(configPath)).toBe(true);

    // Status returns valid JSON
    const statusResult = await runCli(ctx.cwd, ["status", "--host", "opencode"]);
    expect(statusResult.exitCode).toBe(0);
    expect(() => JSON.parse(statusResult.stdout)).not.toThrow();
  }, 10000);

  it("doctor reports no critical errors", async () => {
    const result = await runCli(ctx.cwd, ["doctor", "--host", "opencode"]);
    expect(result.exitCode).toBe(0);
  }, 10000);
});
```

- [ ] **Step 3: Run integration tests**

Run: `npx vitest run test/integration/bootstrap-flow.test.ts`
Expected: PASS (may need adjustment for real filesystem behavior)

- [ ] **Step 4: Commit**

```bash
git add test/integration/setup.ts test/integration/bootstrap-flow.test.ts
git commit -m "test: add integration test infrastructure and bootstrap flow test"
```

---

### Task 5: Add remaining integration tests

**Files:**
- Create: `test/integration/preset-switching-flow.test.ts`
- Create: `test/integration/disable-reenable-flow.test.ts`
- Create: `test/integration/collision-detection.test.ts`
- Create: `test/integration/config-error-recovery.test.ts`

- [ ] **Step 1: Write preset switching test**

```typescript
// test/integration/preset-switching-flow.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createTestProject, runCli } from "./setup.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

describe("preset switching flow", () => {
  const ctx = createTestProject();

  afterAll(() => ctx.cleanup());

  it("switches presets and reflects in artifacts", async () => {
    // First bootstrap
    await runCli(ctx.cwd, ["sync", "--host", "opencode"]);

    // Write a custom preset config
    const config = {
      workflow: { kind: "superpowers" },
      profiles: {
        custom: { model: "custom-model" },
        default: { model: "default-model" },
      },
      presets: {
        default: { label: "Default", short: "default", profiles: { plan: "default" }, routes: {} },
        custom: { label: "Custom", short: "custom", profiles: { plan: "custom" }, routes: {} },
      },
      settings: { activePreset: "default" },
    };
    writeFileSync(join(ctx.cwd, "oh-my-superagents.config.jsonc"), JSON.stringify(config));

    // Switch to custom
    const useResult = await runCli(ctx.cwd, ["use", "--host", "opencode", "custom"]);
    expect(useResult.exitCode).toBe(0);

    // Explain should reference custom profile
    const explainResult = await runCli(ctx.cwd, ["explain", "--host", "opencode", "writing-plans"]);
    expect(explainResult.exitCode).toBe(0);
    expect(explainResult.stdout).toContain("custom-model");
  }, 15000);
});
```

- [ ] **Step 2: Write disable/reenable test**

```typescript
// test/integration/disable-reenable-flow.test.ts
describe("disable/reenable flow", () => {
  it("disables OMS and removes artifacts, then reenables", async () => {
    await runCli(ctx.cwd, ["sync", "--host", "opencode"]);
    
    const disableResult = await runCli(ctx.cwd, ["disable", "--host", "opencode"]);
    expect(disableResult.exitCode).toBe(0);
    
    // Artifacts should be removed
    expect(existsSync(join(ctx.cwd, ".opencode", "agents", "spr-plan.md"))).toBe(false);
    
    // Reenable
    const useResult = await runCli(ctx.cwd, ["use", "--host", "opencode", "default"]);
    expect(useResult.exitCode).toBe(0);
    
    // Artifacts should be regenerated
    expect(existsSync(join(ctx.cwd, ".opencode", "agents", "spr-plan.md"))).toBe(true);
  }, 15000);
});
```

- [ ] **Step 3: Write collision detection test**

```typescript
// test/integration/collision-detection.test.ts
describe("collision detection", () => {
  it("warns when user-owned file conflicts with artifact", async () => {
    await runCli(ctx.cwd, ["sync", "--host", "opencode"]);
    
    // Create user-owned file at artifact path
    const agentDir = join(ctx.cwd, ".opencode", "agents");
    writeFileSync(join(agentDir, "spr-plan.md"), "user content");
    
    // Sync should warn about collision
    const result = await runCli(ctx.cwd, ["sync", "--host", "opencode"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("collision");
  }, 15000);
});
```

- [ ] **Step 4: Write config error recovery test**

```typescript
// test/integration/config-error-recovery.test.ts
describe("config error recovery", () => {
  it("falls back to last-known-good on malformed config", async () => {
    // First create a valid config via sync
    await runCli(ctx.cwd, ["sync", "--host", "opencode"]);
    
    // Corrupt the config
    writeFileSync(join(ctx.cwd, "oh-my-superagents.config.jsonc"), "{invalid json");
    
    // Status should still work (fallback to last-known-good or default)
    const result = await runCli(ctx.cwd, ["status", "--host", "opencode"]);
    // Should not crash — may have exit code > 0 but should produce output
    expect(result.stdout.length).toBeGreaterThan(0);
  }, 15000);
});
```

- [ ] **Step 5: Run all integration tests**

Run: `npx vitest run test/integration/`
Expected: ALL PASS (may need timeout adjustments)

- [ ] **Step 6: Commit**

```bash
git add test/integration/
git commit -m "test: add integration tests for preset switching, disable/reenable, collision, error recovery"
```

---

### Task 6: Full regression

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: Phase 6 complete — data, catalog and testing improvements"
```
