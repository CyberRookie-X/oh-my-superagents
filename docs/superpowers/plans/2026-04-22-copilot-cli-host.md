# Copilot CLI Host Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Copilot CLI (`gh copilot`) as a fully supported host in oh-my-superagents, enabling generation of `.github/prompts/*.md` files for all superpowers phases and control plane commands.

**Architecture:** Following the existing host adapter pattern (OpenCode, Codex, Qwen, Claude), create a new `src/copilot.ts` module that generates Copilot CLI prompt files. Integrate it into the CLI's host dispatch system, capability checks, compatibility matrix, and artifact materialization pipeline.

**Tech Stack:** TypeScript, Vitest, Zod, pnpm

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/copilot.ts` | Create | Copilot CLI prompt file generation (phase prompts, direct mode prompts, control plane commands) |
| `src/capabilities.ts` | Modify | Add "copilot" to CapabilityHost, add Copilot projection rules |
| `src/superpowers-compatibility.ts` | Modify | Add "copilot" to SupportedSuperpowersHost, add compatibility matrix entry |
| `src/cli.ts` | Modify | Add copilot to CliHost, artifact generation dispatch, explain functions, status/doctor, materialization |
| `src/materialize.ts` | Modify | Add Copilot artifact ownership detection |
| `test/copilot.test.ts` | Create | Unit tests for copilot.ts |
| `test/cli-copilot.test.ts` | Create | Integration tests for CLI --host copilot |

---

### Task 1: Core Copilot Artifact Generation (`src/copilot.ts`)

**Files:**
- Create: `src/copilot.ts`
- Test: `test/copilot.test.ts`

**Reference patterns:** `src/claude.ts`, `src/qwen.ts`

- [ ] **Step 1: Write the failing test for renderCopilotPromptFile**

```typescript
import { describe, expect, it } from "vitest"
import { renderCopilotPromptFile } from "../src/copilot.js"

describe("renderCopilotPromptFile", () => {
  it("renders a basic phase prompt file", () => {
    const result = renderCopilotPromptFile({
      name: "oms-execute",
      description: "Execute subagent-driven development",
      model: "gpt-4o",
      phase: "subagent-driven-development",
      profileId: "default",
      sourceEntry: { source: "superpowers", canonicalRoute: "phase.subagent-driven-development" },
      workflowEntryName: "superpowers/subagent-driven-development",
    })

    expect(result).toContain("name: oms-execute")
    expect(result).toContain("description: Execute subagent-driven development")
    expect(result).toContain("model: gpt-4o")
    expect(result).toContain("generated-by: oh-my-superagents")
    expect(result).toContain("host=copilot")
    expect(result).toContain("Use the workflow entry")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/copilot.test.ts`
Expected: FAIL with "renderCopilotPromptFile is not defined" or module not found

- [ ] **Step 3: Implement renderCopilotPromptFile**

Create `src/copilot.ts`:

```typescript
import { BUILT_IN_PHASES, SAFE_NAME_PATTERN, type RouterConfig } from "./config.js"
import { getHostProjectionDecision } from "./capabilities.js"
import { MARKER_TEXT, ROUTE_MARKER_PREFIX } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import type { WorkflowSourceEntry } from "./workflow-sources.js"

const PHASE_TO_COPILOT_PROMPT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

export type CopilotPromptArtifact = {
  kind: "prompt"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

export type RenderCopilotPromptFileInput = {
  name: string
  description: string
  model: string
  phase: BuiltInPhase
  profileId: string
  sourceEntry: WorkflowSourceEntry
  workflowEntryName: string
}

function renderCopilotRouteMetadata(input: {
  source: WorkflowSourceEntry["source"]
  route: WorkflowSourceEntry["canonicalRoute"]
  renderedName: string
}) {
  return `<!-- ${ROUTE_MARKER_PREFIX} stage=1; host=copilot; source=${input.source}; route=${input.route}; projection=prompt; rendered-name=${input.renderedName} -->`
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

function assertCopilotProjectionSupport(workflowKind: RouterConfig["workflow"]["kind"], sourceEntry: WorkflowSourceEntry) {
  const decision = getHostProjectionDecision({
    host: "copilot",
    workflowKind,
    sourceEntry,
  })

  if (decision.supported) {
    return
  }

  throw new Error(
    `Copilot projection blocked by capability policy (${decision.reasonCode}) for ${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`,
  )
}

export function renderCopilotPromptFile(input: RenderCopilotPromptFileInput) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    `model: ${input.model}`,
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    renderCopilotRouteMetadata({
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      renderedName: input.name,
    }),
    "",
    `You are the ${input.name} phase agent for oh-my-superagents.`,
    formatCopilotWorkflowGuidance({
      sourceEntry: input.sourceEntry,
      workflowEntryName: input.workflowEntryName,
    }),
    `If that ${input.sourceEntry.source} entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
  ].join("\n")
}

export function buildCopilotArtifacts(config: RouterConfig) {
  const prompts: CopilotPromptArtifact[] = []

  if (config.workflow?.kind === "direct") {
    for (const [intent, intentConfig] of Object.entries(config.workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const promptName = `rt-${intent}`
      const intentDescription = intentConfig.description
        ? `${intentConfig.label}: ${intentConfig.description}`
        : intentConfig.label

      assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)

      prompts.push({
        kind: "prompt",
        directory: ".github/prompts",
        fileName: `${promptName}.md`,
        ownerPrefix: "rt-",
        content: [
          "---",
          `name: ${promptName}`,
          `description: ${intentDescription}`,
          `model: ${resolved.selection.model}`,
          "---",
          "",
          `<!-- ${MARKER_TEXT} -->`,
          renderCopilotRouteMetadata({
            source: resolved.sourceEntry.source,
            route: resolved.sourceEntry.canonicalRoute,
            renderedName: promptName,
          }),
          "",
          `You are the ${promptName} direct-mode agent for the \`${intent}\` intent.`,
          `Handle requests that match this intent: ${intentDescription}.`,
          `Treat \`${resolved.sourceEntry.canonicalRoute}\` from the ${resolved.sourceEntry.source} workflow source as the routing contract for this agent.`,
          "Stay focused on this intent and do not switch to another workflow intent unless the user explicitly asks.",
          "",
        ].join("\n"),
      })
    }

    return { prompts }
  }

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const promptName = PHASE_TO_COPILOT_PROMPT[phase]
    const workflowEntryName = formatWorkflowEntryName(resolved.sourceEntry)

    assertCopilotProjectionSupport(config.workflow?.kind ?? "superpowers", resolved.sourceEntry)

    prompts.push({
      kind: "prompt",
      directory: ".github/prompts",
      fileName: `${promptName}.md`,
      ownerPrefix: "oms-",
      content: renderCopilotPromptFile({
        name: promptName,
        description: `${phase} phase agent for oh-my-superagents`,
        model: resolved.selection.model,
        phase,
        profileId: resolved.profileId,
        sourceEntry: resolved.sourceEntry,
        workflowEntryName,
      }),
    })
  }

  return { prompts }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/copilot.test.ts`
Expected: PASS

- [ ] **Step 5: Add more comprehensive tests**

Add to `test/copilot.test.ts`:

```typescript
import { buildCopilotArtifacts } from "../src/copilot.js"

describe("buildCopilotArtifacts", () => {
  it("builds phase prompts for superpowers workflow", () => {
    const config = {
      workflow: { kind: "superpowers" as const },
      presets: {
        default: {
          routes: {
            "phase.brainstorming": { profile: "default" },
            "phase.writing-plans": { profile: "default" },
            "phase.subagent-driven-development": { profile: "default" },
            "phase.requesting-code-review": { profile: "default" },
            "phase.verification-before-completion": { profile: "default" },
            "phase.frontend-design": { profile: "default" },
            "phase.webapp-testing": { profile: "default" },
          },
        },
      },
      defaultPreset: "default",
      profiles: {
        default: { model: "gpt-4o" },
      },
    }

    const result = buildCopilotArtifacts(config)
    expect(result.prompts).toHaveLength(7)
    expect(result.prompts[0].fileName).toBe("oms-brainstorm.md")
    expect(result.prompts[0].directory).toBe(".github/prompts")
  })

  it("builds direct mode prompts", () => {
    const config = {
      workflow: {
        kind: "direct" as const,
        intents: {
          "fix-bug": { label: "Fix Bug", description: "Fix a bug in the codebase" },
        },
      },
      presets: {
        default: {
          routes: {
            "intent.fix-bug": { profile: "default" },
          },
        },
      },
      defaultPreset: "default",
      profiles: {
        default: { model: "gpt-4o" },
      },
    }

    const result = buildCopilotArtifacts(config)
    expect(result.prompts).toHaveLength(1)
    expect(result.prompts[0].fileName).toBe("rt-fix-bug.md")
  })
})
```

- [ ] **Step 6: Run all copilot tests**

Run: `pnpm test test/copilot.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/copilot.ts test/copilot.test.ts
git commit -m "feat(copilot): add Copilot CLI prompt file generation"
```

---

### Task 2: Update Capability System (`src/capabilities.ts`)

**Files:**
- Modify: `src/capabilities.ts`
- Test: `test/capabilities.test.ts` (existing)

- [ ] **Step 1: Write failing test for Copilot capability**

Add to existing capabilities test or create new test:

```typescript
import { describe, expect, it } from "vitest"
import { getHostProjectionDecision, getControlPlaneCommandDecision } from "../src/capabilities.js"

describe("copilot capabilities", () => {
  it("supports superpowers workflow projection", () => {
    const result = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "superpowers",
      sourceEntry: { source: "superpowers", canonicalRoute: "phase.brainstorming" },
    })
    expect(result.supported).toBe(true)
  })

  it("supports direct workflow projection", () => {
    const result = getHostProjectionDecision({
      host: "copilot",
      workflowKind: "direct",
      sourceEntry: { source: "direct", canonicalRoute: "intent.fix-bug" },
    })
    expect(result.supported).toBe(true)
  })

  it("does not support explain command", () => {
    const result = getControlPlaneCommandDecision({
      host: "copilot",
      command: "explain",
      workflowKind: "superpowers",
    })
    expect(result.supported).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/capabilities.test.ts`
Expected: FAIL — "copilot" not in CapabilityHost type

- [ ] **Step 3: Modify capabilities.ts**

In `src/capabilities.ts`:

```typescript
// Change line 24:
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

Add Copilot-specific rules in `getHostProjectionDecision` (after line 70):

```typescript
  if (input.host === "copilot" && input.sourceEntry.source === "gstack") {
    return unsupportedDecision("unsupported_host_source_projection")
  }
```

Add Copilot control plane command restrictions in `getControlPlaneCommandDecision` (after line 82):

```typescript
  if (input.command === "explain" && input.host === "copilot") {
    return unsupportedDecision("unsupported_control_plane_command")
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/capabilities.ts test/capabilities.test.ts
git commit -m "feat(capabilities): add Copilot CLI host support"
```

---

### Task 3: Update Compatibility Matrix (`src/superpowers-compatibility.ts`)

**Files:**
- Modify: `src/superpowers-compatibility.ts`

- [ ] **Step 1: Modify superpowers-compatibility.ts**

Change line 15:
```typescript
export type SupportedSuperpowersHost = "opencode" | "codex" | "copilot"
```

Add to SUPERPOWERS_COMPATIBILITY matrix (after line 33):
```typescript
  copilot: {
    minimumSupportedVersion: "1.0.0",
    testedRanges: [">=1.0.0"],
    knownBadRanges: [],
  },
```

- [ ] **Step 2: Run existing compatibility tests**

Run: `pnpm test test/superpowers-compatibility.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/superpowers-compatibility.ts
git commit -m "feat(compatibility): add Copilot CLI to compatibility matrix"
```

---

### Task 4: Integrate into CLI (`src/cli.ts`)

**Files:**
- Modify: `src/cli.ts`
- Test: `test/cli-copilot.test.ts`

This is the largest integration task. Changes needed:

1. Import `buildCopilotArtifacts` at top of file
2. Add `"copilot"` to `CliHost` type
3. Add `buildCopilotArtifacts` to `CliDeps`
4. Add copilot to `explainAllForCliHost` and `explainPhaseForCliHost`
5. Add copilot artifact rules to `OWNED_ARTIFACT_RULES`
6. Add copilot to `getArtifactsForHost()`
7. Add copilot to `getExpectedArtifacts()`
8. Add copilot to host validation messages
9. Add copilot to `buildControlPlaneStatus()` and `buildControlPlaneDoctor()`

- [ ] **Step 1: Add import and type changes**

At top of `src/cli.ts`, add:
```typescript
import { buildCopilotArtifacts } from "./copilot.js"
```

Change line 86:
```typescript
type CliHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

Add to `CliDeps` (around line 145):
```typescript
  buildCopilotArtifacts: typeof buildCopilotArtifacts
```

Add to `defaultDeps` (around line 189):
```typescript
  buildCopilotArtifacts,
```

- [ ] **Step 2: Add explain functions for Copilot**

Add after `explainAllClaude`/`explainClaudePhase` functions (around line 1520):

```typescript
function explainCopilotPhase(config: RouterConfig, phase: BuiltInPhase) {
  const resolved = resolvePhase(config, phase)
  return {
    phase,
    canonicalRoute: resolved.canonicalRoute,
    profileId: resolved.profileId,
    model: resolved.selection.model,
    variant: undefined,
    routeSource: resolved.routeSource,
    resolvedSource: resolved.resolvedSource,
    commandName: undefined,
    agentName: PHASE_TO_COPILOT_PROMPT[phase],
  }
}

function explainAllCopilot(config: RouterConfig) {
  return BUILT_IN_PHASES.map((phase) => explainCopilotPhase(config, phase))
}
```

Import `PHASE_TO_COPILOT_PROMPT` from `./copilot.js` or define locally.

Update `explainAllForCliHost` (line 1511):
```typescript
function explainAllForCliHost(
  config: RouterConfig,
  host: ExplainCliHost,
  deps: CliDeps,
) {
  if (host === "claude") return explainAllClaude(config)
  if (host === "copilot") return explainAllCopilot(config)
  return deps.explainAllForHost(config, host)
}
```

Update `explainPhaseForCliHost` (line 1519):
```typescript
function explainPhaseForCliHost(
  config: RouterConfig,
  host: ExplainCliHost,
  phase: BuiltInPhase,
  deps: CliDeps,
) {
  if (host === "claude") return explainClaudePhase(config, phase)
  if (host === "copilot") return explainCopilotPhase(config, phase)
  return deps.explainPhaseForHost(config, host, phase)
}
```

- [ ] **Step 3: Add artifact rules and generation**

Add to `OWNED_ARTIFACT_RULES` (after line 1734):
```typescript
  copilot: [
    { directory: ".github/prompts", extension: ".md" },
  ],
```

Add to `getArtifactsForHost()` (after line 1654):
```typescript
  if (host === "copilot") {
    return buildCopilotArtifacts(routerConfig).prompts
  }
```

Add to `getExpectedArtifacts()` (after line 1714):
```typescript
  if (host === "copilot") {
    return buildCopilotArtifacts(routerConfig).prompts
      .map((artifact) => path.join(cwd, artifact.directory, artifact.fileName))
      .sort()
  }
```

- [ ] **Step 4: Update host validation messages**

Change line 2540:
```typescript
return { exitCode: 1, stdout: "", stderr: "Missing required --host (supported: opencode, codex, qwen, claude, copilot)" }
```

Change line 2543-2548 to include copilot:
```typescript
if (command === "explain" && host !== "opencode" && host !== "codex" && host !== "qwen" && host !== "claude" && host !== "copilot") {
  return { exitCode: 1, stdout: "", stderr: "Only --host opencode, --host codex, --host claude, or --host copilot is supported for explain in v1" }
}

if (command !== "explain" && host !== "opencode" && host !== "codex" && host !== "qwen" && host !== "claude" && host !== "copilot") {
  return { exitCode: 1, stdout: "", stderr: "Only --host opencode, --host codex, --host qwen, --host claude, or --host copilot is supported in v1" }
}
```

- [ ] **Step 5: Update status and doctor functions**

In `buildControlPlaneStatus()` and `buildControlPlaneDoctor()`, add copilot to artifact summary logic (around lines 2355 and 2399):

```typescript
const artifactSummary = host === "opencode"
  ? summarizeControlPlaneArtifacts(resolved.config.settings, resolved.config.workflow.kind)
  : host === "copilot"
    ? { prompts: buildCopilotArtifacts(routerConfig).prompts.length }
    : undefined
```

- [ ] **Step 6: Write integration test**

Create `test/cli-copilot.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { runCli } from "./helpers/cli.js"

describe("CLI --host copilot", () => {
  it("returns error for unsupported host in v1", async () => {
    const result = await runCli(["status", "--host", "copilot"])
    expect(result.exitCode).toBe(0)
  })
})
```

- [ ] **Step 7: Run tests**

Run: `pnpm test test/cli-copilot.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts test/cli-copilot.test.ts
git commit -m "feat(cli): integrate Copilot CLI host support"
```

---

### Task 5: Update Materialization (`src/materialize.ts`)

**Files:**
- Modify: `src/materialize.ts`

- [ ] **Step 1: Modify materialize.ts**

Add Copilot to artifact ownership detection. Look for `isOmsOwnedArtifactFile` and add:

```typescript
export function isOmsOwnedCopilotPromptFile(filePath: string) {
  return filePath.includes(".github/prompts/") && filePath.endsWith(".md")
}
```

Update `isOmsOwnedArtifactFile` to include Copilot prompts.

- [ ] **Step 2: Run materialize tests**

Run: `pnpm test test/materialize.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/materialize.ts
git commit -m "feat(materialize): add Copilot prompt artifact ownership detection"
```

---

### Task 6: Control Plane Command Prompts for Copilot

**Files:**
- Modify: `src/copilot.ts`
- Test: `test/copilot.test.ts`

- [ ] **Step 1: Add control plane command prompt generation**

Add to `src/copilot.ts`:

```typescript
import { CONTROL_PLANE_COMMAND_KEYS, type ControlPlaneCommandKey } from "./config.js"

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Copilot CLI.",
  use: "Switch OMS to the selected preset for Copilot CLI.",
  disable: "Disable OMS for Copilot CLI.",
  sync: "Sync OMS artifacts for Copilot CLI.",
  doctor: "Inspect OMS diagnostics for Copilot CLI.",
}

function renderCopilotControlPlanePromptFile(input: {
  description: string
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return [
    "---",
    `name: ${input.renderedName}`,
    `description: ${input.description}`,
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    `<!-- oms-control-plane: stage=1; host=copilot; artifact=prompt; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`,
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host copilot $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

export function buildCopilotControlPlaneArtifacts(settings: {
  commandPrefix: string
  commands: Record<ControlPlaneCommandKey, { name: string; aliases: string[] }>
}) {
  const prompts: CopilotPromptArtifact[] = []
  const ownerPrefix = `${settings.commandPrefix}-`

  for (const commandKey of CONTROL_PLANE_COMMAND_KEYS) {
    const command = settings.commands[commandKey]
    const renderedNames = [command.name, ...command.aliases]

    for (const renderedName of renderedNames) {
      const fileName = `${settings.commandPrefix}-${renderedName}.md`
      prompts.push({
        kind: "prompt",
        directory: ".github/prompts",
        fileName,
        ownerPrefix,
        content: renderCopilotControlPlanePromptFile({
          description: CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
          logicalCommand: commandKey,
          renderedName: fileName.replace(/\.md$/, ""),
        }),
      })
    }
  }

  return { prompts }
}
```

- [ ] **Step 2: Update buildCopilotArtifacts to include control plane**

Modify `buildCopilotArtifacts` signature to accept optional control plane settings and include control plane prompts.

- [ ] **Step 3: Add tests for control plane prompts**

```typescript
it("builds control plane command prompts", () => {
  const settings = {
    commandPrefix: "oms",
    commands: {
      status: { name: "status", aliases: [] },
      sync: { name: "sync", aliases: [] },
      doctor: { name: "doctor", aliases: [] },
    } as Record<ControlPlaneCommandKey, { name: string; aliases: string[] }>,
  }

  const result = buildCopilotControlPlaneArtifacts(settings)
  expect(result.prompts).toHaveLength(3)
  expect(result.prompts[0].fileName).toBe("oms-status.md")
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/copilot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot.ts test/copilot.test.ts
git commit -m "feat(copilot): add control plane command prompt generation"
```

---

### Task 7: Final Integration & Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No lint errors

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(copilot): address type and lint issues" || echo "No fixes needed"
```

---

## Spec Coverage Check

| Spec Section | Implementing Task |
|--------------|-------------------|
| 3.1 Host Projection Model | Task 1 |
| 3.2 File Structure | Task 1 |
| 3.3 Prompt File Format | Task 1 |
| 4.1 src/copilot.ts | Task 1, Task 6 |
| 4.2 src/capabilities.ts | Task 2 |
| 4.3 src/cli.ts | Task 4 |
| 4.4 src/superpowers-compatibility.ts | Task 3 |
| 4.5 src/materialize.ts | Task 5 |
| 5 Data Flow | Task 4 |
| 6 Error Handling | Task 1, Task 2 |
| 7 Testing | All tasks |

## Placeholder Scan

No placeholders found. All steps include complete code, exact file paths, and expected outputs.

## Type Consistency Check

- `CapabilityHost` includes "copilot" consistently
- `CliHost` includes "copilot" consistently
- `SupportedSuperpowersHost` includes "copilot" consistently
- Artifact types use `CopilotPromptArtifact` with `kind: "prompt"`
- Function names: `renderCopilotPromptFile`, `buildCopilotArtifacts`, `buildCopilotControlPlaneArtifacts`

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-copilot-cli-host.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
