import path from "node:path"
import { MARKER, type GeneratedArtifact } from "./opencode.js"

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

const AGENT_DIR = [".opencode", "agents"]
const COMMAND_DIR = [".opencode", "commands"]

function getTargetDirectory(cwd: string, kind: GeneratedArtifact["kind"]) {
  return path.join(cwd, ...(kind === "agent" ? AGENT_DIR : COMMAND_DIR))
}

function validateFileName(fileName: string) {
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new Error(`Invalid artifact file name: ${fileName}`)
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

function isRouterOwned(kind: GeneratedArtifact["kind"], fileName: string, content: string) {
  const hasPrefix = kind === "agent" ? fileName.startsWith("spr-") : fileName.startsWith("sp-")
  return hasPrefix && getMarkerLine(content) === MARKER
}

export async function materializeArtifacts(
  input: MaterializeArtifactsInput,
): Promise<MaterializeArtifactsResult> {
  const warnings: string[] = []
  const written: string[] = []
  const removed: string[] = []

  const desiredFinalPaths = new Set<string>()

  try {
    await input.fs.mkdir(path.join(input.cwd, ...AGENT_DIR), { recursive: true })
    await input.fs.mkdir(path.join(input.cwd, ...COMMAND_DIR), { recursive: true })

    for (const artifact of input.artifacts) {
      validateFileName(artifact.fileName)
      const finalPath = path.join(getTargetDirectory(input.cwd, artifact.kind), artifact.fileName)
      desiredFinalPaths.add(finalPath)

      const existingContent = await input.fs.readFile(finalPath).catch(() => "")
      if (existingContent && !isRouterOwned(artifact.kind, artifact.fileName, existingContent)) {
        warnings.push(`Collision at ${finalPath}`)
        return { exitCode: 1, warnings, written, removed }
      }
    }

    for (const artifact of input.artifacts) {
      const finalPath = path.join(getTargetDirectory(input.cwd, artifact.kind), artifact.fileName)
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

  for (const directory of [path.join(input.cwd, ...AGENT_DIR), path.join(input.cwd, ...COMMAND_DIR)]) {
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
      const kind = directory.endsWith(path.join(...AGENT_DIR)) ? "agent" : "command"
      if (!isRouterOwned(kind, entry, content)) {
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

  return {
    exitCode: warnings.length > 0 ? 2 : 0,
    warnings,
    written,
    removed,
  }
}
