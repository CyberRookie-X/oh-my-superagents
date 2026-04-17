import { stat } from "node:fs/promises"
import path from "node:path"
import type { ContextProviderCapability } from "./context-manifest.js"

const CONTEXT_PROVIDER_BASE_DIR_KEY = "baseDir" as const

export type FileContextProviderConfig = {
  kind: "file"
  enabled: boolean
  baseDir?: string
  root: string
  capabilities: readonly ContextProviderCapability[]
}

export type CliContextProviderConfig = {
  kind: "cli"
  enabled: boolean
  baseDir?: string
  command: string
  args?: readonly string[]
  capabilities: readonly ContextProviderCapability[]
}

export type McpContextProviderConfig = {
  kind: "mcp"
  enabled: boolean
  baseDir?: string
  command: string
  args?: readonly string[]
  capabilities: readonly ContextProviderCapability[]
}

export type ContextProviderConfig = FileContextProviderConfig | CliContextProviderConfig | McpContextProviderConfig

type PathExists = (filePath: string) => Promise<boolean>

export type ResolvedContextProvider = {
  readonly id: string
  readonly kind: ContextProviderConfig["kind"]
  readonly available: boolean
  readonly baseDir?: string
  readonly capabilities: readonly ContextProviderCapability[]
} & ({
  readonly kind: "file"
  readonly root: string
} | {
  readonly kind: "cli" | "mcp"
  readonly command: string
  readonly args: readonly string[]
})

export type ResolveContextProvidersInput = {
  baseDir?: string
  config?: Record<string, ContextProviderConfig>
  pathExists?: PathExists
}

export async function resolveContextProviders(
  input: ResolveContextProvidersInput,
): Promise<ResolvedContextProvider[]> {
  const pathExists = input.pathExists ?? defaultPathExists
  const providers: ResolvedContextProvider[] = []

  for (const [id, provider] of Object.entries(input.config ?? {})) {
    if (!provider.enabled) {
      continue
    }

    const providerBaseDir = getContextProviderBaseDir(provider) ?? provider.baseDir ?? input.baseDir

    if (provider.kind === "file") {
      const root = providerBaseDir && !path.isAbsolute(provider.root)
        ? path.resolve(providerBaseDir, provider.root)
        : provider.root

      providers.push(Object.freeze({
        id,
        kind: "file" as const,
        root,
        available: await pathExists(root),
        ...(providerBaseDir ? { baseDir: providerBaseDir } : {}),
        capabilities: Object.freeze([...provider.capabilities]),
      }))
      continue
    }

    providers.push(Object.freeze({
      id,
      kind: provider.kind,
      command: provider.command,
      args: Object.freeze([...(provider.args ?? [])]),
      available: true,
      ...(providerBaseDir ? { baseDir: providerBaseDir } : {}),
      capabilities: Object.freeze([...provider.capabilities]),
    }))
  }

  return providers
}

function getContextProviderBaseDir(provider: ContextProviderConfig): string | undefined {
  const baseDir = Reflect.get(provider as object, CONTEXT_PROVIDER_BASE_DIR_KEY)
  return typeof baseDir === "string" ? baseDir : undefined
}

async function defaultPathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}
