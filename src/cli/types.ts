import * as fs from "node:fs/promises"
import { homedir } from "node:os"
import { cwd as getCwd } from "node:process"
import type { SupportedSuperpowersHost } from "../superpowers-compatibility.js"
import { type ResolveControlPlaneInput } from "../control-plane/index.js"
import { detectOpenCodeSuperpowers, detectCodexSuperpowers } from "../superpowers-detectors.js"
import { discoverQwenUpstreamSkills } from "../qwen.js"
import { detectClaudeGstackAvailability } from "../gstack-detectors.js"
import { evaluateSuperpowersCompatibility } from "../superpowers-compatibility.js"
import { discoverConfigPath, loadRouterConfig } from "../config.js"
import { resolveControlPlane, prepareControlPlaneStateWrite } from "../control-plane/index.js"
import { explainAll, explainPhase } from "../router.js"
import { explainAllCodex, explainCodexPhase } from "../codex.js"
import { buildArtifacts } from "../opencode.js"
import { buildCodexArtifacts } from "../codex.js"
import { buildQwenArtifacts } from "../qwen.js"
import { runCodexBootstrap } from "../codex-bootstrap.js"
import { materializeArtifacts } from "../materialize.js"

export type CliResult = {
  exitCode: 0 | 1 | 2
  stdout: string
  stderr: string
}

export type CliHost = SupportedSuperpowersHost | "qwen" | "claude"
export type ExplainCliHost = Exclude<CliHost, "qwen">

export type CliDeps = {
  mkdir: (filePath: string, options?: { recursive?: boolean }) => Promise<void>
  chmod: (filePath: string, mode: number) => Promise<void>
  lstat: (filePath: string) => Promise<{ isSymbolicLink: () => boolean }>
  readlink: (filePath: string) => Promise<string>
  rename: (from: string, to: string) => Promise<void>
  stat: (filePath: string) => Promise<{ mode: number }>
  getCwd: () => string
  homeDir?: () => string
  discoverConfigPath: typeof discoverConfigPath
  loadConfig: typeof loadRouterConfig
  resolveControlPlane: typeof resolveControlPlane
  prepareControlPlaneStateWrite: typeof prepareControlPlaneStateWrite
  explainAll: typeof explainAll
  explainPhase: typeof explainPhase
  explainAllForHost: (config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], host: "opencode" | "codex") => unknown[]
  explainPhaseForHost: (config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], host: "opencode" | "codex", phase: import("../router.js").BuiltInPhase) => unknown
  buildArtifacts: typeof buildArtifacts
  buildCodexArtifacts: typeof buildCodexArtifacts
  buildQwenArtifacts: typeof buildQwenArtifacts
  buildCodexBootstrap: typeof runCodexBootstrap
  materializeArtifacts: typeof materializeArtifacts
  artifactExists: (filePath: string) => Promise<boolean>
  readdir: (directory: string) => Promise<string[]>
  readArtifactFile: (filePath: string) => Promise<string>
  artifactStat: (filePath: string) => Promise<{ isFile: () => boolean }>
  writeFile: (filePath: string, content: string, options?: { mode?: number }) => Promise<void>
  unlink: (filePath: string) => Promise<void>
  detectOpenCodeSuperpowers: typeof detectOpenCodeSuperpowers
  detectCodexSuperpowers: typeof detectCodexSuperpowers
  detectClaudeGstackAvailability: typeof detectClaudeGstackAvailability
  discoverQwenUpstreamSkills: typeof discoverQwenUpstreamSkills
  evaluateSuperpowersCompatibility: typeof evaluateSuperpowersCompatibility
}

export type CliRuntimeSelectorInputs = Pick<ResolveControlPlaneInput,
  | "runtimeLifecycleStage"
  | "runtimeWorkflowSource"
  | "runtimeRelativePath"
  | "runtimeWorkloadTags"
  | "runtimeModalityRequirements"
  | "runtimeAgentRole"
>

export const nodeFs = {
  mkdir: async (filePath: string, options?: { recursive?: boolean }) => {
    await fs.mkdir(filePath, { recursive: options?.recursive })
  },
  chmod: async (filePath: string, mode: number) => {
    await fs.chmod(filePath, mode)
  },
  lstat: async (filePath: string) => fs.lstat(filePath),
  readlink: async (filePath: string) => fs.readlink(filePath),
  stat: async (filePath: string) => fs.stat(filePath),
  writeFile: async (filePath: string, content: string, options?: { mode?: number }) => {
    await fs.writeFile(filePath, content, options)
  },
  rename: async (from: string, to: string) => {
    await fs.rename(from, to)
  },
  readdir: async (directory: string) => fs.readdir(directory),
  readFile: async (filePath: string) => fs.readFile(filePath, "utf8"),
  unlink: async (filePath: string) => {
    await fs.unlink(filePath)
  },
}

function isMissingFsError(error: unknown) {
  return (
    (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
    || (error instanceof Error && error.message.includes("ENOENT"))
  )
}

export const defaultDeps: CliDeps = {
  mkdir: nodeFs.mkdir,
  chmod: nodeFs.chmod,
  lstat: nodeFs.lstat,
  readlink: nodeFs.readlink,
  rename: nodeFs.rename,
  stat: nodeFs.stat,
  getCwd: getCwd,
  homeDir: homedir,
  discoverConfigPath,
  loadConfig: loadRouterConfig,
  resolveControlPlane,
  prepareControlPlaneStateWrite,
  explainAll,
  explainPhase,
  explainAllForHost: (config, host) => (host === "opencode" ? explainAll(config) : explainAllCodex(config)),
  explainPhaseForHost: (config, host, phase) => (host === "opencode" ? explainPhase(config, phase) : explainCodexPhase(config, phase)),
  buildArtifacts,
  buildCodexArtifacts,
  buildQwenArtifacts,
  buildCodexBootstrap: runCodexBootstrap,
  materializeArtifacts,
  artifactExists: async (filePath) => {
    try {
      await fs.stat(filePath)
      return true
    } catch (error) {
      if (isMissingFsError(error)) {
        return false
      }

      throw error
    }
  },
  readdir: async (directory) => fs.readdir(directory),
  readArtifactFile: async (filePath) => fs.readFile(filePath, "utf8"),
  artifactStat: async (filePath) => fs.stat(filePath),
  writeFile: async (filePath, content, options) => {
    await fs.writeFile(filePath, content, options)
  },
  unlink: async (filePath) => {
    await fs.unlink(filePath)
  },
  detectOpenCodeSuperpowers,
  detectCodexSuperpowers,
  detectClaudeGstackAvailability,
  discoverQwenUpstreamSkills,
  evaluateSuperpowersCompatibility,
}
