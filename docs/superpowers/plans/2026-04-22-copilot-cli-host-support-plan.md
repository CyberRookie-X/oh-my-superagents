# Copilot CLI Host Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement complete GitHub Copilot CLI host support using Agent + Plugin + Hooks scheme, enabling OMS routing, control plane commands, and lifecycle hooks integration.

**Architecture:** Add Copilot CLI host adapter following the existing pattern (src/copilot.ts, src/copilot-hooks.ts, src/copilot-bootstrap.ts). Generate plugin bundle with agents, skills, hooks.json, and plugin.json manifest. Add CLI integration for --host copilot commands.

**Tech Stack:** TypeScript, Node.js, Vitest, existing router/materializer code

---

## File Structure

**Create:**
- `src/copilot.ts` - Copilot CLI artifact generation (agents, skills)
- `src/copilot-hooks.ts` - Hooks configuration builder
- `src/copilot-bootstrap.ts` - Plugin bootstrap scaffolding
- `test/copilot.test.ts` - Copilot adapter tests
- `test/copilot-hooks.test.ts` - Hooks tests
- `test/copilot-bootstrap.test.ts` - Bootstrap tests
- `docs/superpowers/specs/2026-04-22-copilot-cli-host-support-design.md` - Design spec (already created)
- `docs/superpowers/plans/2026-04-22-copilot-cli-host-support-plan.md` - This plan

**Modify:**
- `src/cli.ts` - Add `--host copilot` support
- `src/capabilities.ts` - Add Copilot capability decisions
- `src/index.ts` - Export Copilot adapter
- `src/materialize.ts` - Add Copilot ownership markers and skill cleanup
- `README.md` - Document Copilot CLI host usage

---

## Chunk 1: Core Adapter Tests

### Task 1: Write failing Copilot adapter tests

**Files:**
- Create: `test/copilot.test.ts`

- [ ] **Step 1: Create test file with imports and test structure**

```typescript
import { describe, it, expect } from "vitest"
import { buildCopilotArtifacts, renderCopilotAgentFile, renderCopilotSkillFile, PHASE_TO_COPILOT_AGENT } from "../src/copilot.js"
import { createDefaultControlPlaneConfig } from "../src/config.js"
import type { RouterConfig } from "../src/config.js"

describe("Copilot adapter", () => {
  // Tests will be added here
})
```

- [ ] **Step 2: Add phase-to-agent mapping tests**

```typescript
describe("PHASE_TO_COPILOT_AGENT", () => {
  it("maps brainstorming to oms-brainstorm", () => {
    expect(PHASE_TO_COPILOT_AGENT["brainstorming"]).toBe("oms-brainstorm")
  })

  it("maps writing-plans to oms-plan", () => {
    expect(PHASE_TO_COPILOT_AGENT["writing-plans"]).toBe("oms-plan")
  })

  it("maps subagent-driven-development to oms-execute", () => {
    expect(PHASE_TO_COPILOT_AGENT["subagent-driven-development"]).toBe("oms-execute")
  })

  it("maps requesting-code-review to oms-review", () => {
    expect(PHASE_TO_COPILOT_AGENT["requesting-code-review"]).toBe("oms-review")
  })

  it("maps verification-before-completion to oms-verify", () => {
    expect(PHASE_TO_COPILOT_AGENT["verification-before-completion"]).toBe("oms-verify")
  })

  it("maps frontend-design to oms-visual", () => {
    expect(PHASE_TO_COPILOT_AGENT["frontend-design"]).toBe("oms-visual")
  })

  it("maps webapp-testing to oms-web-test", () => {
    expect(PHASE_TO_COPILOT_AGENT["webapp-testing"]).toBe("oms-web-test")
  })
})
```

- [ ] **Step 3: Add agent file rendering tests**

```typescript
describe("renderCopilotAgentFile", () => {
  it("renders agent with YAML frontmatter and instructions", () => {
    const content = renderCopilotAgentFile({
      name: "oms-brainstorm",
      description: "Brainstorm phase agent for superpowers workflow",
      model: "gpt-4",
      instructions: "Load and follow the upstream workflow entry `superpowers/brainstorming` exactly.",
      sourceEntry: { canonicalRoute: "phase.brainstorm", source: "superpowers" },
    })

    expect(content).toContain("---")
    expect(content).toContain("name: oms-brainstorm")
    expect(content).toContain("description:")
    expect(content).toContain("model: gpt-4")
    expect(content).toContain("generated-by: oh-my-superagents")
    expect(content).toContain("oms-route:")
    expect(content).toContain("host=copilot")
    expect(content).toContain("route=phase.brainstorm")
  })
})
```

- [ ] **Step 4: Add skill file rendering tests**

```typescript
describe("renderCopilotSkillFile", () => {
  it("renders skill with YAML frontmatter and command", () => {
    const content = renderCopilotSkillFile({
      name: "oms-status",
      description: "Show OMS status for Copilot CLI",
      model: "gpt-4o",
      command: "status",
      host: "copilot",
    })

    expect(content).toContain("---")
    expect(content).toContain("name: oms-status")
    expect(content).toContain("model: gpt-4o")
    expect(content).toContain("generated-by: oh-my-superagents")
    expect(content).toContain("oh-my-superagents status --host copilot")
  })
})
```

- [ ] **Step 5: Add buildCopilotArtifacts tests**

```typescript
describe("buildCopilotArtifacts", () => {
  const defaultConfig = createDefaultControlPlaneConfig()
  const routerConfig: RouterConfig = {
    workflow: { kind: "superpowers" },
    profiles: defaultConfig.profiles,
    lanes: {},
    routes: {},
    defaultRoute: "build",
    superpowersCompatibility: { mode: "warn" },
  }

  it("generates agents for all built-in phases", () => {
    const { agents } = buildCopilotArtifacts(routerConfig)
    expect(agents.length).toBe(7) // 7 built-in phases
    expect(agents.some(a => a.fileName === "oms-brainstorm.agent.md")).toBe(true)
    expect(agents.some(a => a.fileName === "oms-plan.agent.md")).toBe(true)
  })

  it("generates skills for control plane commands", () => {
    const { skills } = buildCopilotArtifacts(routerConfig, defaultConfig.settings)
    expect(skills.length).toBe(6) // 5 control plane commands + disable helper
    expect(skills.some(s => s.directory === "skills/oms-status")).toBe(true)
  })

  it("generates plugin.json manifest", () => {
    const { pluginManifest } = buildCopilotArtifacts(routerConfig, defaultConfig.settings)
    expect(pluginManifest.name).toBe("oh-my-superagents-copilot")
    expect(pluginManifest.agents).toBe("agents")
    expect(pluginManifest.skills).toBe("skills")
  })
})
```

- [ ] **Step 6: Run tests to verify failure**

```bash
pnpm test -- --run test/copilot.test.ts
```

Expected: FAIL (module not found or functions not defined)

---

## Chunk 2: Core Adapter Implementation

### Task 2: Implement Copilot adapter constants and types

**Files:**
- Create: `src/copilot.ts`

- [ ] **Step 1: Create file with imports and constants**

```typescript
import { BUILT_IN_PHASES, SAFE_NAME_PATTERN, type RouterConfig, type ControlPlaneConfig } from "./config.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import { MARKER_TEXT, renderRouteOwnershipMetadata, renderControlPlaneOwnershipMetadata, type GeneratedArtifact } from "./opencode.js"
import type { WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

export const PHASE_TO_COPILOT_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

export const CONTROL_PLANE_TO_COPILOT_SKILL = {
  status: "oms-status",
  use: "oms-use",
  disable: "oms-disable",
  sync: "oms-sync",
  doctor: "oms-doctor",
} as const

const SKILL_FILE_NAME = "SKILL.md"
const AGENT_FILE_SUFFIX = ".agent.md"
```

- [ ] **Step 2: Add helper functions**

```typescript
function yamlScalar(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry): string {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function getRouteSourceEntry(
  sourceEntry: WorkflowSourceEntry | undefined,
  fallback: WorkflowSourceEntry,
): WorkflowSourceEntry {
  return sourceEntry ?? fallback
}
```

- [ ] **Step 3: Commit initial implementation**

```bash
git add src/copilot.ts
git commit -m "feat(copilot): add phase-to-agent mapping constants"
```

---

### Task 3: Implement agent file renderer

**Files:**
- Modify: `src/copilot.ts`

- [ ] **Step 1: Add renderCopilotAgentFile function**

```typescript
export function renderCopilotAgentFile(input: {
  name: string
  description: string
  model: string
  instructions: string
  sourceEntry: WorkflowSourceEntry
}): string {
  const sourceEntry = getRouteSourceEntry(input.sourceEntry, {
    canonicalRoute: "phase.unknown" as const,
    source: "superpowers" as WorkflowSourceKind,
  })

  return [
    "---",
    `name: ${yamlScalar(input.name)}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${yamlScalar(input.model)}`,
    "tools:",
    "  - '*'",
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    renderRouteOwnershipMetadata({
      host: "copilot",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.name,
    }),
    "",
    "# Instructions",
    "",
    input.instructions,
    "",
    "Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.",
    "",
  ].join("\n")
}
```

- [ ] **Step 2: Run tests for agent rendering**

```bash
pnpm test -- --run test/copilot.test.ts
```

Expected: Agent rendering tests PASS, others still FAIL

- [ ] **Step 3: Commit agent renderer**

```bash
git add src/copilot.ts
git commit -m "feat(copilot): implement agent file renderer"
```

---

### Task 4: Implement skill file renderer

**Files:**
- Modify: `src/copilot.ts`

- [ ] **Step 1: Add renderCopilotSkillFile function**

```typescript
export function renderCopilotSkillFile(input: {
  name: string
  description: string
  model: string
  command: "status" | "use" | "disable" | "sync" | "doctor"
  host: "copilot"
}): string {
  return [
    "---",
    `name: ${yamlScalar(input.name)}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${yamlScalar(input.model)}`,
    "tools:",
    "  - bash",
    "  - read",
    "  - write",
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    renderControlPlaneOwnershipMetadata({
      host: "copilot",
      artifact: "skill",
      logicalCommand: input.command,
      renderedName: input.name,
    }),
    "",
    `Run \`oh-my-superagents ${input.command} --host ${input.host} $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}
```

- [ ] **Step 2: Add temporary disable helper skill**

```typescript
export function renderCopilotDisableHelperSkill(): string {
  return [
    "---",
    `name: ${yamlScalar("oms-no-superpowers")}`,
    `description: ${yamlScalar("Temporarily disable superpowers for this conversation")}`,
    `model: ${yamlScalar("gpt-4o")}`,
    "tools:",
    "  - bash",
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    "",
    "Tell the assistant:",
    "- do not use superpowers in this conversation",
    "- do not proactively load superpowers skills, workflows, or phase agents",
    "- only use superpowers again if I explicitly ask",
    "",
    "You can add extra freeform arguments via $ARGUMENTS.",
    "",
  ].join("\n")
}
```

- [ ] **Step 3: Run tests for skill rendering**

```bash
pnpm test -- --run test/copilot.test.ts
```

Expected: Skill rendering tests PASS

- [ ] **Step 4: Commit skill renderer**

```bash
git add src/copilot.ts
git commit -m "feat(copilot): implement skill file renderer"
```

---

### Task 5: Implement buildCopilotArtifacts function

**Files:**
- Modify: `src/copilot.ts`

- [ ] **Step 1: Add CopilotPluginManifest type**

```typescript
export type CopilotPluginManifest = {
  name: string
  version: string
  description: string
  agents: string
  skills: string
  hooks: string
}

export type CopilotGeneratedArtifacts = {
  agents: GeneratedArtifact[]
  skills: GeneratedArtifact[]
  pluginManifest: CopilotPluginManifest
}
```

- [ ] **Step 2: Add buildCopilotArtifacts function**

```typescript
export function buildCopilotArtifacts(
  config: RouterConfig,
  controlPlaneSettings?: ControlPlaneConfig["settings"],
): CopilotGeneratedArtifacts {
  const agents: GeneratedArtifact[] = []
  const skills: GeneratedArtifact[] = []

  if (config.workflow?.kind === "direct") {
    for (const intent of Object.keys(config.workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const resolved = resolveRoute(config, intent)
      const agentName = `rt-${intent}`

      agents.push({
        kind: "agent",
        directory: "plugins/oh-my-superagents-copilot/agents",
        fileName: `${agentName}${AGENT_FILE_SUFFIX}`,
        ownerPrefix: "rt-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${agentName} routing agent for ${intent}`,
          model: resolved.selection.model,
          instructions: `Handle requests that match this intent: ${intent}. Use the forwarded router context arguments as the task context.`,
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
        directory: "plugins/oh-my-superagents-copilot/agents",
        fileName: `${agentName}${AGENT_FILE_SUFFIX}`,
        ownerPrefix: "oms-",
        content: renderCopilotAgentFile({
          name: agentName,
          description: `${phase} phase agent for oh-my-superagents`,
          model: resolved.selection.model,
          instructions: `Load and follow the upstream workflow entry \`${workflowEntryName}\` for \`${resolved.sourceEntry.canonicalRoute}\` exactly. If that workflow entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.`,
          sourceEntry: resolved.sourceEntry,
        }),
      })
    }
  }

  if (controlPlaneSettings) {
    for (const [commandKey, skillName] of Object.entries(CONTROL_PLANE_TO_COPILOT_SKILL)) {
      skills.push({
        kind: "agent",
        directory: `plugins/oh-my-superagents-copilot/skills/${skillName}`,
        fileName: SKILL_FILE_NAME,
        ownerPrefix: "oms-",
        content: renderCopilotSkillFile({
          name: skillName,
          description: `OMS ${commandKey} command for Copilot CLI`,
          model: "gpt-4o",
          command: commandKey as keyof typeof CONTROL_PLANE_TO_COPILOT_SKILL,
          host: "copilot",
        }),
      })
    }

    skills.push({
      kind: "agent",
      directory: "plugins/oh-my-superagents-copilot/skills/oms-no-superpowers",
      fileName: SKILL_FILE_NAME,
      ownerPrefix: "oms-no-",
      content: renderCopilotDisableHelperSkill(),
    })
  }

  const pluginManifest: CopilotPluginManifest = {
    name: "oh-my-superagents-copilot",
    version: "0.1.0",
    description: "OMS routing and control plane for GitHub Copilot CLI",
    agents: "agents",
    skills: "skills",
    hooks: "hooks.json",
  }

  return { agents, skills, pluginManifest }
}
```

- [ ] **Step 3: Run tests for buildCopilotArtifacts**

```bash
pnpm test -- --run test/copilot.test.ts
```

Expected: All adapter tests PASS

- [ ] **Step 4: Commit buildCopilotArtifacts**

```bash
git add src/copilot.ts
git commit -m "feat(copilot): implement buildCopilotArtifacts function"
```

---

## Chunk 3: Hooks System

### Task 6: Write failing hooks tests

**Files:**
- Create: `test/copilot-hooks.test.ts`

- [ ] **Step 1: Create hooks test file**

```typescript
import { describe, it, expect } from "vitest"
import { buildCopilotHooksConfig, renderCopilotHookScript, type CopilotHooksConfig } from "../src/copilot-hooks.js"

describe("Copilot hooks", () => {
  describe("buildCopilotHooksConfig", () => {
    it("generates hooks.json with sessionStart hook", () => {
      const config = buildCopilotHooksConfig()
      expect(config.version).toBe(1)
      expect(config.hooks.sessionStart).toBeDefined()
      expect(config.hooks.sessionStart.length).toBeGreaterThan(0)
    })

    it("generates preToolUse hook when tool policy is configured", () => {
      const config = buildCopilotHooksConfig({ hasToolPolicy: true })
      expect(config.hooks.preToolUse).toBeDefined()
    })

    it("generates sessionEnd hook for state snapshot", () => {
      const config = buildCopilotHooksConfig()
      expect(config.hooks.sessionEnd).toBeDefined()
    })
  })

  describe("renderCopilotHookScript", () => {
    it("renders session init script", () => {
      const script = renderCopilotHookScript("sessionStart")
      expect(script).toContain("oh-my-superagents")
      expect(script).toContain("--host copilot")
      expect(script).toContain("sessionStart")
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm test -- --run test/copilot-hooks.test.ts
```

Expected: FAIL (module not found)

---

### Task 7: Implement hooks configuration

**Files:**
- Create: `src/copilot-hooks.ts`

- [ ] **Step 1: Create hooks module**

```typescript
import { CONTROL_PLANE_COMMAND_KEYS, type ControlPlaneCommandKey } from "./config.js"

export type CopilotHookCommand = {
  type: "command"
  bash?: string
  powershell?: string
  cwd?: string
  env?: Record<string, string>
}

export type CopilotHooksConfig = {
  version: 1
  hooks: {
    sessionStart?: CopilotHookCommand[]
    sessionEnd?: CopilotHookCommand[]
    userPromptSubmitted?: CopilotHookCommand[]
    preToolUse?: CopilotHookCommand[]
    postToolUse?: CopilotHookCommand[]
    errorOccurred?: CopilotHookCommand[]
  }
}

export type BuildCopilotHooksConfigInput = {
  hasToolPolicy?: boolean
  hasCompression?: boolean
  scriptDirectory?: string
}

export function buildCopilotHooksConfig(input: BuildCopilotHooksConfigInput = {}): CopilotHooksConfig {
  const scriptDir = input.scriptDirectory ?? "plugins/oh-my-superagents-copilot/scripts"

  const hooks: CopilotHooksConfig["hooks"] = {
    sessionStart: [
      {
        type: "command",
        bash: `./${scriptDir}/oms-session-init.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ],
    sessionEnd: [
      {
        type: "command",
        bash: `./${scriptDir}/oms-session-end.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ],
  }

  if (input.hasToolPolicy) {
    hooks.preToolUse = [
      {
        type: "command",
        bash: `./${scriptDir}/oms-tool-guard.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ]
  }

  if (input.hasCompression) {
    hooks.postToolUse = [
      {
        type: "command",
        bash: `./${scriptDir}/oms-compression-check.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ]
  }

  return {
    version: 1,
    hooks,
  }
}

export function renderCopilotHookScript(hookType: "sessionStart" | "sessionEnd" | "preToolUse" | "postToolUse"): string {
  const scripts: Record<string, string> = {
    sessionStart: [
      "#!/bin/bash",
      "# OMS Session Init Hook for Copilot CLI",
      "",
      "set -e",
      "",
      "# Load OMS config and check compatibility",
      'CONFIG_PATH="${OMS_CONFIG_PATH:-oh-my-superagents.config.jsonc}"',
      "",
      "if command -v oh-my-superagents &> /dev/null; then",
      "  oh-my-superagents doctor --host copilot --config \"$CONFIG_PATH\" 2>/dev/null || true",
      "fi",
      "",
      "# Log session start",
      'echo "OMS session initialized for Copilot CLI at $(date)" >> .oms/session.log',
    ].join("\n"),

    sessionEnd: [
      "#!/bin/bash",
      "# OMS Session End Hook for Copilot CLI",
      "",
      "set -e",
      "",
      "# Snapshot control plane state",
      "if command -v oh-my-superagents &> /dev/null; then",
      "  oh-my-superagents status --host copilot --json 2>/dev/null > .oms/session-state.json || true",
      "fi",
      "",
      '# Log session end',
      'echo "OMS session ended for Copilot CLI at $(date)" >> .oms/session.log',
    ].join("\n"),

    preToolUse: [
      "#!/bin/bash",
      "# OMS Tool Guard Hook for Copilot CLI",
      "",
      "# Read tool policy from stdin JSON",
      "# This hook receives tool use context before execution",
      "# Exit 0 to allow, non-zero to block",
      "",
      "exit 0 # Default: allow all tools",
    ].join("\n"),

    postToolUse: [
      "#!/bin/bash",
      "# OMS Compression Check Hook for Copilot CLI",
      "",
      "# Check if context compression should be triggered",
      "# This hook receives tool use result after execution",
      "",
      "exit 0",
    ].join("\n"),
  }

  return scripts[hookType] ?? ""
}

export function renderCopilotHooksJson(config: CopilotHooksConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`
}
```

- [ ] **Step 2: Run hooks tests**

```bash
pnpm test -- --run test/copilot-hooks.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit hooks module**

```bash
git add src/copilot-hooks.ts test/copilot-hooks.test.ts
git commit -m "feat(copilot): implement hooks configuration and scripts"
```

---

## Chunk 4: Bootstrap System

### Task 8: Write failing bootstrap tests

**Files:**
- Create: `test/copilot-bootstrap.test.ts`

- [ ] **Step 1: Create bootstrap test file**

```typescript
import { describe, it, expect } from "vitest"
import { buildCopilotBootstrapFiles, renderCopilotPluginManifest } from "../src/copilot-bootstrap.js"

describe("Copilot bootstrap", () => {
  describe("renderCopilotPluginManifest", () => {
    it("renders valid plugin.json", () => {
      const manifest = renderCopilotPluginManifest()
      const parsed = JSON.parse(manifest)

      expect(parsed.name).toBe("oh-my-superagents-copilot")
      expect(parsed.version).toBe("0.1.0")
      expect(parsed.agents).toBe("agents")
      expect(parsed.skills).toBe("skills")
    })
  })

  describe("buildCopilotBootstrapFiles", () => {
    it("generates plugin directory structure", () => {
      const files = buildCopilotBootstrapFiles()
      expect(files.some(f => f.path === "plugins/oh-my-superagents-copilot/plugin.json")).toBe(true)
      expect(files.some(f => f.path === "plugins/oh-my-superagents-copilot/hooks.json")).toBe(true)
    })

    it("generates hook scripts", () => {
      const files = buildCopilotBootstrapFiles()
      expect(files.some(f => f.path.endsWith("oms-session-init.sh"))).toBe(true)
      expect(files.some(f => f.path.endsWith("oms-session-end.sh"))).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm test -- --run test/copilot-bootstrap.test.ts
```

Expected: FAIL

---

### Task 9: Implement bootstrap module

**Files:**
- Create: `src/copilot-bootstrap.ts`

- [ ] **Step 1: Create bootstrap module**

```typescript
import { buildCopilotHooksConfig, renderCopilotHooksJson, renderCopilotHookScript } from "./copilot-hooks.js"
import { MARKER_TEXT } from "./opencode.js"

export type BootstrapFile = {
  path: string
  content: string
}

export function renderCopilotPluginManifest(): string {
  const manifest = {
    name: "oh-my-superagents-copilot",
    version: "0.1.0",
    description: "OMS routing and control plane for GitHub Copilot CLI",
    agents: "agents",
    skills: "skills",
    hooks: "hooks.json",
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function buildCopilotBootstrapFiles(): BootstrapFile[] {
  const files: BootstrapFile[] = []
  const pluginRoot = "plugins/oh-my-superagents-copilot"
  const scriptDir = `${pluginRoot}/scripts`

  files.push({
    path: `${pluginRoot}/plugin.json`,
    content: renderCopilotPluginManifest(),
  })

  files.push({
    path: `${pluginRoot}/hooks.json`,
    content: renderCopilotHooksJson(buildCopilotHooksConfig()),
  })

  for (const hookType of ["sessionStart", "sessionEnd", "preToolUse", "postToolUse"] as const) {
    files.push({
      path: `${scriptDir}/oms-${hookType.replace(/([A-Z])/g, (_, c) => `-${c.toLowerCase()}`)}.sh`,
      content: renderCopilotHookScript(hookType),
    })
  }

  return files
}
```

- [ ] **Step 2: Run bootstrap tests**

```bash
pnpm test -- --run test/copilot-bootstrap.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit bootstrap module**

```bash
git add src/copilot-bootstrap.ts test/copilot-bootstrap.test.ts
git commit -m "feat(copilot): implement bootstrap scaffolding"
```

---

## Chunk 5: Capabilities and Materialize Updates

### Task 10: Update capabilities for Copilot

**Files:**
- Modify: `src/capabilities.ts`

- [ ] **Step 1: Add Copilot to CapabilityHost type**

```typescript
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

- [ ] **Step 2: Add Copilot projection decisions**

```typescript
export function getHostProjectionDecision(input: {
  host: CapabilityHost
  workflowKind: WorkflowKind
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  if (!isSourceRouteSupported(input.sourceEntry.source, input.sourceEntry.canonicalRoute)) {
    return unsupportedDecision("unsupported_source_route")
  }

  if (input.host === "claude" && input.workflowKind === "direct") {
    return unsupportedDecision("unsupported_host_direct_projection")
  }

  if (input.host === "qwen" && input.workflowKind === "superpowers" && input.sourceEntry.source === "gstack") {
    return unsupportedDecision("unsupported_host_source_projection")
  }

  if (input.host === "copilot" && input.workflowKind === "superpowers" && input.sourceEntry.source === "gstack") {
    return unsupportedDecision("unsupported_host_source_projection")
  }

  return supportedDecision()
}
```

- [ ] **Step 3: Add Copilot control plane decisions**

```typescript
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

  if (input.workflowKind === "direct" && (input.command === "use" || input.command === "disable")) {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (input.workflowKind === "direct" && input.command === "explain" && input.host !== "opencode" && input.host !== "codex" && input.host !== "copilot") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  return supportedDecision()
}
```

- [ ] **Step 4: Run capabilities tests**

```bash
pnpm test -- --run test/capabilities.test.ts
```

Expected: PASS (update tests to include Copilot)

- [ ] **Step 5: Commit capabilities update**

```bash
git add src/capabilities.ts
git commit -m "feat(copilot): add Copilot CLI capability decisions"
```

---

### Task 11: Update materialize for Copilot ownership

**Files:**
- Modify: `src/materialize.ts`

- [ ] **Step 1: Add Copilot ownership markers**

Add to the marker prefix constants:

```typescript
const COPILOT_ROUTER_OWNED_AGENT_PREFIXES = new Set(["oms-", "rt-"])
const COPILOT_ROUTER_OWNED_SKILL_PREFIXES = new Set(["oms-", "oms-no-"])
```

- [ ] **Step 2: Add Copilot skill detection function**

```typescript
function isCopilotRouterOwnedFile(directory: string, fileName: string, content: string): boolean {
  if (directory.includes(`${path.sep}plugins${path.sep}oh-my-superagents-copilot${path.sep}agents${path.sep}`)) {
    return isPrefixOwned(fileName.replace(AGENT_FILE_SUFFIX, ""), content, COPILOT_ROUTER_OWNED_AGENT_PREFIXES)
  }

  if (directory.includes(`${path.sep}plugins${path.sep}oh-my-superagents-copilot${path.sep}skills${path.sep}`)) {
    return fileName === SKILL_FILE_NAME && hasArtifactOwnershipMarker(content)
  }

  return false
}
```

- [ ] **Step 3: Update isOmsOwnedArtifactFile to include Copilot**

```typescript
export function isOmsOwnedArtifactFile(filePath: string, content: string): boolean {
  const directory = path.dirname(filePath)
  const fileName = path.basename(filePath)

  return (
    isOpenCodeOmsControlPlaneFile(filePath, content)
    || isQwenOmsControlPlaneFile(filePath, content)
    || isOmsOwnedSkillFile(filePath, content)
    || isOpenCodeRouterOwnedFile(directory, fileName, content)
    || isCodexRouterOwnedFile(directory, fileName, content)
    || isQwenRouterOwnedFile(directory, fileName, content)
    || isCopilotRouterOwnedFile(directory, fileName, content)
    || isRouteOwnedFile(filePath, content)
    || (
      hasArtifactOwnershipMarker(content)
      && fileName.startsWith("oms-")
      && (
        directory.endsWith(`${path.sep}.opencode${path.sep}commands`)
        || directory.endsWith(`${path.sep}.qwen${path.sep}commands`)
        || directory.includes(`${path.sep}plugins${path.sep}oh-my-superagents-copilot${path.sep}skills${path.sep}`)
      )
    )
  )
}
```

- [ ] **Step 4: Run materialize tests**

```bash
pnpm test -- --run test/materialize.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit materialize update**

```bash
git add src/materialize.ts
git commit -m "feat(copilot): add Copilot artifact ownership detection"
```

---

## Chunk 6: CLI Integration

### Task 12: Add --host copilot to CLI

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Export Copilot modules from index.ts**

```typescript
export * from "./copilot.js"
export * from "./copilot-hooks.js"
export * from "./copilot-bootstrap.js"
```

- [ ] **Step 2: Add Copilot to CliHost type in cli.ts**

```typescript
type CliHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

- [ ] **Step 3: Add Copilot adapter imports**

```typescript
import { buildCopilotArtifacts, explainCopilotPhase, explainAllCopex } from "./copilot.js"
import { buildCopilotBootstrapFiles } from "./copilot-bootstrap.js"
```

- [ ] **Step 4: Add Copilot artifact building in CLI**

Add to the host dispatch logic:

```typescript
if (host === "copilot") {
  const { agents, skills, pluginManifest } = buildCopilotArtifacts(routerConfig, controlPlaneSettings)
  // ... handle Copilot sync/bootstrap
}
```

- [ ] **Step 5: Add Copilot bootstrap command handling**

```typescript
if (host === "copilot" && command === "bootstrap") {
  const bootstrapFiles = buildCopilotBootstrapFiles()
  // ... materialize bootstrap files
}
```

- [ ] **Step 6: Run CLI tests**

```bash
pnpm test -- --run test/cli.test.ts
```

Expected: Need to add Copilot CLI tests

- [ ] **Step 7: Add Copilot CLI tests**

Add tests for:
- `sync --host copilot`
- `bootstrap --host copilot`
- `explain --host copilot --all`

- [ ] **Step 8: Commit CLI integration**

```bash
git add src/cli.ts src/index.ts test/cli.test.ts
git commit -m "feat(copilot): integrate Copilot CLI into CLI commands"
```

---

## Chunk 7: Documentation

### Task 13: Update README and docs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Add Copilot CLI to Support Matrix**

Add row in README.md support matrix:

```
| GitHub Copilot CLI | Full | Planned | Full | Plugin marketplace | Planned | Agents + Skills + Hooks |
```

- [ ] **Step 2: Add Copilot CLI usage section**

```markdown
## GitHub Copilot CLI Support

### Install

For GitHub Copilot CLI, use the bootstrap command:

```bash
oh-my-superagents bootstrap --host copilot
```

This will create the plugin bundle at `plugins/oh-my-superagents-copilot/` containing:
- Agents for each superpowers phase
- Skills for OMS control plane commands
- Hooks for session lifecycle events
- Plugin manifest for Copilot CLI discovery

### Sync

```bash
oh-my-superagents sync --host copilot
```

### Generated Artifacts

Copilot CLI generates:
- `plugins/oh-my-superagents-copilot/agents/*.agent.md` - Phase routing agents
- `plugins/oh-my-superagents-copilot/skills/*/SKILL.md` - Control plane skills
- `plugins/oh-my-superagents-copilot/hooks.json` - Lifecycle hooks
- `plugins/oh-my-superagents-copilot/plugin.json` - Plugin manifest
```

- [ ] **Step 3: Add Chinese documentation**

Add similar section to README.zh-CN.md.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add Copilot CLI host support documentation"
```

---

## Chunk 8: Full Verification

### Task 14: Full test and build verification

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 2: Run type check**

```bash
pnpm check
```

Expected: No type errors

- [ ] **Step 3: Run build**

```bash
pnpm build
```

Expected: Build succeeds

- [ ] **Step 4: Verify library export**

```bash
node -e "import('./dist/index.js').then(()=>console.log('library-ok'))"
```

Expected: "library-ok"

- [ ] **Step 5: Check git status**

```bash
git diff --stat
```

Confirm only Copilot-related files changed.

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/specs/2026-04-22-copilot-cli-host-support-design.md docs/superpowers/plans/2026-04-22-copilot-cli-host-support-plan.md src/copilot.ts src/copilot-hooks.ts src/copilot-bootstrap.ts src/capabilities.ts src/cli.ts src/index.ts src/materialize.ts test/copilot.test.ts test/copilot-hooks.test.ts test/copilot-bootstrap.test.ts README.md README.zh-CN.md
git commit -m "feat(copilot): complete GitHub Copilot CLI host support"
```

---

## Summary

This plan implements complete GitHub Copilot CLI host support following the Agent + Plugin + Hooks scheme. The implementation adds:

1. **Core Adapter** (`src/copilot.ts`) - Agent and skill generation
2. **Hooks System** (`src/copilot-hooks.ts`) - Lifecycle hooks configuration
3. **Bootstrap** (`src/copilot-bootstrap.ts`) - Plugin scaffolding
4. **Capabilities** - Host support decisions
5. **Materialize** - Artifact ownership detection
6. **CLI Integration** - `--host copilot` commands
7. **Documentation** - Usage guides

All changes follow existing patterns from Codex/Qwen/Claude adapters and maintain consistency with the shared OMS core.