import path from "node:path"
import { CONTROL_PLANE_COMMAND_KEYS, type ControlPlaneCommandKey } from "./config.js"
import {
  AUXILIARY_MARKER_PREFIX,
  CONTROL_PLANE_MARKER_PREFIX,
  MARKER_TEXT,
  ROUTE_MARKER_PREFIX,
  RUNTIME_AGENT_METADATA_DIRECTORY,
  RUNTIME_AGENT_METADATA_FILE,
} from "./opencode.js"

type StatsLike = {
  isFile: () => boolean
}

type MaterializeFs = {
  mkdir: (filePath: string, options?: { recursive?: boolean }) => Promise<void>
  writeFile: (filePath: string, content: string) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  readdir: (directory: string) => Promise<string[]>
  readFile: (filePath: string) => Promise<string>
  stat: (filePath: string) => Promise<StatsLike>
  unlink: (filePath: string) => Promise<void>
}

export type MaterializeArtifactsInput = {
  cwd: string
  artifacts: Array<{
    directory: string
    fileName: string
    ownerPrefix: string
    content: string
  }>
  fs: MaterializeFs
}

export type MaterializeArtifactsResult = {
  exitCode: 0 | 1 | 2
  warnings: string[]
  written: string[]
  removed: string[]
}

const SKILL_FILE_NAME = "SKILL.md"
const CONTROL_PLANE_LOGICAL_COMMANDS = new Set<ControlPlaneCommandKey>(CONTROL_PLANE_COMMAND_KEYS)
const AUXILIARY_HELPER_NAME = "temporary-disable"
const CODEX_DIRECT_SKILL_MARKER_PREFIX = "oms-direct:"
const CODEX_ROUTER_OWNED_AGENT_PREFIXES = new Set(["oms-", "rt-"])
const OPENCODE_ROUTER_OWNED_COMMAND_PREFIXES = new Set(["sp-", "ai-"])
const OPENCODE_ROUTER_OWNED_AGENT_PREFIXES = new Set(["spr-", "rt-"])
const QWEN_ROUTER_OWNED_COMMAND_PREFIXES = new Set(["oms-", "ai-"])
const QWEN_ROUTER_OWNED_AGENT_PREFIXES = new Set(["oms-", "rt-"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getTargetDirectory(cwd: string, directory: string) {
  return path.join(cwd, directory)
}

function validateFileName(fileName: string) {
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new Error(`Invalid artifact file name: ${fileName}`)
  }
}

function validateDirectory(directory: string) {
  if (path.isAbsolute(directory) || directory.includes("..")) {
    throw new Error(`Invalid artifact directory: ${directory}`)
  }
}

function getMarkerLine(content: string) {
  const lines = content.split(/\r?\n/)
  let index = 0

  if (lines[0] === "---") {
    index += 1
    while (index < lines.length && lines[index] !== "---") {
      index += 1
    }
    if (index < lines.length && lines[index] === "---") {
      index += 1
    }
  }

  while (index < lines.length && lines[index].trim() === "") {
    index += 1
  }

  return lines[index]
}

export function hasArtifactOwnershipMarker(content: string) {
  return getMarkerLine(content)?.includes(MARKER_TEXT) ?? false
}

function isPrefixOwned(fileName: string, content: string, prefixes: Set<string>) {
  const hasPrefix = Array.from(prefixes).some((prefix) => fileName.startsWith(prefix))
  return hasPrefix && hasArtifactOwnershipMarker(content)
}

function isOpenCodeRouterOwnedFile(directory: string, fileName: string, content: string) {
  if (directory.endsWith(`${path.sep}.opencode${path.sep}commands`)) {
    return isPrefixOwned(fileName, content, OPENCODE_ROUTER_OWNED_COMMAND_PREFIXES)
  }

  if (directory.endsWith(`${path.sep}.opencode${path.sep}agents`)) {
    return isPrefixOwned(fileName, content, OPENCODE_ROUTER_OWNED_AGENT_PREFIXES)
  }

  return false
}

function isCodexRouterOwnedFile(directory: string, fileName: string, content: string) {
  if (directory.endsWith(`${path.sep}.codex${path.sep}agents`)) {
    return isPrefixOwned(fileName, content, CODEX_ROUTER_OWNED_AGENT_PREFIXES)
  }

  return false
}

function isQwenRouterOwnedFile(directory: string, fileName: string, content: string) {
  if (directory.endsWith(`${path.sep}.qwen${path.sep}commands`)) {
    return isPrefixOwned(fileName, content, QWEN_ROUTER_OWNED_COMMAND_PREFIXES)
  }

  if (directory.endsWith(`${path.sep}.qwen${path.sep}agents`)) {
    return isPrefixOwned(fileName, content, QWEN_ROUTER_OWNED_AGENT_PREFIXES)
  }

  return false
}

function isOpenCodeRuntimeMetadataFile(filePath: string) {
  return filePath.endsWith(`${path.sep}${RUNTIME_AGENT_METADATA_DIRECTORY.replace(/\//g, path.sep)}${path.sep}${RUNTIME_AGENT_METADATA_FILE}`)
}

export function isOpenCodeRuntimeMetadataContent(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!isRecord(parsed) || !isRecord(parsed.agents)) {
      return false
    }

    return Object.values(parsed.agents).every((entry) => {
      if (!isRecord(entry) || typeof entry.profile !== "string" || typeof entry.codexFast !== "boolean") {
        return false
      }

      return entry.profiles === undefined || (Array.isArray(entry.profiles) && entry.profiles.every((value) => typeof value === "string"))
    })
  } catch {
    return false
  }
}

function parseControlPlaneOwnership(content: string) {
  if (!hasArtifactOwnershipMarker(content)) {
    return undefined
  }

  const escapedPrefix = CONTROL_PLANE_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = content.match(
    new RegExp(
      `<!-- ${escapedPrefix} stage=(1|2); host=(opencode|codex|qwen); artifact=(command|skill); logical-command=([a-z-]+); rendered-name=([a-z0-9-]+) -->`,
    ),
  )

  if (!match) {
    return undefined
  }

  const logicalCommand = match[4] as ControlPlaneCommandKey
  if (!CONTROL_PLANE_LOGICAL_COMMANDS.has(logicalCommand)) {
    return undefined
  }

  return {
    stage: match[1] as "1" | "2",
    host: match[2] as "opencode" | "codex" | "qwen",
    artifact: match[3] as "command" | "skill",
    logicalCommand,
    renderedName: match[5],
  }
}

function parseAuxiliaryOwnership(content: string) {
  if (!hasArtifactOwnershipMarker(content)) {
    return undefined
  }

  const escapedPrefix = AUXILIARY_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = content.match(
    new RegExp(
      `<!-- ${escapedPrefix} stage=(1|2); host=(codex); artifact=(skill); helper=([a-z-]+); rendered-name=([a-z0-9-]+) -->`,
    ),
  )

  if (!match || match[4] !== AUXILIARY_HELPER_NAME) {
    return undefined
  }

  return {
    stage: match[1] as "1" | "2",
    host: match[2] as "codex",
    artifact: match[3] as "skill",
    helper: match[4] as typeof AUXILIARY_HELPER_NAME,
    renderedName: match[5],
  }
}

function parseCodexDirectSkillOwnership(content: string) {
  if (!hasArtifactOwnershipMarker(content)) {
    return undefined
  }

  const escapedPrefix = CODEX_DIRECT_SKILL_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = content.match(
    new RegExp(
      `<!-- ${escapedPrefix} stage=(1|2); host=(codex); artifact=(skill); intent=([a-z0-9-]+); rendered-name=([a-z0-9-]+) -->`,
    ),
  )

  if (!match) {
    return undefined
  }

  return {
    stage: match[1] as "1" | "2",
    host: match[2] as "codex",
    artifact: match[3] as "skill",
    intent: match[4],
    renderedName: match[5],
  }
}

function parseRouteOwnership(content: string) {
  if (!hasArtifactOwnershipMarker(content)) {
    return undefined
  }

  const escapedPrefix = ROUTE_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = content.match(
    new RegExp(
      `<!-- ${escapedPrefix} stage=(1|2); host=(opencode|codex|qwen|claude|copilot); source=([a-z-]+); route=([a-z0-9.-]+); projection=(agent|command|skill); rendered-name=([a-z0-9-]+) -->`,
    ),
  )

  if (!match) {
    return undefined
  }

  return {
    stage: match[1] as "1" | "2",
    host: match[2] as "opencode" | "codex" | "qwen" | "claude" | "copilot",
    source: match[3],
    route: match[4],
    projection: match[5] as "agent" | "command" | "skill",
    renderedName: match[6],
  }
}

function isSameRouteOwnership(leftContent: string, rightContent: string) {
  const left = parseRouteOwnership(leftContent)
  const right = parseRouteOwnership(rightContent)

  return (
    left !== undefined
    && right !== undefined
    && left.host === right.host
    && left.source === right.source
    && left.route === right.route
    && left.projection === right.projection
  )
}

function isRouteOwnedFile(filePath: string, content: string) {
  const ownership = parseRouteOwnership(content)
  if (!ownership) {
    return false
  }

  if (ownership.host === "claude") {
    return (
      ownership.projection === "skill"
      && path.basename(filePath) === "SKILL.md"
      && filePath.includes(`${path.sep}.claude${path.sep}skills${path.sep}`)
      && path.basename(path.dirname(filePath)) === ownership.renderedName
    )
  }

  if (path.basename(filePath, ".md") !== ownership.renderedName) {
    return false
  }

  if (ownership.host === "opencode") {
    return ownership.projection === "command"
      ? filePath.includes(`${path.sep}.opencode${path.sep}commands${path.sep}`)
      : filePath.includes(`${path.sep}.opencode${path.sep}agents${path.sep}`)
  }

  if (ownership.host === "codex") {
    return ownership.projection === "agent" && filePath.includes(`${path.sep}.codex${path.sep}agents${path.sep}`)
  }

  if (ownership.host === "copilot") {
    if (ownership.projection === "agent") {
      return filePath.includes(`${path.sep}.github${path.sep}copilot${path.sep}agents${path.sep}`)
    }
    if (ownership.projection === "skill") {
      return filePath.includes(`${path.sep}.github${path.sep}copilot${path.sep}skills${path.sep}`)
    }
    return false
  }

  return ownership.projection === "agent" && filePath.includes(`${path.sep}.qwen${path.sep}agents${path.sep}`)
}

function isRouteOwnedArtifact(artifact: MaterializeArtifactsInput["artifacts"][number]) {
  return parseRouteOwnership(artifact.content) !== undefined
}

function isSameControlPlaneOwnership(leftContent: string, rightContent: string) {
  const left = parseControlPlaneOwnership(leftContent)
  const right = parseControlPlaneOwnership(rightContent)

  return (
    left !== undefined
    && right !== undefined
    && left.host === right.host
    && left.artifact === right.artifact
    && left.logicalCommand === right.logicalCommand
  )
}

function isOpenCodeOmsControlPlaneCommand(content: string) {
  const ownership = parseControlPlaneOwnership(content)
  return ownership?.stage === "1" && ownership.host === "opencode" && ownership.artifact === "command"
}

function isOpenCodeOmsControlPlaneFile(filePath: string, content: string) {
  const ownership = parseControlPlaneOwnership(content)
  if (!ownership || ownership.host !== "opencode" || ownership.artifact !== "command") {
    return false
  }

  return path.basename(filePath, ".md") === ownership.renderedName
}

function isCodexOmsControlPlaneSkillContent(content: string) {
  const ownership = parseControlPlaneOwnership(content)
  return ownership?.stage === "1" && ownership.host === "codex" && ownership.artifact === "skill"
}

function isCodexOmsAuxiliarySkillContent(content: string) {
  const ownership = parseAuxiliaryOwnership(content)
  return ownership?.stage === "1" && ownership.host === "codex" && ownership.artifact === "skill"
}

function isCodexDirectSkillContent(content: string) {
  const ownership = parseCodexDirectSkillOwnership(content)
  return ownership?.stage === "1" && ownership.host === "codex" && ownership.artifact === "skill"
}

function isQwenOmsControlPlaneCommand(content: string) {
  const ownership = parseControlPlaneOwnership(content)
  return ownership?.stage === "2" && ownership.host === "qwen" && ownership.artifact === "command"
}

function isQwenOmsControlPlaneFile(filePath: string, content: string) {
  const ownership = parseControlPlaneOwnership(content)
  if (!ownership || ownership.stage !== "2" || ownership.host !== "qwen" || ownership.artifact !== "command") {
    return false
  }

  return path.basename(filePath, ".md") === ownership.renderedName
}

function isCodexOmsControlPlaneSkillFile(filePath: string, content: string) {
  const ownership = parseControlPlaneOwnership(content)

  return (
    path.basename(filePath) === SKILL_FILE_NAME
    && filePath.includes(`${path.sep}plugins${path.sep}oh-my-superagents-codex${path.sep}skills${path.sep}`)
    && isCodexOmsControlPlaneSkillContent(content)
    && path.basename(path.dirname(filePath)) === ownership?.renderedName
  )
}

function isCodexOmsAuxiliarySkillFile(filePath: string, content: string) {
  const ownership = parseAuxiliaryOwnership(content)

  return (
    path.basename(filePath) === SKILL_FILE_NAME
    && filePath.includes(`${path.sep}plugins${path.sep}oh-my-superagents-codex${path.sep}skills${path.sep}`)
    && isCodexOmsAuxiliarySkillContent(content)
    && path.basename(path.dirname(filePath)) === ownership?.renderedName
  )
}

function isCodexDirectSkillFile(filePath: string, content: string) {
  const ownership = parseCodexDirectSkillOwnership(content)

  return (
    path.basename(filePath) === SKILL_FILE_NAME
    && filePath.includes(`${path.sep}plugins${path.sep}oh-my-superagents-codex${path.sep}skills${path.sep}`)
    && isCodexDirectSkillContent(content)
    && path.basename(path.dirname(filePath)) === ownership?.renderedName
  )
}

export function isOmsOwnedSkillFile(filePath: string, content: string) {
  return (
    isCodexOmsControlPlaneSkillFile(filePath, content)
    || isCodexOmsAuxiliarySkillFile(filePath, content)
    || isCodexDirectSkillFile(filePath, content)
    || (
      path.basename(filePath) === SKILL_FILE_NAME
      && isRouteOwnedFile(filePath, content)
    )
  )
}

export function isOmsOwnedArtifactFile(filePath: string, content: string) {
  const directory = path.dirname(filePath)
  const fileName = path.basename(filePath)

  return (
    isOpenCodeOmsControlPlaneFile(filePath, content)
    || isQwenOmsControlPlaneFile(filePath, content)
    || isOmsOwnedSkillFile(filePath, content)
    || isOpenCodeRouterOwnedFile(directory, fileName, content)
    || isCodexRouterOwnedFile(directory, fileName, content)
    || isQwenRouterOwnedFile(directory, fileName, content)
    || isRouteOwnedFile(filePath, content)
    || (
      hasArtifactOwnershipMarker(content)
      && fileName.startsWith("oms-")
      && (
        directory.endsWith(`${path.sep}.opencode${path.sep}commands`)
        || directory.endsWith(`${path.sep}.qwen${path.sep}commands`)
      )
    )
  )
}

function isCodexOmsControlPlaneSkillArtifact(artifact: MaterializeArtifactsInput["artifacts"][number]) {
  return (
    artifact.fileName === SKILL_FILE_NAME
    && artifact.directory.startsWith("plugins/oh-my-superagents-codex/skills/")
    && isCodexOmsControlPlaneSkillContent(artifact.content)
  )
}

function isCodexOmsAuxiliarySkillArtifact(artifact: MaterializeArtifactsInput["artifacts"][number]) {
  return (
    artifact.fileName === SKILL_FILE_NAME
    && artifact.directory.startsWith("plugins/oh-my-superagents-codex/skills/")
    && isCodexOmsAuxiliarySkillContent(artifact.content)
  )
}

function isCodexDirectSkillArtifact(artifact: MaterializeArtifactsInput["artifacts"][number]) {
  return (
    artifact.fileName === SKILL_FILE_NAME
    && artifact.directory.startsWith("plugins/oh-my-superagents-codex/skills/")
    && isCodexDirectSkillContent(artifact.content)
  )
}

function isOmsOwnedSkillArtifact(artifact: MaterializeArtifactsInput["artifacts"][number]) {
  return (
    isCodexOmsControlPlaneSkillArtifact(artifact)
    || isCodexOmsAuxiliarySkillArtifact(artifact)
    || isCodexDirectSkillArtifact(artifact)
    || (
      artifact.fileName === SKILL_FILE_NAME
      && artifact.directory.startsWith(".claude/skills/")
      && isRouteOwnedArtifact(artifact)
    )
  )
}

function isArtifactOwnedByCurrentContract(
  artifact: MaterializeArtifactsInput["artifacts"][number],
  existingPath: string,
  existingContent: string,
) {
  if (isOpenCodeOmsControlPlaneCommand(artifact.content)) {
    return isOpenCodeOmsControlPlaneFile(existingPath, existingContent)
      && isSameControlPlaneOwnership(artifact.content, existingContent)
  }

  if (isCodexOmsControlPlaneSkillArtifact(artifact)) {
    return isCodexOmsControlPlaneSkillFile(existingPath, existingContent)
      && isSameControlPlaneOwnership(artifact.content, existingContent)
  }

  if (isCodexOmsAuxiliarySkillArtifact(artifact)) {
    const nextOwnership = parseAuxiliaryOwnership(artifact.content)
    const existingOwnership = parseAuxiliaryOwnership(existingContent)

    return (
      isCodexOmsAuxiliarySkillFile(existingPath, existingContent)
      && nextOwnership !== undefined
      && existingOwnership !== undefined
      && nextOwnership.host === existingOwnership.host
      && nextOwnership.artifact === existingOwnership.artifact
      && nextOwnership.helper === existingOwnership.helper
    )
  }

  if (isCodexDirectSkillArtifact(artifact)) {
    const nextOwnership = parseCodexDirectSkillOwnership(artifact.content)
    const existingOwnership = parseCodexDirectSkillOwnership(existingContent)

    return (
      isCodexDirectSkillFile(existingPath, existingContent)
      && nextOwnership !== undefined
      && existingOwnership !== undefined
      && nextOwnership.host === existingOwnership.host
      && nextOwnership.artifact === existingOwnership.artifact
      && nextOwnership.intent === existingOwnership.intent
    )
  }

  if (artifact.directory === ".qwen/commands" && isQwenOmsControlPlaneCommand(artifact.content)) {
    return isQwenOmsControlPlaneFile(existingPath, existingContent)
      && isSameControlPlaneOwnership(artifact.content, existingContent)
  }

  if (artifact.directory === RUNTIME_AGENT_METADATA_DIRECTORY && artifact.fileName === RUNTIME_AGENT_METADATA_FILE) {
    return isOpenCodeRuntimeMetadataFile(existingPath) && isOpenCodeRuntimeMetadataContent(existingContent)
  }

  if (isRouteOwnedArtifact(artifact)) {
    return isRouteOwnedFile(existingPath, existingContent)
  }

  return isPrefixOwned(artifact.fileName, existingContent, new Set([artifact.ownerPrefix]))
}

export async function materializeArtifacts(
  input: MaterializeArtifactsInput,
): Promise<MaterializeArtifactsResult> {
  const warnings: string[] = []
  const written: string[] = []
  const removed: string[] = []

  const desiredFinalPaths = new Set<string>()
  const directoryPrefixes = new Map<string, Set<string>>()
  const opencodeOmsCommandDirectories = new Set<string>()
  const opencodeRuntimeMetadataDirectories = new Set<string>()
  const qwenOmsCommandDirectories = new Set<string>()
  const ownedSkillCleanupRoots = new Map<string, Set<string>>()
  const openCodeRuntimeMetadataPath = path.join(
    input.cwd,
    RUNTIME_AGENT_METADATA_DIRECTORY,
    RUNTIME_AGENT_METADATA_FILE,
  )

  try {
    for (const artifact of input.artifacts) {
      validateFileName(artifact.fileName)
      validateDirectory(artifact.directory)

      const targetDirectory = getTargetDirectory(input.cwd, artifact.directory)
      await input.fs.mkdir(targetDirectory, { recursive: true })

      const prefixes = directoryPrefixes.get(targetDirectory) ?? new Set<string>()
      prefixes.add(artifact.ownerPrefix)
      directoryPrefixes.set(targetDirectory, prefixes)

      if (artifact.directory === ".opencode/commands" && isOpenCodeOmsControlPlaneCommand(artifact.content)) {
        opencodeOmsCommandDirectories.add(targetDirectory)
      }

      if (artifact.directory === RUNTIME_AGENT_METADATA_DIRECTORY && artifact.fileName === RUNTIME_AGENT_METADATA_FILE) {
        opencodeRuntimeMetadataDirectories.add(targetDirectory)
      }

      if (artifact.directory === ".qwen/commands" && isQwenOmsControlPlaneCommand(artifact.content)) {
        qwenOmsCommandDirectories.add(targetDirectory)
      }

      if (isOmsOwnedSkillArtifact(artifact)) {
        const cleanupRoot = path.dirname(targetDirectory)
        const desiredSkillDirectories = ownedSkillCleanupRoots.get(cleanupRoot) ?? new Set<string>()
        desiredSkillDirectories.add(path.basename(targetDirectory))
        ownedSkillCleanupRoots.set(cleanupRoot, desiredSkillDirectories)
      }

      const finalPath = path.join(targetDirectory, artifact.fileName)
      desiredFinalPaths.add(finalPath)

      const existingContent = await input.fs.readFile(finalPath).catch(() => "")
      if (existingContent && !isArtifactOwnedByCurrentContract(artifact, finalPath, existingContent)) {
        warnings.push(`Collision at ${finalPath}`)
        return { exitCode: 1, warnings, written, removed }
      }
    }

    for (const artifact of input.artifacts) {
      const finalPath = path.join(getTargetDirectory(input.cwd, artifact.directory), artifact.fileName)
      const tempPath = `${finalPath}.tmp`
      await input.fs.writeFile(tempPath, artifact.content)
      await input.fs.rename(tempPath, finalPath)
      written.push(tempPath)
      written.push(finalPath)
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error))
    return { exitCode: 1, warnings, written, removed }
  }

  for (const [directory, prefixes] of directoryPrefixes.entries()) {
    let entries: string[] = []
    try {
      entries = await input.fs.readdir(directory)
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry)
      if (desiredFinalPaths.has(fullPath)) {
        continue
      }

      const content = await input.fs.readFile(fullPath).catch(() => "")
      const isOwnedByDirectoryContract =
        (
          opencodeOmsCommandDirectories.has(directory)
          && isOpenCodeOmsControlPlaneFile(fullPath, content)
        )
        || (opencodeRuntimeMetadataDirectories.has(directory) && isOpenCodeRuntimeMetadataFile(fullPath))
        || (
          qwenOmsCommandDirectories.has(directory)
          && isQwenOmsControlPlaneFile(fullPath, content)
        )
        || isOpenCodeRouterOwnedFile(directory, entry, content)
        || isCodexRouterOwnedFile(directory, entry, content)
        || isQwenRouterOwnedFile(directory, entry, content)
        || isRouteOwnedFile(fullPath, content)
        || isPrefixOwned(entry, content, prefixes)

      if (!isOwnedByDirectoryContract) {
        continue
      }

      try {
        const stats = await input.fs.stat(fullPath)
        if (!stats.isFile()) {
          continue
        }

        await input.fs.unlink(fullPath)
        removed.push(fullPath)
      } catch (error) {
        warnings.push(String(error))
      }
    }
  }

  if (!desiredFinalPaths.has(openCodeRuntimeMetadataPath)) {
    const content = await input.fs.readFile(openCodeRuntimeMetadataPath).catch(() => "")

    if (isOpenCodeRuntimeMetadataFile(openCodeRuntimeMetadataPath) && isOpenCodeRuntimeMetadataContent(content)) {
      try {
        const stats = await input.fs.stat(openCodeRuntimeMetadataPath)
        if (stats.isFile()) {
          await input.fs.unlink(openCodeRuntimeMetadataPath)
          removed.push(openCodeRuntimeMetadataPath)
        }
      } catch (error) {
        warnings.push(String(error))
      }
    }
  }

  for (const [cleanupRoot, desiredSkillDirectories] of ownedSkillCleanupRoots.entries()) {
    let entries: string[] = []
    try {
      entries = await input.fs.readdir(cleanupRoot)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (desiredSkillDirectories.has(entry)) {
        continue
      }

      const skillPath = path.join(cleanupRoot, entry, SKILL_FILE_NAME)
      const content = await input.fs.readFile(skillPath).catch(() => "")
      if (!isOmsOwnedSkillFile(skillPath, content)) {
        continue
      }

      try {
        const stats = await input.fs.stat(skillPath)
        if (!stats.isFile()) {
          continue
        }

        await input.fs.unlink(skillPath)
        removed.push(skillPath)
      } catch (error) {
        warnings.push(String(error))
      }
    }
  }

  return {
    exitCode: warnings.length > 0 ? 2 : 0,
    warnings,
    written,
    removed,
  }
}
