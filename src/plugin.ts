import type { Plugin } from "@opencode-ai/plugin"
import { loadRouterConfig } from "./config.js"
import {
  evaluateSuperpowersCompatibility,
  type SuperpowersCompatibilityMode,
  type SuperpowersCompatibilityResult,
} from "./superpowers-compatibility.js"
import { detectOpenCodeSuperpowers } from "./superpowers-detectors.js"

const SERVICE_NAME = "oh-my-superagents"

type LogLevel = "info" | "warn" | "error"
type PluginClient = {
  app: {
    log: (entry: { body: { service: string; level: LogLevel; message: string } }) => Promise<unknown>
  }
}

export const OhMySuperpowersPlugin: Plugin = async ({ client, directory }) => {
  const log = createPluginLogger(client as PluginClient)
  let compatibilityMode: SuperpowersCompatibilityMode = "warn"

  try {
    const { config } = await loadRouterConfig({ cwd: directory })
    compatibilityMode = config.superpowersCompatibility.mode

    void log("info", "router config loaded")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const level = message.includes("Could not find oh-my-superagents.config.jsonc") ? "warn" : "error"

    void log(
      level,
      level === "warn"
        ? `Missing config. Run: oh-my-superagents sync --host opencode. ${message}`
        : `Invalid config. ${message}`,
    )
  }

  void reportCompatibilityDiagnostics({
    cwd: directory,
    policyMode: compatibilityMode,
    log,
  })

  return {}
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
      `Incompatible superpowers upstream detected (${detectedVersion}). ${compatibility.reason}`,
    )
    return
  }

  if (compatibility.status === "not_detected") {
    await input.log(
      "warn",
      `Superpowers compatibility is not_detected. ${compatibility.reason}`,
    )
  }
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
