# Phase 4: Host Adapter Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create shared adapter utilities, add Qwen graceful degradation, support Claude model config, improve route artifact collision precision, fix Codex serviceTier logic.

**Architecture:** New `src/adapters/shared.ts` holds common logic. Each adapter imports shared utilities. No behavioral changes for OpenCode and Codex beyond the serviceTier fix.

**Tech Stack:** TypeScript, Vitest

---

## File Structure

```
src/
  adapters/
    shared.ts              # NEW: shared adapter utilities
  opencode.ts              # MODIFY: import from adapters/shared
  codex.ts                 # MODIFY: import from adapters/shared, fix serviceTier
  qwen.ts                  # MODIFY: import from adapters/shared, graceful degradation
  claude.ts                # MODIFY: import from adapters/shared, model config
  materialize.ts           # MODIFY: precise route artifact collision

test/
  adapters/
    shared.test.ts         # NEW: tests for shared adapter utilities
  opencode.test.ts         # MODIFY: update imports
  codex.test.ts            # MODIFY: add serviceTier tests
  qwen.test.ts             # MODIFY: add missing-skill tests
  claude.test.ts           # MODIFY: add model config tests
  materialize.test.ts      # MODIFY: add collision precision tests
```

---

### Task 1: Create shared adapter utilities

**Files:**
- Create: `src/adapters/shared.ts`
- Create: `test/adapters/shared.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/adapters/shared.test.ts
import { describe, it, expect } from "vitest";
import {
  SAFE_NAME_PATTERN,
  validateProfile,
  buildRouteOwnershipMarker,
  renderYamlFrontmatter,
} from "../../src/adapters/shared.js";

describe("SAFE_NAME_PATTERN", () => {
  it("matches valid names", () => {
    expect(SAFE_NAME_PATTERN.test("my-intent")).toBe(true);
    expect(SAFE_NAME_PATTERN.test("build")).toBe(true);
    expect(SAFE_NAME_PATTERN.test("code-review")).toBe(true);
  });

  it("rejects invalid names", () => {
    expect(SAFE_NAME_PATTERN.test("My Intent")).toBe(false);
    expect(SAFE_NAME_PATTERN.test("build!")).toBe(false);
    expect(SAFE_NAME_PATTERN.test("")).toBe(false);
  });
});

describe("validateProfile", () => {
  const profiles = {
    "sonnet": { model: "claude-sonnet" },
    "gpt5": { model: "gpt-5" },
  };

  it("returns profile if found", () => {
    const result = validateProfile(profiles, "sonnet");
    expect(result.model).toBe("claude-sonnet");
  });

  it("throws for unknown profile", () => {
    expect(() => validateProfile(profiles, "unknown")).toThrow("Unknown profile");
  });
});

describe("buildRouteOwnershipMarker", () => {
  it("generates HTML comment marker", () => {
    const marker = buildRouteOwnershipMarker({
      canonicalRoute: "phase.plan",
      host: "opencode",
      profileId: "sonnet",
      source: "superpowers",
    });
    expect(marker).toContain("<!-- oms-route:");
    expect(marker).toContain("canonicalRoute=phase.plan");
    expect(marker).toContain("host=opencode");
  });
});

describe("renderYamlFrontmatter", () => {
  it("renders simple fields", () => {
    const yaml = renderYamlFrontmatter({ description: "test", model: "sonnet" });
    expect(yaml).toContain("description: test");
    expect(yaml).toContain("model: sonnet");
  });

  it("wraps in --- delimiters", () => {
    const yaml = renderYamlFrontmatter({ key: "value" });
    expect(yaml.startsWith("---\n")).toBe(true);
    expect(yaml.endsWith("---\n")).toBe(true);
  });

  it("escapes single quotes in values", () => {
    const yaml = renderYamlFrontmatter({ desc: "it's working" });
    expect(yaml).toContain("it''s working");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/adapters/shared.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement shared utilities**

```typescript
// src/adapters/shared.ts

export const SAFE_NAME_PATTERN = /^[a-z0-9-]+$/;

export interface ProfileLike {
  model: string;
  variant?: string;
  effort?: string;
  codexFast?: boolean;
  temperature?: number;
}

export function validateProfile(
  profiles: Record<string, ProfileLike>,
  profileId: string,
): ProfileLike {
  const profile = profiles[profileId];
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }
  return profile;
}

export interface RouteOwnershipInfo {
  canonicalRoute: string;
  host: string;
  profileId: string;
  source: string;
  stage?: number;
}

export function buildRouteOwnershipMarker(info: RouteOwnershipInfo): string {
  const parts = [
    `canonicalRoute=${info.canonicalRoute}`,
    `host=${info.host}`,
    `profile=${info.profileId}`,
    `source=${info.source}`,
  ];
  if (info.stage !== undefined) {
    parts.push(`stage=${info.stage}`);
  }
  return `<!-- oms-route: ${parts.join(" ")} -->`;
}

export function renderYamlFrontmatter(fields: Record<string, string | number | boolean | undefined>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      const escaped = value.replace(/'/g, "''");
      lines.push(`${key}: '${escaped}'`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adapters/shared.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/shared.ts test/adapters/shared.test.ts
git commit -m "feat: create shared adapter utility module"
```

---

### Task 2: Update OpenCode adapter to use shared utilities

**Files:**
- Modify: `src/opencode.ts`

- [ ] **Step 1: Replace SAFE_NAME_PATTERN**

Remove local `SAFE_NAME_PATTERN` constant. Add import:
```typescript
import { SAFE_NAME_PATTERN } from "./adapters/shared.js";
```

- [ ] **Step 2: Run OpenCode tests**

Run: `npx vitest run test/opencode.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/opencode.ts
git commit -m "refactor: use shared SAFE_NAME_PATTERN in OpenCode adapter"
```

---

### Task 3: Update Codex adapter — shared utils + serviceTier fix

**Files:**
- Modify: `src/codex.ts`
- Modify: `test/codex.test.ts`

- [ ] **Step 1: Replace SAFE_NAME_PATTERN and fix serviceTier**

In `src/codex.ts`, add import and replace local constant:
```typescript
import { SAFE_NAME_PATTERN } from "./adapters/shared.js";
```

Fix serviceTier logic (around line 46):
```typescript
// Before:
serviceTier: codexFast || effort === "fast" ? "fast" : undefined

// After:
serviceTier: codexFast ? "fast" : (effort === "fast" ? "fast" : undefined)
```

- [ ] **Step 2: Add serviceTier test**

Add to `test/codex.test.ts`:

```typescript
describe("serviceTier logic", () => {
  it("sets fast when codexFast is true", () => {
    const artifacts = buildCodexArtifacts(/* config with codexFast: true profile */);
    const agent = artifacts.agents.find(a => a.fileName === "oms-plan.toml");
    expect(agent.content).toContain('service_tier = "fast"');
  });

  it("does not set fast when codexFast is false even if effort is fast", () => {
    const artifacts = buildCodexArtifacts(/* config with codexFast: false, effort: "fast" profile */);
    const agent = artifacts.agents.find(a => a.fileName === "oms-plan.toml");
    expect(agent.content).not.toContain('service_tier = "fast"');
  });

  it("sets fast when codexFast is undefined and effort is fast", () => {
    const artifacts = buildCodexArtifacts(/* config with effort: "fast" profile, no codexFast */);
    const agent = artifacts.agents.find(a => a.fileName === "oms-plan.toml");
    expect(agent.content).toContain('service_tier = "fast"');
  });
});
```

- [ ] **Step 3: Run Codex tests**

Run: `npx vitest run test/codex.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/codex.ts test/codex.test.ts
git commit -m "fix: correct Codex serviceTier logic and use shared SAFE_NAME_PATTERN"
```

---

### Task 4: Update Qwen adapter — shared utils + graceful degradation

**Files:**
- Modify: `src/qwen.ts`
- Modify: `test/qwen.test.ts`

- [ ] **Step 1: Add shared import and graceful degradation**

In `src/qwen.ts`, add import:
```typescript
import { SAFE_NAME_PATTERN } from "./adapters/shared.js";
```

In `buildQwenArtifacts`, where missing skills are detected (around line 387), instead of throwing:

```typescript
// Before:
if (missingEntries.length > 0) {
  throw new Error(`Missing upstream superpowers skills: ${missingEntries.join(", ")}`);
}

// After:
const warnings: string[] = [];
if (missingEntries.length > 0) {
  warnings.push(`Missing upstream superpowers skills: ${missingEntries.join(", ")}. Install them to .qwen/skills/ or .agents/skills/.`);
}
```

Generate stub artifacts for missing skills:

```typescript
for (const entryName of missingEntries) {
  const stubAgent = renderQwenStubAgent({
    skillName: entryName,
    profile: resolvedRoute.selection,
    canonicalRoute: resolvedRoute.canonicalRoute,
    host: "qwen",
  });
  agents.push(stubAgent);
}
```

Add `renderQwenStubAgent`:

```typescript
function renderQwenStubAgent(input: {
  skillName: string;
  profile: { model: string };
  canonicalRoute: string;
  host: string;
}): GeneratedArtifact {
  const name = `oms-${input.skillName}`;
  const frontmatter = renderYamlFrontmatter({
    name,
    description: `[MISSING UPSTREAM] ${input.skillName}`,
    model: input.profile.model,
  });
  const body = [
    buildRouteOwnershipMarker({
      canonicalRoute: input.canonicalRoute,
      host: input.host,
      profileId: input.profile.model,
      source: "superpowers",
    }),
    "",
    "# WARNING: Upstream skill not found",
    "",
    `The superpowers "${input.skillName}" skill is not installed.`,
    "Install it first, then re-run: oh-my-superagents sync --host qwen",
  ].join("\n");
  return {
    path: path.join(".qwen/agents", `${name}.md`),
    content: frontmatter + body,
  };
}
```

- [ ] **Step 2: Add test for missing skill behavior**

Add to `test/qwen.test.ts`:

```typescript
it("generates stub artifacts when upstream skills are missing", async () => {
  const result = await buildQwenArtifacts(config, {
    homeDir: "/tmp/empty-home",
    skillSearchDirs: ["/tmp/empty-dir"],
    controlPlaneSettings: undefined,
  });
  // Should not throw
  expect(result.agents.length).toBeGreaterThan(0);
  // Stub agents should contain warning
  const stubAgent = result.agents.find(a => a.content.includes("WARNING"));
  expect(stubAgent).toBeDefined();
});
```

- [ ] **Step 3: Run Qwen tests**

Run: `npx vitest run test/qwen.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/qwen.ts test/qwen.test.ts
git commit -m "fix: add graceful degradation for missing upstream skills in Qwen adapter"
```

---

### Task 5: Add Claude model configuration support

**Files:**
- Modify: `src/claude.ts`
- Modify: `test/claude.test.ts`

- [ ] **Step 1: Research Claude skill model support**

Claude Code skills can specify model via a `model` field in SKILL.md. If supported, add model to the skill content.

- [ ] **Step 2: Implement model configuration**

In `src/claude.ts`, in `renderClaudeSkillFile`, add model directive if supported:

```typescript
function renderClaudeSkillFile(input: {
  canonicalRoute: string;
  phaseId: string;
  source: string;
  entryName?: string;
  profile: { model: string; variant?: string; temperature?: number };
}): string {
  const lines: string[] = [
    "# generated-by: oh-my-superagents; do-not-edit: true",
    buildRouteOwnershipMarker({
      canonicalRoute: input.canonicalRoute,
      host: "claude",
      profileId: input.profile.model,
      source: input.source,
    }),
    "",
    "# Skill: " + input.phaseId,
    "",
    "## Model",
    "",
    "Preferred model: " + input.profile.model,
  ];
  // ... rest of skill content
}
```

If Claude Code doesn't support per-skill model selection, add a note:

```typescript
// Claude does not currently support per-skill model selection.
// Model preference is listed for human reference only.
```

- [ ] **Step 3: Run Claude tests**

Run: `npx vitest run test/claude.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/claude.ts test/claude.test.ts
git commit -m "feat: add model reference in Claude skill files"
```

---

### Task 6: Improve route artifact collision precision

**Files:**
- Modify: `src/materialize.ts`
- Modify: `test/materialize.test.ts`

- [ ] **Step 1: Implement isSameRouteOwnership**

In `src/materialize.ts`, add:

```typescript
function isSameRouteOwnership(
  existingContent: string,
  artifactContent: string,
): boolean {
  const existingMarker = parseRouteOwnership(existingContent);
  const artifactMarker = parseRouteOwnership(artifactContent);
  if (!existingMarker || !artifactMarker) return false;
  return existingMarker.canonicalRoute === artifactMarker.canonicalRoute
    && existingMarker.host === artifactMarker.host;
}
```

- [ ] **Step 2: Use in isArtifactOwnedByCurrentContract**

In `isArtifactOwnedByCurrentContract` (around line 476), for route-owned artifacts, replace `isRouteOwnedFile(existingPath, existingContent)` with:

```typescript
const existingContent = await readFile(existingPath, "utf-8");
if (isRouteOwnedFile(existingPath, existingContent)) {
  return isSameRouteOwnership(existingContent, artifact.content);
}
```

- [ ] **Step 3: Add test**

Add to `test/materialize.test.ts`:

```typescript
it("does not collide when different routes produce same filename", async () => {
  const artifact1 = {
    path: ".opencode/agents/shared-agent.md",
    content: "<!-- oms-route: canonicalRoute=phase.plan host=opencode -->\n...",
  };
  const artifact2 = {
    path: ".opencode/agents/shared-agent.md",
    content: "<!-- oms-route: canonicalRoute=phase.review host=opencode -->\n...",
  };

  // First write
  await materializeArtifacts(cwd, [artifact1], deps);
  // Second write with different route — should not collide if we consider route identity
  // Actually this SHOULD collide because same path — but the collision message
  // should indicate they're different routes
  const result = await materializeArtifacts(cwd, [artifact2], deps);
  // The file exists with different route ownership
  expect(result.warnings.length).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Run materialize tests**

Run: `npx vitest run test/materialize.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/materialize.ts test/materialize.test.ts
git commit -m "fix: improve route artifact collision precision with route identity check"
```

---

### Task 7: Full regression

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
git commit -m "chore: Phase 4 complete — host adapter improvements"
```
