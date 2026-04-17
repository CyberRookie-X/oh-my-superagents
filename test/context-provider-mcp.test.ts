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

  it("initializes the default transport before listing tools", async () => {
    const writes: string[] = []
    const pendingResponses = new Map<number, (response: Record<string, unknown>) => void>()

    const tools = await listMcpContextProviderTools({
      command: "graphiti-mcp",
      transportFactory: () => ({
        writeLine(line) {
          writes.push(line)
          const request = JSON.parse(line) as { id?: number; method: string }

          if (request.method === "notifications/initialized") {
            return
          }

          const resolveResponse = pendingResponses.get(request.id ?? -1)
          if (!resolveResponse) {
            throw new Error(`Missing response handler for ${request.method}`)
          }

          if (request.method === "initialize") {
            resolveResponse({ protocolVersion: "2025-03-26", serverInfo: { name: "graphiti-mcp", version: "0.1.0" } })
            return
          }

          resolveResponse({ tools: [{ name: "recall" }] })
        },
        onResponse(id, handler) {
          pendingResponses.set(id, handler)
        },
        onError() {
          return
        },
        onClose() {
          return
        },
        dispose() {
          return
        },
      }),
    })

    expect(tools).toEqual(["recall"])
    expect(writes.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ method: "initialize" }),
      expect.objectContaining({ method: "notifications/initialized" }),
      expect.objectContaining({ method: "tools/list" }),
    ])
  })

  it("emits notifications/initialized on the default transport path", async () => {
    const writes: string[] = []
    const pendingResponses = new Map<number, (response: Record<string, unknown>) => void>()

    await callMcpContextProviderTool({
      command: "graphiti-mcp",
      toolName: "recall",
      transportFactory: () => ({
        writeLine(line) {
          writes.push(line)
          const request = JSON.parse(line) as { id?: number; method: string }

          if (request.method === "notifications/initialized") {
            return
          }

          const resolveResponse = pendingResponses.get(request.id ?? -1)
          if (!resolveResponse) {
            throw new Error(`Missing response handler for ${request.method}`)
          }

          if (request.method === "initialize") {
            resolveResponse({ protocolVersion: "2025-03-26", serverInfo: { name: "graphiti-mcp", version: "0.1.0" } })
            return
          }

          resolveResponse({ content: [{ type: "text", text: "Found prior decision." }] })
        },
        onResponse(id, handler) {
          pendingResponses.set(id, handler)
        },
        onError() {
          return
        },
        onClose() {
          return
        },
        dispose() {
          return
        },
      }),
    })

    expect(writes.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({ method: "notifications/initialized" }),
    )
  })

  it("times out the default transport when a response never arrives", async () => {
    await expect(callMcpContextProviderTool({
      command: "graphiti-mcp",
      toolName: "recall",
      timeoutMs: 10,
      transportFactory: () => ({
        writeLine() {
          return
        },
        onResponse() {
          return
        },
        onError() {
          return
        },
        onClose() {
          return
        },
        dispose() {
          return
        },
      }),
    })).rejects.toThrow("MCP provider request timed out after 10ms during initialize")
  })
})
