import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Plugin } from "@opencode-ai/plugin"
import { loadRouterConfig } from "./config.js"
import { RUNTIME_AGENT_METADATA_DIRECTORY, RUNTIME_AGENT_METADATA_FILE } from "./opencode.js"
import {
  evaluateSuperpowersCompatibility,
  type SuperpowersCompatibilityMode,
  type SuperpowersCompatibilityResult,
} from "./superpowers-compatibility.js"
import { detectOpenCodeSuperpowers } from "./superpowers-detectors.js"

const SERVICE_NAME = "oh-my-superagents"
const CONFIG_FILE_NAME = "oh-my-superagents.config.jsonc"

type LogLevel = "info" | "warn" | "error"
type PluginClient = {
  app: {
    log: (entry: { body: { service: string; level: LogLevel; message: string } }) => Promise<unknown>
  }
}

type StartupGuidanceState =
  | "invalid_config"
  | "missing_config"
  | "upstream_incompatible"
  | "upstream_not_detected"

type RuntimeAgentMetadata = {
  agents: Record<string, { profile: string; codexFast: boolean; profiles?: string[] }>
}

export const OhMySuperpowersPlugin: Plugin = async ({ client, directory, worktree }) => {
  const log = createPluginLogger(client as PluginClient)
  const rootDirectory = await resolvePluginRootDirectory(directory, worktree)
  let compatibilityMode: SuperpowersCompatibilityMode = "warn"
  let shouldReportCompatibility = true

  try {
    const { config } = await loadRouterConfig({ cwd: rootDirectory })
    compatibilityMode = config.superpowersCompatibility.mode

    void log("info", "router config loaded")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isMissingConfig = message.includes("Could not find oh-my-superagents.config.jsonc")
    const level = isMissingConfig ? "warn" : "error"

    if (isMissingConfig) {
      shouldReportCompatibility = false
    }

    void log(
      level,
      level === "warn"
        ? formatStartupGuidance({
            state: "missing_config",
            reason: message,
            nextStep: "oh-my-superagents sync --host opencode",
          })
        : formatStartupGuidance({
            state: "invalid_config",
            reason: message,
          }),
    )
  }

  if (shouldReportCompatibility) {
    void reportCompatibilityDiagnostics({
      cwd: rootDirectory,
      policyMode: compatibilityMode,
      log,
    })
  }

  return {
    "chat.params": async (input, output) => {
      const metadata = await readRuntimeAgentMetadata(rootDirectory)

      if (metadata?.agents[input.agent]?.codexFast) {
        output.options.serviceTier = "fast"
      }
    },
  }
}

async function readRuntimeAgentMetadata(cwd: string): Promise<RuntimeAgentMetadata | undefined> {
  try {
    const content = await readFile(
      path.join(cwd, RUNTIME_AGENT_METADATA_DIRECTORY, RUNTIME_AGENT_METADATA_FILE),
      "utf8",
    )
    const parsed = JSON.parse(content) as unknown

    if (!isRuntimeAgentMetadata(parsed)) {
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath, "utf8")
    return true
  } catch {
    return false
  }
}

async function resolvePluginRootDirectory(directory: string, worktree?: string) {
  if (!worktree || directory === worktree) {
    return directory
  }

  const localConfigPath = path.join(directory, CONFIG_FILE_NAME)
  if (await fileExists(localConfigPath)) {
    return directory
  }

  return worktree
}

async function reportCompatibilityDiagnostics(input: {
  cwd: string
  policyMode: SuperpowersCompatibilityMode
  log: (level: LogLevel, message: string) => Promise<void>
}) {
  const compatibility = await resolveCompatibilityForStartup(input)

  if (compatibility.status === "incompatible") {
    const detectedVersion = compatibility.detectedVersion ?? compatibility.detectedRef ?? "unknown"
    await input.log(
      "error",
      formatStartupGuidance({
        state: "upstream_incompatible",
        reason: `Incompatible superpowers upstream detected (${detectedVersion}). ${compatibility.reason}`,
        nextStep: "oh-my-superagents doctor --host opencode",
      }),
    )
    return
  }

  if (compatibility.status === "not_detected") {
    await input.log(
      "warn",
      formatStartupGuidance({
        state: "upstream_not_detected",
        reason: compatibility.reason,
        nextStep: "oh-my-superagents doctor --host opencode",
      }),
    )
  }
}

function formatStartupGuidance(input: {
  state: StartupGuidanceState
  reason: string
  nextStep?: string
}) {
  return [
    `Current state: ${input.state}`,
    `Reason: ${input.reason}`,
    ...(input.nextStep ? [`Next step: ${input.nextStep}`] : []),
  ].join(" ")
}

async function resolveCompatibilityForStartup(input: {
  cwd: string
  policyMode: SuperpowersCompatibilityMode
  log: (level: LogLevel, message: string) => Promise<void>
}): Promise<SuperpowersCompatibilityResult> {
  let detection

  try {
    detection = await detectOpenCodeSuperpowers({ cwd: input.cwd })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await input.log(
      "error",
      `Superpowers compatibility detector failed. Falling back to not_detected. ${message}`,
    )

    return createNotDetectedCompatibilityResult(input.policyMode)
  }

  try {
    return evaluateSuperpowersCompatibility(detection, input.policyMode)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await input.log(
      "error",
      `Superpowers compatibility evaluator failed. Falling back to not_detected. ${message}`,
    )

    return createNotDetectedCompatibilityResult(input.policyMode)
  }
}

function createPluginLogger(client: PluginClient) {
  return async (level: LogLevel, message: string) => {
    try {
      await client.app.log({
        body: {
          service: SERVICE_NAME,
          level,
          message,
        },
      })
    } catch {
      // Startup diagnostics should never fail plugin initialization.
    }
  }
}

function isRuntimeAgentMetadata(value: unknown): value is RuntimeAgentMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }

  const { agents } = value as { agents?: unknown }
  if (typeof agents !== "object" || agents === null || Array.isArray(agents)) {
    return false
  }

  return Object.values(agents).every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return false
    }

    const candidate = entry as { profile?: unknown; codexFast?: unknown; profiles?: unknown }
    if (typeof candidate.profile !== "string" || typeof candidate.codexFast !== "boolean") {
      return false
    }

    return (
      candidate.profiles === undefined ||
      (Array.isArray(candidate.profiles) && candidate.profiles.every((profile) => typeof profile === "string"))
    )
  })
}

function createNotDetectedCompatibilityResult(
  policyMode: SuperpowersCompatibilityMode,
): SuperpowersCompatibilityResult {
  return {
    host: "opencode",
    source: "opencode-install-detection",
    detectedVersion: null,
    detectedRef: null,
    status: "not_detected",
    reason: "Could not detect a parseable superpowers version.",
    policyMode,
    shouldBlock: false,
  }
}

export default OhMySuperpowersPlugin
