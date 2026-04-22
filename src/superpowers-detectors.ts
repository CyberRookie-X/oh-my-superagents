import { execFile } from "node:child_process"
import { lstat, readFile, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { parse, type ParseError } from "jsonc-parser"
import {
  evaluateSuperpowersCompatibility,
  normalizeSuperpowersVersion,
  pickHighestSuperpowersVersion,
  toSuperpowersAvailabilityResult,
  type SuperpowersCompatibilityMode,
  type SuperpowersDetectionDetails,
  type SuperpowersDetectionFailure,
  type SuperpowersDetectionFailureStage,
  type SuperpowersDetectionResult,
} from "./superpowers-compatibility.js"

const execFileAsync = promisify(execFile)
const HOSTED_GIT_HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org"])

type OpenCodePluginSpec = string | [string, Record<string, unknown>]

type OpenCodeConfigFile = {
  plugin?: OpenCodePluginSpec[]
}

type OpenCodeConfigSource = "opencode-project-config" | "opencode-user-config"
type OpenCodePluginDirSource = "opencode-project-plugin-dir" | "opencode-user-plugin-dir"

type OpenCodeDetectorInput = {
  cwd?: string
  homeDir?: string
  readFile?: (filePath: string) => Promise<string>
}

type GitCheckoutState = {
  headCommit: string
  headTags: string[]
}

type CodexDetectorInput = {
  homeDir?: string
  pathExists?: (filePath: string) => Promise<boolean>
  resolveRealPath?: (filePath: string) => Promise<string>
  readGitCheckout?: (repoPath: string) => Promise<GitCheckoutState | null>
}

const NOT_DETECTED_OPENCODE: SuperpowersDetectionResult = {
  host: "opencode",
  source: "opencode-install-detection",
  detectedVersion: null,
  detectedRef: null,
}

const NOT_DETECTED_CODEX: SuperpowersDetectionResult = {
  host: "codex",
  source: "codex-repo",
  detectedVersion: null,
  detectedRef: null,
}

const NOT_DETECTED_COPILOT: SuperpowersDetectionResult = {
  host: "copilot",
  source: "copilot-plugin-detection",
  detectedVersion: null,
  detectedRef: null,
}

type CopilotDetectorInput = {
  cwd?: string
  homeDir?: string
  pathExists?: (filePath: string) => Promise<boolean>
  readFile?: (filePath: string) => Promise<string>
}

export async function detectCopilotSuperpowers(
  input: CopilotDetectorInput = {},
): Promise<SuperpowersDetectionResult> {
  const cwd = input.cwd ?? process.cwd()
  const homeDir = input.homeDir ?? homedir()
  const pathExists = input.pathExists ?? defaultPathExists
  const readConfigFile = input.readFile ?? defaultReadFile
  const failures: SuperpowersDetectionFailure[] = []

  const projectPluginPath = path.join(cwd, ".github", "agents")
  const userPluginPath = path.join(homeDir, ".copilot", "plugins")

  const projectAgentsPath = await detectCopilotAgentsDir(projectPluginPath, "copilot-project-agents", pathExists)
  const userPluginsPath = await detectCopilotPluginDir(userPluginPath, "copilot-user-plugins", pathExists, readConfigFile)

  const resolvedDetection = resolveCopilotDetection(projectAgentsPath, userPluginsPath)

  return withFailures(resolvedDetection, failures)
}

export async function detectCopilotSuperpowersAvailability(
  input: CopilotDetectorInput = {},
  policyMode: SuperpowersCompatibilityMode = "warn",
): Promise<ReturnType<typeof toSuperpowersAvailabilityResult>> {
  return toSuperpowersAvailabilityResult(
    evaluateSuperpowersCompatibility(await detectCopilotSuperpowers(input), policyMode),
  )
}

async function detectCopilotAgentsDir(
  agentsPath: string,
  source: string,
  pathExists: (filePath: string) => Promise<boolean>,
): Promise<SuperpowersDetectionResult | null> {
  if (!(await pathExists(agentsPath))) {
    return null
  }

  return {
    host: "copilot",
    source,
    detectedVersion: null,
    detectedRef: agentsPath,
  }
}

async function detectCopilotPluginDir(
  pluginsPath: string,
  source: string,
  pathExists: (filePath: string) => Promise<boolean>,
  readConfigFile: (filePath: string) => Promise<string>,
): Promise<SuperpowersDetectionResult | null> {
  if (!(await pathExists(pluginsPath))) {
    return null
  }

  const superpowersPluginManifest = path.join(pluginsPath, "superpowers", "plugin.json")
  if (!(await pathExists(superpowersPluginManifest))) {
    return null
  }

  try {
    const rawManifest = await readConfigFile(superpowersPluginManifest)
    const manifest = JSON.parse(rawManifest) as { version?: string }
    const detectedVersion = manifest.version ? normalizeSuperpowersVersion(manifest.version) : null

    return {
      host: "copilot",
      source,
      detectedVersion,
      detectedRef: detectedVersion ? null : superpowersPluginManifest,
      details: {
        configPath: superpowersPluginManifest,
      },
    }
  } catch (error) {
    return {
      host: "copilot",
      source,
      detectedVersion: null,
      detectedRef: superpowersPluginManifest,
    }
  }
}

function resolveCopilotDetection(
  projectDetection: SuperpowersDetectionResult | null,
  userDetection: SuperpowersDetectionResult | null,
): SuperpowersDetectionResult {
  if (projectDetection && userDetection) {
    return {
      host: "copilot",
      source: "copilot-multiple-installs",
      detectedVersion: null,
      detectedRef: null,
    }
  }

  return projectDetection ?? userDetection ?? { ...NOT_DETECTED_COPILOT }
}

export async function detectOpenCodeSuperpowers(
  input: OpenCodeDetectorInput = {},
): Promise<SuperpowersDetectionResult> {
  const cwd = input.cwd ?? process.cwd()
  const homeDir = input.homeDir ?? homedir()
  const readConfigFile = input.readFile ?? defaultReadFile
  const failures: SuperpowersDetectionFailure[] = []

  const projectConfigPath = path.join(cwd, "opencode.json")
  const projectPluginPath = getOpenCodeProjectPluginPath(cwd)
  const userConfigPath = getOpenCodeUserConfigPath(homeDir)
  const userPluginPath = getOpenCodeUserPluginPath(homeDir)

  const projectConfig = await readOpenCodeConfig(
    projectConfigPath,
    "opencode-project-config",
    readConfigFile,
  )
  if (projectConfig.failure) {
    failures.push(projectConfig.failure)
  }

  const projectDetection = detectOpenCodePlugin(
    projectConfig.config,
    projectConfigPath,
    "opencode-project-config",
  )
  const projectPluginDetection = await detectOpenCodePluginPath(
    projectPluginPath,
    "opencode-project-plugin-dir",
  )
  const projectScopeDetection = resolveOpenCodeScopeDetection(projectDetection, projectPluginDetection)

  const userConfig = await readOpenCodeConfig(userConfigPath, "opencode-user-config", readConfigFile)
  if (userConfig.failure) {
    failures.push(userConfig.failure)
  }

  const userDetection = detectOpenCodePlugin(
    userConfig.config,
    userConfigPath,
    "opencode-user-config",
  )
  const userPluginDetection = await detectOpenCodePluginPath(userPluginPath, "opencode-user-plugin-dir")
  const userScopeDetection = resolveOpenCodeScopeDetection(userDetection, userPluginDetection)

  const resolvedDetection = resolveOpenCodeDetection(projectScopeDetection, userScopeDetection)

  return withFailures(resolvedDetection, failures)
}

export async function detectOpenCodeSuperpowersAvailability(
  input: OpenCodeDetectorInput = {},
  policyMode: SuperpowersCompatibilityMode = "warn",
): Promise<ReturnType<typeof toSuperpowersAvailabilityResult>> {
  return toSuperpowersAvailabilityResult(
    evaluateSuperpowersCompatibility(await detectOpenCodeSuperpowers(input), policyMode),
  )
}

export async function detectCodexSuperpowers(
  input: CodexDetectorInput = {},
): Promise<SuperpowersDetectionResult> {
  const homeDir = input.homeDir ?? homedir()
  const pathExists = input.pathExists ?? defaultPathExists
  const resolveRealPath = input.resolveRealPath ?? realpath
  const readGitCheckout = input.readGitCheckout ?? defaultReadGitCheckout
  const failures: SuperpowersDetectionFailure[] = []

  const symlinkPath = path.join(homeDir, ".agents", "skills", "superpowers")
  const clonePath = getCodexClonePath(homeDir)

  if (await pathExists(symlinkPath)) {
    let resolvedRepoPath: string | null = null

    try {
      resolvedRepoPath = await resolveRealPath(symlinkPath)
    } catch (error) {
      failures.push(createFailure("codex-skills-symlink", "resolve-symlink", error))
    }

    if (resolvedRepoPath) {
      try {
        const symlinkRepo = await readGitCheckout(resolvedRepoPath)
        if (symlinkRepo) {
          return withFailures(
            buildCodexDetectionResult("codex-skills-symlink", resolvedRepoPath, symlinkRepo),
            failures,
          )
        }
      } catch (error) {
        failures.push(createFailure("codex-skills-symlink", "inspect-git-checkout", error))
      }
    }
  }

  if (await pathExists(clonePath)) {
    try {
      const cloneRepo = await readGitCheckout(clonePath)
      if (cloneRepo) {
        return withFailures(
          buildCodexDetectionResult("codex-repo-clone", clonePath, cloneRepo),
          failures,
        )
      }
    } catch (error) {
      failures.push(createFailure("codex-repo-clone", "inspect-git-checkout", error))
    }
  }

  return withFailures({ ...NOT_DETECTED_CODEX }, failures)
}

export async function detectCodexSuperpowersAvailability(
  input: CodexDetectorInput = {},
  policyMode: SuperpowersCompatibilityMode = "warn",
): Promise<ReturnType<typeof toSuperpowersAvailabilityResult>> {
  return toSuperpowersAvailabilityResult(
    evaluateSuperpowersCompatibility(await detectCodexSuperpowers(input), policyMode),
  )
}

async function defaultReadFile(filePath: string) {
  return readFile(filePath, "utf8")
}

async function readOpenCodeConfig(
  filePath: string,
  source: OpenCodeConfigSource,
  readConfigFile: (filePath: string) => Promise<string>,
): Promise<{ config: OpenCodeConfigFile | null; failure?: SuperpowersDetectionFailure }> {
  let rawConfig: string

  try {
    rawConfig = await readConfigFile(filePath)
  } catch (error) {
    if (isNotFoundError(error)) {
      return { config: null }
    }

    return {
      config: null,
      failure: createFailure(source, "read-config", error),
    }
  }

  const parseErrors: ParseError[] = []
  const parsed = parse(rawConfig, parseErrors)
  if (parseErrors.length > 0) {
    return {
      config: null,
      failure: createFailure(source, "parse-config", new Error(`Invalid JSONC in ${filePath}`)),
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { config: null }
  }

  return { config: parsed as OpenCodeConfigFile }
}

function detectOpenCodePlugin(
  config: OpenCodeConfigFile | null,
  configPath: string,
  source: OpenCodeConfigSource,
) {
  if (!config?.plugin || !Array.isArray(config.plugin)) {
    return null
  }

  for (const entry of config.plugin) {
    const spec = getPluginSpec(entry)
    if (!spec || !isSuperpowersPluginSpec(spec)) {
      continue
    }

    const fragment = getPluginFragment(spec)
    const isGitSpec = isGitPluginSpec(spec)
    const detectedVersion = isGitSpec
      ? normalizeSuperpowersVersion(fragment)
      : null

    return {
      host: "opencode" as const,
      source,
      detectedVersion,
      detectedRef: detectedVersion ? null : isGitSpec ? fragment ?? spec : spec,
      details: {
        configPath,
        pluginSpec: spec,
      },
    }
  }

  return null
}

async function detectOpenCodePluginPath(
  pluginPath: string,
  source: OpenCodePluginDirSource,
) {
  if (!(await defaultPathExists(pluginPath))) {
    return null
  }

  return {
    host: "opencode" as const,
    source,
    detectedVersion: null,
    detectedRef: pluginPath,
  }
}

function resolveOpenCodeScopeDetection(
  configDetection: SuperpowersDetectionResult | null,
  pluginPathDetection: SuperpowersDetectionResult | null,
): SuperpowersDetectionResult | null {
  if (configDetection) {
    return configDetection
  }

  return pluginPathDetection
}

function resolveOpenCodeDetection(
  projectDetection: SuperpowersDetectionResult | null,
  userDetection: SuperpowersDetectionResult | null,
): SuperpowersDetectionResult {
  if (projectDetection && userDetection) {
    if (hasSameOpenCodeInstall(projectDetection, userDetection)) {
      return projectDetection
    }

    return createOpenCodeConflictDetection()
  }

  return projectDetection ?? userDetection ?? { ...NOT_DETECTED_OPENCODE }
}

function createOpenCodeConflictDetection(): SuperpowersDetectionResult {
  return {
    host: "opencode",
    source: "opencode-multiple-installs",
    detectedVersion: null,
    detectedRef: null,
  }
}

function hasSameOpenCodeInstall(
  left: Pick<SuperpowersDetectionResult, "detectedVersion" | "detectedRef" | "details">,
  right: Pick<SuperpowersDetectionResult, "detectedVersion" | "detectedRef" | "details">,
) {
  return (
    (left.detectedVersion ?? null) === (right.detectedVersion ?? null) &&
    (left.detectedRef ?? null) === (right.detectedRef ?? null) &&
    getOpenCodeInstallIdentity(left) === getOpenCodeInstallIdentity(right)
  )
}

function getOpenCodeInstallIdentity(
  detection: Pick<SuperpowersDetectionResult, "detectedVersion" | "detectedRef" | "details">,
) {
  if (detection.details?.pluginSpec) {
    return detection.details.pluginSpec
  }

  if (detection.detectedRef) {
    return detection.detectedRef
  }

  return detection.detectedVersion ?? null
}

function getPluginSpec(plugin: OpenCodePluginSpec | unknown) {
  if (typeof plugin === "string") {
    return plugin
  }

  if (Array.isArray(plugin) && typeof plugin[0] === "string") {
    return plugin[0]
  }

  return null
}

function isSuperpowersPluginSpec(spec: string) {
  const specName = extractSpecName(spec)
  return specName === "superpowers" || isSuperpowersTarballSpecName(specName)
}

function extractSpecName(spec: string) {
  const withoutFragment = stripFragment(spec)

  if (withoutFragment.startsWith("file://")) {
    try {
      return normalizeSpecName(path.basename(fileURLToPath(withoutFragment)))
    } catch {
      return normalizeSpecName(path.basename(withoutFragment))
    }
  }

  if (looksLikePathSpec(withoutFragment)) {
    return normalizeSpecName(path.basename(withoutFragment))
  }

  if (withoutFragment.startsWith("git@")) {
    const separatorIndex = withoutFragment.indexOf(":")
    const repoPath = separatorIndex >= 0 ? withoutFragment.slice(separatorIndex + 1) : withoutFragment
    return normalizeSpecName(path.posix.basename(repoPath))
  }

  try {
    const url = new URL(withoutFragment)
    return normalizeSpecName(path.posix.basename(url.pathname))
  } catch {
    const packageName = withoutFragment.split("/").pop() ?? withoutFragment
    return normalizeSpecName(stripPackageVersion(packageName))
  }
}

function normalizeSpecName(name: string) {
  return name
    .replace(/\.(?:tar\.gz|tgz|tar)$/i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "")
}

function isSuperpowersTarballSpecName(name: string) {
  return /^superpowers-v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/i.test(name)
}

function stripPackageVersion(name: string) {
  if (name.startsWith("@")) {
    return name
  }

  const versionSeparator = name.lastIndexOf("@")
  if (versionSeparator > 0) {
    return name.slice(0, versionSeparator)
  }

  return name
}

function isGitPluginSpec(spec: string) {
  const withoutFragment = stripFragment(spec)

  if (withoutFragment.startsWith("file://") || looksLikePathSpec(withoutFragment)) {
    return false
  }

  if (withoutFragment.startsWith("git@") || withoutFragment.startsWith("git+")) {
    return true
  }

  try {
    const url = new URL(withoutFragment)
    if (url.protocol === "git:" || url.protocol === "ssh:") {
      return true
    }

    return (url.protocol === "http:" || url.protocol === "https:") && isHostedGitUrl(url)
  } catch {
    return false
  }
}

function isHostedGitUrl(url: URL) {
  return url.pathname.endsWith(".git") || looksLikeHostedGitRepoUrl(url)
}

function looksLikeHostedGitRepoUrl(url: URL) {
  if (!HOSTED_GIT_HOSTS.has(url.hostname)) {
    return false
  }

  return url.pathname.split("/").filter(Boolean).length >= 2
}

function looksLikePathSpec(spec: string) {
  return (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec.startsWith("/") ||
    spec.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/.test(spec)
  )
}

function getPluginFragment(spec: string) {
  const fragmentIndex = spec.indexOf("#")
  return fragmentIndex >= 0 ? spec.slice(fragmentIndex + 1) : null
}

function stripFragment(spec: string) {
  const fragmentIndex = spec.indexOf("#")
  return fragmentIndex >= 0 ? spec.slice(0, fragmentIndex) : spec
}

async function defaultPathExists(filePath: string) {
  try {
    await lstat(filePath)
    return true
  } catch {
    return false
  }
}

async function defaultReadGitCheckout(repoPath: string): Promise<GitCheckoutState | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"])
    if (stdout.trim() !== "true") {
      return null
    }
  } catch {
    return null
  }

  const [{ stdout: headCommit }, { stdout: headTags }] = await Promise.all([
    execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"]),
    execFileAsync("git", ["-C", repoPath, "tag", "--points-at", "HEAD"]),
  ])

  return {
    headCommit: headCommit.trim(),
    headTags: headTags
      .split(/\r?\n/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  }
}

function getOpenCodeUserConfigPath(homeDir: string) {
  return path.join(getOpenCodeConfigHome(homeDir), "opencode", "opencode.json")
}

function getOpenCodeProjectPluginPath(cwd: string) {
  return path.join(cwd, ".opencode", "plugins", "superpowers.js")
}

function getOpenCodeUserPluginPath(homeDir: string) {
  return path.join(getOpenCodeConfigHome(homeDir), "opencode", "plugins", "superpowers.js")
}

function getOpenCodeConfigHome(homeDir: string) {
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, ".config")
}

function getCodexClonePath(homeDir: string) {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(homeDir, ".codex")
  return path.join(codexHome, "superpowers")
}

function buildCodexDetectionResult(
  source: "codex-skills-symlink" | "codex-repo-clone",
  repoPath: string,
  repoState: GitCheckoutState,
): SuperpowersDetectionResult {
  const detectedVersion = pickHighestSuperpowersVersion(repoState.headTags)

  return {
    host: "codex",
    source,
    detectedVersion,
    detectedRef: detectedVersion ? null : repoState.headCommit,
    details: {
      repoPath,
      headTags: repoState.headTags,
    },
  }
}

function createFailure(
  source: string,
  stage: SuperpowersDetectionFailureStage,
  error: unknown,
): SuperpowersDetectionFailure {
  return {
    source,
    stage,
    message: error instanceof Error ? error.message : String(error),
  }
}

function withFailures(result: SuperpowersDetectionResult, failures: SuperpowersDetectionFailure[]) {
  const details: SuperpowersDetectionDetails = {
    ...(result.details ?? {}),
    failures,
  }

  if (failures.length === 0) {
    return result
  }

  return {
    ...result,
    details,
  }
}

function isNotFoundError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT"
}
