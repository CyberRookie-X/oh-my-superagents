import path from "node:path"
import { CONTROL_PLANE_COMMAND_KEYS, type ControlPlaneCommandKey } from "./config.js"
import { CONTROL_PLANE_MARKER_PREFIX, MARKER_TEXT, type GeneratedArtifact } from "./opencode.js"

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
  artifacts: GeneratedArtifact[]
  fs: MaterializeFs
}

export type MaterializeArtifactsResult = {
  exitCode: 0 | 1 | 2
  warnings: string[]
  written: string[]
  removed: string[]
}

const CODEX_SKILL_FILE_NAME = "SKILL.md"
const CONTROL_PLANE_LOGICAL_COMMANDS = new Set<ControlPlaneCommandKey>(CONTROL_PLANE_COMMAND_KEYS)

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
    path.basename(filePath) === CODEX_SKILL_FILE_NAME
    && filePath.includes(`${path.sep}plugins${path.sep}oh-my-superagents-codex${path.sep}skills${path.sep}`)
    && isCodexOmsControlPlaneSkillContent(content)
    && path.basename(path.dirname(filePath)) === ownership?.renderedName
  )
}

function isCodexOmsControlPlaneSkillArtifact(artifact: GeneratedArtifact) {
  return (
    artifact.fileName === CODEX_SKILL_FILE_NAME
    && artifact.directory.startsWith("plugins/oh-my-superagents-codex/skills/")
    && isCodexOmsControlPlaneSkillContent(artifact.content)
  )
}

function isArtifactOwnedByCurrentContract(
  artifact: GeneratedArtifact,
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

  if (artifact.directory === ".qwen/commands" && isQwenOmsControlPlaneCommand(artifact.content)) {
    return isQwenOmsControlPlaneFile(existingPath, existingContent)
      && isSameControlPlaneOwnership(artifact.content, existingContent)
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
  const qwenOmsCommandDirectories = new Set<string>()
  const codexSkillCleanupRoots = new Map<string, Set<string>>()

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

      if (artifact.directory === ".qwen/commands" && isQwenOmsControlPlaneCommand(artifact.content)) {
        qwenOmsCommandDirectories.add(targetDirectory)
      }

      if (isCodexOmsControlPlaneSkillArtifact(artifact)) {
        const cleanupRoot = path.dirname(targetDirectory)
        const desiredSkillDirectories = codexSkillCleanupRoots.get(cleanupRoot) ?? new Set<string>()
        desiredSkillDirectories.add(path.basename(targetDirectory))
        codexSkillCleanupRoots.set(cleanupRoot, desiredSkillDirectories)
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
        || (
          qwenOmsCommandDirectories.has(directory)
          && isQwenOmsControlPlaneFile(fullPath, content)
        )
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

  for (const [cleanupRoot, desiredSkillDirectories] of codexSkillCleanupRoots.entries()) {
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

      const skillPath = path.join(cleanupRoot, entry, CODEX_SKILL_FILE_NAME)
      const content = await input.fs.readFile(skillPath).catch(() => "")
      if (!isCodexOmsControlPlaneSkillFile(skillPath, content)) {
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
