# Copilot CLI Host Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Copilot CLI as a first-class host adapter with Agent + Plugin + Hooks integration, following the same architecture as existing hosts (OpenCode, Codex, Qwen, Claude).

**Architecture:** Create a new `src/copilot.ts` host adapter that generates Copilot-native `.agent.md` files, `SKILL.md` skills, a `plugin.json` manifest, and `hooks.json` for lifecycle automation. Update `capabilities.ts`, `materialize.ts`, `cli.ts`, and `opencode.ts` to support the new host.

**Tech Stack:** TypeScript (ESM, strict), Vitest, Zod, pnpm

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/copilot.ts` | Create | Copilot CLI host adapter — agent/skill/plugin/hooks rendering |
| `src/capabilities.ts` | Modify | Add `"copilot"` to `CapabilityHost` type and projection rules |
| `src/opencode.ts` | Modify | Add `"copilot"` to `renderRouteOwnershipMetadata` host union |
| `src/materialize.ts` | Modify | Add Copilot ownership detection and cleanup |
| `src/cli.ts` | Modify | Add `"copilot"` to host validation and artifact dispatch |
| `src/index.ts` | Modify | Export copilot module public API |
| `test/copilot-agent-rendering.test.ts` | Create | Agent `.agent.md` rendering tests |
| `test/copilot-skill-rendering.test.ts` | Create | Skill `SKILL.md` rendering tests |
| `test/copilot-plugin-manifest.test.ts` | Create | `plugin.json` generation tests |
| `test/copilot-hooks-config.test.ts` | Create | `hooks.json` generation tests |
| `test/copilot-direct-mode.test.ts` | Create | Direct mode rendering tests |
| `test/copilot-capabilities.test.ts` | Create | Capability policy tests |
| `test/copilot-build-artifacts.test.ts` | Create | Full artifact generation integration tests |
| `test/copilot-materialize.test.ts` | Create | Ownership detection and materialization tests |

---

### Task 1: Write Copilot Agent Rendering Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-agent-rendering.test.ts`

- [ ] **Step 1: Create the test file with agent rendering tests**

```typescript
import { describe, expect, it } from "vitest"
import { renderCopilotAgentFile } from "../src/copilot.js"

describe("renderCopilotAgentFile", () => {
  it("renders a superpowers phase agent with correct front matter", () => {
    const result = renderCopilotAgentFile({
      name: "oms-brainstorm",
      description: "Route brainstorming phase through OMS profile default",
      model: "gpt-4.1",
      phase: "brainstorming",
      profileId: "default",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(result).toContain("---")
    expect(result).toContain("name: oms-brainstorm")
    expect(result).toContain("description:")
    expect(result).toContain("tools:")
    expect(result).toContain("generated-by: oh-my-superagents")
    expect(result).toContain("oms-route: stage=3; host=copilot")
    expect(result).toContain("route=phase.brainstorm")
    expect(result).toContain("source=superpowers")
    expect(result).toContain("projection=agent")
    expect(result).toContain("canonical route: `phase.brainstorm`")
    expect(result).toContain("model: `gpt-4.1`")
    expect(result).toContain("profile: `default`")
    expect(result).toContain("superpowers/brainstorming")
  })

  it("renders a direct mode agent", () => {
    const result = renderCopilotAgentFile({
      name: "rt-review",
      description: "rt-review routing agent for review",
      model: "gpt-4.1",
      intent: "review",
      sourceEntry: {
        canonicalRoute: "intent.review",
        source: "direct",
      },
    })

    expect(result).toContain("name: rt-review")
    expect(result).toContain("route=intent.review")
    expect(result).toContain("source=direct")
    expect(result).toContain("projection=agent")
    expect(result).not.toContain("workflow entry")
  })

  it("includes variant and temperature when provided", () => {
    const result = renderCopilotAgentFile({
      name: "oms-plan",
      description: "plan agent",
      model: "gpt-4.1",
      variant: "fast",
      temperature: 0.5,
      phase: "writing-plans",
      profileId: "default",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "superpowers",
        entryName: "writing-plans",
      },
      workflowEntryName: "superpowers/writing-plans",
    })

    expect(result).toContain("variant: fast")
    expect(result).toContain("temperature: 0.5")
  })

  it("includes lane info for subagent-driven-development", () => {
    const result = renderCopilotAgentFile({
      name: "spr-build--frontend",
      description: "spr-build--frontend helper for subagent-driven-development",
      model: "gpt-4.1",
      phase: "subagent-driven-development",
      profileId: "frontend",
      effectiveLane: "frontend",
      sourceEntry: {
        canonicalRoute: "phase.execute",
        source: "superpowers",
        entryName: "subagent-driven-development",
      },
      workflowEntryName: "superpowers/subagent-driven-development",
    })

    expect(result).toContain("lane: frontend")
    expect(result).toContain("spr-build--frontend")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-agent-rendering.test.ts`
Expected: FAIL — module `../src/copilot.js` not found

- [ ] **Step 3: Commit test file**

```bash
git add test/copilot-agent-rendering.test.ts
git commit -m "test(copilot): add agent rendering tests (TDD red phase)"
```

---

### Task 2: Write Copilot Skill Rendering Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-skill-rendering.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it } from "vitest"
import { renderCopilotSkillFile } from "../src/copilot.js"

describe("renderCopilotSkillFile", () => {
  it("renders a superpowers phase skill with correct structure", () => {
    const result = renderCopilotSkillFile({
      name: "oms-brainstorm",
      phase: "brainstorming",
      profileId: "default",
      model: "gpt-4.1",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(result).toContain("# Skill: oms-brainstorm")
    expect(result).toContain("## Purpose")
    expect(result).toContain("## Instructions")
    expect(result).toContain("## Route Metadata")
    expect(result).toContain("generated-by: oh-my-superagents")
    expect(result).toContain("oms-route: stage=3; host=copilot")
    expect(result).toContain("route=phase.brainstorm")
    expect(result).toContain("projection=skill")
    expect(result).toContain("canonical route: `phase.brainstorm`")
    expect(result).toContain("model: `gpt-4.1`")
  })

  it("renders direct mode skill", () => {
    const result = renderCopilotSkillFile({
      name: "rt-review",
      intent: "review",
      profileId: "default",
      model: "gpt-4.1",
      sourceEntry: {
        canonicalRoute: "intent.review",
        source: "direct",
      },
    })

    expect(result).toContain("route=intent.review")
    expect(result).toContain("source=direct")
    expect(result).toContain("projection=skill")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-skill-rendering.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Commit**

```bash
git add test/copilot-skill-rendering.test.ts
git commit -m "test(copilot): add skill rendering tests (TDD red phase)"
```

---

### Task 3: Write Copilot Plugin Manifest Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-plugin-manifest.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it } from "vitest"
import { buildCopilotPluginManifest } from "../src/copilot.js"

describe("buildCopilotPluginManifest", () => {
  it("generates a valid plugin.json with required fields", () => {
    const result = buildCopilotPluginManifest()

    expect(result).toContain('"name": "oh-my-superagents"')
    expect(result).toContain('"version"')
    expect(result).toContain('"description"')
    expect(result).toContain('"license": "MIT"')
    expect(result).toContain('"agents": "agents/"')
    expect(result).toContain('"skills": "skills/"')
    expect(result).toContain('"hooks": "hooks.json"')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-plugin-manifest.test.ts`
Expected: FAIL

- [ ] **Step 3: Commit**

```bash
git add test/copilot-plugin-manifest.test.ts
git commit -m "test(copilot): add plugin manifest tests (TDD red phase)"
```

---

### Task 4: Write Copilot Hooks Config Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-hooks-config.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it } from "vitest"
import { buildCopilotHooksConfig } from "../src/copilot.js"

describe("buildCopilotHooksConfig", () => {
  it("generates hooks.json with sessionStart hook", () => {
    const result = buildCopilotHooksConfig({ enableSessionStart: true })

    expect(result).toContain('"version": 1')
    expect(result).toContain('"sessionStart"')
    expect(result).toContain('"type": "command"')
    expect(result).toContain("oh-my-superagents sync --host copilot")
  })

  it("generates empty hooks when all disabled", () => {
    const result = buildCopilotHooksConfig({
      enableSessionStart: false,
      enablePostToolUse: false,
    })

    const parsed = JSON.parse(result)
    expect(parsed.version).toBe(1)
    expect(parsed.hooks.sessionStart).toEqual([])
    expect(parsed.hooks.postToolUse).toEqual([])
  })

  it("includes postToolUse hook when enabled", () => {
    const result = buildCopilotHooksConfig({ enablePostToolUse: true })

    expect(result).toContain('"postToolUse"')
    expect(result).toContain("oh-my-superagents status --host copilot")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-hooks-config.test.ts`
Expected: FAIL

- [ ] **Step 3: Commit**

```bash
git add test/copilot-hooks-config.test.ts
git commit -m "test(copilot): add hooks config tests (TDD red phase)"
```

---

### Task 5: Write Copilot Direct Mode Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-direct-mode.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it } from "vitest"
import { buildCopilotArtifacts } from "../src/copilot.js"
import type { RouterConfig } from "../src/config.js"

describe("buildCopilotArtifacts direct mode", () => {
  const directConfig: RouterConfig = {
    workflow: {
      kind: "direct",
      intents: {
        review: { label: "Code Review" },
        deploy: { label: "Deploy", description: "Deploy to production" },
      },
    },
    profiles: {
      default: { model: "gpt-4.1" },
    },
    defaultRoute: { profile: "default" },
    routes: {},
    lanes: {},
    settings: {
      activePreset: "default",
      commandPrefix: "oms",
      commands: {
        status: { name: "status", aliases: [] },
        use: { name: "use", aliases: [] },
        disable: { name: "disable", aliases: [] },
        sync: { name: "sync", aliases: [] },
        doctor: { name: "doctor", aliases: [] },
      },
      subagentExecution: { mode: "suggest" },
    },
  }

  it("generates direct mode agents with rt- prefix", () => {
    const result = buildCopilotArtifacts(directConfig)

    const agentNames = result.agents.map((a) => a.fileName)
    expect(agentNames).toContain("rt-review.agent.md")
    expect(agentNames).toContain("rt-deploy.agent.md")
  })

  it("generates direct mode agents with correct route metadata", () => {
    const result = buildCopilotArtifacts(directConfig)

    const reviewAgent = result.agents.find((a) => a.fileName === "rt-review.agent.md")
    expect(reviewAgent).toBeDefined()
    expect(reviewAgent!.content).toContain("route=intent.review")
    expect(reviewAgent!.content).toContain("source=direct")
  })

  it("generates skills for direct mode intents", () => {
    const result = buildCopilotArtifacts(directConfig)

    const skillDirs = result.skills.map((s) => s.directory)
    expect(skillDirs).toContain(".copilot-plugin/skills/rt-review")
    expect(skillDirs).toContain(".copilot-plugin/skills/rt-deploy")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-direct-mode.test.ts`
Expected: FAIL

- [ ] **Step 3: Commit**

```bash
git add test/copilot-direct-mode.test.ts
git commit -m "test(copilot): add direct mode tests (TDD red phase)"
```

---

### Task 6: Write Copilot Capabilities Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-capabilities.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it } from "vitest"
import { getHostProjectionDecision, getControlPlaneCommandDecision } from "../src/capabilities.js"

describe("copilot capabilities", () => {
  it("supports superpowers projection", () => {
    const decision = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "superpowers",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
    })
    expect(decision.supported).toBe(true)
  })

  it("supports direct mode projection", () => {
    const decision = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "direct",
      sourceEntry: {
        canonicalRoute: "intent.review",
        source: "direct",
      },
    })
    expect(decision.supported).toBe(true)
  })

  it("supports gstack source projection", () => {
    const decision = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "superpowers",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "gstack",
        entryName: "plan-eng-review",
      },
    })
    expect(decision.supported).toBe(true)
  })

  it("supports all control plane commands", () => {
    for (const command of ["status", "use", "disable", "sync", "doctor", "explain"] as const) {
      const decision = getControlPlaneCommandDecision({
        host: "copilot",
        command,
        workflowKind: "superpowers",
      })
      expect(decision.supported).toBe(true)
    }
  })

  it("supports control plane commands in direct mode", () => {
    for (const command of ["status", "sync", "doctor", "explain"] as const) {
      const decision = getControlPlaneCommandDecision({
        host: "copilot",
        command,
        workflowKind: "direct",
      })
      expect(decision.supported).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-capabilities.test.ts`
Expected: FAIL — `"copilot"` is not a valid host

- [ ] **Step 3: Commit**

```bash
git add test/copilot-capabilities.test.ts
git commit -m "test(copilot): add capabilities tests (TDD red phase)"
```

---

### Task 7: Write Copilot Build Artifacts Integration Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-build-artifacts.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it } from "vitest"
import { buildCopilotArtifacts } from "../src/copilot.js"
import type { RouterConfig } from "../src/config.js"

describe("buildCopilotArtifacts", () => {
  const superpowersConfig: RouterConfig = {
    workflow: {
      kind: "superpowers",
    },
    profiles: {
      default: { model: "gpt-4.1" },
    },
    defaultRoute: { profile: "default" },
    routes: {},
    lanes: {},
    settings: {
      activePreset: "default",
      commandPrefix: "oms",
      commands: {
        status: { name: "status", aliases: [] },
        use: { name: "use", aliases: [] },
        disable: { name: "disable", aliases: [] },
        sync: { name: "sync", aliases: [] },
        doctor: { name: "doctor", aliases: [] },
      },
      subagentExecution: { mode: "suggest" },
    },
  }

  it("generates 7 phase agents", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.agents).toHaveLength(7)
  })

  it("generates 7 phase skills", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.skills).toHaveLength(7)
  })

  it("generates plugin manifest", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.pluginManifest).toBeDefined()
    expect(result.pluginManifest).toContain('"name": "oh-my-superagents"')
  })

  it("generates hooks config", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.hooksConfig).toBeDefined()
    expect(result.hooksConfig).toContain('"version": 1')
  })

  it("generates control plane command artifacts", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    const commandNames = result.commands.map((c) => c.fileName)
    expect(commandNames.length).toBeGreaterThanOrEqual(5)
  })

  it("all agents have ownership markers", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const agent of result.agents) {
      expect(agent.content).toContain("generated-by: oh-my-superagents")
      expect(agent.content).toContain("host=copilot")
    }
  })

  it("all skills have ownership markers", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const skill of result.skills) {
      expect(skill.content).toContain("generated-by: oh-my-superagents")
      expect(skill.content).toContain("host=copilot")
    }
  })

  it("uses stage=3 for copilot markers", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const agent of result.agents) {
      expect(agent.content).toContain("stage=3")
    }
  })

  it("agents are placed in .copilot-plugin/agents/", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const agent of result.agents) {
      expect(agent.directory).toBe(".copilot-plugin/agents")
    }
  })

  it("skills are placed in .copilot-plugin/skills/<name>/", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const skill of result.skills) {
      expect(skill.directory).toMatch(/^\.copilot-plugin\/skills\//)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-build-artifacts.test.ts`
Expected: FAIL

- [ ] **Step 3: Commit**

```bash
git add test/copilot-build-artifacts.test.ts
git commit -m "test(copilot): add build artifacts integration tests (TDD red phase)"
```

---

### Task 8: Write Copilot Materialize Tests (TDD Red Phase)

**Files:**
- Create: `test/copilot-materialize.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it } from "vitest"
import { isOmsOwnedArtifactFile, hasArtifactOwnershipMarker } from "../src/materialize.js"

describe("copilot materialize ownership", () => {
  it("detects copilot agent ownership via route marker", () => {
    const content = [
      "---",
      "name: oms-brainstorm",
      "description: test",
      'tools: ["bash"]',
      "---",
      "",
      "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
      "<!-- oms-route: stage=3; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->",
      "",
      "Agent content here",
    ].join("\n")

    expect(hasArtifactOwnershipMarker(content)).toBe(true)
  })

  it("detects copilot skill ownership via route marker", () => {
    const content = [
      "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
      "<!-- oms-route: stage=3; host=copilot; source=superpowers; route=phase.brainstorm; projection=skill; rendered-name=oms-brainstorm -->",
      "",
      "# Skill: oms-brainstorm",
    ].join("\n")

    expect(hasArtifactOwnershipMarker(content)).toBe(true)
  })

  it("detects copilot command ownership via control plane marker", () => {
    const content = [
      "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
      "<!-- oms-control-plane: stage=3; host=copilot; artifact=command; logical-command=status; rendered-name=oms-status -->",
      "",
      "Run oh-my-superagents status.",
    ].join("\n")

    expect(hasArtifactOwnershipMarker(content)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- test/copilot-materialize.test.ts`
Expected: FAIL — copilot host not recognized in ownership parsing

- [ ] **Step 3: Commit**

```bash
git add test/copilot-materialize.test.ts
git commit -m "test(copilot): add materialize ownership tests (TDD red phase)"
```

---

### Task 9: Update Capabilities — Add Copilot Host

**Files:**
- Modify: `src/capabilities.ts`

- [ ] **Step 1: Add `"copilot"` to `CapabilityHost` type**

In `src/capabilities.ts`, change line 24:

```typescript
// Before:
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude"

// After:
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

- [ ] **Step 2: Add copilot projection support in `getHostProjectionDecision`**

Add a case before the final `return supportedDecision()` (around line 64):

```typescript
// Copilot CLI supports all source/routes — no restrictions needed
// (falls through to supportedDecision)
```

Actually, since there are no restrictions, no code change is needed in the function body — copilot will fall through to the default `supportedDecision()`.

- [ ] **Step 3: Add copilot control plane command support**

In `getControlPlaneCommandDecision`, add support for direct mode explain on copilot (line 92):

```typescript
// Before:
if (input.workflowKind === "direct" && input.command === "explain" && input.host !== "opencode" && input.host !== "codex") {

// After:
if (input.workflowKind === "direct" && input.command === "explain" && input.host !== "opencode" && input.host !== "codex" && input.host !== "copilot") {
```

- [ ] **Step 4: Run capabilities tests**

Run: `pnpm run test -- test/copilot-capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing tests to verify no regression**

Run: `pnpm run test`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/capabilities.ts
git commit -m "feat(copilot): add copilot to capability host type and projection rules"
```

---

### Task 10: Update Ownership Markers — Add Copilot to Route Ownership

**Files:**
- Modify: `src/opencode.ts`
- Modify: `src/materialize.ts`

- [ ] **Step 1: Add `"copilot"` to `renderRouteOwnershipMetadata` host union**

In `src/opencode.ts`, line 98:

```typescript
// Before:
export function renderRouteOwnershipMetadata(input: {
  host: "opencode" | "codex" | "qwen"

// After:
export function renderRouteOwnershipMetadata(input: {
  host: "opencode" | "codex" | "qwen" | "copilot"
```

- [ ] **Step 2: Update stage logic in `renderRouteOwnershipMetadata`**

In `src/opencode.ts`, line 104:

```typescript
// Before:
return `<!-- ${ROUTE_MARKER_PREFIX} stage=${input.host === "qwen" ? "2" : "1"}; host=${input.host}; ...`

// After:
function getStageForHost(host: string): string {
  if (host === "qwen") return "2"
  if (host === "copilot") return "3"
  return "1"
}

// In the function body:
return `<!-- ${ROUTE_MARKER_PREFIX} stage=${getStageForHost(input.host)}; host=${input.host}; source=${input.source}; route=${input.route}; projection=${input.projection}; rendered-name=${input.renderedName} -->`
```

- [ ] **Step 3: Update `materialize.ts` route ownership parsing**

In `src/materialize.ts`, update `parseRouteOwnership` regex (line 247):

```typescript
// Before:
`<!-- ${escapedPrefix} stage=(1|2); host=(opencode|codex|qwen|claude); ...`

// After:
`<!-- ${escapedPrefix} stage=(1|2|3); host=(opencode|codex|qwen|claude|copilot); ...`
```

Also update the return type (line 256):

```typescript
// Before:
host: match[2] as "opencode" | "codex" | "qwen" | "claude",

// After:
host: match[2] as "opencode" | "codex" | "qwen" | "claude" | "copilot",
```

- [ ] **Step 4: Add Copilot ownership detection in `isRouteOwnedFile`**

In `src/materialize.ts`, add copilot case after the codex block (around line 305):

```typescript
if (ownership.host === "copilot") {
  if (ownership.projection === "agent") {
    return filePath.includes(`${path.sep}.copilot-plugin${path.sep}agents${path.sep}`)
      && path.basename(filePath, ".agent.md") === ownership.renderedName
  }
  if (ownership.projection === "skill") {
    return (
      path.basename(filePath) === "SKILL.md"
      && filePath.includes(`${path.sep}.copilot-plugin${path.sep}skills${path.sep}`)
      && path.basename(path.dirname(filePath)) === ownership.renderedName
    )
  }
  return false
}
```

- [ ] **Step 5: Add Copilot agent ownership prefix detection**

In `src/materialize.ts`, add after line 52:

```typescript
const COPILOT_ROUTER_OWNED_AGENT_PREFIXES = new Set(["oms-", "rt-"])
```

Add a new function:

```typescript
function isCopilotRouterOwnedFile(directory: string, fileName: string, content: string) {
  if (directory.endsWith(`${path.sep}.copilot-plugin${path.sep}agents`)) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_AGENT_PREFIXES)
  }
  return false
}
```

Add `isCopilotRouterOwnedFile` to the cleanup check in `materializeArtifacts` (around line 635):

```typescript
|| isCopilotRouterOwnedFile(directory, entry, content)
```

- [ ] **Step 6: Run materialize tests**

Run: `pnpm run test -- test/copilot-materialize.test.ts`
Expected: PASS

- [ ] **Step 7: Run all tests**

Run: `pnpm run test`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/opencode.ts src/materialize.ts
git commit -m "feat(copilot): add copilot ownership markers and materialization support"
```

---

### Task 11: Implement Copilot Host Adapter (Core)

**Files:**
- Create: `src/copilot.ts`

- [ ] **Step 1: Create `src/copilot.ts` with types and rendering functions**

```typescript
import { BUILT_IN_PHASES, CONTROL_PLANE_COMMAND_KEYS, SAFE_NAME_PATTERN, type ControlPlaneCommandKey, type RouterConfig } from "./config.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX, CONTROL_PLANE_MARKER_PREFIX, type GeneratedArtifact } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import { toSuperpowersCanonicalRouteId } from "./workflow-superpowers.js"
import type { WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

const PHASE_TO_COPILOT_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

const PHASE_TO_SKILL = {
  brainstorming: "brainstorming",
  "writing-plans": "writing-plans",
  "subagent-driven-development": "subagent-driven-development",
  "requesting-code-review": "requesting-code-review",
  "verification-before-completion": "verification-before-completion",
  "frontend-design": "frontend-design",
  "webapp-testing": "webapp-testing",
} as const satisfies Record<BuiltInPhase, string>

const PHASE_TOOLS: Record<BuiltInPhase, string[]> = {
  brainstorming: ["bash", "view", "glob", "rg"],
  "writing-plans": ["bash", "view", "glob", "rg"],
  "subagent-driven-development": ["bash", "view", "edit", "glob", "rg", "task"],
  "requesting-code-review": ["bash", "view", "glob", "rg"],
  "verification-before-completion": ["bash", "view", "glob", "rg"],
  "frontend-design": ["bash", "view", "edit", "glob", "rg"],
  "webapp-testing": ["bash", "view", "edit", "glob", "rg"],
}

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot CLI.",
  use: "Switch OMS to the selected preset for Copilot CLI.",
  disable: "Disable OMS for Copilot CLI.",
  sync: "Sync OMS artifacts for Copilot CLI.",
  doctor: "Inspect OMS diagnostics for Copilot CLI.",
}

export type CopilotAgentArtifact = {
  kind: "agent"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotSkillArtifact = {
  kind: "skill"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type CopilotCommandArtifact = {
  kind: "command"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

function yamlScalar(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function renderCopilotRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  projection: "agent" | "skill"
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=3; host=copilot; source=${input.source}; route=${input.route}; projection=${input.projection}; rendered-name=${input.renderedName} -->`
}

function renderCopilotControlPlaneMetadata(input: {
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=3; host=copilot; artifact=command; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function formatTools(tools: string[]) {
  return `[${tools.map((t) => `"${t}"`).join(", ")}]`
}

export type RenderCopilotAgentInput = {
  name: string
  description: string
  model: string
  variant?: string
  temperature?: number
  phase?: BuiltInPhase
  intent?: string
  profileId?: string
  effectiveLane?: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName?: string
}

export function renderCopilotAgentFile(input: RenderCopilotAgentInput): string {
  const tools = input.phase ? PHASE_TOOLS[input.phase] : ["bash", "view", "edit", "glob", "rg", "task"]
  const frontMatter = [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `tools: ${formatTools(tools)}`,
    ...(input.variant ? [`variant: ${yamlScalar(input.variant)}`] : []),
    ...(input.temperature !== undefined ? [`temperature: ${input.temperature}`] : []),
    "---",
  ].join("\n")

  const body = [
    MARKER_TEXT ? `<!-- ${MARKER_TEXT} -->` : "",
    renderCopilotRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.name,
    }),
    "",
    `You are the ${input.name} agent.`,
  ]

  if (input.workflowEntryName) {
    body.push(
      `Load and follow the upstream workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`,
      `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
    )
  } else if (input.intent) {
    body.push(
      `Handle requests that match the \`${input.intent}\` intent.`,
      "Follow the requested intent directly without any upstream skill handoff.",
    )
  }

  body.push(
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
  )

  if (input.profileId) {
    body.push(`- profile: \`${input.profileId}\``)
  }
  body.push(`- model: \`${input.model}\``)

  if (input.effectiveLane) {
    body.push(`- lane: ${input.effectiveLane}`)
  }

  body.push("")

  return [frontMatter, ...body].join("\n")
}

export type RenderCopilotSkillInput = {
  name: string
  phase?: BuiltInPhase
  intent?: string
  profileId: string
  model: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName?: string
}

export function renderCopilotSkillFile(input: RenderCopilotSkillInput): string {
  const lines = [
    `# ${MARKER_TEXT}`,
    renderCopilotRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      projection: "skill",
      renderedName: input.name,
    }),
    "",
    `# Skill: ${input.name}`,
    "",
    "## Purpose",
    `This project-scoped Copilot CLI wrapper routes the \`${input.phase ?? input.intent}\` ${input.phase ? "phase" : "intent"} through OMS profile \`${input.profileId}\`.`,
    "",
    "## Instructions",
  ]

  if (input.workflowEntryName) {
    lines.push(
      `Use the workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`,
      `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
    )
  } else {
    lines.push(
      "Follow the requested intent directly without any upstream skill handoff.",
    )
  }

  lines.push(
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- profile: \`${input.profileId}\``,
    `- model: \`${input.model}\``,
    "",
  )

  return lines.join("\n")
}

export function buildCopilotPluginManifest(): string {
  return JSON.stringify(
    {
      name: "oh-my-superagents",
      description: "OMS routing and control-plane for Copilot CLI",
      version: "0.1.0",
      author: {
        name: "oh-my-superagents contributors",
      },
      license: "MIT",
      keywords: ["routing", "superpowers", "workflow", "agent"],
      category: "development",
      agents: "agents/",
      skills: "skills/",
      hooks: "hooks.json",
    },
    null,
    2,
  ) + "\n"
}

export type CopilotHooksOptions = {
  enableSessionStart?: boolean
  enablePostToolUse?: boolean
}

export function buildCopilotHooksConfig(options: CopilotHooksOptions = {}): string {
  const hooks: Record<string, unknown[]> = {
    sessionStart: [],
    postToolUse: [],
  }

  if (options.enableSessionStart !== false) {
    hooks.sessionStart.push({
      type: "command",
      bash: "npx oh-my-superagents sync --host copilot --quiet",
      timeoutSec: 15,
    })
  }

  if (options.enablePostToolUse) {
    hooks.postToolUse.push({
      type: "command",
      bash: "npx oh-my-superagents status --host copilot --quiet 2>/dev/null || true",
      timeoutSec: 5,
    })
  }

  return JSON.stringify({ version: 1, hooks }, null, 2) + "\n"
}

function renderCopilotControlPlaneCommandFile(input: {
  description: string
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return [
    "---",
    `name: ${yamlScalar(input.renderedName)}`,
    `description: ${yamlScalar(input.description)}`,
    'tools: ["bash"]',
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    renderCopilotControlPlaneMetadata({
      logicalCommand: input.logicalCommand,
      renderedName: input.renderedName,
    }),
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host copilot\` from the repository root.`,
    "",
  ].join("\n")
}

function buildControlPlaneCommandArtifacts(): CopilotCommandArtifact[] {
  return CONTROL_PLANE_COMMAND_KEYS.map((commandKey) => {
    const renderedName = `oms-${commandKey}`
    return {
      kind: "command" as const,
      directory: ".copilot-plugin/agents",
      fileName: `${renderedName}.agent.md`,
      ownerPrefix: "oms-",
      content: renderCopilotControlPlaneCommandFile({
        description: CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
        logicalCommand: commandKey,
        renderedName,
      }),
    }
  })
}

export type BuildCopilotArtifactsResult = {
  agents: CopilotAgentArtifact[]
  skills: CopilotSkillArtifact[]
  commands: CopilotCommandArtifact[]
  pluginManifest: string
  hooksConfig: string
}

export function buildCopilotArtifacts(config: RouterConfig): BuildCopilotArtifactsResult {
  const agents: CopilotAgentArtifact[] = []
  const skills: CopilotSkillArtifact[] = []
  const workflow = config.workflow

  if (workflow?.kind === "direct") {
    for (const [intent, intentConfig] of Object.entries(workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const agentName = `rt-${intent}`
      const intentDescription = intentConfig.description
        ? `${intentConfig.label}: ${intentConfig.description}`
        : intentConfig.label

      agents.push({
        kind: "agent",
        directory: ".copilot-plugin/agents",
        fileName: `${agentName}.agent.md`,
        ownerPrefix: "rt-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
          model: resolved.selection.model,
          intent,
          sourceEntry: resolved.sourceEntry,
        }),
      })

      skills.push({
        kind: "skill",
        directory: `.copilot-plugin/skills/${agentName}`,
        fileName: "SKILL.md",
        ownerPrefix: "rt-",
        content: renderCopilotSkillFile({
          name: agentName,
          intent,
          profileId: resolved.profileId,
          model: resolved.selection.model,
          sourceEntry: resolved.sourceEntry,
        }),
      })
    }
  } else {
    for (const phase of BUILT_IN_PHASES) {
      const resolved = resolvePhase(config, phase)
      const agentName = PHASE_TO_COPILOT_AGENT[phase]
      const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

      agents.push({
        kind: "agent",
        directory: ".copilot-plugin/agents",
        fileName: `${agentName}.agent.md`,
        ownerPrefix: "oms-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} phase agent for oh-my-superagents`,
          model: resolved.selection.model,
          variant: resolved.selection.variant,
          temperature: resolved.selection.temperature,
          phase,
          profileId: resolved.profileId,
          sourceEntry: resolved.sourceEntry,
          workflowEntryName,
        }),
      })

      skills.push({
        kind: "skill",
        directory: `.copilot-plugin/skills/${agentName}`,
        fileName: "SKILL.md",
        ownerPrefix: "oms-",
        content: renderCopilotSkillFile({
          name: agentName,
          phase,
          profileId: resolved.profileId,
          model: resolved.selection.model,
          sourceEntry: resolved.sourceEntry,
          workflowEntryName,
        }),
      })
    }
  }

  const commands = buildControlPlaneCommandArtifacts()

  return {
    agents,
    skills,
    commands,
    pluginManifest: buildCopilotPluginManifest(),
    hooksConfig: buildCopilotHooksConfig({ enableSessionStart: true }),
  }
}
```

- [ ] **Step 2: Run copilot tests**

Run: `pnpm run test -- test/copilot-agent-rendering.test.ts test/copilot-skill-rendering.test.ts test/copilot-plugin-manifest.test.ts test/copilot-hooks-config.test.ts test/copilot-direct-mode.test.ts test/copilot-build-artifacts.test.ts`
Expected: All PASS

- [ ] **Step 3: Run type check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/copilot.ts
git commit -m "feat(copilot): implement copilot CLI host adapter"
```

---

### Task 12: Update CLI for Copilot Host

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add `"copilot"` to host validation**

In `src/cli.ts`, find the host validation logic (where `"opencode"`, `"codex"`, `"qwen"`, `"claude"` are listed) and add `"copilot"`:

```typescript
// Find the valid hosts list and add "copilot"
const VALID_HOSTS = ["opencode", "codex", "qwen", "claude", "copilot"]
```

- [ ] **Step 2: Add copilot artifact dispatch**

In the `getArtifactsForHost` function (or equivalent dispatch logic), add:

```typescript
if (host === "copilot") {
  const { buildCopilotArtifacts } = await import("./copilot.js")
  return buildCopilotArtifacts(routerConfig)
}
```

- [ ] **Step 3: Run type check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `pnpm run test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat(copilot): add copilot host to CLI validation and dispatch"
```

---

### Task 13: Update Library Exports

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add copilot exports**

In `src/index.ts`, add:

```typescript
export {
  buildCopilotArtifacts,
  buildCopilotPluginManifest,
  buildCopilotHooksConfig,
  renderCopilotAgentFile,
  renderCopilotSkillFile,
  type CopilotAgentArtifact,
  type CopilotSkillArtifact,
  type CopilotCommandArtifact,
  type CopilotHooksOptions,
  type BuildCopilotArtifactsResult,
} from "./copilot.js"
```

- [ ] **Step 2: Run type check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `pnpm run test`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(copilot): export copilot module public API"
```

---

### Task 14: Add Control Plane Summaries for Copilot

**Files:**
- Modify: `src/control-plane.ts`

- [ ] **Step 1: Add copilot to host-specific summary functions**

In `src/control-plane.ts`, find the `summarizeEffectiveSourceReadiness` or similar function that has host-specific dispatch logic. Add `"copilot"` to any host union types and switch statements.

Look for patterns like:
```typescript
host: "opencode" | "codex" | "qwen" | "claude"
```
and change to:
```typescript
host: "opencode" | "codex" | "qwen" | "claude" | "copilot"
```

Also check `buildControlPlaneExplainTrace`, `buildOpenCodeStatusState`, and `buildOpenCodeNextAction` for host-specific logic.

- [ ] **Step 2: Run type check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/control-plane.ts
git commit -m "feat(copilot): add copilot to control plane host summaries"
```

---

### Task 15: Final Integration — Run All Checks

- [ ] **Step 1: Run full type check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 2: Run all tests**

Run: `pnpm run test`
Expected: All PASS

- [ ] **Step 3: Run build**

Run: `pnpm run build`
Expected: PASS

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "feat(copilot): complete copilot CLI host adapter with agent, plugin, and hooks support"
```
