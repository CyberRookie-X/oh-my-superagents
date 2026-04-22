import { readFile } from "node:fs/promises"
import path from "node:path"
import { RUNTIME_AGENT_METADATA_DIRECTORY, RUNTIME_AGENT_METADATA_FILE } from "./opencode.js"

export interface CodexHookContext {
  host: "codex"
  agentName: string
  profileId: string
  codexFast?: boolean
  lane?: string
}

type RuntimeAgentMetadata = {
  agents: Record<string, { profile: string; codexFast: boolean; profiles?: string[] }>
}

async function readRuntimeAgentMetadata(cwd: string): Promise<RuntimeAgentMetadata | undefined> {
  try {
    const content = await readFile(
      path.join(cwd, RUNTIME_AGENT_METADATA_DIRECTORY, RUNTIME_AGENT_METADATA_FILE),
      "utf8",
    )
    const parsed = JSON.parse(content) as unknown
    if (!isRuntimeAgentMetadata(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isRuntimeAgentMetadata(value: unknown): value is RuntimeAgentMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const { agents } = value as { agents?: unknown }
  if (typeof agents !== "object" || agents === null || Array.isArray(agents)) return false
  return Object.values(agents).every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false
    const candidate = entry as { profile?: unknown; codexFast?: unknown; profiles?: unknown }
    if (typeof candidate.profile !== "string" || typeof candidate.codexFast !== "boolean") return false
    return (
      candidate.profiles === undefined ||
      (Array.isArray(candidate.profiles) && candidate.profiles.every((p) => typeof p === "string"))
    )
  })
}

export function buildCodexChatParamsHook(context: CodexHookContext) {
  return async (
    _input: { agent: string },
    output: { options: Record<string, unknown> },
  ) => {
    const cwd = process.cwd()
    const metadata = await readRuntimeAgentMetadata(cwd)

    if (metadata?.agents[_input.agent]?.codexFast || context.codexFast) {
      output.options.serviceTier = "fast"
    }
    if (context.lane) {
      output.options.lane = context.lane
    }
  }
}

export function buildCodexCommandHook(context: CodexHookContext) {
  return async (
    _input: { command: string; sessionID: string; arguments: string },
    _output: { parts: unknown[] },
  ) => {
  }
}

export function buildCodexToolHook(context: CodexHookContext) {
  return async (
    _input: { tool: string; sessionID: string; callID: string },
    _output: { args: unknown },
  ) => {
  }
}

export function buildCodexHooks(context: CodexHookContext) {
  return {
    "chat.params": buildCodexChatParamsHook(context),
    "command.execute.before": buildCodexCommandHook(context),
    "tool.execute.before": buildCodexToolHook(context),
  }
}
