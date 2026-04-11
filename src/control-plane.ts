import { homedir } from "node:os"
import {
  BUILT_IN_PHASES,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type ControlPlanePreset,
  defaultExists,
  defaultReadFile,
  defaultIsWritable,
  MissingControlPlaneConfigError,
  createDefaultControlPlaneConfig,
  getGlobalConfigPath,
  getProjectConfigPath,
  type LayeredControlPlaneConfigInput,
  loadControlPlaneConfig,
  type LoadControlPlaneConfigInput,
  readControlPlaneSourceDocument,
  resolvePresetReuse,
} from "./config.js"
import type { BuiltInPhase } from "./router.js"
import type { SuperpowersCompatibilityResult, SupportedSuperpowersHost } from "./superpowers-compatibility.js"

const READ_ONLY_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "doctor"])
const NAME_PATTERN = /^[a-z0-9-]+$/

export type ResolveControlPlaneInput = LoadControlPlaneConfigInput & {
  command: ControlPlaneCommandKey
}

export type PrepareControlPlaneStateWriteInput = ResolveControlPlaneInput & {
  isWritable?: (filePath: string) => Promise<boolean>
  nextState: Pick<ControlPlaneConfig["settings"], "activePreset" | "enabled">
}

export type PreparedControlPlaneStateWrite = {
  path: string
  content: string
  config: ControlPlaneConfig
}

export type ResolvedControlPlane = {
  source:
    | { kind: "default"; hasRealSource: false; sources: [] }
    | { kind: "file"; hasRealSource: true; path?: string; sources: string[] }
  config: ControlPlaneConfig
  activePreset: {
    key: string
    preset: ControlPlanePreset
  }
  trace?: {
    activePresetDefinition?: { path: string; preset: ControlPlanePreset }
    parentPresetDefinition?: { path: string; preset: ControlPlanePreset }
  }
  laneState: {
    allowedLanes: string[]
    presetDefaultLane?: string
    defaultLane?: string
    effectiveLane?: string
  }
}

export type OpenCodeStatusState = {
  code:
    | "healthy"
    | "missing_config"
    | "disabled"
    | "artifacts_out_of_sync"
    | "upstream_not_detected"
    | "upstream_incompatible"
  category: "oms" | "upstream" | "host"
  reason: string
}

export type ControlPlaneNextAction = {
  command: string
  reason: string
}

export type ControlPlaneArtifactSummary = {
  expected: number
  present: string[]
  missing: string[]
  stale: string[]
}

export type ExplainTrace = {
  routeSource: "explicit_route" | "default_route"
  configSource: "project" | "global" | "default"
  reuseRelationship: "none" | "extends"
}

export type RoutingValidationSummary = {
  defaultRoutedPhases: BuiltInPhase[]
  explicitRoutedPhases: BuiltInPhase[]
  unusedProfiles: string[]
  reuseRelationship:
    | { kind: "none"; parentPresetKey: null; resolvable: true }
    | { kind: "extends"; parentPresetKey: string; resolvable: boolean }
}

function classifyConfigSource(filePath: string | undefined, cwd: string): ExplainTrace["configSource"] {
  if (!filePath) {
    return "default"
  }

  return filePath === getProjectConfigPath(cwd) ? "project" : "global"
}

function chooseMostLocalConfigSource(
  filePaths: Array<string | undefined>,
  cwd: string,
): ExplainTrace["configSource"] {
  if (filePaths.some((filePath) => filePath === getProjectConfigPath(cwd))) {
    return "project"
  }

  if (filePaths.some((filePath) => Boolean(filePath))) {
    return "global"
  }

  return "default"
}

export function summarizeControlPlaneArtifacts(input: {
  present: string[]
  missing: string[]
  stale: string[]
}): ControlPlaneArtifactSummary {
  return {
    expected: input.present.length + input.missing.length,
    present: input.present,
    missing: input.missing,
    stale: input.stale,
  }
}

export function buildOpenCodeStatusState(input: {
  host: SupportedSuperpowersHost | "qwen"
  source: ResolvedControlPlane["source"]
  enabled: boolean
  compatibility: SuperpowersCompatibilityResult | null
  artifactSummary: ControlPlaneArtifactSummary
}): OpenCodeStatusState {
  if (input.host === "opencode" && !input.source.hasRealSource) {
    return {
      code: "missing_config",
      category: "oms",
      reason: "No OMS config file was found, so OpenCode is using synthesized defaults.",
    }
  }

  if (!input.enabled) {
    return {
      code: "disabled",
      category: "oms",
      reason: "OMS is currently disabled for this workspace.",
    }
  }

  if (input.compatibility?.status === "not_detected") {
    return {
      code: "upstream_not_detected",
      category: "upstream",
      reason: input.compatibility.reason,
    }
  }

  if (input.compatibility?.status === "incompatible") {
    return {
      code: "upstream_incompatible",
      category: "upstream",
      reason: input.compatibility.reason,
    }
  }

  if (input.host === "opencode" && (input.artifactSummary.missing.length > 0 || input.artifactSummary.stale.length > 0)) {
    return {
      code: "artifacts_out_of_sync",
      category: "host",
      reason: "Expected OMS-managed OpenCode artifacts are missing or need to be re-synced.",
    }
  }

  return {
    code: "healthy",
    category: "oms",
    reason: "OMS is enabled and expected OpenCode artifacts are present.",
  }
}

export function buildControlPlaneExplainTrace(input: {
  cwd: string
  resolved: ResolvedControlPlane
  phase: BuiltInPhase
}): ExplainTrace {
  const activeDefinition = input.resolved.trace?.activePresetDefinition
  const parentDefinition = input.resolved.trace?.parentPresetDefinition
  const fallbackPath = input.resolved.source.kind === "file" ? input.resolved.source.path : undefined
  const selectedProfileId = input.resolved.activePreset.preset.routes[input.phase] ?? input.resolved.activePreset.preset.defaultRoute
  const decisivePath = activeDefinition?.preset.routes[input.phase]
    ? activeDefinition.path
    : parentDefinition?.preset.routes[input.phase]
      ? parentDefinition.path
      : activeDefinition?.path ?? fallbackPath
  const selectedProfilePath = activeDefinition?.preset.profiles?.[selectedProfileId]
    ? activeDefinition.path
    : parentDefinition?.preset.profiles?.[selectedProfileId]
      ? parentDefinition.path
      : input.resolved.config.profiles?.[selectedProfileId]
        ? fallbackPath
        : undefined

  return {
    routeSource: input.resolved.activePreset.preset.routes[input.phase] ? "explicit_route" : "default_route",
    configSource: input.resolved.source.kind === "default"
      ? "default"
      : chooseMostLocalConfigSource([decisivePath, selectedProfilePath], input.cwd),
    reuseRelationship: input.resolved.activePreset.preset.extends ? "extends" : "none",
  }
}

export function summarizeRoutingValidation(
  config: ControlPlaneConfig,
  presetKey: string,
  localPresetDefinition?: ControlPlanePreset,
): RoutingValidationSummary {
  const preset = config.presets[presetKey]
  if (!preset) {
    throw new Error(`Unknown preset: ${presetKey}`)
  }

  const explicitRouteSource = localPresetDefinition ?? preset
  const explicitRoutedPhases = BUILT_IN_PHASES.filter((phase) => phase in explicitRouteSource.routes)
  const defaultRoutedPhases = BUILT_IN_PHASES.filter((phase) => !(phase in explicitRouteSource.routes))
  const effectiveProfiles = getEffectiveProfiles(config, preset)
  const usedProfiles = new Set<string>([preset.defaultRoute, ...Object.values(preset.routes)])
  const reuseRelationship: RoutingValidationSummary["reuseRelationship"] = preset.extends
    ? {
        kind: "extends" as const,
        parentPresetKey: preset.extends,
        resolvable: isPresetReuseResolvable(config, presetKey),
      }
    : {
        kind: "none" as const,
        parentPresetKey: null,
        resolvable: true,
      }

  return {
    defaultRoutedPhases,
    explicitRoutedPhases,
    unusedProfiles: Object.keys(effectiveProfiles).filter((profileKey) => !usedProfiles.has(profileKey)),
    reuseRelationship,
  }
}

function isPresetReuseResolvable(config: ControlPlaneConfig, presetKey: string) {
  try {
    resolvePresetReuse(config)
    return true
  } catch {
    return false
  }
}

function cloneProfiles(profiles: ControlPlaneConfig["profiles"] | ControlPlanePreset["profiles"] | undefined) {
  if (!profiles) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(profiles).map(([key, profile]) => [key, { ...profile }]),
  )
}

function cloneLanes(lanes: ControlPlaneConfig["lanes"] | LayeredControlPlaneConfigInput["lanes"] | undefined) {
  if (!lanes) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(lanes).map(([key, lane]) => [key, { ...lane, routes: { ...lane.routes } }]),
  )
}

function getEffectiveProfiles(config: ControlPlaneConfig, preset: ControlPlanePreset) {
  return {
    ...config.profiles,
    ...(preset.profiles ?? {}),
  }
}

function resolvePresetDefinitionFromLayers(
  layers: Array<{ path: string; config: LayeredControlPlaneConfigInput }>,
  presetKey: string,
) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]!
    const preset = layer.config.presets[presetKey]
    if (preset) {
      return { path: layer.path, preset }
    }
  }

  return undefined
}

export function buildOpenCodeNextAction(input: {
  host: SupportedSuperpowersHost | "qwen"
  state: OpenCodeStatusState
  activePresetShort: string
}): ControlPlaneNextAction | null {
  switch (input.state.code) {
    case "missing_config":
    case "artifacts_out_of_sync":
      return {
        command: `oh-my-superagents sync --host ${input.host}`,
        reason: "Materialize the expected OMS-managed host artifacts.",
      }
    case "upstream_not_detected":
    case "upstream_incompatible":
      return {
        command: `oh-my-superagents doctor --host ${input.host}`,
        reason: "Inspect superpowers detection and compatibility details for this workspace.",
      }
    case "disabled":
      return {
        command: `oh-my-superagents use ${input.activePresetShort} --host ${input.host}`,
        reason: "Re-enable OMS by selecting the active preset again.",
      }
    default:
      return null
  }
}

function validatePresetGraph(config: ControlPlaneConfig, presetKey: string, preset: ControlPlanePreset) {
  const allowedLanes = preset.usesLanes ?? []
  const effectiveProfiles = getEffectiveProfiles(config, preset)

  if (preset.defaultLane && !allowedLanes.includes(preset.defaultLane)) {
    throw new Error(`Preset ${presetKey} defaultLane must be included in usesLanes: ${preset.defaultLane}`)
  }

  if (!effectiveProfiles[preset.defaultRoute]) {
    throw new Error(`Preset ${presetKey} has unknown defaultRoute profile: ${preset.defaultRoute}`)
  }

  for (const phase of Object.keys(preset.routes)) {
    if (!BUILT_IN_PHASES.includes(phase as (typeof BUILT_IN_PHASES)[number])) {
      throw new Error(`Unknown phase: ${phase}`)
    }

    const target = preset.routes[phase]
    if (!effectiveProfiles[target]) {
      throw new Error(`Preset ${presetKey} has unknown profile: ${target}`)
    }
  }
}

function validatePresetShorts(config: ControlPlaneConfig) {
  const seen = new Map<string, string>()

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    if (!NAME_PATTERN.test(preset.short)) {
      throw new Error(`Preset ${presetKey} has invalid short name: ${preset.short}`)
    }

    const existing = seen.get(preset.short)
    if (existing) {
      throw new Error(`Preset short must be unique: ${preset.short} (${existing}, ${presetKey})`)
    }

    seen.set(preset.short, presetKey)
  }
}

function validateCommandNames(config: ControlPlaneConfig) {
  if (!NAME_PATTERN.test(config.settings.commandPrefix)) {
    throw new Error(`Invalid command prefix: ${config.settings.commandPrefix}`)
  }

  const seen = new Map<string, string>()

  for (const [commandKey, command] of Object.entries(config.settings.commands)) {
    if (!NAME_PATTERN.test(command.name)) {
      throw new Error(`Invalid command name for ${commandKey}: ${command.name}`)
    }

    const primaryConflict = seen.get(command.name)
    if (primaryConflict) {
      throw new Error(`Rendered command names must be unique: ${command.name}`)
    }

    seen.set(command.name, commandKey)

    for (const alias of command.aliases) {
      if (!NAME_PATTERN.test(alias)) {
        throw new Error(`Invalid command alias for ${commandKey}: ${alias}`)
      }

      const aliasConflict = seen.get(alias)
      if (aliasConflict) {
        throw new Error(`Rendered command names and aliases must be unique: ${alias}`)
      }

      seen.set(alias, commandKey)
    }
  }
}

function resolveLaneState(config: ControlPlaneConfig, activePreset: { key: string; preset: ControlPlanePreset }) {
  const allowedLanes = [...(activePreset.preset.usesLanes ?? [])]

  if (config.settings.defaultLane && !allowedLanes.includes(config.settings.defaultLane)) {
    throw new Error(
      `settings.defaultLane must reference a lane allowed by preset ${activePreset.key}: ${config.settings.defaultLane}`,
    )
  }

  return {
    allowedLanes,
    presetDefaultLane: activePreset.preset.defaultLane,
    defaultLane: config.settings.defaultLane,
    effectiveLane: config.settings.defaultLane ?? activePreset.preset.defaultLane,
  }
}

function sanitizeSettingsDefaultLane(settings: ControlPlaneConfig["settings"], preset: ControlPlanePreset | undefined) {
  if (!settings.defaultLane || !preset) {
    return settings
  }

  return (preset.usesLanes ?? []).includes(settings.defaultLane)
    ? settings
    : { ...settings, defaultLane: undefined }
}

function validateControlPlaneConfig(config: ControlPlaneConfig) {
  const activePreset = config.presets[config.settings.activePreset]
  if (!activePreset) {
    throw new Error(`settings.activePreset must reference an existing preset: ${config.settings.activePreset}`)
  }

  validatePresetShorts(config)
  validateCommandNames(config)

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    validatePresetGraph(config, presetKey, preset)
  }

  return {
    activePreset: {
      key: config.settings.activePreset,
      preset: activePreset,
    },
    laneState: resolveLaneState(config, {
      key: config.settings.activePreset,
      preset: activePreset,
    }),
  }
}

function clonePreset(preset: ControlPlanePreset): ControlPlanePreset {
  return {
    ...preset,
    profiles: cloneProfiles(preset.profiles),
    usesLanes: preset.usesLanes ? [...preset.usesLanes] : undefined,
    routes: { ...preset.routes },
  }
}

function cloneLayeredConfig(config: LayeredControlPlaneConfigInput): LayeredControlPlaneConfigInput {
  return {
    settings: config.settings
      ? {
          ...config.settings,
          commands: config.settings.commands
            ? Object.fromEntries(
                Object.entries(config.settings.commands).map(([key, command]) => [
                  key,
                  { ...command, aliases: command.aliases ? [...command.aliases] : undefined },
                ]),
              )
            : undefined,
          superpowersCompatibility: config.settings.superpowersCompatibility
            ? { ...config.settings.superpowersCompatibility }
            : undefined,
        }
      : undefined,
    profiles: cloneProfiles(config.profiles),
    lanes: cloneLanes(config.lanes),
    presets: Object.fromEntries(
      Object.entries(config.presets).map(([key, preset]) => [key, clonePreset(preset)]),
    ),
  }
}

function toLayeredDocument(config: ControlPlaneConfig): LayeredControlPlaneConfigInput {
  return {
    settings: {
      enabled: config.settings.enabled,
      activePreset: config.settings.activePreset,
      defaultLane: config.settings.defaultLane,
      laneSelection: { ...config.settings.laneSelection },
      commandPrefix: config.settings.commandPrefix,
      commands: Object.fromEntries(
        Object.entries(config.settings.commands).map(([key, command]) => [
          key,
          { name: command.name, aliases: [...command.aliases] },
        ]),
      ),
      superpowersCompatibility: { ...config.settings.superpowersCompatibility },
    },
    profiles: cloneProfiles(config.profiles),
    lanes: cloneLanes(config.lanes),
    presets: Object.fromEntries(
      Object.entries(config.presets).map(([key, preset]) => [key, clonePreset(preset)]),
    ),
  }
}

function serializeLayeredConfig(config: LayeredControlPlaneConfigInput) {
  return `${JSON.stringify(config, null, 2)}\n`
}

function applyNextState(
  config: LayeredControlPlaneConfigInput,
  nextState: PrepareControlPlaneStateWriteInput["nextState"],
) {
  return {
    ...config,
    settings: {
      ...config.settings,
      activePreset: nextState.activePreset,
      enabled: nextState.enabled,
    },
  }
}

function ensureStandaloneSettings(config: LayeredControlPlaneConfigInput) {
  const defaults = createDefaultControlPlaneConfig()

  return {
    ...config,
    settings: {
      ...config.settings,
      commandPrefix: config.settings?.commandPrefix ?? defaults.settings.commandPrefix,
      commands: config.settings?.commands ?? defaults.settings.commands,
      superpowersCompatibility:
        config.settings?.superpowersCompatibility ?? defaults.settings.superpowersCompatibility,
    },
  }
}

async function selectWriteTarget(input: PrepareControlPlaneStateWriteInput) {
  const exists = input.exists ?? defaultExists
  const homeDirectory = input.homeDir ?? homedir()

  if (input.explicitPath) {
    return {
      path: input.explicitPath,
      exists: await exists(input.explicitPath),
      hasLowerPrioritySource: false,
    }
  }

  const projectPath = getProjectConfigPath(input.cwd)
  const projectExists = await exists(projectPath)
  if (projectExists) {
    return {
      path: projectPath,
      exists: true,
      hasLowerPrioritySource: await exists(getGlobalConfigPath(homeDirectory)),
    }
  }

  const globalPath = getGlobalConfigPath(homeDirectory)
  const globalExists = await exists(globalPath)
  if (globalExists) {
    return {
      path: globalPath,
      exists: true,
      hasLowerPrioritySource: false,
    }
  }

  return {
    path: globalPath,
    exists: false,
    hasLowerPrioritySource: false,
  }
}

export async function prepareControlPlaneStateWrite(
  input: PrepareControlPlaneStateWriteInput,
): Promise<PreparedControlPlaneStateWrite> {
  const isWritable = input.isWritable ?? defaultIsWritable
  const reader = input.readFile ?? defaultReadFile

  let resolvedConfig: ControlPlaneConfig
  try {
    resolvedConfig = (await loadControlPlaneConfig(input)).config
  } catch (error) {
    if (!(error instanceof MissingControlPlaneConfigError)) {
      throw error
    }

    resolvedConfig = createDefaultControlPlaneConfig()
  }

  const nextSettings = sanitizeSettingsDefaultLane({
    ...resolvedConfig.settings,
    activePreset: input.nextState.activePreset,
    enabled: input.nextState.enabled,
  }, resolvedConfig.presets[input.nextState.activePreset])

  const nextConfig: ControlPlaneConfig = {
    ...resolvedConfig,
    settings: nextSettings,
  }
  validateControlPlaneConfig(nextConfig)

  const target = await selectWriteTarget(input)
  if (!(await isWritable(target.path))) {
    throw new Error(`Selected config target is not writable: ${target.path}`)
  }

  let nextDocument: LayeredControlPlaneConfigInput
  let sourceFormat: "layered" | "legacy" = "layered"

  if (target.exists) {
    const source = await readControlPlaneSourceDocument(target.path, reader)
    sourceFormat = source.format
    nextDocument = cloneLayeredConfig(source.config)
  } else {
    nextDocument = toLayeredDocument(createDefaultControlPlaneConfig())
  }

  nextDocument = applyNextState(nextDocument, input.nextState)
  if (nextDocument.settings) {
    nextDocument.settings = sanitizeSettingsDefaultLane(
      nextDocument.settings as ControlPlaneConfig["settings"],
      resolvedConfig.presets[input.nextState.activePreset],
    )
  }

  if (!target.hasLowerPrioritySource && (!target.exists || sourceFormat === "legacy")) {
    nextDocument = ensureStandaloneSettings(nextDocument)
  }

  return {
    path: target.path,
    content: serializeLayeredConfig(nextDocument),
    config: nextConfig,
  }
}

export async function resolveControlPlane(input: ResolveControlPlaneInput): Promise<ResolvedControlPlane> {
  try {
    const loaded = await loadControlPlaneConfig(input)
    const { activePreset, laneState } = validateControlPlaneConfig(loaded.config)
    const activePresetDefinition = resolvePresetDefinitionFromLayers(loaded.layers, activePreset.key)
    const parentPresetDefinition = activePreset.preset.extends
      ? resolvePresetDefinitionFromLayers(loaded.layers, activePreset.preset.extends)
      : undefined

    return {
      source: {
        kind: "file",
        hasRealSource: true,
        path: loaded.path,
        sources: loaded.sources,
      },
      config: loaded.config,
      activePreset,
      laneState,
      trace: {
        activePresetDefinition,
        parentPresetDefinition,
      },
    }
  } catch (error) {
    if (!(error instanceof MissingControlPlaneConfigError)) {
      throw error
    }

    if (!READ_ONLY_COMMANDS.has(input.command)) {
      throw new Error(`Command ${input.command} requires a real config source`)
    }

    const config = createDefaultControlPlaneConfig()
    const { activePreset, laneState } = validateControlPlaneConfig(config)

    return {
      source: {
        kind: "default",
        hasRealSource: false,
        sources: [],
      },
      config,
      activePreset,
      laneState,
    }
  }
}
