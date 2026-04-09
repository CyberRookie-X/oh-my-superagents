import path from "node:path"
import { MARKER_TEXT, type GeneratedArtifact } from "./opencode.js"

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

function isRouterOwned(fileName: string, content: string, prefixes: Set<string>) {
  const hasPrefix = Array.from(prefixes).some((prefix) => fileName.startsWith(prefix))
  return hasPrefix && getMarkerLine(content)?.includes(MARKER_TEXT)
}

export async function materializeArtifacts(
  input: MaterializeArtifactsInput,
): Promise<MaterializeArtifactsResult> {
  const warnings: string[] = []
  const written: string[] = []
  const removed: string[] = []

  const desiredFinalPaths = new Set<string>()
  const directoryPrefixes = new Map<string, Set<string>>()

  try {
    for (const artifact of input.artifacts) {
      validateFileName(artifact.fileName)
      validateDirectory(artifact.directory)

      const targetDirectory = getTargetDirectory(input.cwd, artifact.directory)
      await input.fs.mkdir(targetDirectory, { recursive: true })

      const prefixes = directoryPrefixes.get(targetDirectory) ?? new Set<string>()
      prefixes.add(artifact.ownerPrefix)
      directoryPrefixes.set(targetDirectory, prefixes)

      const finalPath = path.join(targetDirectory, artifact.fileName)
      desiredFinalPaths.add(finalPath)

      const existingContent = await input.fs.readFile(finalPath).catch(() => "")
      if (existingContent && !isRouterOwned(artifact.fileName, existingContent, new Set([artifact.ownerPrefix]))) {
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
      if (!isRouterOwned(entry, content, prefixes)) {
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
