import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { createContextArtifact, type ContextArtifact } from "./context-artifacts.js"
import type { ContextProviderCapability } from "./context-manifest.js"
import { classifyOpenSpecArtifact } from "./openspec.js"
import type { ResolvedContextProvider } from "./context-providers.js"

export type ContextProviderAvailabilitySummary = {
  availableIds: string[]
  unavailableIds: string[]
  capabilityMap: Partial<Record<ContextProviderCapability, string[]>>
}

export type ContextIndex = {
  artifacts: ContextArtifact[]
  warnings: string[]
  providers?: ContextProviderAvailabilitySummary
}

export async function buildContextIndex(input: {
  cwd: string
  walkFiles?: (cwd: string) => Promise<string[]>
  contextProviders?: readonly ResolvedContextProvider[]
}): Promise<ContextIndex> {
  const walkFiles = input.walkFiles ?? defaultWalkFiles
  const files = [...await walkFiles(input.cwd)].sort()
  const providers = summarizeContextProviders(input.contextProviders)

  return {
    artifacts: files.flatMap((filePath) => classifyIndexedFile(filePath)),
    warnings: [],
    ...(providers ? { providers } : {}),
  }
}

export function summarizeContextProviders(
  providers: readonly ResolvedContextProvider[] | undefined,
): ContextProviderAvailabilitySummary | undefined {
  if (!providers || providers.length === 0) {
    return undefined
  }

  const sortedProviders = [...providers].sort((left, right) => left.id.localeCompare(right.id))
  const capabilityMap = {} as Partial<Record<ContextProviderCapability, string[]>>

  for (const provider of sortedProviders) {
    for (const capability of provider.capabilities) {
      const providerIds = capabilityMap[capability] ?? []
      providerIds.push(provider.id)
      capabilityMap[capability] = providerIds
    }
  }

  return {
    availableIds: sortedProviders.filter((provider) => provider.available).map((provider) => provider.id),
    unavailableIds: sortedProviders.filter((provider) => !provider.available).map((provider) => provider.id),
    capabilityMap,
  }
}

function classifyIndexedFile(filePath: string): ContextArtifact[] {
  const openSpecArtifact = classifyOpenSpecArtifact(filePath)

  if (openSpecArtifact) {
    return [createContextArtifact({
      kind: openSpecArtifact.kind,
      path: filePath,
      authority: openSpecArtifact.kind === "spec" ? "authoritative" : "advisory",
      source: "external",
      lifecycleStage: openSpecArtifact.kind === "spec" ? "design" : "plan",
    })]
  }

  if (filePath.startsWith("docs/superpowers/specs/")) {
    return [createContextArtifact({ kind: "spec", path: filePath, authority: "authoritative", source: "oms", lifecycleStage: "design" })]
  }

  if (filePath.startsWith("docs/superpowers/plans/")) {
    return [createContextArtifact({ kind: "plan", path: filePath, authority: "authoritative", source: "oms", lifecycleStage: "plan" })]
  }

  if (filePath === ".gsd/DECISIONS.md") {
    return [createContextArtifact({ kind: "decision", path: filePath, authority: "derived", source: "gsd", lifecycleStage: "plan" })]
  }

  if (filePath === ".gsd/KNOWLEDGE.md") {
    return [createContextArtifact({ kind: "knowledge", path: filePath, authority: "derived", source: "gsd" })]
  }

  if (filePath === ".planning/STATE.md") {
    return [createContextArtifact({ kind: "checkpoint", path: filePath, authority: "derived", source: "gsd", lifecycleStage: "checkpoint" })]
  }

  if (path.basename(filePath) === "SUMMARY.md") {
    return [createContextArtifact({ kind: "summary", path: filePath, authority: "derived", source: "external" })]
  }

  return []
}

async function defaultWalkFiles(cwd: string) {
  const roots = [
    "docs/superpowers/specs",
    "docs/superpowers/plans",
    "openspec",
    ".gsd",
    ".planning",
    ".memorybank",
  ]

  const results: string[] = []

  for (const root of roots) {
    const absoluteRoot = path.join(cwd, root)
    let entries: string[]

    try {
      entries = await readdir(absoluteRoot, { recursive: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue
      }

      throw error
    }

    for (const entry of entries) {
      const absolutePath = path.join(absoluteRoot, entry)
      const entryStat = await stat(absolutePath)
      if (entryStat.isFile()) {
        results.push(path.relative(cwd, absolutePath).replace(/\\/g, "/"))
      }
    }
  }

  return results.sort()
}
