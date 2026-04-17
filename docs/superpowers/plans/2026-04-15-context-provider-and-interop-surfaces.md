# Context Provider and Interoperability Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the broad file, CLI, MCP, manifest, and event interoperability layer so OMS can use external context-management tools without making any one upstream product the architectural center.

**Architecture:** Build a shared provider registry with explicit provider kinds (`file`, `cli`, `mcp`), a small manifest contract, and a small lifecycle event model. Thread provider discovery and availability through the existing D1, D2, and compression layers so OMS can prefer built-in capabilities by default while delegating to external tools when configured and available.

**Tech Stack:** TypeScript, Zod, Node child processes, Node streams, JSON schema updates, Vitest, existing context index/pack/compression modules

---

## Scope Decomposition

This plan covers only the external interoperability layer.

It includes:

- provider manifest and event contracts
- config support for external providers
- file, CLI, and MCP provider adapters
- provider-aware index, pack, and compression diagnostics

Out of scope even in this final plan:

- copying any external tool's whole runtime or memory engine into OMS
- coupling OMS to a single hosted provider
- requiring one external provider for OMS to function

## File Structure

### Shared provider contracts

- Create: `src/context-manifest.ts`
  - define provider manifest shapes and capability vocabulary
- Create: `src/context-events.ts`
  - define the shared lifecycle event model

### Provider registry and adapters

- Create: `src/context-providers.ts`
  - resolve configured providers, availability, and normalized calls
- Create: `src/context-provider-cli.ts`
  - spawn external CLIs and normalize responses
- Create: `src/context-provider-mcp.ts`
  - run a narrow stdio JSON-RPC MCP client for tool discovery and calls

### Config and schema

- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`

### Core integration

- Modify: `src/context-index.ts`
- Modify: `src/context-packs.ts`
- Modify: `src/context-compression.ts`
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`

### Tests

- Create: `test/context-manifest.test.ts`
- Create: `test/context-events.test.ts`
- Create: `test/context-providers.test.ts`
- Create: `test/context-provider-cli.test.ts`
- Create: `test/context-provider-mcp.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- OMS must still work with zero external providers configured.
- Keep provider capability names small and normalized.
- The MCP adapter should implement only the subset OMS needs: capability discovery plus tool calls for `recall`, `search`, `summarize`, `pack`, and `status`.
- File and manifest interoperability should be preferred before network-style transport.
- Avoid hiding provider failures. Surface them in diagnostics as availability or interoperability state.

### Task 1: Add the Provider Manifest and Event Contracts

**Files:**
- Create: `src/context-manifest.ts`
- Create: `src/context-events.ts`
- Create: `test/context-manifest.test.ts`
- Create: `test/context-events.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

Create `test/context-manifest.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { parseContextProviderManifest } from "../src/context-manifest.js"

describe("parseContextProviderManifest", () => {
  it("parses a provider manifest with normalized capabilities", () => {
    expect(parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall", "search", "summarize", "status"],
      events: ["session_start", "before_compact", "session_end"],
    })).toMatchObject({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall", "search", "summarize", "status"],
    })
  })
})
```

Create `test/context-events.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { CONTEXT_LIFECYCLE_EVENTS, isContextLifecycleEvent } from "../src/context-events.js"

describe("CONTEXT_LIFECYCLE_EVENTS", () => {
  it("keeps the event catalog stable", () => {
    expect(CONTEXT_LIFECYCLE_EVENTS).toEqual([
      "session_start",
      "before_compact",
      "after_edit",
      "post_commit",
      "session_end",
      "reindex_complete",
    ])
  })
})

describe("isContextLifecycleEvent", () => {
  it("accepts known event ids and rejects unknown ids", () => {
    expect(isContextLifecycleEvent("session_start")).toBe(true)
    expect(isContextLifecycleEvent("not-real")).toBe(false)
  })
})
```

- [ ] **Step 2: Run the focused contract tests and verify failure**

Run: `pnpm test -- --run test/context-manifest.test.ts test/context-events.test.ts`

Expected: FAIL because the new contract modules do not exist yet.

- [ ] **Step 3: Implement the manifest and event contracts**

Create `src/context-manifest.ts` with:

```ts
export const CONTEXT_PROVIDER_CAPABILITIES = ["recall", "search", "summarize", "pack", "status"] as const
export type ContextProviderCapability = (typeof CONTEXT_PROVIDER_CAPABILITIES)[number]

export type ContextProviderManifest = {
  id: string
  kind: "file" | "cli" | "mcp"
  capabilities: ContextProviderCapability[]
  events: string[]
}

export function parseContextProviderManifest(input: ContextProviderManifest): ContextProviderManifest {
  return {
    id: input.id,
    kind: input.kind,
    capabilities: [...input.capabilities],
    events: [...input.events],
  }
}
```

Create `src/context-events.ts` with:

```ts
export const CONTEXT_LIFECYCLE_EVENTS = [
  "session_start",
  "before_compact",
  "after_edit",
  "post_commit",
  "session_end",
  "reindex_complete",
] as const

export type ContextLifecycleEvent = (typeof CONTEXT_LIFECYCLE_EVENTS)[number]

export function isContextLifecycleEvent(value: string): value is ContextLifecycleEvent {
  return CONTEXT_LIFECYCLE_EVENTS.includes(value as ContextLifecycleEvent)
}
```

Export both modules from `src/index.ts`:

```ts
export * from "./context-manifest.js"
export * from "./context-events.js"
```

- [ ] **Step 4: Run the focused contract tests and verify they pass**

Run: `pnpm test -- --run test/context-manifest.test.ts test/context-events.test.ts`

Expected: PASS for the shared provider contracts.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/context-manifest.ts src/context-events.ts src/index.ts test/context-manifest.test.ts test/context-events.test.ts
git commit -m "feat: add context provider contracts"
```

### Task 2: Add Provider Config, Registry, and CLI Adapters

**Files:**
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Create: `src/context-providers.ts`
- Create: `src/context-provider-cli.ts`
- Create: `test/context-providers.test.ts`
- Create: `test/context-provider-cli.test.ts`
- Modify: `test/config.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing provider-registry tests**

Create `test/context-providers.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { resolveContextProviders } from "../src/context-providers.js"

describe("resolveContextProviders", () => {
  it("returns enabled file, cli, and mcp providers with stable capability data", async () => {
    const providers = await resolveContextProviders({
      config: {
        memoryBank: {
          kind: "file",
          enabled: true,
          root: ".memorybank",
          capabilities: ["recall", "search", "status"],
        },
        repomix: {
          kind: "cli",
          enabled: true,
          command: "repomix",
          args: ["--stdout"],
          capabilities: ["pack", "status"],
        },
        graphiti: {
          kind: "mcp",
          enabled: true,
          command: "graphiti-mcp",
          capabilities: ["recall", "search", "summarize", "status"],
        },
      },
      pathExists: async () => true,
    })

    expect(providers.map((provider) => provider.id)).toEqual(["memoryBank", "repomix", "graphiti"])
  })
})
```

Create `test/context-provider-cli.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { runCliContextProvider } from "../src/context-provider-cli.js"

describe("runCliContextProvider", () => {
  it("returns stdout payloads from external packer commands", async () => {
    const result = await runCliContextProvider({
      providerId: "repomix",
      command: "repomix",
      args: ["--stdout"],
      cwd: "/workspace/project",
      spawn: async () => ({ exitCode: 0, stdout: "{\"kind\":\"pack\"}", stderr: "" }),
    })

    expect(result).toEqual({ exitCode: 0, stdout: "{\"kind\":\"pack\"}", stderr: "" })
  })
})
```

Add to `test/config.test.ts`:

```ts
it("loads configured context providers", async () => {
  const result = await loadControlPlaneConfig({
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => `{
      "contextProviders": {
        "memoryBank": {
          "kind": "file",
          "enabled": true,
          "root": ".memorybank",
          "capabilities": ["recall", "search", "status"]
        }
      },
      "presets": {
        "default": {
          "label": "Default",
          "short": "def",
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": {},
          "defaultRoute": "build"
        }
      }
    }`,
  })

  expect(result.config.contextProviders.memoryBank.kind).toBe("file")
})
```

- [ ] **Step 2: Run the focused provider tests and verify failure**

Run: `pnpm test -- --run test/context-providers.test.ts test/context-provider-cli.test.ts test/config.test.ts`

Expected: FAIL because provider config, registry, and CLI adapter support do not exist yet.

- [ ] **Step 3: Implement provider config, registry, and CLI adapters**

Update `src/config.ts` with provider schemas such as:

```ts
const FileContextProviderSchema = z.object({
  kind: z.literal("file"),
  enabled: z.boolean().default(true),
  root: z.string().min(1),
  capabilities: z.array(z.enum(["recall", "search", "summarize", "pack", "status"])),
}).strict()

const CliContextProviderSchema = z.object({
  kind: z.literal("cli"),
  enabled: z.boolean().default(true),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  capabilities: z.array(z.enum(["recall", "search", "summarize", "pack", "status"])),
}).strict()

const McpContextProviderSchema = z.object({
  kind: z.literal("mcp"),
  enabled: z.boolean().default(true),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  capabilities: z.array(z.enum(["recall", "search", "summarize", "pack", "status"])),
}).strict()
```

Thread them into `LayeredControlPlaneConfigSchema`, `ControlPlaneConfig`, `mergeLayeredConfigs()`, and `finalizeConfig()`.

Create `src/context-provider-cli.ts` with:

```ts
import { spawn as spawnChildProcess } from "node:child_process"

export async function runCliContextProvider(input: {
  providerId: string
  command: string
  args?: string[]
  cwd: string
  spawn?: (input: { command: string; args: string[]; cwd: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }>
}) {
  const spawn = input.spawn ?? defaultSpawn
  return spawn({ command: input.command, args: input.args ?? [], cwd: input.cwd })
}

async function defaultSpawn(input: {
  command: string
  args: string[]
  cwd: string
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnChildProcess(input.command, input.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}
```

Create `src/context-providers.ts` with:

```ts
import type { ControlPlaneConfig } from "./config.js"

export async function resolveContextProviders(input: {
  config: ControlPlaneConfig["contextProviders"]
  pathExists?: (filePath: string) => Promise<boolean>
}) {
  const entries = Object.entries(input.config)
  return Promise.all(entries
    .filter(([, provider]) => provider.enabled)
    .map(async ([id, provider]) => ({
      id,
      ...provider,
      available: provider.kind !== "file" ? true : await (input.pathExists ?? (async () => false))(provider.root),
    })))
}
```

Update `schemas/oh-my-superagents.schema.json` and export the new registry and CLI adapter from `src/index.ts`.

- [ ] **Step 4: Run the focused provider tests and verify they pass**

Run: `pnpm test -- --run test/context-providers.test.ts test/context-provider-cli.test.ts test/config.test.ts`

Expected: PASS with provider config and CLI adapters working.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/config.ts schemas/oh-my-superagents.schema.json src/context-providers.ts src/context-provider-cli.ts src/index.ts test/context-providers.test.ts test/context-provider-cli.test.ts test/config.test.ts
git commit -m "feat: add external context provider registry"
```

### Task 3: Add Narrow MCP Support and Provider-Aware Core Integration

**Files:**
- Create: `src/context-provider-mcp.ts`
- Create: `test/context-provider-mcp.test.ts`
- Modify: `src/context-index.ts`
- Modify: `src/context-packs.ts`
- Modify: `src/context-compression.ts`
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing MCP and integration tests**

Create `test/context-provider-mcp.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { callMcpContextProviderTool, listMcpContextProviderTools } from "../src/context-provider-mcp.js"

describe("listMcpContextProviderTools", () => {
  it("lists the narrow OMS tool set from an MCP provider", async () => {
    const tools = await listMcpContextProviderTools({
      command: "graphiti-mcp",
      sendRequest: async (method) => {
        expect(method).toBe("tools/list")
        return { tools: [{ name: "recall" }, { name: "search" }, { name: "summarize" }] }
      },
    })

    expect(tools).toEqual(["recall", "search", "summarize"])
  })
})

describe("callMcpContextProviderTool", () => {
  it("passes normalized arguments through to a provider tool", async () => {
    const result = await callMcpContextProviderTool({
      command: "graphiti-mcp",
      toolName: "recall",
      arguments: { query: "codexFast" },
      sendRequest: async (method, params) => {
        expect(method).toBe("tools/call")
        expect(params).toMatchObject({ name: "recall", arguments: { query: "codexFast" } })
        return { content: [{ type: "text", text: "Found prior decision." }] }
      },
    })

    expect(result).toEqual({ content: [{ type: "text", text: "Found prior decision." }] })
  })
})
```

Add to `test/control-plane.test.ts`:

```ts
it("includes external provider availability in resolved control-plane context state", async () => {
  const resolved = await resolveControlPlane({
    command: "status",
    cwd: "/workspace/project",
    homeDir: "/home/tester",
    exists: async () => false,
    readFile: async () => {
      throw new Error("should not read")
    },
    resolveContextProviders: async () => [
      { id: "repomix", kind: "cli", capabilities: ["pack", "status"], available: true },
      { id: "graphiti", kind: "mcp", capabilities: ["recall", "search", "summarize", "status"], available: true },
    ],
  })

  expect(resolved.contextProviders).toHaveLength(2)
})
```

Add to `test/cli.test.ts`:

```ts
it("shows configured external provider availability in doctor output", async () => {
  const result = await runCli(["doctor", "--host", "opencode"], {
    ...deps,
    resolveControlPlane: async () => ({
      ...resolvedControlPlane,
      contextProviders: [
        { id: "repomix", kind: "cli", capabilities: ["pack", "status"], available: true },
        { id: "graphiti", kind: "mcp", capabilities: ["recall", "search", "summarize", "status"], available: true },
      ],
    }),
  })

  expect(result.stdout).toMatch(/repomix/i)
  expect(result.stdout).toMatch(/graphiti/i)
})
```

- [ ] **Step 2: Run the focused MCP and integration tests and verify failure**

Run: `pnpm test -- --run test/context-provider-mcp.test.ts test/control-plane.test.ts test/cli.test.ts`

Expected: FAIL because the MCP adapter and provider-aware control-plane state do not exist yet.

- [ ] **Step 3: Implement the narrow MCP adapter and core integration**

Create `src/context-provider-mcp.ts` with:

```ts
import { spawn as spawnChildProcess } from "node:child_process"
import { createInterface } from "node:readline"

export async function listMcpContextProviderTools(input: {
  command: string
  args?: string[]
  sendRequest?: (method: string, params?: unknown) => Promise<{ tools?: Array<{ name: string }> }>
}) {
  const sendRequest = input.sendRequest ?? createMcpSendRequest(input)
  const response = await sendRequest("tools/list")
  return (response.tools ?? []).map((tool) => tool.name)
}

export async function callMcpContextProviderTool(input: {
  command: string
  args?: string[]
  toolName: string
  arguments: Record<string, unknown>
  sendRequest?: (method: string, params?: unknown) => Promise<unknown>
}) {
  const sendRequest = input.sendRequest ?? createMcpSendRequest(input)
  return sendRequest("tools/call", {
    name: input.toolName,
    arguments: input.arguments,
  })
}

function createMcpSendRequest(input: { command: string; args?: string[] }) {
  return async (method: string, params?: unknown) => {
    const child = spawnChildProcess(input.command, input.args ?? [], {
      stdio: ["pipe", "pipe", "inherit"],
    })

    const rl = createInterface({ input: child.stdout })
    const id = 1
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    })

    child.stdin.write(`${request}\n`)

    const response = await new Promise<unknown>((resolve, reject) => {
      rl.once("line", (line) => {
        try {
          const parsed = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } }
          if (parsed.error) {
            reject(new Error(parsed.error.message ?? `MCP request failed for ${method}`))
            return
          }
          resolve(parsed.result)
        } catch (error) {
          reject(error)
        }
      })

      child.once("error", reject)
    })

    child.stdin.end()
    rl.close()
    child.kill()

    return response
  }
}
```

Then update `src/control-plane.ts` so `ResolveControlPlaneInput` accepts a provider resolver and `ResolvedControlPlane` carries `contextProviders`.

Update `src/context-index.ts`, `src/context-packs.ts`, and `src/context-compression.ts` so they can inspect provider availability and capabilities when present, but still function with no providers configured.

Update `src/cli.ts` so `status`, `doctor`, and `explain` list provider ids, kinds, capabilities, and availability.

- [ ] **Step 4: Run the focused MCP and integration tests and verify they pass**

Run: `pnpm test -- --run test/context-provider-mcp.test.ts test/control-plane.test.ts test/cli.test.ts`

Expected: PASS with the narrow MCP adapter and provider-aware diagnostics in place.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/context-provider-mcp.ts src/context-index.ts src/context-packs.ts src/context-compression.ts src/control-plane.ts src/cli.ts test/context-provider-mcp.test.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: add MCP-backed context interoperability"
```
