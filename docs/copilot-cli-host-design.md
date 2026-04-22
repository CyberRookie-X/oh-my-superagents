# GitHub Copilot CLI Host Design

## 1. Overview

### Why Copilot CLI

GitHub Copilot CLI (`copilot`) is GitHub's official terminal-based coding agent, powered by the same agentic harness as GitHub's Copilot coding agent. It provides:

- **Terminal-native development**: AI coding agent directly in the command line
- **Deep GitHub integration**: PRs, issues, actions via natural language
- **Custom agents**: `.agent.md` files with YAML frontmatter for specialized roles
- **Plugin system**: Distributable bundles with agents, skills, hooks, and MCP config
- **Hooks**: Shell commands triggered at session/tool lifecycle events
- **Skills**: Task-specific instruction packs invoked via slash commands
- **Auto-compaction**: Built-in context management for long sessions

Adding Copilot CLI as an OMS host extends the routing and control-plane layer to one of the most widely distributed AI coding agents, giving OMS users:

1. Phase-based routing (`brainstorming`, `writing-plans`, `subagent-driven-development`, etc.) inside Copilot CLI sessions
2. Control-plane commands (`status`, `use`, `disable`, `sync`, `doctor`) via Copilot skills
3. Consistent OMS semantics across all supported hosts
4. Plugin-based distribution for team/org-wide installation

### Goals

- Implement Copilot CLI as a thin host adapter following existing OMS patterns
- Use the "Agent + Plugin + Hooks" approach: agents for phase routing, plugin for distribution, hooks for control-plane integration
- Maintain compatibility with both `superpowers` and `direct` workflow modes
- Preserve all OMS invariants: ownership markers, materialization, capability policy, compatibility monitoring

### Scope

- New adapter file: `src/copilot.ts`
- Plugin bundle: `plugins/oh-my-superagents-copilot/`
- Hooks: `hooks.json` for session lifecycle integration
- CLI integration: `--host copilot` flag
- Capability policy updates in `capabilities.ts`
- Materialization support in `materialize.ts`
- Bootstrap support similar to Codex

### Out of Scope (initial slice)

- Copilot CLI version-specific feature detection beyond basic install detection
- Custom MCP server integration beyond what the plugin manifest supports
- Migration of existing Copilot CLI custom instructions

---

## 2. Copilot CLI Host Primitives

### 2.1 Agents

Custom agents are Markdown files with YAML frontmatter, stored in `agents/` directories:

**File format**: `NAME.agent.md`

```yaml
---
name: oms-brainstorm
description: OMS brainstorming phase agent for Copilot CLI
tools:
  use:
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
---

You are the oms-brainstorm phase agent for oh-my-superagents.
...
```

**Key frontmatter fields**:
- `name`: Agent identifier (lowercase, hyphenated)
- `description`: Human-readable description
- `tools`: Tool permissions (`use`, `deny`, or permission objects)
- `model`: Optional model override
- `temperature`: Optional temperature override

**Locations**:
- Project-scoped: `.copilot/agents/` (repo root)
- User-scoped: `~/.copilot/agents/`
- Plugin-scoped: `plugins/PLUGIN_NAME/agents/`
- Custom: `--agent-dir` flag, `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env

### 2.2 Plugins

Plugins are directory bundles with a manifest and optional subdirectories:

**Directory structure**:
```
oh-my-superagents-copilot/
├── plugin.json          # Primary manifest
├── package.json         # Alternative manifest (npm-style)
├── .lsp.json            # LSP config (optional)
├── agents/              # Custom agents
│   ├── oms-brainstorm.agent.md
│   ├── oms-plan.agent.md
│   └── ...
├── skills/              # Custom skills
│   ├── oms-status/
│   │   └── SKILL.md
│   ├── oms-sync/
│   │   └── SKILL.md
│   └── ...
├── hooks.json           # Hook definitions
└── .mcp.json            # MCP server config (optional)
```

**plugin.json manifest**:
```json
{
  "name": "oh-my-superagents-copilot",
  "version": "1.0.0",
  "description": "Oh My Superagents routing and control plane for Copilot CLI",
  "agents": "./agents/",
  "skills": "./skills/",
  "hooks": "./hooks.json",
  "interface": {
    "displayName": "Oh My Superagents",
    "shortDescription": "Phase-based routing and control plane",
    "category": "Developer Tools",
    "developerName": "oh-my-superagents"
  }
}
```

**Manifest formats** (Copilot CLI checks in order):
1. `plugin.json` - Copilot CLI native format
2. `package.json` - npm-style with `copilot` field
3. `.lsp.json` - LSP-only plugins
4. Open Plugin spec - emerging standard

**Install**: `copilot plugin install ./oh-my-superagents-copilot`
**List**: `copilot plugin list`

**Discovery locations**:
- `~/.copilot/plugins/` - user-global
- `.claude-plugin/` - legacy compat
- `--plugin-dir` flag
- `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var
- `.agents/plugins/marketplace.json` - marketplace-style (Copilot CLI compatible)

### 2.3 Hooks

Hooks execute shell commands at lifecycle events:

**hooks.json format**:
```json
{
  "hooks": [
    {
      "event": "sessionStart",
      "command": "echo 'OMS session initialized'"
    },
    {
      "event": "subagentStart",
      "command": "echo 'Subagent starting: $COPILOT_AGENT_NAME'"
    },
    {
      "event": "preToolUse",
      "command": "echo 'Tool: $COPILOT_TOOL_NAME'"
    },
    {
      "event": "postToolUse",
      "command": "echo 'Tool completed: $COPILOT_TOOL_NAME'"
    },
    {
      "event": "sessionEnd",
      "command": "echo 'OMS session ended'"
    },
    {
      "event": "preCompact",
      "command": "echo 'Context compaction about to occur'"
    }
  ]
}
```

**Available triggers**:
| Event | When | Available vars |
|-------|------|----------------|
| `sessionStart` | Session begins | `$COPILOT_SESSION_ID`, `$COPILOT_CWD` |
| `sessionEnd` | Session ends | `$COPILOT_SESSION_ID` |
| `subagentStart` | Sub-agent spawned | `$COPILOT_AGENT_NAME`, `$COPILOT_SESSION_ID` |
| `preToolUse` | Before tool execution | `$COPILOT_TOOL_NAME`, `$COPILOT_TOOL_ARGS` |
| `postToolUse` | After tool execution | `$COPILOT_TOOL_NAME`, `$COPILOT_TOOL_RESULT` |
| `preCompact` | Before context compaction | `$COPILOT_CONTEXT_USAGE` |

### 2.4 Skills

Skills are instruction packs invoked via slash commands (`/skill-name`):

**Directory structure**: `skills/NAME/SKILL.md`

**SKILL.md format**:
```markdown
---
name: oms-status
description: Show OMS status for Copilot CLI
---

Run `oh-my-superagents status --host copilot $ARGUMENTS` from the repository root.
If the binary is not on PATH, run `npx oh-my-superagents status --host copilot $ARGUMENTS` instead.
```

**Locations**:
- Project-scoped: `.copilot/skills/` (repo root)
- User-scoped: `~/.copilot/skills/`
- Plugin-scoped: `plugins/PLUGIN_NAME/skills/`

### 2.5 Config

**User config directory**: `~/.copilot/`
```
~/.copilot/
├── config.json        # Main config
├── settings.json      # User settings
├── agents/            # User agents
├── skills/            # User skills
├── hooks/             # User hooks
└── plugins/           # Installed plugins
```

**Key config files**:
- `config.json` - main configuration
- `settings.json` - user preferences
- `lsp-config.json` - LSP server config (user: `~/.copilot/`, repo: `.github/lsp.json`)

---

## 3. Architecture Design

### 3.1 Where Copilot CLI Fits in OMS Layers

The Copilot CLI adapter follows the same seven-layer architecture as existing hosts:

```
Layer 1: Control Plane Core (config.ts, control-plane.ts, cli.ts)
  + "copilot" as a new CliHost value
        |
Layer 2: Workflow Adapters (router.ts, workflow-*.ts) -- no changes needed
        |
Layer 3: Shared Capability Policy (capabilities.ts) -- add copilot decisions
        |
Layer 4: Host Adapters
  + src/copilot.ts (NEW)
    src/opencode.ts, src/codex.ts, src/qwen.ts, src/claude.ts
        |
Layer 5: Compatibility Monitor
  + detectCopilotCli() (NEW)
    superpowers-compatibility.ts
        |
Layer 6: Artifact Reconciliation (materialize.ts) -- add copilot ownership rules
        |
Layer 7: Bootstrap
  + copilot-bootstrap.ts (NEW, similar to codex)
```

### 3.2 Adapter Responsibilities

The `copilot.ts` adapter:

1. **Render agents**: Generate `NAME.agent.md` files for each OMS phase
2. **Render control-plane skills**: Generate `SKILL.md` files for status/use/disable/sync/doctor
3. **Build plugin manifest**: Generate `plugin.json` for the plugin bundle
4. **Build hooks config**: Generate `hooks.json` for lifecycle integration
5. **Explain functions**: `explainCopilotPhase()`, `explainAllCopilot()` for diagnostics

### 3.3 Artifact Types

| Artifact | Format | Location | Purpose |
|----------|--------|----------|---------|
| Phase agents | `.agent.md` | `.copilot/agents/` or plugin `agents/` | Route OMS phases to upstream workflows |
| Control-plane skills | `SKILL.md` | plugin `skills/NAME/` | Invoke OMS CLI commands |
| Plugin manifest | `plugin.json` | plugin root | Enable `copilot plugin install` |
| Hooks config | `hooks.json` | plugin root | Enable control-plane lifecycle hooks |
| Direct-mode agents | `.agent.md` | `.copilot/agents/` or plugin `agents/` | Route direct intents |
| Direct-mode skills | `SKILL.md` | plugin `skills/NAME/` | Invoke direct-mode routing |

---

## 4. Agent Design

### 4.1 Phase Agent Naming

Following the existing convention from `codex.ts` and `qwen.ts`:

```typescript
const PHASE_TO_COPILOT_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>
```

### 4.2 Superpowers Workflow Agents

For `workflow.kind === "superpowers"`, each phase gets an agent:

**File**: `agents/oms-brainstorm.agent.md`

```yaml
---
name: oms-brainstorm
description: OMS brainstorming phase agent for Copilot CLI
tools:
  use:
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->

You are the oms-brainstorm phase agent for oh-my-superagents.

Use the workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.
If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop instead of improvising a replacement workflow.

Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.
```

### 4.3 Direct Workflow Agents

For `workflow.kind === "direct"`, each intent gets an agent:

**File**: `agents/rt-my-intent.agent.md`

```yaml
---
name: rt-my-intent
description: rt-my-intent routing agent for my-intent
tools:
  use:
    - Read
    - Write
    - Edit
    - Bash
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=copilot; source=direct; route=intent.my-intent; projection=agent; rendered-name=rt-my-intent -->

You are the rt-my-intent routing agent for the `my-intent` intent.
Handle requests that match this intent: My Intent Label: Optional description.
Treat `intent.my-intent` from the direct workflow source as the routing contract for this agent.
Stay focused on this intent and do not switch to another workflow intent unless the user explicitly asks.
```

### 4.4 Agent File Renderer

```typescript
function renderCopilotAgentFile(input: {
  name: string
  description: string
  developerInstructions: string
  model?: string
  tools?: Record<string, string[]>
  sourceEntry: WorkflowSourceEntry
}) {
  return [
    "---",
    `name: ${yamlScalar(input.name)}`,
    `description: ${yamlScalar(input.description)}`,
    ...(input.model ? [`model: ${yamlScalar(input.model)}`] : []),
    ...(input.tools ? [renderToolsBlock(input.tools)] : []),
    "---",
    "",
    MARKER,
    renderRouteOwnershipMetadata({
      host: "copilot",
      source: input.sourceEntry.source,
      route: input.sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.name,
    }),
    "",
    input.developerInstructions,
    "",
  ].join("\n")
}
```

### 4.5 Workflow Entry Name Formatting

Same pattern as existing adapters:

```typescript
function formatWorkflowEntryName(sourceEntry: WorkflowSourceEntry) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function formatCopilotWorkflowGuidance(sourceEntry: WorkflowSourceEntry, workflowEntryName: string) {
  if (sourceEntry.source === "gstack") {
    return `Use the gstack developer instructions from \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
  }
  return `Use the workflow entry \`${workflowEntryName}\` for \`${sourceEntry.canonicalRoute}\` whenever it is relevant.`
}
```

---

## 5. Plugin Design

### 5.1 Plugin Directory Structure

```
plugins/oh-my-superagents-copilot/
├── plugin.json
├── agents/
│   ├── oms-brainstorm.agent.md
│   ├── oms-plan.agent.md
│   ├── oms-execute.agent.md
│   ├── oms-review.agent.md
│   ├── oms-verify.agent.md
│   ├── oms-visual.agent.md
│   └── oms-web-test.agent.md
├── skills/
│   ├── oms-status/
│   │   └── SKILL.md
│   ├── oms-use/
│   │   └── SKILL.md
│   ├── oms-disable/
│   │   └── SKILL.md
│   ├── oms-sync/
│   │   └── SKILL.md
│   ├── oms-doctor/
│   │   └── SKILL.md
│   ├── oms-no-superpowers/
│   │   └── SKILL.md
│   └── ai-<intent>/          # direct mode only
│       └── SKILL.md
└── hooks.json
```

### 5.2 Plugin Manifest

```typescript
function buildPluginManifest(
  packageVersion: string,
  controlPlaneSettings: CopilotControlPlaneSettings,
) {
  const syncSkillName = `${controlPlaneSettings.commandPrefix}-${controlPlaneSettings.commands.sync.name}`
  const doctorSkillName = `${controlPlaneSettings.commandPrefix}-${controlPlaneSettings.commands.doctor.name}`

  return JSON.stringify(
    {
      name: "oh-my-superagents-copilot",
      version: packageVersion,
      description: "Oh My Superagents routing and control plane for Copilot CLI",
      agents: "./agents/",
      skills: "./skills/",
      hooks: "./hooks.json",
      interface: {
        displayName: "Oh My Superagents",
        shortDescription: "Phase-based routing and control plane for Copilot CLI",
        category: "Developer Tools",
        developerName: "oh-my-superagents",
        defaultPrompt: [
          `Use $${syncSkillName} to refresh Copilot routing for this project.`,
          `Use $${doctorSkillName} to inspect the current Copilot routing map.`,
        ],
      },
    },
    null,
    2,
  )
}
```

### 5.3 Marketplace Integration

Following the Codex pattern, Copilot CLI can use a marketplace-style entry:

```typescript
function buildCopilotMarketplaceJson() {
  return {
    name: "oh-my-superagents-local",
    interface: {
      displayName: "Oh My Superagents (Local)",
    },
    plugins: [{
      name: "oh-my-superagents-copilot",
      source: {
        source: "local",
        path: "./plugins/oh-my-superagents-copilot",
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Developer Tools",
    }],
  }
}
```

Marketplace file location: `.agents/plugins/marketplace.json` (same as Codex, since Copilot CLI shares the `.agents/` discovery convention).

---

## 6. Hooks Design

### 6.1 Hooks Purpose

Hooks enable OMS control-plane integration by:

1. **sessionStart**: Detect and report OMS state on session begin
2. **subagentStart**: Ensure phase agents receive correct routing context
3. **preToolUse**: Optional guardrails for tool execution
4. **postToolUse**: Optional logging/telemetry
5. **sessionEnd**: Cleanup or state persistence
6. **preCompact**: Preserve critical routing state before compaction

### 6.2 hooks.json

```json
{
  "hooks": [
    {
      "event": "sessionStart",
      "command": "test -f .copilot/agents/oms-brainstorm.agent.md && echo '[OMS] Superagents routing active' || echo '[OMS] No OMS agents detected'"
    },
    {
      "event": "subagentStart",
      "command": "echo '[OMS] Subagent starting: $COPILOT_AGENT_NAME'"
    },
    {
      "event": "preCompact",
      "command": "echo '[OMS] Context compaction imminent'"
    }
  ]
}
```

### 6.3 Hook Design Principles

- **Minimal by default**: Hooks should not slow down session start
- **Non-blocking**: Hook failures should not crash the session
- **Informative**: Provide useful diagnostics without being noisy
- **Extensible**: Users can add custom hooks alongside OMS hooks

### 6.4 Advanced Hook: OMS Status on Session Start

For a richer session-start experience, the hook could write a temporary file that Copilot CLI reads as custom instructions:

```json
{
  "event": "sessionStart",
  "command": "oh-my-superagents status --host copilot --json > /tmp/oms-copilot-status.json 2>/dev/null || true"
}
```

However, this requires the OMS binary on PATH. The initial slice should use simpler hooks and rely on skills for control-plane access.

---

## 7. Artifact Generation

### 7.1 What Gets Generated

| File | Generated By | Location |
|------|-------------|----------|
| `agents/oms-brainstorm.agent.md` | `buildCopilotArtifacts()` | `.copilot/agents/` or plugin |
| `agents/oms-plan.agent.md` | `buildCopilotArtifacts()` | `.copilot/agents/` or plugin |
| `agents/oms-execute.agent.md` | `buildCopilotArtifacts()` | `.copilot/agents/` or plugin |
| `agents/oms-review.agent.md` | `buildCopilotArtifacts()` | `.copilot/agents/` or plugin |
| `agents/oms-verify.agent.md` | `buildCopilotArtifacts()` | `.copilot/agents/` or plugin |
| `agents/oms-visual.agent.md` | `buildCopilotArtifacts()` | `.copilot/agents/` or plugin |
| `agents/oms-web-test.agent.md` | `buildCopilotArtifacts()` | `.copilot/agents/` or plugin |
| `agents/rt-<intent>.agent.md` | `buildCopilotArtifacts()` (direct) | `.copilot/agents/` or plugin |
| `skills/oms-status/SKILL.md` | `buildCopilotBootstrapFiles()` | plugin `skills/` |
| `skills/oms-use/SKILL.md` | `buildCopilotBootstrapFiles()` | plugin `skills/` |
| `skills/oms-disable/SKILL.md` | `buildCopilotBootstrapFiles()` | plugin `skills/` |
| `skills/oms-sync/SKILL.md` | `buildCopilotBootstrapFiles()` | plugin `skills/` |
| `skills/oms-doctor/SKILL.md` | `buildCopilotBootstrapFiles()` | plugin `skills/` |
| `skills/oms-no-superpowers/SKILL.md` | `buildCopilotBootstrapFiles()` | plugin `skills/` |
| `skills/ai-<intent>/SKILL.md` | `buildCopilotBootstrapFiles()` (direct) | plugin `skills/` |
| `plugin.json` | `buildCopilotBootstrapFiles()` | plugin root |
| `hooks.json` | `buildCopilotBootstrapFiles()` | plugin root |
| `marketplace.json` | `buildCopilotBootstrapFiles()` | `.agents/plugins/` |

### 7.2 Generation Flow

```
oms sync --host copilot
    |
    +-- loadRouterConfig() -> RouterConfig
    +-- loadControlPlaneConfig() -> ControlPlaneConfig
    |
    +-- buildCopilotArtifacts(config)
    |     +-- GeneratedArtifact[] (agents)
    |
    +-- buildCopilotBootstrapFiles({ config, controlPlaneSettings })
    |     +-- CopilotBootstrapFile[] (plugin.json, hooks.json, skills, marketplace)
    |
    +-- materializeArtifacts({ cwd, artifacts: [...agents, ...skills], fs })
    |     +-- MaterializeArtifactsResult
    |
    +-- write bootstrap files (plugin.json, hooks.json, marketplace.json)
```

### 7.3 Ownership Markers

All generated artifacts include the standard OMS marker:

```
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
```

Plus route-specific metadata:

```
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->
```

Control-plane skills use the control-plane marker:

```
<!-- oms-control-plane: stage=1; host=copilot; artifact=skill; logical-command=status; rendered-name=oms-status -->
```

---

## 8. Control Plane Integration

### 8.1 Control Plane Commands via Skills

Each OMS control-plane command becomes a Copilot skill:

**oms-status skill** (`skills/oms-status/SKILL.md`):
```markdown
---
name: oms-status
description: Show OMS status for Copilot CLI
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-control-plane: stage=1; host=copilot; artifact=skill; logical-command=status; rendered-name=oms-status -->

Run `oh-my-superagents status --host copilot $ARGUMENTS` from the repository root.
If the binary is not on PATH, run `npx oh-my-superagents status --host copilot $ARGUMENTS` instead.
Forward any command arguments as-is.
Treat this skill as the Copilot CLI host entry for the logical `status` command key.
```

**oms-use**, **oms-disable**, **oms-sync**, **oms-doctor** follow the same pattern, each invoking the corresponding `oh-my-superagents <command> --host copilot $ARGUMENTS`.

### 8.2 Temporary Disable

Following the OpenCode pattern, a `oms-no-superpowers` skill allows temporary disablement:

```markdown
---
name: oms-no-superpowers
description: Temporarily disable superpowers for this conversation.
---

<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-auxiliary: stage=1; host=copilot; artifact=skill; helper=temporary-disable; rendered-name=oms-no-superpowers -->

Tell the assistant:
- do not use superpowers in this conversation
- do not proactively load superpowers skills, workflows, or phase agents
- only use superpowers again if I explicitly ask

Extra instruction: $ARGUMENTS
```

### 8.3 How Skills Enable Control Plane

1. User invokes `/oms-status` inside Copilot CLI
2. Copilot reads the skill's SKILL.md instructions
3. Skill instructs Copilot to run `oh-my-superagents status --host copilot`
4. OMS CLI executes and returns status output
5. Copilot presents the output to the user

This is the same pattern used by Codex skills and Claude skills.

### 8.4 Supported Commands by Workflow Mode

| Command | superpowers | direct |
|---------|-------------|--------|
| status | yes | yes |
| use | yes | no |
| disable | yes | no |
| sync | yes | yes |
| doctor | yes | yes |
| explain | yes | no |

Direct mode supports only `status`, `sync`, `doctor` -- matching the existing pattern for OpenCode and Qwen direct mode.

---

## 9. Capability Policy

### 9.1 Host Type

Add `"copilot"` to the `CapabilityHost` type:

```typescript
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

### 9.2 Projection Decisions

Copilot CLI should support the same projections as Codex for the initial slice:

```typescript
export function getHostProjectionDecision(input: {
  host: CapabilityHost
  workflowKind: WorkflowKind
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  // ... existing checks ...

  // Copilot CLI: direct mode supported (unlike Claude)
  if (input.host === "copilot" && input.workflowKind === "direct") {
    return supportedDecision()
  }

  return supportedDecision()
}
```

### 9.3 Control Plane Command Decisions

```typescript
export function getControlPlaneCommandDecision(input: {
  host: CapabilityHost
  command: ControlPlaneCapabilityCommand
  workflowKind: WorkflowKind
}): CapabilityDecision {
  // ... existing checks ...

  // Copilot CLI direct mode: limited commands
  if (input.workflowKind === "direct" && input.host === "copilot") {
    if (input.command === "use" || input.command === "disable" || input.command === "explain") {
      return unsupportedDecision("unsupported_workflow_mode")
    }
  }

  return supportedDecision()
}
```

### 9.4 Decision Matrix

| Host | superpowers + superpowers | superpowers + gstack | direct + intent |
|------|--------------------------|---------------------|-----------------|
| opencode | yes | yes | yes |
| codex | yes | yes | yes |
| qwen | yes | no | yes |
| claude | yes | yes | no |
| **copilot** | **yes** | **yes** | **yes** |

| Host | status | use | disable | sync | doctor | explain |
|------|--------|-----|---------|------|--------|---------|
| opencode | yes | yes | yes | yes | yes | yes |
| codex | yes | yes | yes | yes | yes | yes |
| qwen | yes | yes | yes | yes | yes | no |
| claude | yes | yes | yes | yes | yes | yes |
| **copilot** | **yes** | **yes** | **yes** | **yes** | **yes** | **yes** |
| **copilot (direct)** | **yes** | **no** | **no** | **yes** | **yes** | **no** |

---

## 10. Materialization Strategy

### 10.1 Ownership Detection

Add Copilot CLI to the materialization ownership rules:

```typescript
const COPILOT_ROUTER_OWNED_AGENT_PREFIXES = new Set(["oms-", "rt-"])

function isCopilotRouterOwnedFile(directory: string, fileName: string, content: string) {
  if (directory.endsWith(`${path.sep}.copilot${path.sep}agents`)) {
    return isPrefixOwned(fileName, content, COPILOT_ROUTER_OWNED_AGENT_PREFIXES)
  }
  return false
}
```

### 10.2 Skill Ownership

Copilot CLI skills follow the same pattern as Codex skills:

```typescript
function isCopilotOmsControlPlaneSkillContent(content: string) {
  const ownership = parseControlPlaneOwnership(content)
  return ownership?.stage === "1" && ownership.host === "copilot" && ownership.artifact === "skill"
}

function isCopilotOmsControlPlaneSkillFile(filePath: string, content: string) {
  const ownership = parseControlPlaneOwnership(content)
  return (
    path.basename(filePath) === SKILL_FILE_NAME
    && filePath.includes(`${path.sep}plugins${path.sep}oh-my-superagents-copilot${path.sep}skills${path.sep}`)
    && isCopilotOmsControlPlaneSkillContent(content)
    && path.basename(path.dirname(filePath)) === ownership?.renderedName
  )
}
```

### 10.3 Route Ownership Marker Parsing

Update the regex in `parseRouteOwnership` to include `"copilot"`:

```typescript
const match = content.match(
  new RegExp(
    `<!-- ${escapedPrefix} stage=(1|2); host=(opencode|codex|qwen|claude|copilot); source=([a-z-]+); route=([a-z0-9.-]+); projection=(agent|command|skill); rendered-name=([a-z0-9-]+) -->`,
  ),
)
```

### 10.4 Cleanup Rules

During `materializeArtifacts`, Copilot-owned files are cleaned up when no longer needed:

1. Scan `.copilot/agents/` for files with `oms-` or `rt-` prefix + marker
2. Scan `plugins/oh-my-superagents-copilot/skills/*/SKILL.md` for control-plane markers
3. Remove any owned files not in the desired artifact set

### 10.5 Owned Artifact Rules

```typescript
const OWNED_ARTIFACT_RULES: Record<CliHost, Array<{ directory: string; extension: string }>> = {
  // ... existing hosts ...
  copilot: [
    { directory: ".copilot/agents", extension: ".agent.md" },
  ],
}
```

### 10.6 isRouteOwnedFile for Copilot

```typescript
if (ownership.host === "copilot") {
  return ownership.projection === "agent" && filePath.includes(`${path.sep}.copilot${path.sep}agents${path.sep}`)
}
```

### 10.7 isOmsOwnedSkillFile and isOmsOwnedArtifactFile

Add copilot checks to the existing functions:

```typescript
export function isOmsOwnedSkillFile(filePath: string, content: string) {
  return (
    isCodexOmsControlPlaneSkillFile(filePath, content)
    || isCodexOmsAuxiliarySkillFile(filePath, content)
    || isCodexDirectSkillFile(filePath, content)
    || isCopilotOmsControlPlaneSkillFile(filePath, content)  // NEW
    || isCopilotOmsAuxiliarySkillFile(filePath, content)    // NEW
    || (
      path.basename(filePath) === SKILL_FILE_NAME
      && isRouteOwnedFile(filePath, content)
    )
  )
}
```

---

## 11. CLI Integration

### 11.1 Host Type

```typescript
type CliHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
```

### 11.2 Command Shapes

All existing OMS commands work with `--host copilot`:

```bash
# Sync artifacts
oh-my-superagents sync --host copilot

# Check status
oh-my-superagents status --host copilot

# Diagnostics
oh-my-superagents doctor --host copilot

# Switch preset
oh-my-superagents use --host copilot --preset default

# Disable
oh-my-superagents disable --host copilot

# Explain routing
oh-my-superagents explain --host copilot
oh-my-superagents explain --host copilot --phase brainstorming
```

### 11.3 getArtifactsForHost Integration

```typescript
async function getArtifactsForHost(
  cwd: string,
  config: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  host: CliHost,
  deps: CliDeps,
  controlPlaneSettings?: ResolvedControlPlane["config"]["settings"],
) {
  // ... existing hosts ...

  if (host === "copilot") {
    return deps.buildCopilotArtifacts(config).agents
  }

  // ...
}
```

### 11.4 getExpectedArtifacts Integration

```typescript
async function getExpectedArtifacts(
  cwd: string,
  config: ResolvedControlPlane["config"],
  laneState: ResolvedControlPlane["laneState"] | undefined,
  host: CliHost,
  deps: CliDeps,
) {
  // ... existing hosts ...

  if (host === "copilot") {
    const routerConfig = toRouterConfig(config, laneState)
    const built = deps.buildCopilotArtifacts(routerConfig).agents
    const bootstrapFiles = buildCopilotBootstrapFiles({
      packageVersion: "0.0.0",
      includeConfig: false,
      configArtifactPath: toProjectRelativePath(cwd, path.join(cwd, "oh-my-superagents.config.jsonc")),
      routerConfig,
      controlPlaneSettings: config.settings,
    }).files

    return [
      ...built.map((artifact) => path.join(cwd, artifact.directory, artifact.fileName)),
      ...bootstrapFiles.map((file) => path.join(cwd, file.path)),
    ].sort()
  }

  // ...
}
```

### 11.5 CliDeps Extension

```typescript
type CliDeps = {
  // ... existing deps ...
  buildCopilotArtifacts: typeof buildCopilotArtifacts
  buildCopilotBootstrap: typeof runCopilotBootstrap
}
```

### 11.6 Bootstrap Command

Following the Codex pattern, a bootstrap flow for Copilot CLI:

```bash
oh-my-superagents sync --host copilot
```

This would:
1. Generate agent files to `.copilot/agents/`
2. Generate plugin bundle to `plugins/oh-my-superagents-copilot/`
3. Write marketplace entry to `.agents/plugins/marketplace.json`
4. Materialize all artifacts with ownership tracking
5. Print next steps:
   - "Install the plugin: `copilot plugin install ./plugins/oh-my-superagents-copilot`"
   - "Restart Copilot CLI"
   - "Use `/oms-status` to check routing"

### 11.7 discoverOwnedArtifacts for Copilot

Add copilot to the `OWNED_ARTIFACT_RULES` and the `discoverOwnedArtifacts` function:

```typescript
const OWNED_ARTIFACT_RULES: Record<CliHost, Array<{ directory: string; extension: string }>> = {
  opencode: [
    { directory: ".opencode/agents", extension: ".md" },
    { directory: ".opencode/commands", extension: ".md" },
    { directory: RUNTIME_AGENT_METADATA_DIRECTORY, extension: ".json" },
  ],
  codex: [
    { directory: ".codex/agents", extension: ".toml" },
  ],
  qwen: [
    { directory: ".qwen/agents", extension: ".md" },
    { directory: ".qwen/commands", extension: ".md" },
  ],
  claude: [],
  copilot: [
    { directory: ".copilot/agents", extension: ".agent.md" },
  ],
}
```

---

## 12. Compatibility Monitoring

### 12.1 Detection Strategy

Unlike OpenCode/Codex which use `superpowers` detectors, Copilot CLI has its own versioning and installation model. The compatibility monitor should:

1. **Detect Copilot CLI installation**: Check for `copilot` binary on PATH
2. **Parse version**: `copilot --version` output
3. **Check subscription**: Copilot CLI requires an active Copilot subscription
4. **Check experimental mode**: Some features may require `--experimental`

### 12.2 Compatibility Matrix

```typescript
export const COPILOT_COMPATIBILITY = {
  minimumSupportedVersion: "1.0.0",
  testedRanges: [">=1.0.0 <2.0.0"],
  knownBadRanges: [],
} as const
```

### 12.3 Detection Function

```typescript
export async function detectCopilotCli(input: {
  cwd: string
  execFile?: typeof execFile
}): Promise<CopilotDetectionResult> {
  // Check for copilot binary
  // Run copilot --version
  // Parse output
  // Return detection result
}
```

### 12.4 Superpowers Compatibility Note

Copilot CLI does NOT use the `superpowers` skill system. The `superpowers-compatibility.ts` module is not directly applicable to Copilot CLI. Instead:

- The compatibility monitor tracks Copilot CLI version
- OMS features depend on specific Copilot CLI capabilities (agents, plugins, hooks)
- If a future Copilot CLI version changes these primitives, OMS can detect and warn

For the initial slice, the compatibility check can be minimal:
- Is `copilot` installed?
- Is the version within tested range?
- If not, warn the user

---

## 13. Implementation Plan

### Phase 1: Core Adapter (Foundation)

**Files to create**:
- `src/copilot.ts` -- agent rendering, artifact building

**Changes to existing files**:
- `src/capabilities.ts` -- add `"copilot"` to `CapabilityHost`, add projection/command decisions
- `src/cli.ts` -- add `"copilot"` to `CliHost`, wire up `getArtifactsForHost`, `getExpectedArtifacts`
- `src/materialize.ts` -- add copilot ownership detection, update marker parsing regex
- `src/index.ts` -- export new copilot module

**Deliverables**:
- `buildCopilotArtifacts(config)` returns `GeneratedArtifact[]` for all 7 phase agents
- `renderCopilotAgentFile()` produces valid `.agent.md` content
- `--host copilot` works for `sync`, `status`, `doctor`

### Phase 2: Plugin + Bootstrap

**Files to create**:
- `src/copilot-bootstrap.ts` -- plugin manifest, hooks, marketplace, skill generation

**Changes to existing files**:
- `src/cli.ts` -- wire up bootstrap in `sync --host copilot` flow
- `src/materialize.ts` -- add copilot skill ownership detection

**Deliverables**:
- `buildCopilotBootstrapFiles()` generates complete plugin bundle
- `plugin.json`, `hooks.json`, `marketplace.json` generated correctly
- Control-plane skills generated: status, use, disable, sync, doctor, no-superpowers
- Bootstrap flow writes all files and prints next steps

### Phase 3: Direct Workflow Support

**Changes to existing files**:
- `src/copilot.ts` -- add direct-mode agent and skill rendering
- `src/copilot-bootstrap.ts` -- add direct-mode skill generation
- `src/capabilities.ts` -- confirm direct mode decisions for copilot
- `src/cli.ts` -- wire up direct mode for copilot

**Deliverables**:
- Direct intent agents generated: `rt-<intent>.agent.md`
- Direct intent skills generated: `ai-<intent>/SKILL.md`
- `--host copilot` works with `workflow.kind === "direct"`

### Phase 4: Compatibility Monitoring

**Files to create**:
- `src/copilot-detectors.ts` -- Copilot CLI version detection

**Changes to existing files**:
- `src/superpowers-compatibility.ts` -- optionally add copilot entry or create separate module
- `src/cli.ts` -- wire up compatibility check in status/doctor

**Deliverables**:
- `detectCopilotCli()` returns version and install state
- `status --host copilot` shows compatibility info
- `doctor --host copilot` diagnoses issues

### Phase 5: Testing + Polish

**Files to create**:
- `test/copilot.test.ts` -- unit tests for adapter
- `test/copilot-bootstrap.test.ts` -- unit tests for bootstrap
- `test/copilot-materialize.test.ts` -- integration tests for materialization

**Deliverables**:
- All tests pass
- Edge cases handled: name collisions, missing config, incompatible version
- Documentation updated

### File-by-File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/copilot.ts` | CREATE | Phase agent rendering, artifact building |
| `src/copilot-bootstrap.ts` | CREATE | Plugin manifest, hooks, skills, marketplace |
| `src/copilot-detectors.ts` | CREATE | Copilot CLI version detection (Phase 4) |
| `src/capabilities.ts` | MODIFY | Add `"copilot"` to types and decisions |
| `src/cli.ts` | MODIFY | Wire up copilot host in all command paths |
| `src/materialize.ts` | MODIFY | Add copilot ownership rules and marker parsing |
| `src/index.ts` | MODIFY | Export copilot module |
| `test/copilot.test.ts` | CREATE | Unit tests |
| `test/copilot-bootstrap.test.ts` | CREATE | Bootstrap tests |

---

## 14. Testing Strategy

### 14.1 Unit Tests

**copilot.test.ts**:
```typescript
describe("buildCopilotArtifacts", () => {
  it("generates all 7 phase agents for superpowers workflow", () => {
    const config = createTestConfig({ workflow: { kind: "superpowers" } })
    const result = buildCopilotArtifacts(config)
    expect(result.agents).toHaveLength(7)
    expect(result.agents.map(a => a.fileName)).toContain("oms-brainstorm.agent.md")
  })

  it("generates intent agents for direct workflow", () => {
    const config = createTestConfig({
      workflow: { kind: "direct", intents: { "fix-bug": { label: "Fix Bug" } } }
    })
    const result = buildCopilotArtifacts(config)
    expect(result.agents).toHaveLength(1)
    expect(result.agents[0].fileName).toBe("rt-fix-bug.agent.md")
  })

  it("includes ownership markers in all agents", () => {
    // verify MARKER and route ownership metadata present
  })

  it("throws on invalid intent names", () => {
    // verify SAFE_NAME_PATTERN enforcement
  })
})

describe("explainAllCopilot", () => {
  it("returns explain data for all phases", () => {
    // verify phase, canonicalRoute, profileId, model, agentName
  })
})
```

**copilot-bootstrap.test.ts**:
```typescript
describe("buildCopilotBootstrapFiles", () => {
  it("generates valid plugin.json", () => {
    // verify name, version, agents, skills, hooks, interface
  })

  it("generates hooks.json with correct events", () => {
    // verify sessionStart, subagentStart, preCompact events
  })

  it("generates control-plane skills for all commands", () => {
    // verify status, use, disable, sync, doctor, no-superpowers skills
  })

  it("generates marketplace.json", () => {
    // verify plugins array with oh-my-superagents-copilot entry
  })

  it("includes direct-mode skills when workflow is direct", () => {
    // verify ai-<intent> skills generated
  })

  it("detects skill name collisions", () => {
    // verify error thrown on duplicate skill names
  })
})
```

### 14.2 Integration Tests

**copilot-materialize.test.ts**:
```typescript
describe("materialize with copilot artifacts", () => {
  it("writes copilot agents to .copilot/agents/", () => {
    // verify files written to correct location
  })

  it("cleans up stale copilot agents", () => {
    // verify old agents removed when no longer in config
  })

  it("detects ownership via prefix + marker", () => {
    // verify isCopilotRouterOwnedFile returns true for OMS files
  })

  it("rejects collisions with non-OMS files", () => {
    // verify exitCode 1 when non-OMS file exists at target path
  })
})
```

### 14.3 CLI Tests

Following the existing pattern in `cli.test.ts`:

```typescript
describe("--host copilot", () => {
  it("sync generates copilot artifacts", () => {
    // verify sync command generates agents + bootstrap files
  })

  it("status shows copilot routing info", () => {
    // verify status output includes copilot-specific data
  })

  it("doctor diagnoses copilot state", () => {
    // verify doctor output checks copilot install + artifacts
  })

  it("direct mode works with copilot", () => {
    // verify direct workflow generates intent agents + skills
  })
})
```

### 14.4 Canary Testing

Following the existing pattern from `scripts/run-opencode-debian-canary.sh` and `scripts/run-codex-debian-canary.sh`:

```bash
# scripts/run-copilot-debian-canary.sh
# Test OMS + Copilot CLI in a clean Debian container
```

Note: Copilot CLI requires authentication and a subscription, so canary testing may need mock/stub approach for CI.

---

## 15. Migration Path

### 15.1 From Other OMS Hosts

Users migrating from OpenCode, Codex, Qwen, or Claude to Copilot CLI:

1. **Config is shared**: The `oh-my-superagents.config.jsonc` file is host-agnostic. No config changes needed.
2. **Run sync**: `oh-my-superagents sync --host copilot` generates Copilot-specific artifacts.
3. **Install plugin**: `copilot plugin install ./plugins/oh-my-superagents-copilot`
4. **Restart Copilot CLI**: The plugin loads agents, skills, and hooks.
5. **Verify**: Use `/oms-status` inside Copilot CLI to confirm routing is active.

### 15.2 Running Multiple Hosts

OMS supports running multiple hosts simultaneously:

```bash
# Sync for all hosts
oh-my-superagents sync --host opencode
oh-my-superagents sync --host codex
oh-my-superagents sync --host copilot

# Each host gets its own artifacts in its native locations
# Config changes propagate to all hosts on next sync
```

### 15.3 From Manual Copilot CLI Custom Instructions

Users with existing `.copilot/` custom instructions:

1. OMS artifacts go in `.copilot/agents/` -- separate from user custom instructions
2. Plugin installs to `plugins/oh-my-superagents-copilot/` -- isolated directory
3. No conflict with existing `.copilot/` files
4. OMS markers identify which files are OMS-owned for cleanup

### 15.4 Uninstallation

```bash
# Disable OMS for Copilot CLI
oh-my-superagents disable --host copilot

# Or manually remove plugin
copilot plugin uninstall oh-my-superagents-copilot

# Remove OMS-owned artifacts
rm -rf plugins/oh-my-superagents-copilot
rm -f .agents/plugins/marketplace.json  # if only OMS entry
rm -rf .copilot/agents/oms-*.agent.md
rm -rf .copilot/agents/rt-*.agent.md
```

### 15.5 Version Compatibility

| OMS Version | Copilot CLI Version | Status |
|-------------|---------------------|--------|
| Initial release | >= 1.0.0 | Tested |
| Initial release | < 1.0.0 | Untested (may work) |
| Initial release | >= 2.0.0 | Untested (breaking changes possible) |

### 15.6 Config Migration

No config migration is needed. OMS config is host-agnostic:

```jsonc
// oh-my-superagents.config.jsonc -- works for all hosts
{
  "workflow": { "kind": "superpowers" },
  "presets": {
    "default": {
      "label": "Default",
      "profiles": { ... },
      "routes": { ... }
    }
  }
}
```

When a user runs `sync --host copilot`, the same config is used to generate Copilot-specific artifacts.

---

## Appendix A: Comparison with Existing Hosts

| Aspect | OpenCode | Codex | Qwen | Claude | **Copilot CLI** |
|--------|----------|-------|------|--------|-----------------|
| Agent format | `.md` YAML frontmatter | `.toml` | `.md` YAML frontmatter | N/A (skills only) | **`.agent.md` YAML frontmatter** |
| Command format | `.md` commands | N/A | `.md` commands | N/A | **N/A (skills instead)** |
| Skill format | N/A | `SKILL.md` in plugin | N/A | `SKILL.md` in `.claude/skills/` | **`SKILL.md` in plugin skills/** |
| Plugin system | Yes (`@opencode-ai/plugin`) | Yes (local bundle) | No | No | **Yes (plugin.json)** |
| Hooks | No | No | No | No | **Yes (hooks.json)** |
| Bootstrap | Plugin sync | Bootstrap files | Agent sync | Skill sync | **Plugin + bootstrap** |
| Direct mode | Yes | Yes | Yes | No | **Yes** |
| Control plane | Commands | Skills | Commands | Skills | **Skills** |
| Config location | `opencode.json` | `.codex/` | `.qwen/` | `.claude/` | **`.copilot/`** |

---

## Appendix B: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Copilot CLI agent format changes | Low | High | Version detection + compatibility matrix |
| Plugin API changes | Low | Medium | Follow official docs, test against latest |
| Hook environment variables change | Medium | Low | Hooks are informational only in initial slice |
| Skill invocation behavior changes | Low | High | Skills are simple shell commands, resilient |
| Copilot CLI requires subscription | N/A | Medium | Detect and warn in doctor/status |
| Name collision with user agents | Medium | Low | OMS prefix (`oms-`, `rt-`) + ownership markers |
| Marketplace.json format changes | Low | Low | Copilot CLI also supports `plugin.json` directly |

---

## Appendix C: Future Enhancements

1. **MCP Server Integration**: Add `.mcp.json` to the plugin for custom MCP servers
2. **Memory Integration**: Leverage Copilot Memory for persistent routing state
3. **Plan Mode Integration**: Hook into Copilot CLI's plan mode for OMS planning phase
4. **ACP Integration**: Use Copilot CLI's ACP server for programmatic OMS control
5. **Auto-compact Hooks**: Preserve routing context before compaction events
6. **Multi-agent Orchestration**: Use Copilot CLI's sub-agent delegation for lane splitting
7. **GitHub Actions Integration**: OMS routing in CI via Copilot CLI programmatic mode
