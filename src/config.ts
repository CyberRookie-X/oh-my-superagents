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

const LEGACY_ROUTER_ONLY_KEYS = [
  "routes",
  "defaultRoute",
  "superpowersCompatibility",
] as const

const ProfileSchema = z
  .object({
    model: z.string().min(1),
    variant: z.string().min(1).optional(),
    effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
    codexFast: z.boolean().optional(),
    temperature: z.number().optional(),
  })
  .strict()

const CompatibilitySchema = z
  .object({
    mode: z.enum(SUPERPOWERS_COMPATIBILITY_MODES).default("warn"),
  })
  .strict()

const LaneSelectionSchema = z
  .object({
    mode: z.enum(["manual", "suggest", "auto"]).default("suggest"),
  })
  .strict()

const LaneSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().min(1).optional(),
    routes: z.record(z.string().min(1), z.string().min(1)),
    defaultRoute: z.string().min(1),
  })
  .strict()

const SuperpowersWorkflowSchema = z
  .object({
    kind: z.literal("superpowers"),
  })
  .strict()

const DirectIntentSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().min(1).optional(),
  })
  .strict()

const DirectWorkflowSchema = z
  .object({
    kind: z.literal("direct"),
    intents: z.record(z.string().min(1), DirectIntentSchema),
  })
  .strict()

const WorkflowSchema = z.discriminatedUnion("kind", [SuperpowersWorkflowSchema, DirectWorkflowSchema])

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
    defaultLane: z.union([z.string().min(1), z.null()]).optional(),
    laneSelection: LaneSelectionSchema.optional(),
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
    profiles: z.record(z.string().min(1), ProfileSchema).optional(),
    usesLanes: z.array(z.string().min(1)).optional(),
    defaultLane: z.string().min(1).optional(),
    routes: z.record(z.string().min(1), z.string().min(1)),
    defaultRoute: z.string().min(1),
  })
  .strict()

const LayeredControlPlaneConfigSchema = z
  .object({
    workflow: WorkflowSchema.optional(),
    settings: LayeredSettingsSchema.optional(),
    profiles: z.record(z.string().min(1), ProfileSchema).optional(),
    lanes: z.record(z.string().min(1), LaneSchema).optional(),
    presets: z.record(z.string().min(1), ControlPlanePresetSchema),
  })
  .strict()

type LegacyRouterConfigInput = z.infer<typeof LegacyRouterConfigSchema>
export type SuperpowersCompatibilityConfig = {
  mode: SuperpowersCompatibilityMode
}
export type DirectIntentConfig = z.infer<typeof DirectIntentSchema>
export type WorkflowConfig = z.infer<typeof WorkflowSchema>

export type RouterConfig = {
  workflow: WorkflowConfig
  profiles: Record<string, ControlPlaneProfile>
  lanes?: Record<string, ControlPlaneLane>
  routes: Record<string, string>
  defaultRoute: string
  effectiveLane?: string
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
export type ControlPlaneLaneSelection = z.infer<typeof LaneSelectionSchema>
export type ControlPlaneLane = z.infer<typeof LaneSchema>
export type ControlPlanePreset = z.infer<typeof ControlPlanePresetSchema>
export type ControlPlaneConfig = {
  workflow: WorkflowConfig
  settings: {
    enabled: boolean
    activePreset: string
    defaultLane?: string
    laneSelection: ControlPlaneLaneSelection
    commandPrefix: string
    commands: Record<ControlPlaneCommandKey, ControlPlaneCommandConfig>
    superpowersCompatibility: SuperpowersCompatibilityConfig
  }
  profiles: Record<string, ControlPlaneProfile>
  lanes: Record<string, ControlPlaneLane>
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
  layers: Array<{
    path: string
    config: LayeredControlPlaneConfigInput
  }>
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

function cloneProfiles(profiles: Record<string, ControlPlaneProfile> | undefined) {
  if (!profiles) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(profiles).map(([key, profile]) => [key, { ...profile }]),
  )
}

function cloneLanes(lanes: Record<string, ControlPlaneLane>) {
  return Object.fromEntries(
    Object.entries(lanes).map(([key, lane]) => [key, { ...lane, routes: { ...lane.routes } }]),
  )
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
  const defaultPreset = createDefaultPreset()

  return {
    workflow: { kind: "superpowers" },
    settings: {
      enabled: true,
      activePreset: "default",
      laneSelection: { mode: "suggest" },
      commandPrefix: "oms",
      commands: synthesizeCommands(undefined),
      superpowersCompatibility: { mode: "warn" },
    },
    profiles: cloneProfiles(defaultPreset.profiles) ?? {},
    lanes: {},
    presets: {
      default: defaultPreset,
    },
  }
}

function hasOwnKey(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isMixedShape(rawConfig: Record<string, unknown>) {
  const isLayered = hasOwnKey(rawConfig, "settings") || hasOwnKey(rawConfig, "presets")
  const hasLegacyKeys = LEGACY_ROUTER_ONLY_KEYS.some((key) => hasOwnKey(rawConfig, key))
  return isLayered && hasLegacyKeys
}

function migrateLegacyConfig(rawConfig: unknown): LayeredControlPlaneConfigInput {
  const parsed: LegacyRouterConfigInput = LegacyRouterConfigSchema.parse(rawConfig)

  return {
    settings: parsed.superpowersCompatibility
      ? { superpowersCompatibility: parsed.superpowersCompatibility }
      : undefined,
    profiles: parsed.profiles,
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
  const mergedSettings = {
    ...lowerPriority.settings,
    ...higherPriority.settings,
    commands: {
      ...lowerPriority.settings?.commands,
      ...higherPriority.settings?.commands,
    },
  }

  if (higherPriority.settings && hasOwnKey(higherPriority.settings, "defaultLane") && higherPriority.settings.defaultLane === null) {
    mergedSettings.defaultLane = undefined
  }

  return {
    workflow: higherPriority.workflow ?? lowerPriority.workflow,
    settings: mergedSettings,
    profiles: {
      ...lowerPriority.profiles,
      ...higherPriority.profiles,
    },
    lanes: {
      ...lowerPriority.lanes,
      ...higherPriority.lanes,
    },
    presets: {
      ...lowerPriority.presets,
      ...higherPriority.presets,
    },
  }
}

function validateLaneReferences(config: ControlPlaneConfig) {
  const availableLanes = new Set(Object.keys(config.lanes))

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    for (const laneKey of preset.usesLanes ?? []) {
      if (!availableLanes.has(laneKey)) {
        throw new Error(`Preset ${presetKey} references unknown lane: ${laneKey}`)
      }
    }

    if (preset.defaultLane && !availableLanes.has(preset.defaultLane)) {
      throw new Error(`Preset ${presetKey} references unknown lane: ${preset.defaultLane}`)
    }
  }
}

function finalizeConfig(merged: LayeredControlPlaneConfigInput): ControlPlaneConfig {
  const finalized: ControlPlaneConfig = {
    workflow: merged.workflow ?? { kind: "superpowers" },
    settings: {
      enabled: merged.settings?.enabled ?? true,
      activePreset: merged.settings?.activePreset ?? "default",
      defaultLane: merged.settings?.defaultLane ?? undefined,
      laneSelection: merged.settings?.laneSelection ?? { mode: "suggest" },
      commandPrefix: merged.settings?.commandPrefix ?? "oms",
      commands: synthesizeCommands(merged.settings?.commands),
      superpowersCompatibility: merged.settings?.superpowersCompatibility ?? { mode: "warn" },
    },
    profiles: cloneProfiles(merged.profiles) ?? {},
    lanes: cloneLanes(merged.lanes ?? {}),
    presets: merged.presets,
  }

  validateLaneReferences(finalized)
  return finalized
}

function clonePreset(preset: ControlPlanePreset): ControlPlanePreset {
  return {
    ...preset,
    profiles: cloneProfiles(preset.profiles),
    usesLanes: preset.usesLanes ? [...preset.usesLanes] : undefined,
    routes: { ...preset.routes },
  }
}

function getEffectiveProfilesForPreset(config: ControlPlaneConfig, preset: ControlPlanePreset) {
  return {
    ...config.profiles,
    ...(preset.profiles ?? {}),
  }
}

function validateLaneTargets(config: ControlPlaneConfig) {
  for (const [presetKey, preset] of Object.entries(config.presets)) {
    const effectiveProfiles = getEffectiveProfilesForPreset(config, preset)

    for (const laneKey of preset.usesLanes ?? []) {
      const lane = config.lanes[laneKey]
      if (!lane) {
        continue
      }

      if (!effectiveProfiles[lane.defaultRoute]) {
        throw new Error(`Preset ${presetKey} lane ${laneKey} has unknown defaultRoute profile: ${lane.defaultRoute}`)
      }

      for (const target of Object.values(lane.routes)) {
        if (!effectiveProfiles[target]) {
          throw new Error(`Preset ${presetKey} lane ${laneKey} has unknown profile: ${target}`)
        }
      }
    }
  }
}

export function resolvePresetReuse(config: ControlPlaneConfig): ControlPlaneConfig {
  const visiting = new Set<string>()
  const resolved = new Map<string, ControlPlanePreset>()

  const resolvePreset = (presetKey: string): ControlPlanePreset => {
    const cached = resolved.get(presetKey)
    if (cached) {
      return cached
    }

    const preset = config.presets[presetKey]
    if (!preset) {
      throw new Error(`Unknown preset: ${presetKey}`)
    }

    if (visiting.has(presetKey)) {
      throw new Error(`Cyclic preset reuse detected: ${presetKey}`)
    }

    visiting.add(presetKey)

    let nextPreset: ControlPlanePreset
    if (!preset.extends) {
      nextPreset = clonePreset(preset)
    } else {
      const parentPreset = config.presets[preset.extends]
      if (!parentPreset) {
        throw new Error(`Preset ${presetKey} extends unknown preset: ${preset.extends}`)
      }

      if (parentPreset.extends) {
        throw new Error(
          `Preset ${presetKey} extends ${preset.extends}, but single-level preset reuse does not allow chained extends`,
        )
      }

      const resolvedParent = resolvePreset(preset.extends)
      nextPreset = {
        ...preset,
        defaultLane: preset.defaultLane ?? resolvedParent.defaultLane,
        profiles:
          resolvedParent.profiles || preset.profiles
            ? {
                ...(resolvedParent.profiles ?? {}),
                ...(preset.profiles ?? {}),
              }
            : undefined,
        usesLanes: preset.usesLanes
          ? [...preset.usesLanes]
          : resolvedParent.usesLanes
            ? [...resolvedParent.usesLanes]
            : undefined,
        routes: {
          ...resolvedParent.routes,
          ...preset.routes,
        },
      }
    }

    visiting.delete(presetKey)
    resolved.set(presetKey, nextPreset)
    return nextPreset
  }

  return {
    ...config,
    presets: Object.fromEntries(
      Object.keys(config.presets).map((presetKey) => [presetKey, resolvePreset(presetKey)]),
    ),
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
  const layers: LoadedControlPlaneConfig["layers"] = []
  for (const filePath of sources) {
    const loaded = await readConfigFile(filePath, reader)
    layers.push({ path: filePath, config: loaded })
    merged = merged ? mergeLayeredConfigs(merged, loaded) : loaded
  }

  const config = resolvePresetReuse(finalizeConfig(merged ?? { presets: {} }))
  validateLaneTargets(config)

  return {
    path: sources[sources.length - 1]!,
    sources,
    layers,
    hasRealSource: true,
    config,
  }
}

export async function loadRouterConfig(input: LoadRouterConfigInput): Promise<LoadedRouterConfig> {
  const loaded = await loadControlPlaneConfig(input)
  const activePreset = loaded.config.presets[loaded.config.settings.activePreset]

  if (!activePreset) {
    throw new Error(`Unknown preset: ${loaded.config.settings.activePreset}`)
  }

  const config: LoadedRouterConfig["config"] = {
    workflow: loaded.config.workflow,
    profiles: {
      ...loaded.config.profiles,
      ...(activePreset.profiles ?? {}),
    },
    lanes: loaded.config.lanes,
    routes: activePreset.routes,
    defaultRoute: activePreset.defaultRoute,
    effectiveLane: loaded.config.settings.defaultLane ?? activePreset.defaultLane,
    superpowersCompatibility: loaded.config.settings.superpowersCompatibility,
  }

  const validRouteIds =
    config.workflow.kind === "direct"
      ? new Set(Object.keys(config.workflow.intents))
      : BUILT_IN_PHASE_SET

  for (const routeId of Object.keys(config.routes)) {
    if (!validRouteIds.has(routeId)) {
      throw new Error(
        config.workflow.kind === "direct" ? `Unknown intent: ${routeId}` : `Unknown phase: ${routeId}`,
      )
    }

    const target = config.routes[routeId]
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
