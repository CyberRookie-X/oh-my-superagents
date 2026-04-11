import { access, readFile } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
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

export const CONTROL_PLANE_COMMAND_KEYS = ["status", "use", "disable", "sync", "doctor"] as const

const LEGACY_TOP_LEVEL_KEYS = [
  "profiles",
  "routes",
  "defaultRoute",
  "superpowersCompatibility",
] as const

const ProfileSchema = z
  .object({
    model: z.string().min(1),
    variant: z.string().min(1).optional(),
    effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
    temperature: z.number().optional(),
  })
  .strict()

const CompatibilitySchema = z
  .object({
    mode: z.enum(SUPERPOWERS_COMPATIBILITY_MODES).default("warn"),
  })
  .strict()

const LegacyRouterConfigSchema = z
  .object({
    profiles: z.record(z.string().min(1), ProfileSchema),
    routes: z.record(z.string().min(1), z.string().min(1)).optional(),
    defaultRoute: z.string().min(1),
    superpowersCompatibility: CompatibilitySchema.optional(),
  })
  .strict()

const CommandEntryOverrideSchema = z
  .object({
    name: z.string().min(1).optional(),
    aliases: z.array(z.string().min(1)).optional(),
  })
  .strict()

const CommandsOverrideSchema = z
  .object({
    status: CommandEntryOverrideSchema.optional(),
    use: CommandEntryOverrideSchema.optional(),
    disable: CommandEntryOverrideSchema.optional(),
    sync: CommandEntryOverrideSchema.optional(),
    doctor: CommandEntryOverrideSchema.optional(),
  })
  .strict()

const LayeredSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    activePreset: z.string().min(1).optional(),
    commandPrefix: z.string().min(1).optional(),
    commands: CommandsOverrideSchema.optional(),
    superpowersCompatibility: CompatibilitySchema.optional(),
  })
  .strict()

const ControlPlanePresetSchema = z
  .object({
    label: z.string().min(1),
    short: z.string().min(1),
    description: z.string().min(1).optional(),
    extends: z.string().min(1).optional(),
    profiles: z.record(z.string().min(1), ProfileSchema),
    routes: z.record(z.string().min(1), z.string().min(1)),
    defaultRoute: z.string().min(1),
  })
  .strict()

const LayeredControlPlaneConfigSchema = z
  .object({
    settings: LayeredSettingsSchema.optional(),
    presets: z.record(z.string().min(1), ControlPlanePresetSchema),
  })
  .strict()

type LegacyRouterConfigInput = z.infer<typeof LegacyRouterConfigSchema>
export type SuperpowersCompatibilityConfig = {
  mode: SuperpowersCompatibilityMode
}

export type RouterConfig = {
  profiles: Record<string, ControlPlaneProfile>
  routes: Record<string, string>
  defaultRoute: string
  superpowersCompatibility?: SuperpowersCompatibilityConfig
}

export type LoadedRouterConfig = {
  path: string
  config: RouterConfig & { superpowersCompatibility: SuperpowersCompatibilityConfig }
}

export type ControlPlaneCommandKey = (typeof CONTROL_PLANE_COMMAND_KEYS)[number]
export type ControlPlaneCommandConfig = {
  name: string
  aliases: string[]
}
export type ControlPlaneProfile = z.infer<typeof ProfileSchema>
export type ControlPlanePreset = z.infer<typeof ControlPlanePresetSchema>
export type ControlPlaneConfig = {
  settings: {
    enabled: boolean
    activePreset: string
    commandPrefix: string
    commands: Record<ControlPlaneCommandKey, ControlPlaneCommandConfig>
    superpowersCompatibility: SuperpowersCompatibilityConfig
  }
  presets: Record<string, ControlPlanePreset>
}

export type LayeredControlPlaneConfigInput = z.infer<typeof LayeredControlPlaneConfigSchema>
type CommandEntryOverride = z.infer<typeof CommandEntryOverrideSchema>
type CommandsOverride = z.infer<typeof CommandsOverrideSchema>
export type ControlPlaneSourceFormat = "layered" | "legacy"
export type LoadedControlPlaneSourceDocument = {
  format: ControlPlaneSourceFormat
  config: LayeredControlPlaneConfigInput
}

export type DiscoverConfigPathInput = {
  cwd: string
  homeDir?: string
  explicitPath?: string
  exists?: (filePath: string) => Promise<boolean>
}

export type LoadRouterConfigInput = {
  cwd: string
  explicitPath?: string
  exists?: (filePath: string) => Promise<boolean>
  readFile?: (filePath: string) => Promise<string>
}

export type LoadControlPlaneConfigInput = {
  cwd: string
  homeDir?: string
  explicitPath?: string
  exists?: (filePath: string) => Promise<boolean>
  readFile?: (filePath: string) => Promise<string>
}

export type LoadedControlPlaneConfig = {
  path: string
  sources: string[]
  hasRealSource: boolean
  config: ControlPlaneConfig
}

export class MissingControlPlaneConfigError extends Error {
  constructor() {
    super("Could not find oh-my-superagents.config.jsonc")
    this.name = "MissingControlPlaneConfigError"
  }
}

const DEFAULT_COMMANDS: Record<ControlPlaneCommandKey, ControlPlaneCommandConfig> = {
  status: { name: "status", aliases: ["st"] },
  use: { name: "use", aliases: ["u"] },
  disable: { name: "off", aliases: ["o"] },
  sync: { name: "sync", aliases: ["sy"] },
  doctor: { name: "doctor", aliases: ["dr"] },
}

export async function defaultExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export function defaultReadFile(filePath: string) {
  return readFile(filePath, "utf8")
}

export function getProjectConfigPath(cwd: string) {
  return path.join(cwd, "oh-my-superagents.config.jsonc")
}

export function getGlobalConfigPath(homeDirectory: string) {
  return path.join(homeDirectory, ".config", "oh-my-superagents", "config.jsonc")
}

function synthesizeCommandEntry(
  key: ControlPlaneCommandKey,
  override: CommandEntryOverride | undefined,
): ControlPlaneCommandConfig {
  return {
    name: override?.name ?? DEFAULT_COMMANDS[key].name,
    aliases: [...(override?.aliases ?? DEFAULT_COMMANDS[key].aliases)],
  }
}

function synthesizeCommands(
  overrides: CommandsOverride | undefined,
): Record<ControlPlaneCommandKey, ControlPlaneCommandConfig> {
  return {
    status: synthesizeCommandEntry("status", overrides?.status),
    use: synthesizeCommandEntry("use", overrides?.use),
    disable: synthesizeCommandEntry("disable", overrides?.disable),
    sync: synthesizeCommandEntry("sync", overrides?.sync),
    doctor: synthesizeCommandEntry("doctor", overrides?.doctor),
  }
}

function createDefaultPreset(): ControlPlanePreset {
  return {
    label: "Default",
    short: "def",
    description: "General daily development",
    profiles: {
      strategy: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
      build: { model: "openai/gpt-5", effort: "balanced" },
    },
    routes: {
      brainstorming: "strategy",
    },
    defaultRoute: "build",
  }
}

export function createDefaultControlPlaneConfig(): ControlPlaneConfig {
  return {
    settings: {
      enabled: true,
      activePreset: "default",
      commandPrefix: "oms",
      commands: synthesizeCommands(undefined),
      superpowersCompatibility: { mode: "warn" },
    },
    presets: {
      default: createDefaultPreset(),
    },
  }
}

function hasOwnKey(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isMixedShape(rawConfig: Record<string, unknown>) {
  const isLayered = hasOwnKey(rawConfig, "settings") || hasOwnKey(rawConfig, "presets")
  const hasLegacyKeys = LEGACY_TOP_LEVEL_KEYS.some((key) => hasOwnKey(rawConfig, key))
  return isLayered && hasLegacyKeys
}

function migrateLegacyConfig(rawConfig: unknown): LayeredControlPlaneConfigInput {
  const parsed: LegacyRouterConfigInput = LegacyRouterConfigSchema.parse(rawConfig)

  return {
    settings: parsed.superpowersCompatibility
      ? { superpowersCompatibility: parsed.superpowersCompatibility }
      : undefined,
    presets: {
      default: {
        label: "Default",
        short: "def",
        description: "Migrated legacy OMS configuration",
        profiles: parsed.profiles,
        routes: parsed.routes ?? {},
        defaultRoute: parsed.defaultRoute,
      },
    },
  }
}

function getSourceFormat(rawConfig: Record<string, unknown>): ControlPlaneSourceFormat {
  return hasOwnKey(rawConfig, "settings") || hasOwnKey(rawConfig, "presets") ? "layered" : "legacy"
}

export function normalizeRawConfig(rawConfig: unknown): LayeredControlPlaneConfigInput {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error("Config must be a JSON object")
  }

  const rawObject = rawConfig as Record<string, unknown>
  if (isMixedShape(rawObject)) {
    throw new Error("Invalid mixed-shape config: do not mix layered settings/presets with legacy routing keys")
  }

  if (hasOwnKey(rawObject, "settings") || hasOwnKey(rawObject, "presets")) {
    return LayeredControlPlaneConfigSchema.parse(rawObject)
  }

  return migrateLegacyConfig(rawObject)
}

function mergeLayeredConfigs(
  lowerPriority: LayeredControlPlaneConfigInput,
  higherPriority: LayeredControlPlaneConfigInput,
): LayeredControlPlaneConfigInput {
  return {
    settings: {
      ...lowerPriority.settings,
      ...higherPriority.settings,
      commands: {
        ...lowerPriority.settings?.commands,
        ...higherPriority.settings?.commands,
      },
    },
    presets: {
      ...lowerPriority.presets,
      ...higherPriority.presets,
    },
  }
}

function finalizeConfig(merged: LayeredControlPlaneConfigInput): ControlPlaneConfig {
  return {
    settings: {
      enabled: merged.settings?.enabled ?? true,
      activePreset: merged.settings?.activePreset ?? "default",
      commandPrefix: merged.settings?.commandPrefix ?? "oms",
      commands: synthesizeCommands(merged.settings?.commands),
      superpowersCompatibility: merged.settings?.superpowersCompatibility ?? { mode: "warn" },
    },
    presets: merged.presets,
  }
}

export async function readControlPlaneSourceDocument(
  filePath: string,
  reader: (filePath: string) => Promise<string>,
): Promise<LoadedControlPlaneSourceDocument> {
  const parseErrors: ParseError[] = []
  const rawConfig = parse(await reader(filePath), parseErrors)

  if (parseErrors.length > 0) {
    throw new Error(`Invalid JSONC in ${filePath}`)
  }

  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error("Config must be a JSON object")
  }

  const rawObject = rawConfig as Record<string, unknown>

  return {
    format: getSourceFormat(rawObject),
    config: normalizeRawConfig(rawObject),
  }
}

async function readConfigFile(
  filePath: string,
  reader: (filePath: string) => Promise<string>,
): Promise<LayeredControlPlaneConfigInput> {
  return (await readControlPlaneSourceDocument(filePath, reader)).config
}

export async function defaultIsWritable(filePath: string) {
  try {
    await access(filePath, constants.F_OK)
  } catch {
    let candidate = path.dirname(filePath)

    while (true) {
      try {
        await access(candidate, constants.F_OK)
        try {
          await access(candidate, constants.W_OK)
          return true
        } catch {
          return false
        }
      } catch {
        const parent = path.dirname(candidate)
        if (parent === candidate) {
          break
        }

        candidate = parent
      }
    }

    return false
  }

  try {
    await access(filePath, constants.W_OK)
    return true
  } catch {
    return false
  }
}

export async function discoverConfigPath(input: DiscoverConfigPathInput) {
  const exists = input.exists ?? defaultExists
  const homeDirectory = input.homeDir ?? homedir()

  if (input.explicitPath) {
    return input.explicitPath
  }

  const projectPath = getProjectConfigPath(input.cwd)
  if (await exists(projectPath)) {
    return projectPath
  }

  const globalPath = getGlobalConfigPath(homeDirectory)
  if (await exists(globalPath)) {
    return globalPath
  }

  return undefined
}

export async function loadControlPlaneConfig(
  input: LoadControlPlaneConfigInput,
): Promise<LoadedControlPlaneConfig> {
  const exists = input.exists ?? defaultExists
  const reader = input.readFile ?? defaultReadFile
  const homeDirectory = input.homeDir ?? homedir()

  const sources = input.explicitPath
    ? ((await exists(input.explicitPath)) ? [input.explicitPath] : [])
    : (
        await Promise.all([
          getGlobalConfigPath(homeDirectory),
          getProjectConfigPath(input.cwd),
        ].map(async (filePath) => ((await exists(filePath)) ? filePath : undefined)))
      ).filter((filePath): filePath is string => Boolean(filePath))

  if (sources.length === 0) {
    throw new MissingControlPlaneConfigError()
  }

  let merged: LayeredControlPlaneConfigInput | undefined
  for (const filePath of sources) {
    const loaded = await readConfigFile(filePath, reader)
    merged = merged ? mergeLayeredConfigs(merged, loaded) : loaded
  }

  return {
    path: sources[sources.length - 1]!,
    sources,
    hasRealSource: true,
    config: finalizeConfig(merged ?? { presets: {} }),
  }
}

export async function loadRouterConfig(input: LoadRouterConfigInput): Promise<LoadedRouterConfig> {
  const loaded = await loadControlPlaneConfig(input)
  const activePreset = loaded.config.presets[loaded.config.settings.activePreset]

  if (!activePreset) {
    throw new Error(`Unknown preset: ${loaded.config.settings.activePreset}`)
  }

  const config: LoadedRouterConfig["config"] = {
    profiles: activePreset.profiles,
    routes: activePreset.routes,
    defaultRoute: activePreset.defaultRoute,
    superpowersCompatibility: loaded.config.settings.superpowersCompatibility,
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

  if (!config.profiles[config.defaultRoute]) {
    throw new Error(`Unknown profile: ${config.defaultRoute}`)
  }

  return {
    path: loaded.path,
    config,
  }
}
