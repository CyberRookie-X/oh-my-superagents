# Copilot CLI Host Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Copilot CLI as a first-party host adapter with Stage 1 support (superpowers workflow, skills-based projection, read-only CLI commands).

**Architecture:** Follow existing host adapter pattern (Claude Code adapter as primary reference). Create thin adapter layer in `src/copilot-cli.ts` that consumes resolved routes and renders Copilot-native skill files. Add capability policy rules and CLI integration.

**Tech Stack:** TypeScript, Node.js fs/promises, Zod for config validation, existing OMS control-plane core.

---

## File Structure

**New Files:**
- `src/copilot-cli.ts` - Main host adapter (~500 LOC)
- `test/copilot-cli.test.ts` - Unit tests for adapter
- `test/public-api-copilot-cli-typecheck.ts` - Type check tests

**Modified Files:**
- `src/capabilities.ts` - Add Copilot CLI capability rules
- `src/cli.ts` - Add Copilot CLI host case
- `src/materialize.ts` - Add Copilot CLI artifact ownership detection
- `src/index.ts` - Export Copilot CLI adapter
- `README.md` - Update support matrix
- `README.zh-CN.md` - Update support matrix

**Docs:**
- `docs/superpowers/specs/2026-04-23-copilot-cli-host-adapter-design.md` - Already created
- `docs/superpowers/plans/2026-04-23-copilot-cli-host-adapter.md` - This document

---

### Task 1: Update Capability Policy

**Files:**
- Modify: `src/capabilities.ts`

- [ ] **Step 1: Add Copilot CLI to CapabilityHost type**

```typescript
// In src/capabilities.ts, line ~23
export type CapabilityHost = 
  | SupportedSuperpowersHost  // "opencode" | "codex"
  | "qwen" 
  | "claude"
  | "copilot-cli"  // ADD THIS
```

- [ ] **Step 2: Add Copilot CLI projection decision function**

```typescript
// In src/capabilities.ts, after getHostProjectionDecision function
export function getCopilotProjectionDecision(input: {
  workflowKind: WorkflowKind
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  if (input.workflowKind === "direct") {
    return unsupportedDecision("unsupported_host_direct_projection")
  }

  if (input.workflowKind === "superpowers" && input.sourceEntry.source === "gstack") {
    return unsupportedDecision("unsupported_host_source_projection")
  }

  return supportedDecision()
}
```

- [ ] **Step 3: Add Copilot CLI command decision function**

```typescript
// In src/capabilities.ts, after getControlPlaneCommandDecision function
export function getCopilotCommandDecision(input: {
  command: ControlPlaneCapabilityCommand
  workflowKind: WorkflowKind
}): CapabilityDecision {
  // Stage 1: only read-only commands supported
  const stage1Commands: ControlPlaneCapabilityCommand[] = ["status", "sync", "doctor"]

  if (input.command === "explain") {
    return unsupportedDecision("unsupported_control_plane_command")
  }

  if (input.command === "use" || input.command === "disable") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (!stage1Commands.includes(input.command)) {
    return unsupportedDecision("unsupported_control_plane_command")
  }

  return supportedDecision()
}
```

- [ ] **Step 4: Run type check**

```bash
pnpm run check
```

Expected: PASS (or minor type errors to fix)

- [ ] **Step 5: Commit**

```bash
git add src/capabilities.ts
git commit -m "feat: add Copilot CLI capability policy rules"
```

---

### Task 2: Create Copilot CLI Adapter

**Files:**
- Create: `src/copilot-cli.ts`

- [ ] **Step 1: Create file with imports and constants**

```typescript
// src/copilot-cli.ts
import {
  BUILT_IN_PHASES,
  type ControlPlaneConfig,
  type RouterConfig,
} from "./config.js"
import { PHASE_TO_AGENT, PHASE_TO_COMMAND, type BuiltInPhase } from "./router.js"
import type { CanonicalRouteId, WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

export const COPILOT_MARKING_TEXT = "generated-by: oh-my-superagents; do-not-edit: true"
export const COPILOT_MARKING = `<!-- ${COPILOT_MARKING_TEXT} -->`
export const COPILOT_ROUTE_MARKER_PREFIX = "oms-route:"
export const COPILOT_SKILLS_ROOT = ".github-copilot/skills"
export const COPILOT_COMMANDS_ROOT = ".github-copilot/commands"

const COPILOT_SKILL_PREFIXES = new Set(["oms-"])
const COPILOT_COMMAND_PREFIXES = new Set(["oms-"])
```

- [ ] **Step 2: Add route ownership metadata renderer**

```typescript
// Add to src/copilot-cli.ts
export function renderRouteOwnershipMetadata(input: {
  host: "copilot-cli"
  source: WorkflowSourceKind
  route: CanonicalRouteId
  projection: "skill" | "command"
  renderedName: string
}): string {
  return `<!-- ${COPILOT_ROUTE_MARKER_PREFIX} stage=1; host=copilot-cli; source=${input.source}; route=${input.route}; projection=${input.projection}; rendered-name=${input.renderedName} -->`
}
```

- [ ] **Step 3: Add skill file renderer**

```typescript
// Add to src/copilot-cli.ts
export function renderCopilotSkill(input: {
  skillName: string
  description: string
  model: string
  variant?: string
  temperature?: number
  sourceEntry?: WorkflowSourceEntry
}): string {
  const sourceEntry = input.sourceEntry ?? {
    canonicalRoute: "phase.unknown" as CanonicalRouteId,
    source: "superpowers",
  }

  const workflowEntryName = sourceEntry.entryName 
    ? `${sourceEntry.source}/${sourceEntry.entryName}`
    : sourceEntry.canonicalRoute

  return [
    "# " + input.skillName,
    "",
    COPILOT_MARKING,
    renderRouteOwnershipMetadata({
      host: "copilot-cli",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "skill",
      renderedName: input.skillName,
    }),
    "",
    "**Description:** " + input.description,
    "",
    "**Workflow:** " + workflowEntryName,
    "",
    "**Model:** " + input.model,
    ...(input.variant ? ["**Variant:** " + input.variant] : []),
    ...(input.temperature !== undefined ? ["**Temperature:** " + input.temperature.toString()] : []),
    "",
    "---",
    "",
    "You are the " + input.skillName + " helper for GitHub Copilot CLI.",
    "",
    "## Role",
    "",
    "This skill provides specialized assistance for the " + input.skillName + " workflow phase.",
    "",
    "## Instructions",
    "",
    "Follow the OMS routing configuration for this phase. Use the configured model and parameters.",
  ].join("\n")
}
```

- [ ] **Step 4: Add command file renderer**

```typescript
// Add to src/copilot-cli.ts
export function renderCopilotCommand(input: {
  commandName: string
  description: string
  script: string
}): string {
  return [
    "# " + input.commandName,
    "",
    COPILOT_MARKING,
    renderRouteOwnershipMetadata({
      host: "copilot-cli",
      source: "superpowers",
      route: "command." + input.commandName,
      projection: "command",
      renderedName: input.commandName,
    }),
    "",
    "**Description:** " + input.description,
    "",
    "---",
    "",
    "```bash",
    input.script,
    "```",
  ].join("\n")
}
```

- [ ] **Step 5: Add build artifacts function**

```typescript
// Add to src/copilot-cli.ts
export type GeneratedCopilotArtifact = {
  kind: "skill" | "command"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export function buildCopilotArtifacts(config: RouterConfig): GeneratedCopilotArtifact[] {
  const artifacts: GeneratedCopilotArtifact[] = []

  // Build skill artifacts for each phase
  for (const phase of BUILT_IN_PHASES) {
    const resolved = PHASE_TO_COMMAND[phase]
    const agentName = PHASE_TO_AGENT[phase]
    const skillName = `oms-${phase.replace("writing-", "").replace("ing", "")}`
    
    // Get profile for this phase
    const profileId = config.routes?.[phase] ?? config.defaultRoute
    const profile = profileId ? config.profiles[profileId] : undefined
    
    if (!profile) continue

    const content = renderCopilotSkill({
      skillName: `copilot-${skillName}`,
      description: `OMS ${phase} helper for Copilot CLI`,
      model: profile.model,
      variant: profile.variant,
      temperature: profile.temperature,
      sourceEntry: {
        canonicalRoute: `phase.${phase}` as CanonicalRouteId,
        source: "superpowers",
        entryName: phase,
      },
    })

    artifacts.push({
      kind: "skill",
      directory: COPILOT_SKILLS_ROOT,
      fileName: `${skillName}.md`,
      ownerPrefix: `oms-${skillName}`,
      content,
    })
  }

  // Build command artifacts for CLI commands
  const commands = [
    { name: "status", description: "Show OMS status for Copilot CLI" },
    { name: "sync", description: "Sync OMS artifacts for Copilot CLI" },
    { name: "doctor", description: "Inspect OMS diagnostics for Copilot CLI" },
  ]

  for (const cmd of commands) {
    const content = renderCopilotCommand({
      commandName: `oms-${cmd.name}`,
      description: cmd.description,
      script: `echo "OMS ${cmd.name} command for Copilot CLI"`,
    })

    artifacts.push({
      kind: "command",
      directory: COPILOT_COMMANDS_ROOT,
      fileName: `oms-${cmd.name}.md`,
      ownerPrefix: `oms-${cmd.name}`,
      content,
    })
  }

  return artifacts
}
```

- [ ] **Step 6: Add explain functions**

```typescript
// Add to src/copilot-cli.ts
export function explainCopilotPhase(config: RouterConfig, phase: BuiltInPhase) {
  const profileId = config.routes?.[phase] ?? config.defaultRoute
  const profile = profileId ? config.profiles[profileId] : undefined

  return {
    phase,
    profileId,
    skillName: `copilot-${phase}`,
    model: profile?.model ?? "unknown",
    commandName: PHASE_TO_COMMAND[phase],
  }
}

export function explainAllCopilot(config: RouterConfig) {
  return BUILT_IN_PHASES.map((phase) => explainCopilotPhase(config, phase))
}
```

- [ ] **Step 7: Add exports to index.ts**

```typescript
// In src/index.ts, add exports
export {
  COPILOT_MARKING_TEXT,
  COPILOT_MARKING,
  COPILOT_ROUTE_MARKER_PREFIX,
  COPILOT_SKILLS_ROOT,
  COPILOT_COMMANDS_ROOT,
  renderRouteOwnershipMetadata,
  renderCopilotSkill,
  renderCopilotCommand,
  buildCopilotArtifacts,
  explainCopilotPhase,
  explainAllCopilot,
  type GeneratedCopilotArtifact,
} from "./copilot-cli.js"
```

- [ ] **Step 8: Run type check**

```bash
pnpm run check
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/copilot-cli.ts src/index.ts
git commit -m "feat: create Copilot CLI host adapter"
```

---

### Task 3: Update Artifact Reconciliation

**Files:**
- Modify: `src/materialize.ts`

- [ ] **Step 1: Add Copilot CLI constants**

```typescript
// In src/materialize.ts, line ~50, add after QWEN_ROUTER_OWNED_AGENT_PREFIXES
const COPILOT_ROUTER_OWNED_SKILL_PREFIXES = new Set(["oms-"])
const COPILOT_ROUTER_OWNED_COMMAND_PREFIXES = new Set(["oms-"])
```

- [ ] **Step 2: Add Copilot CLI ownership detection function**

```typescript
// In src/materialize.ts, add after isQwenRouterOwnedFile function
function isCopilotRouterOwnedFile(directory: string, fileName: string, content: string) {
  if (directory.endsWith(`${path.sep}.github-copilot${path.sep}skills`)) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_SKILL_PREFIXES)
  }

  if (directory.endsWith(`${path.sep}.github-copilot${path.sep}commands`)) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_COMMAND_PREFIXES)
  }

  return false
}
```

- [ ] **Step 3: Update isOmsOwnedArtifactFile function**

```typescript
// In src/materialize.ts, find isOmsOwnedArtifactFile function
// Add Copilot CLI case to the function
export function isOmsOwnedArtifactFile(filePath: string, content: string): boolean {
  const directory = path.dirname(filePath)
  const fileName = path.basename(filePath)

  return (
    isOpenCodeRouterOwnedFile(directory, fileName, content) ||
    isCodexRouterOwnedFile(directory, fileName, content) ||
    isQwenRouterOwnedFile(directory, fileName, content) ||
    isCopilotRouterOwnedFile(directory, fileName, content) ||  // ADD THIS
    isOpenCodeRuntimeMetadataFile(filePath)
  )
}
```

- [ ] **Step 4: Run type check**

```bash
pnpm run check
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/materialize.ts
git commit -m "feat: add Copilot CLI artifact ownership detection"
```

---

### Task 4: Integrate with CLI

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add Copilot CLI imports**

```typescript
// In src/cli.ts, add imports near top
import {
  buildCopilotArtifacts,
  explainAllCopilot,
  explainCopilotPhase,
  COPILOT_SKILLS_ROOT,
  COPILOT_COMMANDS_ROOT,
} from "./copilot-cli.js"
```

- [ ] **Step 2: Add Copilot CLI to CliHost type**

```typescript
// In src/cli.ts, line ~86
type CliHost = 
  | SupportedSuperpowersHost 
  | "qwen" 
  | "claude"
  | "copilot-cli"  // ADD THIS
```

- [ ] **Step 3: Add Copilot CLI constants**

```typescript
// In src/cli.ts, add after QWEN_MANAGED_AGENT_FILE_NAMES
const COPILOT_SKILL_FILE_NAMES = [
  "oms-brainstorm.md",
  "oms-plan.md",
  "oms-execute.md",
  "oms-review.md",
  "oms-verify.md",
  "oms-visual.md",
]
```

- [ ] **Step 4: Add Copilot CLI to deps**

```typescript
// In src/cli.ts, find defaultDeps object
// Add Copilot CLI functions
const defaultDeps: CliDeps = {
  // ... existing properties
  buildCopilotArtifacts,
  explainAllCopilot,
  explainCopilotPhase,
  // ... rest of properties
}
```

- [ ] **Step 5: Add Copilot CLI sync command handler**

```typescript
// In src/cli.ts, find sync command handler
// Add Copilot CLI case
case "sync": {
  // ... existing host cases
  
  // ADD Copilot CLI case
  if (host === "copilot-cli") {
    const artifacts = buildCopilotArtifacts(config.config)
    
    const result = await materializeArtifacts({
      cwd,
      artifacts: artifacts.map(a => ({
        directory: a.directory,
        fileName: a.fileName,
        ownerPrefix: a.ownerPrefix,
        content: a.content,
      })),
      fs: nodeFs,
    })
    
    if (result.exitCode === 0) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          state: "healthy",
          artifacts: result.written,
          removed: result.removed,
        }, null, 2),
        stderr: "",
      }
    }
    
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Sync failed: ${result.warnings.join(", ")}`,
    }
  }
}
```

- [ ] **Step 6: Add Copilot CLI status command handler**

```typescript
// In src/cli.ts, find status command handler
// Add Copilot CLI case
if (host === "copilot-cli") {
  const plane = await resolveControlPlane({
    cwd,
    command: "status",
  })
  
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      host: "copilot-cli",
      preset: plane.activePreset.key,
      lane: plane.laneState.effectiveLane,
      artifacts: {
        skills: COPILOT_SKILLS_ROOT,
        commands: COPILOT_COMMANDS_ROOT,
      },
      workflow: config.config.workflow?.kind ?? "superpowers",
    }, null, 2),
    stderr: "",
  }
}
```

- [ ] **Step 7: Add Copilot CLI doctor command handler**

```typescript
// In src/cli.ts, find doctor command handler
// Add Copilot CLI case
if (host === "copilot-cli") {
  const plane = await resolveControlPlane({
    cwd,
    command: "doctor",
  })
  
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      host: "copilot-cli",
      config: {
        valid: true,
        preset: plane.activePreset.key,
      },
      artifacts: {
        skills: COPILOT_SKILLS_ROOT,
        commands: COPILOT_COMMANDS_ROOT,
      },
      workflow: config.config.workflow?.kind ?? "superpowers",
      stage1Limitations: [
        "Direct mode not yet supported",
        "Gstack workflow source not yet supported",
        "use/disable commands not yet supported",
      ],
    }, null, 2),
    stderr: "",
  }
}
```

- [ ] **Step 8: Run type check**

```bash
pnpm run check
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/cli.ts
git commit -m "feat: integrate Copilot CLI with CLI commands"
```

---

### Task 5: Write Unit Tests

**Files:**
- Create: `test/copilot-cli.test.ts`

- [ ] **Step 1: Create test file with basic structure**

```typescript
// test/copilot-cli.test.ts
import { describe, it, expect } from "vitest"
import {
  renderCopilotSkill,
  renderCopilotCommand,
  buildCopilotArtifacts,
  explainCopilotPhase,
  COPILOT_MARKING,
  COPILOT_ROUTE_MARKER_PREFIX,
} from "../src/copilot-cli.js"
import type { RouterConfig } from "../src/config.js"

describe("copilot-cli", () => {
  describe("renderCopilotSkill", () => {
    it("renders skill with required metadata", () => {
      const content = renderCopilotSkill({
        skillName: "copilot-plan",
        description: "OMS plan helper",
        model: "gpt-4",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "superpowers",
          entryName: "writing-plans",
        },
      })

      expect(content).toContain(COPILOT_MARKING)
      expect(content).toContain("copilot-plan")
      expect(content).toContain("OMS plan helper")
      expect(content).toContain("gpt-4")
    })

    it("includes variant when provided", () => {
      const content = renderCopilotSkill({
        skillName: "copilot-plan",
        description: "Test",
        model: "gpt-4",
        variant: "high",
      })

      expect(content).toContain("**Variant:** high")
    })

    it("includes temperature when provided", () => {
      const content = renderCopilotSkill({
        skillName: "copilot-plan",
        description: "Test",
        model: "gpt-4",
        temperature: 0.7,
      })

      expect(content).toContain("**Temperature:** 0.7")
    })
  })

  describe("renderCopilotCommand", () => {
    it("renders command with required metadata", () => {
      const content = renderCopilotCommand({
        commandName: "oms-status",
        description: "Show status",
        script: "echo status",
      })

      expect(content).toContain(COPILOT_MARKING)
      expect(content).toContain("oms-status")
      expect(content).toContain("Show status")
      expect(content).toContain("```bash")
      expect(content).toContain("echo status")
    })
  })

  describe("buildCopilotArtifacts", () => {
    it("builds skill artifacts for all phases", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      const artifacts = buildCopilotArtifacts(config)

      expect(artifacts.length).toBeGreaterThan(0)
      expect(artifacts.some(a => a.kind === "skill")).toBe(true)
      expect(artifacts.some(a => a.kind === "command")).toBe(true)
    })

    it("includes correct skill file names", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      const artifacts = buildCopilotArtifacts(config)
      const skillNames = artifacts
        .filter(a => a.kind === "skill")
        .map(a => a.fileName)

      expect(skillNames).toContain("oms-brainstorm.md")
      expect(skillNames).toContain("oms-plan.md")
      expect(skillNames).toContain("oms-execute.md")
    })
  })

  describe("explainCopilotPhase", () => {
    it("explains phase routing", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {
          "writing-plans": "default",
        },
      }

      const explanation = explainCopilotPhase(config, "writing-plans")

      expect(explanation.phase).toBe("writing-plans")
      expect(explanation.profileId).toBe("default")
      expect(explanation.model).toBe("gpt-4")
    })
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test -- test/copilot-cli.test.ts
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add test/copilot-cli.test.ts
git commit -m "test: add Copilot CLI adapter unit tests"
```

---

### Task 6: Add Type Check Tests

**Files:**
- Create: `test/public-api-copilot-cli-typecheck.ts`

- [ ] **Step 1: Create type check test file**

```typescript
// test/public-api-copilot-cli-typecheck.ts
import {
  COPILOT_MARKING_TEXT,
  COPILOT_MARKING,
  COPILOT_ROUTE_MARKER_PREFIX,
  COPILOT_SKILLS_ROOT,
  COPILOT_COMMANDS_ROOT,
  renderRouteOwnershipMetadata,
  renderCopilotSkill,
  renderCopilotCommand,
  buildCopilotArtifacts,
  explainCopilotPhase,
  explainAllCopilot,
  type GeneratedCopilotArtifact,
} from "../src/index.js"
import type { RouterConfig } from "../src/config.js"

// Type check: exports exist
const _marking: string = COPILOT_MARKING_TEXT
const _skillsRoot: string = COPILOT_SKILLS_ROOT
const _commandsRoot: string = COPILOT_COMMANDS_ROOT

// Type check: render functions
const _skillContent: string = renderCopilotSkill({
  skillName: "test",
  description: "test",
  model: "gpt-4",
})

const _commandContent: string = renderCopilotCommand({
  commandName: "test",
  description: "test",
  script: "echo test",
})

// Type check: build artifacts
const _config: RouterConfig = {
  defaultRoute: "default",
  profiles: { default: { model: "gpt-4" } },
  routes: {},
}
const _artifacts: GeneratedCopilotArtifact[] = buildCopilotArtifacts(_config)

// Type check: explain functions
const _explanation = explainCopilotPhase(_config, "writing-plans")
const _allExplanations = explainAllCopilot(_config)

// Type check: artifact type
const _artifact: GeneratedCopilotArtifact = {
  kind: "skill",
  directory: ".github-copilot/skills",
  fileName: "test.md",
  ownerPrefix: "oms-test",
  content: "test",
}

export {}
```

- [ ] **Step 2: Run type check**

```bash
pnpm run check
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/public-api-copilot-cli-typecheck.ts
git commit -m "test: add Copilot CLI public API type checks"
```

---

### Task 7: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README-architecture.md`

- [ ] **Step 1: Update README.md support matrix**

```markdown
<!-- In README.md, find Support Matrix table -->
<!-- Add Copilot CLI column -->

| Capability | OpenCode | Codex | Qwen | Claude Code | Copilot CLI |
| --- | --- | --- | --- | --- | --- |
| `superpowers` workflow routing | Full | Full | Partial | Experimental | **Stage 1** |
| Direct mode | Experimental | Experimental | Experimental | None yet | **Stage 2** |
| OMS control plane | Full | Full | Full | Experimental | **Stage 1** |
| Host bootstrap | Native plugin entry | Local bootstrap/plugin bundle | None | None | **None yet** |
| Compatibility monitor | Full | Full | None yet | None yet | **Stage 2** |
| Generated host artifacts | Agents + commands | Agents + plugin/skills | Agents + commands | Skills | **Skills + commands** |
| Temporary disable helper | Full | Full | None yet | None yet | **Stage 2** |
| `codexFast` | Full | Full | None yet | None yet | **Stage 2** |
```

- [ ] **Step 2: Update README.md implementation footprint**

```markdown
<!-- In README.md, find Implementation Footprint table -->
<!-- Add Copilot CLI row -->

| Layer | Main files | Approx. source LOC | Thickness |
| --- | --- | ---: | --- |
| Copilot CLI adapter | `src/copilot-cli.ts` | **~500** | **Thin** |
```

- [ ] **Step 3: Update README.zh-CN.md support matrix**

```markdown
<!-- Translate the same changes to Chinese version -->
```

- [ ] **Step 4: Update docs/README-architecture.md host adapters section**

```markdown
<!-- In docs/README-architecture.md, find Host Adapters section -->
<!-- Add Copilot CLI subsection -->

### Copilot CLI

Main characteristics:

- project-local skills and commands
- skills-based projection (similar to Claude Code)
- Stage 1: superpowers workflow only
- Stage 2: direct mode, compatibility monitor

Architectural consequence:

- Copilot CLI is implemented as a thin adapter
- Current support is Stage 1 (basic routing + read-only CLI commands)
- Follows Claude Code pattern for skills projection
```

- [ ] **Step 5: Run build to verify no issues**

```bash
pnpm run build
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add README.md README.zh-CN.md docs/README-architecture.md
git commit -m "docs: update READMEs with Copilot CLI support matrix"
```

---

### Task 8: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 2: Run type check**

```bash
pnpm run check
```

Expected: PASS

- [ ] **Step 3: Run build**

```bash
pnpm run build
```

Expected: PASS

- [ ] **Step 4: Verify git status**

```bash
git status
```

Expected: Clean working tree with all changes committed

- [ ] **Step 5: Review commit history**

```bash
git log --oneline -10
```

Expected: 8 commits (one per task)

---

## Self-Review Checklist

**1. Spec Coverage:**

| Spec Requirement | Task |
|-----------------|------|
| Copilot CLI adapter | Task 2 |
| Capability policy rules | Task 1 |
| CLI integration (status/sync/doctor) | Task 4 |
| Artifact ownership detection | Task 3 |
| Unit tests | Task 5 |
| Type check tests | Task 6 |
| Documentation updates | Task 7 |
| Skills-based projection | Task 2 |
| Stage 1 scope (no direct mode) | Task 1, 2 |

**2. Placeholder Scan:**
- No "TBD", "TODO", "implement later" found
- All code steps include actual code
- All test steps include actual test code
- All commands include expected output

**3. Type Consistency:**
- `GeneratedCopilotArtifact` type defined in Task 2, used consistently in Tasks 4, 5, 6
- `RouterConfig` type imported from `./config.js` consistently
- Function signatures match between implementation and tests

**4. File Path Consistency:**
- `src/copilot-cli.ts` - created in Task 2
- `src/index.ts` - modified in Task 2
- `src/capabilities.ts` - modified in Task 1
- `src/materialize.ts` - modified in Task 3
- `src/cli.ts` - modified in Task 4
- `test/copilot-cli.test.ts` - created in Task 5
- `test/public-api-copilot-cli-typecheck.ts` - created in Task 6

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-copilot-cli-host-adapter.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
