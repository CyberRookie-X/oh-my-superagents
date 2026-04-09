# Oh My Superpowers for OpenCode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a thin OpenCode-compatible router package that reads `oh-my-superagents.config.jsonc`, resolves built-in `superpowers` phases to profiles, materializes generated `.opencode/agents` and `.opencode/commands` files, exposes `sync` and `explain` CLIs, and ships a minimal plugin runtime.

**Architecture:** Keep the implementation deliberately small. Use one host-neutral config and route layer, one OpenCode artifact generator, one materializer, one CLI entrypoint, and one minimal plugin entrypoint. Do not add orchestration logic, prompt mutation hooks, or upstream skill vendoring.

**Tech Stack:** TypeScript, Node.js, `@opencode-ai/plugin`, `zod`, `jsonc-parser`, `vitest`

---

## File Structure

**Create:**

- `package.json` - package metadata, scripts, runtime dependencies, binary entry
- `tsconfig.json` - TypeScript compiler config for `src/` to `dist/`
- `vitest.config.ts` - test runner config
- `schemas/oh-my-superagents.schema.json` - JSON schema for editor validation
- `src/index.ts` - public exports
- `src/plugin.ts` - minimal OpenCode plugin entrypoint
- `src/config.ts` - config discovery, parsing, and validation
- `src/router.ts` - built-in phase list, route resolution, explain output helpers
- `src/opencode.ts` - generated agent and command content builders
- `src/materialize.ts` - filesystem sync, marker detection, cleanup, exit-code friendly results
- `src/cli.ts` - `sync` and `explain` CLI entrypoint
- `test/config.test.ts` - config discovery and validation tests
- `test/router.test.ts` - route resolution and explain output tests
- `test/opencode.test.ts` - generated markdown snapshot-style tests
- `test/materialize.test.ts` - sync semantics, cleanup, and collision tests
- `test/cli.test.ts` - CLI JSON output and exit-code tests
- `test/plugin.test.ts` - runtime startup diagnostics tests
- `README.md` - install, config, and usage docs

**Modify:**

- none

## Chunk 1: Core Model and Config

### Task 1: Scaffold the package and baseline tests

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `test/config.test.ts`

- [ ] **Step 1: Write the failing config baseline test**
  ```ts
  import { describe, expect, it } from "vitest"
  import { discoverConfigPath } from "../src/config"

  describe("discoverConfigPath", () => {
    it("prefers the default config file in cwd", async () => {
      const result = await discoverConfigPath({
        cwd: "/workspace/project",
        explicitPath: undefined,
        exists: async (filePath) =>
          filePath === "/workspace/project/oh-my-superagents.config.jsonc",
      })

      expect(result).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- --runInBand test/config.test.ts`
  Expected: FAIL with module resolution or missing export error for `../src/config`

- [ ] **Step 3: Create minimal project scaffold**
  ```json
  {
    "name": "oh-my-superagents",
    "version": "0.1.0",
    "type": "module",
    "bin": {
      "oh-my-superagents": "dist/bin.js"
    },
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "check": "tsc -p tsconfig.json --noEmit",
      "test": "vitest run"
    },
    "dependencies": {
      "@opencode-ai/plugin": "^1.2.24",
      "jsonc-parser": "^3.3.1",
      "zod": "^3.24.2"
    },
    "devDependencies": {
      "@types/node": "^22.13.10",
      "typescript": "^5.8.2",
      "vitest": "^3.1.1"
    }
  }
  ```
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "declaration": true,
      "outDir": "dist",
      "rootDir": ".",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true
    },
    "include": ["src/**/*.ts", "test/**/*.ts"]
  }
  ```
  ```ts
  import { defineConfig } from "vitest/config"

  export default defineConfig({
    test: {
      environment: "node",
      include: ["test/**/*.test.ts"],
    },
  })
  ```
  ```ts
  export * from "./config.js"
  export * from "./router.js"
  export * from "./opencode.js"
  export * from "./materialize.js"
  ```

- [ ] **Step 4: Run test to verify scaffold is wired**
  Run: `npm test -- --runInBand test/config.test.ts`
  Expected: FAIL with missing function implementation, not package or runner errors

### Task 2: Implement config discovery and schema validation

**Files:**

- Create: `src/config.ts`
- Create: `schemas/oh-my-superagents.schema.json`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Expand config tests first**
  ```ts
  import { describe, expect, it } from "vitest"
  import { loadRouterConfig } from "../src/config"

  describe("loadRouterConfig", () => {
    it("loads valid config from explicit path", async () => {
      const result = await loadRouterConfig({
        cwd: "/workspace/project",
        explicitPath: "/workspace/project/router.jsonc",
        readFile: async () => `{
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": { "brainstorming": "build" },
          "defaultRoute": "build"
        }`,
        exists: async () => true,
      })

      expect(result.config.defaultRoute).toBe("build")
      expect(result.path).toBe("/workspace/project/router.jsonc")
    })

    it("rejects unknown phase keys", async () => {
      await expect(
        loadRouterConfig({
          cwd: "/workspace/project",
          explicitPath: "/workspace/project/router.jsonc",
          readFile: async () => `{
            "profiles": { "build": { "model": "openai/gpt-5" } },
            "routes": { "unknown-phase": "build" }
          }`,
          exists: async () => true,
        }),
      ).rejects.toThrow(/unknown-phase/)
    })

    it("rejects unknown top-level keys", async () => {
      await expect(
        loadRouterConfig({
          cwd: "/workspace/project",
          explicitPath: "/workspace/project/router.jsonc",
          readFile: async () => `{
            "profiles": { "build": { "model": "openai/gpt-5" } },
            "routes": { "brainstorming": "build" },
            "unexpected": true
          }`,
          exists: async () => true,
        }),
      ).rejects.toThrow(/unexpected/)
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm test -- --runInBand test/config.test.ts`
  Expected: FAIL with unimplemented `loadRouterConfig`

- [ ] **Step 3: Write minimal config loader and schema**
  ```ts
  import path from "node:path"
  import { parse } from "jsonc-parser"
  import { z } from "zod"

  export const BUILT_IN_PHASES = [
    "brainstorming",
    "writing-plans",
    "subagent-driven-development",
    "requesting-code-review",
    "verification-before-completion",
    "frontend-design",
    "webapp-testing",
  ] as const

  const ProfileSchema = z.object({
    model: z.string().min(1),
    variant: z.string().min(1).optional(),
    effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
    temperature: z.number().optional(),
  })

  const ConfigSchema = z.object({
    profiles: z.record(z.string().min(1), ProfileSchema),
    routes: z.record(z.enum(BUILT_IN_PHASES), z.string().min(1)),
    defaultRoute: z.string().min(1).optional(),
  }).superRefine((value, ctx) => {
    for (const target of Object.values(value.routes)) {
      if (!value.profiles[target]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown profile: ${target}` })
      }
    }
    if (value.defaultRoute && !value.profiles[value.defaultRoute]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown profile: ${value.defaultRoute}` })
    }
  })

  export async function discoverConfigPath(...) { /* default file or explicit override */ }
  export async function loadRouterConfig(...) { /* parse JSONC and validate */ }
  ```
  ```json
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["profiles", "routes"],
    "additionalProperties": false,
    "properties": {
      "profiles": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "required": ["model"],
          "additionalProperties": false,
          "properties": {
            "model": { "type": "string", "minLength": 1 },
            "variant": { "type": "string", "minLength": 1 },
            "effort": { "enum": ["fast", "balanced", "deep", "max"] },
            "temperature": { "type": "number" }
          }
        }
      },
      "routes": {
        "type": "object",
        "propertyNames": {
          "enum": [
            "brainstorming",
            "writing-plans",
            "subagent-driven-development",
            "requesting-code-review",
            "verification-before-completion",
            "frontend-design",
            "webapp-testing"
          ]
        },
        "additionalProperties": { "type": "string", "minLength": 1 }
      },
      "defaultRoute": { "type": "string", "minLength": 1 }
    }
  }
  ```

- [ ] **Step 4: Run config tests to verify they pass**
  Run: `npm test -- --runInBand test/config.test.ts`
  Expected: PASS

## Chunk 2: Routing and OpenCode Artifact Generation

### Task 3: Implement route resolution and explain output

**Files:**

- Create: `src/router.ts`
- Create: `test/router.test.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Write failing route tests**
  ```ts
  import { describe, expect, it } from "vitest"
  import { explainPhase, resolvePhase } from "../src/router"

  const config = {
    profiles: {
      build: { model: "openai/gpt-5", effort: "balanced" },
      review: { model: "anthropic/claude-sonnet-4-5", variant: "high" },
    },
    routes: {
      brainstorming: "review",
    },
    defaultRoute: "build",
  }

  describe("resolvePhase", () => {
    it("uses exact phase route before default route", () => {
      expect(resolvePhase(config, "brainstorming").profileId).toBe("review")
    })

    it("falls back to default route for other built-in phases", () => {
      expect(resolvePhase(config, "webapp-testing").profileId).toBe("build")
    })
  })

  describe("explainPhase", () => {
    it("returns fixed command and agent names", () => {
      expect(explainPhase(config, "requesting-code-review")).toMatchObject({
        phase: "requesting-code-review",
        profileId: "build",
        commandName: "/sp-review",
        agentName: "spr-review",
      })
    })
  })
  ```

- [ ] **Step 2: Run router tests to verify they fail**
  Run: `npm test -- --runInBand test/router.test.ts`
  Expected: FAIL with missing exports from `src/router.ts`

- [ ] **Step 3: Implement route and explain helpers**
  ```ts
  export const EFFORT_TO_VARIANT = {
    fast: "low",
    balanced: "medium",
    deep: "high",
    max: "max",
  } as const

  export const PHASE_TO_COMMAND = {
    brainstorming: "/sp-brainstorm",
    "writing-plans": "/sp-plan",
    "subagent-driven-development": "/sp-execute",
    "requesting-code-review": "/sp-review",
    "verification-before-completion": "/sp-verify",
    "frontend-design": "/sp-visual",
    "webapp-testing": "/sp-web-test",
  } as const

  export const PHASE_TO_AGENT = {
    brainstorming: "spr-strategy",
    "writing-plans": "spr-plan",
    "subagent-driven-development": "spr-build",
    "requesting-code-review": "spr-review",
    "verification-before-completion": "spr-verify",
    "frontend-design": "spr-visual",
    "webapp-testing": "spr-visual",
  } as const

  export function resolvePhase(config, phase) { /* exact route or defaultRoute */ }
  export function explainPhase(config, phase) { /* resolved model, variant, names */ }
  export function explainAll(config) { /* map built-in phases */ }
  ```

- [ ] **Step 4: Run router tests to verify they pass**
  Run: `npm test -- --runInBand test/router.test.ts`
  Expected: PASS

### Task 4: Generate OpenCode agent and command markdown

**Files:**

- Create: `src/opencode.ts`
- Create: `test/opencode.test.ts`
- Modify: `src/router.ts`

- [ ] **Step 1: Write failing artifact tests**
  ```ts
  import { describe, expect, it } from "vitest"
  import { buildArtifacts, renderAgentFile, renderCommandFile } from "../src/opencode"

  describe("renderAgentFile", () => {
    it("renders hidden subagent frontmatter and marker", () => {
      const output = renderAgentFile({
        agentName: "spr-build",
        description: "Implementation lane",
        model: "openai/gpt-5",
        variant: "medium",
        temperature: 0.1,
        permissionTask: { "*": "deny", "spr-review": "allow", "spr-verify": "allow" },
      })

      expect(output).toContain("mode: subagent")
      expect(output).toContain("hidden: true")
      expect(output).toContain("generated-by: oh-my-superagents")
      expect(output).toContain("spr-review")
    })
  })

  describe("renderCommandFile", () => {
    it("renders exact skill handoff payload", () => {
      const output = renderCommandFile({
        description: "Route brainstorming",
        agentName: "spr-strategy",
        skillName: "superpowers/brainstorming",
        phase: "brainstorming",
      })

      expect(output).toContain("agent: spr-strategy")
      expect(output).toContain("subtask: true")
      expect(output).toContain("superpowers/brainstorming")
      expect(output).toContain("arguments: $ARGUMENTS")
    })
  })

  describe("buildArtifacts", () => {
    it("materializes the full fixed v1 command set", () => {
      const artifacts = buildArtifacts({
        profiles: { build: { model: "openai/gpt-5" } },
        routes: {},
        defaultRoute: "build",
      })

      expect(artifacts.commands.map((item) => item.fileName)).toEqual([
        "sp-brainstorm.md",
        "sp-plan.md",
        "sp-execute.md",
        "sp-review.md",
        "sp-verify.md",
        "sp-visual.md",
        "sp-web-test.md",
      ])
    })

    it("fails when a built-in phase has no route and no defaultRoute", () => {
      expect(() =>
        buildArtifacts({
          profiles: { review: { model: "anthropic/claude-sonnet-4-5" } },
          routes: { "requesting-code-review": "review" },
        }),
      ).toThrow(/brainstorming/)
    })
  })
  ```

- [ ] **Step 2: Run artifact tests to verify they fail**
  Run: `npm test -- --runInBand test/opencode.test.ts`
  Expected: FAIL with missing `renderAgentFile` or `renderCommandFile`

- [ ] **Step 3: Implement minimal generators**
  ```ts
  const MARKER = "<!-- generated-by: oh-my-superagents; do-not-edit: true -->"

  export function renderAgentFile(input) {
    const permissionBlock = input.permissionTask
      ? `permission:\n  task:\n    "*": deny\n    "spr-review": allow\n    "spr-verify": allow`
      : ""

    return `---\n` +
      `description: ${input.description}\n` +
      `mode: subagent\n` +
      `hidden: true\n` +
      `model: ${input.model}\n` +
      (input.variant ? `variant: ${input.variant}\n` : "") +
      (input.temperature !== undefined ? `temperature: ${input.temperature}\n` : "") +
      (permissionBlock ? `${permissionBlock}\n` : "") +
      `---\n\n${MARKER}\n\n` +
      `You are the ${input.agentName} helper agent.\n` +
      `Load the upstream superpowers skill named in the invoking command and follow it exactly.\n`
  }

  export function renderCommandFile(input) {
    return `---\n` +
      `description: ${input.description}\n` +
      `agent: ${input.agentName}\n` +
      `subtask: true\n` +
      `---\n\n${MARKER}\n\n` +
      `Load and follow the upstream skill \`${input.skillName}\` exactly.\n\n` +
      `## Router Context\n` +
      `- phase: ${input.phase}\n` +
      `- arguments: $ARGUMENTS\n`
  }

  export function buildArtifacts(config) {
    // resolve every built-in phase
    // generate the fixed v1 command files
    // dedupe helper agents by agent name
    // throw when any built-in phase lacks an exact route and defaultRoute
  }
  ```

- [ ] **Step 4: Run artifact tests to verify they pass**
  Run: `npm test -- --runInBand test/opencode.test.ts`
  Expected: PASS

## Chunk 3: Materialization, CLI, Runtime, and Docs

### Task 5: Implement materializer semantics with collision and cleanup handling

**Files:**

- Create: `src/materialize.ts`
- Create: `test/materialize.test.ts`
- Modify: `src/opencode.ts`

- [ ] **Step 1: Write failing materializer tests**
  ```ts
  import { describe, expect, it } from "vitest"
  import { materializeArtifacts } from "../src/materialize"

  describe("materializeArtifacts", () => {
    it("writes agents and commands into fixed .opencode directories", async () => {
      const writes: string[] = []
      const result = await materializeArtifacts({
        cwd: "/workspace/project",
        artifacts: [
          { kind: "agent", fileName: "spr-build.md", content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->" },
          { kind: "command", fileName: "sp-review.md", content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->" },
        ],
        fs: {
          mkdir: async () => undefined,
          writeFile: async (filePath) => { writes.push(filePath) },
          rename: async () => undefined,
          readdir: async () => [],
          readFile: async () => "",
          stat: async () => ({ isFile: () => true }),
          unlink: async () => undefined,
        },
      })

      expect(result.exitCode).toBe(0)
      expect(writes).toContain("/workspace/project/.opencode/agents/spr-build.md.tmp")
    })

    it("fails on collisions with non-router-owned files", async () => {
      const result = await materializeArtifacts({
        cwd: "/workspace/project",
        artifacts: [
          { kind: "agent", fileName: "spr-build.md", content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->" },
        ],
        fs: {
          mkdir: async () => undefined,
          writeFile: async () => undefined,
          rename: async () => undefined,
          readdir: async () => [],
          readFile: async () => "---\nuser file\n---",
          stat: async () => ({ isFile: () => true }),
          unlink: async () => undefined,
        },
      })

      expect(result.exitCode).toBe(1)
    })

    it("returns exit code 2 when cleanup warnings occur", async () => {
      const result = await materializeArtifacts({
        cwd: "/workspace/project",
        artifacts: [
          { kind: "agent", fileName: "spr-build.md", content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->" },
        ],
        fs: {
          mkdir: async () => undefined,
          writeFile: async () => undefined,
          rename: async () => undefined,
          readdir: async () => ["spr-stale.md"],
          readFile: async () => "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
          stat: async () => ({ isFile: () => true }),
          unlink: async () => {
            throw new Error("cleanup failed")
          },
        },
      })

      expect(result.exitCode).toBe(2)
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm test -- --runInBand test/materialize.test.ts`
  Expected: FAIL with missing materializer implementation

- [ ] **Step 3: Implement materializer result contract**
  ```ts
  export type MaterializeResult = {
    exitCode: 0 | 1 | 2
    warnings: string[]
    written: string[]
    removed: string[]
  }

  export async function materializeArtifacts(input): Promise<MaterializeResult> {
    // validate desired set
    // mkdir fixed target dirs
    // detect collisions on final paths
    // write tmp files then rename
    // cleanup stale router-owned files
    // exitCode 2 only when cleanup warnings occur after successful activation
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm test -- --runInBand test/materialize.test.ts`
  Expected: PASS

### Task 6: Implement CLI, plugin runtime, README, and full verification

**Files:**

- Create: `src/cli.ts`
- Create: `src/plugin.ts`
- Create: `README.md`
- Modify: `src/index.ts`
- Create: `test/cli.test.ts`
- Create: `test/plugin.test.ts`

- [ ] **Step 1: Write failing CLI and runtime tests**
  ```ts
  import { describe, expect, it } from "vitest"
  import { runCli } from "../src/cli"

  describe("runCli", () => {
    it("returns exit code 0 for explain --all", async () => {
      const result = await runCli(["explain", "--host", "opencode", "--all"], testDeps)
      expect(result.exitCode).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            phase: "brainstorming",
            commandName: "/sp-brainstorm",
          }),
        ]),
      )
    })

    it("returns exit code 1 for unknown explain phase", async () => {
      const result = await runCli(["explain", "--host", "opencode", "--phase", "unknown"], testDeps)
      expect(result.exitCode).toBe(1)
    })

    it("returns exit code 2 when sync finishes with cleanup warnings", async () => {
      const result = await runCli(["sync", "--host", "opencode"], cleanupWarningDeps)
      expect(result.exitCode).toBe(2)
    })
  })

  import { OhMySuperpowersPlugin } from "../src/plugin"

  describe("OhMySuperpowersPlugin", () => {
    it("logs the recommended sync command when config is missing", async () => {
      const logs: unknown[] = []
      await OhMySuperpowersPlugin({
        directory: "/workspace/project",
        client: { app: { log: async (entry) => logs.push(entry) } },
      } as any)

      expect(JSON.stringify(logs)).toContain("oh-my-superagents sync --host opencode")
    })
  })
  ```

- [ ] **Step 2: Run targeted tests to verify they fail**
  Run: `npm test -- --runInBand test/cli.test.ts test/plugin.test.ts`
  Expected: FAIL with missing `runCli` or plugin runtime exports

- [ ] **Step 3: Implement CLI, plugin runtime, and docs**
  ```ts
  #!/usr/bin/env node
  import { loadRouterConfig } from "./config.js"
  import { explainAll, explainPhase } from "./router.js"
  import { buildArtifacts } from "./opencode.js"
  import { materializeArtifacts } from "./materialize.js"

  export async function runCli(argv, deps = defaultDeps) {
    // support: sync --host opencode [--config path]
    // support: explain --host opencode --phase <skill> | --all [--config path]
    // return { exitCode, stdout, stderr }
  }
  ```
  ```ts
  import type { Plugin } from "@opencode-ai/plugin"
  import { loadRouterConfig } from "./config.js"

  export const OhMySuperpowersPlugin: Plugin = async ({ client, directory }) => {
    try {
      await loadRouterConfig({ cwd: directory })
      await client.app.log({ body: { service: "oh-my-superagents", level: "info", message: "router config loaded" } })
    } catch (error) {
      await client.app.log({ body: { service: "oh-my-superagents", level: "warn", message: `Missing or invalid config. Run: oh-my-superagents sync --host opencode. ${String(error)}` } })
    }

    return {}
  }

  export default OhMySuperpowersPlugin
  ```
  ```md
  # oh-my-superagents

  ## Install

  Add this package to OpenCode's plugin list, then create `oh-my-superagents.config.jsonc`.

  ## Sync

  `oh-my-superagents sync --host opencode`

  ## Explain

  `oh-my-superagents explain --host opencode --all`
  ```

- [ ] **Step 4: Run the full verification suite**
  Run: `npm test && npm run check && npm run build`
  Expected: all commands succeed with exit code 0

- [ ] **Step 5: Commit**
  ```bash
  git add package.json tsconfig.json vitest.config.ts schemas/oh-my-superagents.schema.json src/index.ts src/plugin.ts src/config.ts src/router.ts src/opencode.ts src/materialize.ts src/cli.ts test/config.test.ts test/router.test.ts test/opencode.test.ts test/materialize.test.ts README.md docs/superpowers/specs/2026-04-09-oh-my-superagents-design.md .agents/superpowers/specs/2026-04-09-oh-my-superagents-implementation-plan.md
  git commit -m "feat: add thin oh-my-superagents router for opencode"
  ```

  Note: only create this commit if the user explicitly asks for it.
