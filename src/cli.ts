import * as fs from "node:fs/promises"
import { cwd as getCwd } from "node:process"
import { BUILT_IN_PHASES, loadRouterConfig } from "./config.js"
import { materializeArtifacts } from "./materialize.js"
import { buildArtifacts } from "./opencode.js"
import { explainAll, explainPhase, type BuiltInPhase } from "./router.js"

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
  loadConfig: typeof loadRouterConfig
  explainAll: typeof explainAll
  explainPhase: typeof explainPhase
  buildArtifacts: typeof buildArtifacts
  materializeArtifacts: typeof materializeArtifacts
}

const defaultDeps: CliDeps = {
  loadConfig: loadRouterConfig,
  explainAll,
  explainPhase,
  buildArtifacts,
  materializeArtifacts,
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

export async function runCli(argv: string[], deps: CliDeps = defaultDeps): Promise<CliResult> {
  try {
    const { command, flags } = parseArgs(argv)
    const cwd = getCwd()
    const host = getStringFlag(flags, "--host")
    const explicitPath = getStringFlag(flags, "--config")

    if (command !== "sync" && command !== "explain") {
      return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }
    }

    if (host !== "opencode") {
      return { exitCode: 1, stdout: "", stderr: "Only --host opencode is supported in v1" }
    }

    const loaded = await deps.loadConfig({ cwd, explicitPath })

    if (command === "explain") {
      if (flags.get("--all") === true) {
        return { exitCode: 0, stdout: JSON.stringify(deps.explainAll(loaded.config), null, 2), stderr: "" }
      }

      const phase = getStringFlag(flags, "--phase")
      if (!phase) {
        return { exitCode: 1, stdout: "", stderr: "Missing --phase or --all" }
      }

      if (!BUILT_IN_PHASES.includes(phase as (typeof BUILT_IN_PHASES)[number])) {
        return { exitCode: 1, stdout: "", stderr: `Unknown phase: ${phase}` }
      }

      return {
        exitCode: 0,
        stdout: JSON.stringify(deps.explainPhase(loaded.config, phase as BuiltInPhase), null, 2),
        stderr: "",
      }
    }

    if (command === "sync") {
      const artifacts = deps.buildArtifacts(loaded.config)
      const result = await deps.materializeArtifacts({
        cwd,
        artifacts: [...artifacts.agents, ...artifacts.commands],
        fs: nodeFs,
      })

      return {
        exitCode: result.exitCode,
        stdout: JSON.stringify(result, null, 2),
        stderr: result.exitCode === 0 ? "" : result.warnings.join("\n"),
      }
    }

    return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }

  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }
  }
}
