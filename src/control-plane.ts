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
} from "./config.js"

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
}

function validatePresetGraph(presetKey: string, preset: ControlPlanePreset) {
  if (!preset.profiles[preset.defaultRoute]) {
    throw new Error(`Preset ${presetKey} has unknown defaultRoute profile: ${preset.defaultRoute}`)
  }

  for (const phase of Object.keys(preset.routes)) {
    if (!BUILT_IN_PHASES.includes(phase as (typeof BUILT_IN_PHASES)[number])) {
      throw new Error(`Unknown phase: ${phase}`)
    }

    const target = preset.routes[phase]
    if (!preset.profiles[target]) {
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

function validateControlPlaneConfig(config: ControlPlaneConfig) {
  const activePreset = config.presets[config.settings.activePreset]
  if (!activePreset) {
    throw new Error(`settings.activePreset must reference an existing preset: ${config.settings.activePreset}`)
  }

  validatePresetShorts(config)
  validateCommandNames(config)

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    validatePresetGraph(presetKey, preset)
  }

  return {
    key: config.settings.activePreset,
    preset: activePreset,
  }
}

function clonePreset(preset: ControlPlanePreset): ControlPlanePreset {
  return {
    ...preset,
    profiles: Object.fromEntries(
      Object.entries(preset.profiles).map(([key, profile]) => [key, { ...profile }]),
    ),
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
      commandPrefix: config.settings.commandPrefix,
      commands: Object.fromEntries(
        Object.entries(config.settings.commands).map(([key, command]) => [
          key,
          { name: command.name, aliases: [...command.aliases] },
        ]),
      ),
      superpowersCompatibility: { ...config.settings.superpowersCompatibility },
    },
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

  const nextConfig: ControlPlaneConfig = {
    ...resolvedConfig,
    settings: {
      ...resolvedConfig.settings,
      activePreset: input.nextState.activePreset,
      enabled: input.nextState.enabled,
    },
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
    const activePreset = validateControlPlaneConfig(loaded.config)

    return {
      source: {
        kind: "file",
        hasRealSource: true,
        path: loaded.path,
        sources: loaded.sources,
      },
      config: loaded.config,
      activePreset,
    }
  } catch (error) {
    if (!(error instanceof MissingControlPlaneConfigError)) {
      throw error
    }

    if (!READ_ONLY_COMMANDS.has(input.command)) {
      throw new Error(`Command ${input.command} requires a real config source`)
    }

    const config = createDefaultControlPlaneConfig()
    const activePreset = validateControlPlaneConfig(config)

    return {
      source: {
        kind: "default",
        hasRealSource: false,
        sources: [],
      },
      config,
      activePreset,
    }
  }
}
