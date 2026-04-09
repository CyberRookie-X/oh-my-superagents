import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { parse, type ParseError } from "jsonc-parser"
import { z } from "zod"
import {
  SUPERPOWERS_COMPATIBILITY_MODES,
  type SuperpowersCompatibilityMode,
} from "./superpowers-compatibility.js"

export const BUILT_IN_PHASES = [
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "requesting-code-review",
  "verification-before-completion",
  "frontend-design",
  "webapp-testing",
] as const

const BUILT_IN_PHASE_SET = new Set<string>(BUILT_IN_PHASES)

const ProfileSchema = z
  .object({
    model: z.string().min(1),
    variant: z.string().min(1).optional(),
    effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
    temperature: z.number().optional(),
  })
  .strict()

const RouterConfigSchema = z
  .object({
    profiles: z.record(z.string().min(1), ProfileSchema),
    routes: z.record(z.string().min(1), z.string().min(1)),
    defaultRoute: z.string().min(1).optional(),
    superpowersCompatibility: z
      .object({
        mode: z.enum(SUPERPOWERS_COMPATIBILITY_MODES).default("warn"),
      })
      .strict()
      .optional(),
  })
  .strict()

export type RouterConfig = z.infer<typeof RouterConfigSchema>
export type SuperpowersCompatibilityConfig = {
  mode: SuperpowersCompatibilityMode
}

export type DiscoverConfigPathInput = {
  cwd: string
  explicitPath?: string
  exists?: (filePath: string) => Promise<boolean>
}

export type LoadRouterConfigInput = {
  cwd: string
  explicitPath?: string
  exists?: (filePath: string) => Promise<boolean>
  readFile?: (filePath: string) => Promise<string>
}

async function defaultExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function discoverConfigPath(input: DiscoverConfigPathInput) {
  const exists = input.exists ?? defaultExists

  if (input.explicitPath) {
    return input.explicitPath
  }

  const defaultPath = path.join(input.cwd, "oh-my-superagents.config.jsonc")
  if (await exists(defaultPath)) {
    return defaultPath
  }

  return undefined
}

export async function loadRouterConfig(input: LoadRouterConfigInput) {
  const configPath = await discoverConfigPath(input)

  if (!configPath) {
    throw new Error("Could not find oh-my-superagents.config.jsonc")
  }

  const parseErrors: ParseError[] = []
  const rawConfig = parse(
    await (input.readFile ?? ((filePath: string) => readFile(filePath, "utf8")))(configPath),
    parseErrors,
  )

  if (parseErrors.length > 0) {
    throw new Error(`Invalid JSONC in ${configPath}`)
  }

  const parsedConfig = RouterConfigSchema.parse(rawConfig)
  const config = {
    ...parsedConfig,
    superpowersCompatibility: parsedConfig.superpowersCompatibility ?? { mode: "warn" as const },
  }

  for (const phase of Object.keys(config.routes)) {
    if (!BUILT_IN_PHASE_SET.has(phase)) {
      throw new Error(`Unknown phase: ${phase}`)
    }

    const target = config.routes[phase]
    if (!config.profiles[target]) {
      throw new Error(`Unknown profile: ${target}`)
    }
  }

  if (config.defaultRoute && !config.profiles[config.defaultRoute]) {
    throw new Error(`Unknown profile: ${config.defaultRoute}`)
  }

  return {
    path: configPath,
    config,
  }
}
