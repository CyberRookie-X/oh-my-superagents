import { spawn as spawnChildProcess } from "node:child_process"
import { cwd as getCwd } from "node:process"

const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 5_000
const MCP_PROTOCOL_VERSION = "2025-03-26"

type McpToolRequestMethod = "tools/list" | "tools/call"
type McpSessionRequestMethod = "initialize" | McpToolRequestMethod
type McpSessionNotificationMethod = "notifications/initialized"

type McpJsonRpcRequest = {
  jsonrpc: "2.0"
  id: number
  method: McpSessionRequestMethod
  params?: Record<string, unknown>
}

type McpJsonRpcNotification = {
  jsonrpc: "2.0"
  method: McpSessionNotificationMethod
}

type McpJsonRpcResponse = {
  id?: number
  result?: Record<string, unknown>
  error?: unknown
}

export type McpContextProviderSendRequest = (
  method: McpToolRequestMethod,
  params?: Record<string, unknown>,
) => Promise<Record<string, unknown>>

export type McpLineTransport = {
  writeLine: (line: string) => void
  onResponse: (id: number, handler: (result: Record<string, unknown>) => void) => void
  onError: (handler: (error: Error) => void) => void
  onClose: (handler: (details: { exitCode?: number; stderr?: string }) => void) => void
  dispose: () => void
}

export type McpLineTransportFactory = (input: {
  command: string
  args?: readonly string[]
  cwd: string
}) => McpLineTransport

export type ListMcpContextProviderToolsInput = {
  command: string
  args?: readonly string[]
  cwd?: string
  baseDir?: string
  timeoutMs?: number
  sendRequest?: McpContextProviderSendRequest
  transportFactory?: McpLineTransportFactory
}

export type CallMcpContextProviderToolInput = {
  command: string
  args?: readonly string[]
  cwd?: string
  baseDir?: string
  toolName: string
  arguments?: Record<string, unknown>
  timeoutMs?: number
  sendRequest?: McpContextProviderSendRequest
  transportFactory?: McpLineTransportFactory
}

export async function listMcpContextProviderTools(input: ListMcpContextProviderToolsInput): Promise<string[]> {
  const result = await getSendRequest(input)("tools/list")
  const tools = result.tools

  if (!Array.isArray(tools)) {
    return []
  }

  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      return []
    }

    const name = Reflect.get(tool, "name")
    return typeof name === "string" ? [name] : []
  })
}

export async function callMcpContextProviderTool(
  input: CallMcpContextProviderToolInput,
): Promise<Record<string, unknown>> {
  return getSendRequest(input)("tools/call", {
    name: input.toolName,
    arguments: { ...(input.arguments ?? {}) },
  })
}

function getSendRequest(
  input: ListMcpContextProviderToolsInput | CallMcpContextProviderToolInput,
): McpContextProviderSendRequest {
  return input.sendRequest ?? createDefaultSendRequest({
    command: input.command,
    args: input.args,
    cwd: input.cwd ?? input.baseDir ?? getCwd(),
    timeoutMs: input.timeoutMs ?? DEFAULT_MCP_REQUEST_TIMEOUT_MS,
    transportFactory: input.transportFactory ?? createStdioMcpLineTransport,
  })
}

function createDefaultSendRequest(input: {
  command: string
  args?: readonly string[]
  cwd: string
  timeoutMs: number
  transportFactory: McpLineTransportFactory
}): McpContextProviderSendRequest {
  return async (method, params) => {
    const transport = input.transportFactory({
      command: input.command,
      args: input.args,
      cwd: input.cwd,
    })
    const session = createMcpTransportSession(transport, input.timeoutMs)

    try {
      await session.request("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "oh-my-superagents",
          version: "0.1.0",
        },
      }, "initialize")
      session.notify("notifications/initialized")
      return await session.request(method, params, method)
    } finally {
      transport.dispose()
    }
  }
}

function createMcpTransportSession(transport: McpLineTransport, timeoutMs: number) {
  let nextRequestId = 1

  return {
    notify(method: McpSessionNotificationMethod) {
      transport.writeLine(JSON.stringify({
        jsonrpc: "2.0",
        method,
      } satisfies McpJsonRpcNotification))
    },
    async request(
      method: McpSessionRequestMethod,
      params: Record<string, unknown> | undefined,
      stage: string,
    ): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        const requestId = nextRequestId++
        let settled = false

        const finishResolve = (result: Record<string, unknown>) => {
          if (settled) {
            return
          }

          settled = true
          clearTimeout(timeout)
          resolve(result)
        }

        const finishReject = (error: Error) => {
          if (settled) {
            return
          }

          settled = true
          clearTimeout(timeout)
          reject(error)
        }

        const timeout = setTimeout(() => {
          finishReject(new Error(`MCP provider request timed out after ${timeoutMs}ms during ${stage}`))
          transport.dispose()
        }, timeoutMs)

        transport.onResponse(requestId, finishResolve)
        transport.onError((error) => {
          finishReject(error)
        })
        transport.onClose((details) => {
          const suffix = details.stderr ? `: ${details.stderr}` : ""
          finishReject(new Error(
            `MCP provider request exited before returning a response (exit ${details.exitCode ?? 1})${suffix}`,
          ))
        })

        try {
          transport.writeLine(JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            method,
            ...(params ? { params } : {}),
          } satisfies McpJsonRpcRequest))
        } catch (error) {
          finishReject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    },
  }
}

function createStdioMcpLineTransport(input: {
  command: string
  args?: readonly string[]
  cwd: string
}): McpLineTransport {
  const child = spawnChildProcess(input.command, input.args ? [...input.args] : [], {
    cwd: input.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  })

  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error("MCP provider transport requires stdio pipes")
  }

  const responseHandlers = new Map<number, (result: Record<string, unknown>) => void>()
  const errorHandlers = new Set<(error: Error) => void>()
  const closeHandlers = new Set<(details: { exitCode?: number; stderr?: string }) => void>()
  let stdoutBuffer = ""
  let stderr = ""
  let disposed = false

  const emitError = (error: Error) => {
    for (const handler of errorHandlers) {
      handler(error)
    }
  }

  const emitClose = (details: { exitCode?: number; stderr?: string }) => {
    for (const handler of closeHandlers) {
      handler(details)
    }
  }

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdoutBuffer += chunk.toString()

    while (stdoutBuffer.includes("\n")) {
      const newlineIndex = stdoutBuffer.indexOf("\n")
      const line = stdoutBuffer.slice(0, newlineIndex)
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      handleResponseLine(line)
    }
  })

  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString()
  })

  child.on("error", (error) => {
    emitError(error instanceof Error ? error : new Error(String(error)))
  })

  child.on("close", (exitCode) => {
    if (disposed) {
      return
    }

    emitClose({
      exitCode: exitCode ?? 1,
      stderr: stderr.trim() || undefined,
    })
  })

  return {
    writeLine(line) {
      child.stdin.write(`${line}\n`)
    },
    onResponse(id, handler) {
      responseHandlers.set(id, handler)
    },
    onError(handler) {
      errorHandlers.add(handler)
    },
    onClose(handler) {
      closeHandlers.add(handler)
    },
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      child.stdin.end()
      child.kill()
    },
  }

  function handleResponseLine(line: string) {
    if (line.trim().length === 0) {
      return
    }

    let response: McpJsonRpcResponse
    try {
      response = JSON.parse(line) as McpJsonRpcResponse
    } catch {
      return
    }

    if (typeof response.id !== "number") {
      return
    }

    if (response.error !== undefined) {
      responseHandlers.delete(response.id)
      emitError(new Error(`MCP provider request failed: ${formatMcpError(response.error)}`))
      return
    }

    const handler = responseHandlers.get(response.id)
    if (!handler) {
      return
    }

    responseHandlers.delete(response.id)
    handler(response.result ?? {})
  }
}

function formatMcpError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
