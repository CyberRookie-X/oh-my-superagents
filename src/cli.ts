import * as fs from "node:fs/promises"
import { cwd as getCwd } from "node:process"
import { BUILT_IN_PHASES, discoverConfigPath, loadRouterConfig } from "./config.js"
import { runCodexBootstrap } from "./codex-bootstrap.js"
import { buildCodexArtifacts, explainAllCodex, explainCodexPhase } from "./codex.js"
import { materializeArtifacts } from "./materialize.js"
import { buildArtifacts } from "./opencode.js"
import { explainAll, explainPhase, type BuiltInPhase } from "./router.js"
import {
  evaluateSuperpowersCompatibility,
  type SuperpowersCompatibilityMode,
  type SuperpowersCompatibilityResult,
  type SuperpowersDetectionResult,
  type SupportedSuperpowersHost,
} from "./superpowers-compatibility.js"
import { detectCodexSuperpowers, detectOpenCodeSuperpowers } from "./superpowers-detectors.js"

export type CliResult = {
  exitCode: 0 | 1 | 2
  stdout: string
  stderr: string
}

const nodeFs = {
  mkdir: async (filePath: string, options?: { recursive?: boolean }) => {
    await fs.mkdir(filePath, { recursive: options?.recursive })
  },
  writeFile: async (filePath: string, content: string) => {
    await fs.writeFile(filePath, content)
  },
  rename: async (from: string, to: string) => {
    await fs.rename(from, to)
  },
  readdir: async (directory: string) => fs.readdir(directory),
  readFile: async (filePath: string) => fs.readFile(filePath, "utf8"),
  stat: async (filePath: string) => fs.stat(filePath),
  unlink: async (filePath: string) => {
    await fs.unlink(filePath)
  },
}

type CliDeps = {
  discoverConfigPath: typeof discoverConfigPath
  loadConfig: typeof loadRouterConfig
  explainAll: typeof explainAll
  explainPhase: typeof explainPhase
  explainAllForHost: (config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], host: "opencode" | "codex") => unknown[]
  explainPhaseForHost: (config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], host: "opencode" | "codex", phase: BuiltInPhase) => unknown
  buildArtifacts: typeof buildArtifacts
  buildCodexArtifacts: typeof buildCodexArtifacts
  buildCodexBootstrap: typeof runCodexBootstrap
  materializeArtifacts: typeof materializeArtifacts
  detectOpenCodeSuperpowers: typeof detectOpenCodeSuperpowers
  detectCodexSuperpowers: typeof detectCodexSuperpowers
  evaluateSuperpowersCompatibility: typeof evaluateSuperpowersCompatibility
}

const defaultDeps: CliDeps = {
  discoverConfigPath,
  loadConfig: loadRouterConfig,
  explainAll,
  explainPhase,
  explainAllForHost: (config, host) => (host === "opencode" ? explainAll(config) : explainAllCodex(config)),
  explainPhaseForHost: (config, host, phase) => (host === "opencode" ? explainPhase(config, phase) : explainCodexPhase(config, phase)),
  buildArtifacts,
  buildCodexArtifacts,
  buildCodexBootstrap: runCodexBootstrap,
  materializeArtifacts,
  detectOpenCodeSuperpowers,
  detectCodexSuperpowers,
  evaluateSuperpowersCompatibility,
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv
  const flags = new Map<string, string | true>()

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index]
    if (!value?.startsWith("--")) {
      continue
    }

    const next = rest[index + 1]
    if (!next || next.startsWith("--")) {
      flags.set(value, true)
      continue
    }

    flags.set(value, next)
    index += 1
  }

  return { command, flags }
}

function getStringFlag(flags: Map<string, string | true>, name: string) {
  const value = flags.get(name)
  return typeof value === "string" ? value : undefined
}

function formatCompatibilityWarning(result: SuperpowersCompatibilityResult) {
  if (result.status === "compatible" || result.shouldBlock) {
    return ""
  }

  return `Warning: superpowers compatibility is ${result.status} for ${result.host}: ${result.reason}`
}

function formatCompatibilityBlock(result: SuperpowersCompatibilityResult) {
  return `Blocked by incompatible superpowers installation for ${result.host}: ${result.reason}`
}

function withCompatibility<T extends Record<string, unknown>>(
  payload: T,
  compatibility: SuperpowersCompatibilityResult,
) {
  return {
    ...payload,
    compatibility,
  }
}

function formatExplainOutput(payload: unknown, compatibility: SuperpowersCompatibilityResult) {
  if (Array.isArray(payload)) {
    return payload.map((item) => (
      item && typeof item === "object" && !Array.isArray(item)
        ? withCompatibility(item as Record<string, unknown>, compatibility)
        : item
    ))
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return withCompatibility(payload as Record<string, unknown>, compatibility)
  }

  return {
    result: payload,
    compatibility,
  }
}

function createFallbackCompatibility(
  host: SupportedSuperpowersHost,
  policyMode: SuperpowersCompatibilityMode,
  source: string,
  error: unknown,
): SuperpowersCompatibilityResult {
  return {
    host,
    source,
    detectedVersion: null,
    detectedRef: null,
    status: "not_detected",
    reason: error instanceof Error ? `Compatibility check failed: ${error.message}` : `Compatibility check failed: ${String(error)}`,
    policyMode,
    shouldBlock: false,
  }
}

async function resolveCompatibilityForHost(
  host: SupportedSuperpowersHost,
  policyMode: SuperpowersCompatibilityMode,
  deps: CliDeps,
): Promise<SuperpowersCompatibilityResult> {
  let detection: SuperpowersDetectionResult

  try {
    detection = host === "opencode"
      ? await deps.detectOpenCodeSuperpowers()
      : await deps.detectCodexSuperpowers()
  } catch (error) {
    return createFallbackCompatibility(host, policyMode, "compatibility-monitor", error)
  }

  try {
    return deps.evaluateSuperpowersCompatibility(detection, policyMode)
  } catch (error) {
    return createFallbackCompatibility(host, policyMode, detection.source, error)
  }
}

function joinStderr(parts: Array<string | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.length > 0)).join("\n")
}

export async function runCli(argv: string[], deps: CliDeps = defaultDeps): Promise<CliResult> {
  try {
    const { command, flags } = parseArgs(argv)
    const cwd = getCwd()
    const host = getStringFlag(flags, "--host")
    const explicitPath = getStringFlag(flags, "--config")

    if (command !== "sync" && command !== "explain" && command !== "bootstrap") {
      return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }
    }

    if (command === "bootstrap") {
      if (host !== "codex") {
        return { exitCode: 1, stdout: "", stderr: "bootstrap is currently only supported for --host codex" }
      }

      const result = await deps.buildCodexBootstrap({
        cwd,
        explicitPath,
        discoverConfigPath: deps.discoverConfigPath,
        loadConfig: deps.loadConfig,
        materializeArtifacts: deps.materializeArtifacts,
        buildCodexArtifacts: deps.buildCodexArtifacts,
        resolveCompatibility: async (policyMode) => resolveCompatibilityForHost(host, policyMode, deps),
        fs: nodeFs,
      })

      return {
        exitCode: result.syncResult.exitCode,
        stdout: JSON.stringify(result, null, 2),
        stderr: result.compatibility.shouldBlock
          ? formatCompatibilityBlock(result.compatibility)
          : joinStderr([
            formatCompatibilityWarning(result.compatibility),
            ...result.syncResult.warnings,
          ]),
      }
    }

    if (host !== "opencode" && host !== "codex") {
      return { exitCode: 1, stdout: "", stderr: "Only --host opencode or --host codex is supported in v1" }
    }

    const loaded = await deps.loadConfig({ cwd, explicitPath })

    if (command === "explain") {
      if (flags.get("--all") === true) {
        const compatibility = await resolveCompatibilityForHost(
          host,
          loaded.config.superpowersCompatibility.mode,
          deps,
        )

        return {
          exitCode: 0,
          stdout: JSON.stringify(formatExplainOutput(deps.explainAllForHost(loaded.config, host), compatibility), null, 2),
          stderr: "",
        }
      }

      const phase = getStringFlag(flags, "--phase")
      if (!phase) {
        return { exitCode: 1, stdout: "", stderr: "Missing --phase or --all" }
      }

      if (!BUILT_IN_PHASES.includes(phase as (typeof BUILT_IN_PHASES)[number])) {
        return { exitCode: 1, stdout: "", stderr: `Unknown phase: ${phase}` }
      }

      const compatibility = await resolveCompatibilityForHost(
        host,
        loaded.config.superpowersCompatibility.mode,
        deps,
      )

      return {
        exitCode: 0,
        stdout: JSON.stringify(
          formatExplainOutput(deps.explainPhaseForHost(loaded.config, host, phase as BuiltInPhase), compatibility),
          null,
          2,
        ),
        stderr: "",
      }
    }

    if (command === "sync") {
      const compatibility = await resolveCompatibilityForHost(
        host,
        loaded.config.superpowersCompatibility.mode,
        deps,
      )

      if (compatibility.shouldBlock) {
        return {
          exitCode: 1,
          stdout: JSON.stringify(
            withCompatibility({ exitCode: 1 as const, warnings: [], written: [], removed: [] }, compatibility),
            null,
            2,
          ),
          stderr: formatCompatibilityBlock(compatibility),
        }
      }

      const artifacts = host === "opencode"
        ? (() => {
            const built = deps.buildArtifacts(loaded.config)
            return [...built.agents, ...built.commands]
          })()
        : deps.buildCodexArtifacts(loaded.config).agents
      const result = await deps.materializeArtifacts({
        cwd,
        artifacts,
        fs: nodeFs,
      })

      return {
        exitCode: result.exitCode,
        stdout: JSON.stringify(withCompatibility(result, compatibility), null, 2),
        stderr: joinStderr([
          formatCompatibilityWarning(compatibility),
          ...result.warnings,
        ]),
      }
    }

    return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }

  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }
  }
}
