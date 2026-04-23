# Copilot CLI Host Deep Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Copilot CLI as a first-party host adapter with deep integration using the Agent + Plugin + Hooks approach.

**Architecture:** Thin host adapter following the same canonical route model as other hosts. Generates Copilot-native agents, skills, and hooks from resolved routing decisions.

**Tech Stack:** TypeScript, Zod validation, Vitest testing

---

### Task 1: Create Copilot Host Adapter Core

**Files:**
- Create: `src/copilot.ts`
- Modify: `src/index.ts:1-40`

- [ ] **Step 1: Write the failing test**

```typescript
// test/copilot.test.ts
import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

describe("renderCopilotAgentFile", () => {
  it("renders a Copilot-native agent file with source-aware instructions", () => {
    const output = library.renderCopilotAgentFile({
      name: "oms-plan",
      phase: "writing-plans",
      profileId: "planner",
      model: "anthropic/claude-sonnet-4-5",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "superpowers",
        entryName: "writing-plans",
      },
      workflowEntryName: "superpowers/writing-plans",
    })

    expect(output).toContain("# generated-by: oh-my-superagents; do-not-edit: true")
    expect(output).toContain(
      "<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.plan; projection=agent; rendered-name=oms-plan -->",
    )
    expect(output).toContain("# Agent: oms-plan")
    expect(output).toContain("Use the workflow entry `superpowers/writing-plans` for `phase.plan` whenever it is relevant.")
    expect(output).toContain(
      "If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.",
    )
    expect(output).toContain("- profile: `planner`")
    expect(output).toContain("- model: `anthropic/claude-sonnet-4-5`")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/copilot.test.ts`
Expected: FAIL with "renderCopilotAgentFile is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/copilot.ts
import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, type BuiltInPhase } from "./router.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

const PHASE_TO_COPILOT_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

export type CopilotAgentArtifact = {
  kind: "agent"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type RenderCopilotAgentFileInput = {
  name: string
  phase: BuiltInPhase
  profileId: string
  model: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName: string
}

function renderCopilotRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${input.source}; route=${input.route}; projection=agent; rendered-name=${input.renderedName} -->`
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function formatCopilotWorkflowGuidance(input: { sourceEntry: WorkflowSourceEntry; workflowEntryName: string }) {
  if (input.sourceEntry.source === "gstack") {
    return `Use the gstack workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`
  }

  return `Use the workflow entry \`${input.workflowEntryName}\` for \`${input.sourceEntry.canonicalRoute}\` whenever it is relevant.`
}

export function renderCopilotAgentFile(input: RenderCopilotAgentFileInput) {
  return [
    `# ${MARKER_TEXT}`,
    renderCopilotRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      renderedName: input.name,
    }),
    "",
    `# Agent: ${input.name}`,
    "",
    "## Purpose",
    `This project-scoped Copilot wrapper routes the \`${input.phase}\` phase through OMS profile \`${input.profileId}\`.`,
    "",
    "## Instructions",
    formatCopilotWorkflowGuidance({
      sourceEntry: input.sourceEntry,
      workflowEntryName: input.workflowEntryName,
    }),
    `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.`,
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
    "## Route Metadata",
    `- canonical route: \`${input.sourceEntry.canonicalRoute}\``,
    `- source: \`${input.sourceEntry.source}\``,
    `- profile: \`${input.profileId}\``,
    `- model: \`${input.model}\``,
    "",
  ].join("\n")
}

export function buildCopilotArtifacts(config: RouterConfig) {
  const agents = BUILT_IN_PHASES.map<CopilotAgentArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_COPILOT_AGENT[phase]

    return {
      kind: "agent",
      directory: `.github/copilot/agents`,
      fileName: `${agentName}.md`,
      ownerPrefix: "oms-",
      content: renderCopilotAgentFile({
        name: agentName,
        phase,
        profileId: resolved.profileId,
        model: resolved.selection.model,
        sourceEntry: resolved.sourceEntry,
        workflowEntryName: formatWorkflowEntryName(resolved.sourceEntry),
      }),
    }
  })

  return { agents }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/copilot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot.ts test/copilot.test.ts
git commit -m "feat(copilot): add basic agent rendering for Copilot CLI host adapter"
```

---

### Task 2: Add Copilot Control-Plane Skills

**Files:**
- Modify: `src/copilot.ts`
- Modify: `test/copilot.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to test/copilot.test.ts
describe("buildCopilotArtifacts - control-plane skills", () => {
  it("renders skill files for all control-plane commands", () => {
    const artifacts = library.buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
    } as never)

    expect(artifacts.skills.map((item) => `${item.directory}/${item.fileName}`)).toEqual([
      ".github/copilot/skills/oms-status/SKILL.md",
      ".github/copilot/skills/oms-use/SKILL.md",
      ".github/copilot/skills/oms-disable/SKILL.md",
      ".github/copilot/skills/oms-sync/SKILL.md",
      ".github/copilot/skills/oms-doctor/SKILL.md",
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/copilot.test.ts`
Expected: FAIL with "artifacts.skills is undefined"

- [ ] **Step 3: Write minimal implementation**

Add to `src/copilot.ts`:

```typescript
import {
  BUILT_IN_PHASES,
  CONTROL_PLANE_COMMAND_KEYS,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type RouterConfig,
} from "./config.js"

export type CopilotSkillArtifact = {
  kind: "skill"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot CLI.",
  use: "Switch OMS to the selected preset for Copilot CLI.",
  disable: "Disable OMS for Copilot CLI.",
  sync: "Sync OMS artifacts for Copilot CLI.",
  doctor: "Inspect OMS diagnostics for Copilot CLI.",
}

function renderCopilotControlPlaneMetadata(input: {
  host: "copilot"
  artifact: "skill"
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return `<!-- oms-control-plane: stage=1; host=${input.host}; artifact=${input.artifact}; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`
}

export function renderCopilotSkillFile(input: {
  name: string
  command: ControlPlaneCommandKey
}) {
  return [
    `# ${MARKER_TEXT}`,
    renderCopilotControlPlaneMetadata({
      host: "copilot",
      artifact: "skill",
      logicalCommand: input.command,
      renderedName: input.name,
    }),
    "",
    `# Skill: ${input.name}`,
    "",
    "## Purpose",
    CONTROL_PLANE_COMMAND_DESCRIPTIONS[input.command],
    "",
    "## Instructions",
    `Run \`oh-my-superagents ${input.command} --host copilot\` and present the results.`,
    "",
  ].join("\n")
}

export function buildCopilotControlPlaneSkills(config: RouterConfig) {
  const commandPrefix = config.commandPrefix ?? "oms"

  return CONTROL_PLANE_COMMAND_KEYS.map<CopilotSkillArtifact>((command) => {
    const skillName = `${commandPrefix}-${command}`

    return {
      kind: "skill",
      directory: `.github/copilot/skills/${skillName}`,
      fileName: "SKILL.md",
      ownerPrefix: "oms-",
      content: renderCopilotSkillFile({
        name: skillName,
        command,
      }),
    }
  })
}
```

Update `buildCopilotArtifacts` to include skills:

```typescript
export function buildCopilotArtifacts(config: RouterConfig) {
  const agents = BUILT_IN_PHASES.map<CopilotAgentArtifact>((phase) => {
    // ... existing agent code
  })

  const skills = buildCopilotControlPlaneSkills(config)

  return { agents, skills }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/copilot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot.ts test/copilot.test.ts
git commit -m "feat(copilot): add control-plane skill rendering for Copilot CLI"
```

---

### Task 3: Add Copilot Hooks Generation

**Files:**
- Modify: `src/copilot.ts`
- Modify: `test/copilot.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to test/copilot.test.ts
describe("buildCopilotArtifacts - hooks", () => {
  it("renders pre and post command hooks", () => {
    const artifacts = library.buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
    } as never)

    expect(artifacts.hooks.map((item) => `${item.directory}/${item.fileName}`)).toEqual([
      ".github/copilot/hooks/pre-command.sh",
      ".github/copilot/hooks/post-command.sh",
    ])

    const preHook = artifacts.hooks.find((item) => item.fileName === "pre-command.sh")
    expect(preHook?.content).toContain("#!/bin/bash")
    expect(preHook?.content).toContain("generated-by: oh-my-superagents")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/copilot.test.ts`
Expected: FAIL with "artifacts.hooks is undefined"

- [ ] **Step 3: Write minimal implementation**

Add to `src/copilot.ts`:

```typescript
export type CopilotHookArtifact = {
  kind: "hook"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
  executable: boolean
}

function renderCopilotHookMetadata(input: {
  host: "copilot"
  hook: "pre-command" | "post-command"
  renderedName: string
}) {
  return `<!-- oms-hook: stage=1; host=${input.host}; hook=${input.hook}; rendered-name=${input.renderedName} -->`
}

export function renderCopilotPreCommandHook() {
  return [
    "#!/bin/bash",
    `# ${MARKER_TEXT}`,
    renderCopilotHookMetadata({
      host: "copilot",
      hook: "pre-command",
      renderedName: "pre-command.sh",
    }),
    "",
    "# Pre-command hook for OMS Copilot integration",
    "# Validates OMS state before command execution",
    "",
    'COMMAND="$1"',
    'if [ -f ".copilot/oh-my-superagents/state.json" ]; then',
    '  STATE=$(cat .copilot/oh-my-superagents/state.json)',
    '  if echo "$STATE" | grep -q \'"enabled": false\'; then',
    '    echo "OMS is disabled for this project"',
    "    exit 0",
    "  fi",
    "fi",
    "",
  ].join("\n")
}

export function renderCopilotPostCommandHook() {
  return [
    "#!/bin/bash",
    `# ${MARKER_TEXT}`,
    renderCopilotHookMetadata({
      host: "copilot",
      hook: "post-command",
      renderedName: "post-command.sh",
    }),
    "",
    "# Post-command hook for OMS Copilot integration",
    "# Handles cleanup after command execution",
    "",
    'COMMAND="$1"',
    'EXIT_CODE="$2"',
    "",
    "# Log command execution for diagnostics",
    'if [ -d ".copilot/oh-my-superagents/logs" ]; then',
    '  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $COMMAND $EXIT_CODE" >> .copilot/oh-my-superagents/logs/commands.log',
    "fi",
    "",
  ].join("\n")
}

export function buildCopilotHooks() {
  return [
    {
      kind: "hook" as const,
      directory: ".github/copilot/hooks",
      fileName: "pre-command.sh",
      ownerPrefix: "oms-",
      content: renderCopilotPreCommandHook(),
      executable: true,
    },
    {
      kind: "hook" as const,
      directory: ".github/copilot/hooks",
      fileName: "post-command.sh",
      ownerPrefix: "oms-",
      content: renderCopilotPostCommandHook(),
      executable: true,
    },
  ]
}
```

Update `buildCopilotArtifacts` to include hooks:

```typescript
export function buildCopilotArtifacts(config: RouterConfig) {
  const agents = BUILT_IN_PHASES.map<CopilotAgentArtifact>((phase) => {
    // ... existing agent code
  })

  const skills = buildCopilotControlPlaneSkills(config)
  const hooks = buildCopilotHooks()

  return { agents, skills, hooks }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/copilot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot.ts test/copilot.test.ts
git commit -m "feat(copilot): add hooks generation for Copilot CLI lifecycle"
```

---

### Task 4: Update Capability Policy for Copilot

**Files:**
- Modify: `src/capabilities.ts:24-97`
- Modify: `test/capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to test/capabilities.test.ts
describe("getHostProjectionDecision - copilot", () => {
  it("supports superpowers workflow on copilot", () => {
    const decision = library.getHostProjectionDecision({
      host: "copilot",
      workflowKind: "superpowers",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "superpowers",
      },
    })

    expect(decision.supported).toBe(true)
  })

  it("blocks direct workflow on copilot", () => {
    const decision = library.getHostProjectionDecision({
      host: "copilot",
      workflowKind: "direct",
      sourceEntry: {
        canonicalRoute: "intent.plan",
        source: "direct",
      },
    })

    expect(decision.supported).toBe(false)
    expect(decision.reasonCode).toBe("unsupported_host_direct_projection")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/capabilities.test.ts`
Expected: FAIL with "copilot is not a valid host"

- [ ] **Step 3: Write minimal implementation**

Update `src/capabilities.ts`:

```typescript
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"

export function getHostProjectionDecision(input: {
  host: CapabilityHost
  workflowKind: WorkflowKind
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  if (!isSourceRouteSupported(input.sourceEntry.source, input.sourceEntry.canonicalRoute)) {
    return unsupportedDecision("unsupported_source_route")
  }

  if (input.host === "copilot" && input.workflowKind === "direct") {
    return unsupportedDecision("unsupported_host_direct_projection")
  }

  if (input.host === "claude" && input.workflowKind === "direct") {
    return unsupportedDecision("unsupported_host_direct_projection")
  }

  if (input.host === "qwen" && input.workflowKind === "superpowers" && input.sourceEntry.source === "gstack") {
    return unsupportedDecision("unsupported_host_source_projection")
  }

  return supportedDecision()
}

export function getControlPlaneCommandDecision(input: {
  host: CapabilityHost
  command: ControlPlaneCapabilityCommand
  workflowKind: WorkflowKind
}): CapabilityDecision {
  if (input.command === "explain" && input.host === "qwen") {
    return unsupportedDecision("unsupported_control_plane_command")
  }

  if (input.workflowKind === "direct" && input.host === "claude") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (input.workflowKind === "direct" && input.host === "copilot") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (input.workflowKind === "direct" && (input.command === "use" || input.command === "disable")) {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (input.workflowKind === "direct" && input.command === "explain" && input.host !== "opencode" && input.host !== "codex") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  return supportedDecision()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/capabilities.ts test/capabilities.test.ts
git commit -m "feat(copilot): add capability policy for Copilot CLI host"
```

---

### Task 5: Add Copilot CLI Commands

**Files:**
- Modify: `src/cli.ts:86-100`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to test/cli.test.ts
describe("CLI - Copilot host support", () => {
  it("supports --host copilot for status command", async () => {
    const result = await library.runCli(["status", "--host", "copilot"], {
      cwd: "/tmp/test-project",
      fs: createMockFs(),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("host")
    expect(result.stdout).toContain("copilot")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL with "copilot is not a supported host"

- [ ] **Step 3: Write minimal implementation**

Update `src/cli.ts`:

```typescript
type CliHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"

// In the CLI parsing logic, add copilot to the host options
const HOST_OPTIONS = ["opencode", "codex", "qwen", "claude", "copilot"] as const

// In the status command handler
if (host === "copilot") {
  // Handle Copilot-specific status output
  const copilotArtifacts = buildCopilotArtifacts(config)
  // ... format and return status
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat(copilot): add CLI commands for Copilot CLI host"
```

---

### Task 6: Add Copilot to Materialize

**Files:**
- Modify: `src/materialize.ts:44-53`
- Modify: `test/materialize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to test/materialize.test.ts
describe("isOmsOwnedArtifactFile - Copilot", () => {
  it("detects Copilot agent files as OMS-owned", () => {
    const content = "# generated-by: oh-my-superagents; do-not-edit: true\n# Agent: oms-plan"
    expect(library.isOmsOwnedArtifactFile(".github/copilot/agents/oms-plan.md", content)).toBe(true)
  })

  it("detects Copilot skill files as OMS-owned", () => {
    const content = "# generated-by: oh-my-superagents; do-not-edit: true\n# Skill: oms-status"
    expect(library.isOmsOwnedArtifactFile(".github/copilot/skills/oms-status/SKILL.md", content)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/materialize.test.ts`
Expected: FAIL with test assertion error

- [ ] **Step 3: Write minimal implementation**

Update `src/materialize.ts`:

```typescript
const COPILOT_ROUTER_OWNED_AGENT_PREFIXES = new Set(["oms-"])
const COPILOT_ROUTER_OWNED_SKILL_PREFIXES = new Set(["oms-"])

// In the isOmsOwnedArtifactFile function
function isCopilotOwnedArtifact(fileName: string, content: string): boolean {
  if (!fileName.startsWith(".github/copilot/")) {
    return false
  }

  if (fileName.includes("/agents/")) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_AGENT_PREFIXES)
  }

  if (fileName.includes("/skills/")) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_SKILL_PREFIXES)
  }

  return hasArtifactOwnershipMarker(content)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/materialize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/materialize.ts test/materialize.test.ts
git commit -m "feat(copilot): add Copilot artifact ownership detection"
```

---

### Task 7: Export Copilot Module

**Files:**
- Modify: `src/index.ts:1-40`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to test/index.test.ts
describe("public API - Copilot exports", () => {
  it("exports Copilot rendering functions", () => {
    expect(library.renderCopilotAgentFile).toBeDefined()
    expect(library.renderCopilotSkillFile).toBeDefined()
    expect(library.buildCopilotArtifacts).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/index.test.ts`
Expected: FAIL with "renderCopilotAgentFile is not defined"

- [ ] **Step 3: Write minimal implementation**

Update `src/index.ts`:

```typescript
export * from "./copilot.js"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/index.test.ts
git commit -m "feat(copilot): export Copilot module in public API"
```

---

### Task 8: Run Full Test Suite

**Files:**
- None

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: verify Copilot CLI integration passes all checks"
```
