import { homedir } from "node:os"
import type { ControlPlaneConfig, ControlPlanePreset, LayeredControlPlaneConfigInput } from "../config.js"
import {
  createDefaultControlPlaneConfig,
  defaultExists,
  defaultIsWritable,
  defaultReadFile,
  getGlobalConfigPath,
  getProjectConfigPath,
  loadControlPlaneConfig,
  MissingControlPlaneConfigError,
  readControlPlaneSourceDocument,
} from "../config.js"
import { clonePolicyRules } from "../policy-families.js"
import type { PrepareControlPlaneStateWriteInput, PreparedControlPlaneStateWrite } from "./types.js"
import { clearInvalidDocumentDefaultLane, clearInvalidSettingsDefaultLane, validateControlPlaneConfig } from "./doctor.js"

export function cloneProfiles(profiles: ControlPlaneConfig["profiles"] | ControlPlanePreset["profiles"] | undefined) {
  if (!profiles) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(profiles).map(([key, profile]) => [key, { ...profile }]),
  )
}

export function cloneLanes(lanes: ControlPlaneConfig["lanes"] | LayeredControlPlaneConfigInput["lanes"] | undefined) {
  if (!lanes) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(lanes).map(([key, lane]) => [key, { ...lane, routes: { ...lane.routes } }]),
  )
}

export function clonePreset(preset: ControlPlanePreset): ControlPlanePreset {
  return {
    ...preset,
    profiles: cloneProfiles(preset.profiles),
    usesLanes: preset.usesLanes ? [...preset.usesLanes] : undefined,
    routes: { ...preset.routes },
  }
}

function cloneWorkflow(config: { workflow: ControlPlaneConfig["workflow"] }) {
  return config.workflow.kind === "direct"
    ? {
        kind: "direct" as const,
        intents: Object.fromEntries(
          Object.entries(config.workflow.intents).map(([key, intent]) => [key, { ...intent }]),
        ),
      }
    : { kind: "superpowers" as const }
}

export function cloneContextCompression<
  T extends {
    moments?: Record<string, boolean>
    safety?: Record<string, boolean>
  } | undefined,
>(contextCompression: T): T {
  if (!contextCompression) {
    return contextCompression
  }

  return {
    ...contextCompression,
    moments: contextCompression.moments ? { ...contextCompression.moments } : undefined,
    safety: contextCompression.safety ? { ...contextCompression.safety } : undefined,
  } as T
}

function cloneCompressionPresets<
  T extends Record<string, { moments?: Record<string, boolean>; safety?: Record<string, boolean> }> | undefined,
>(compressionPresets: T): T {
  if (!compressionPresets) {
    return compressionPresets
  }

  return Object.fromEntries(
    Object.entries(compressionPresets).map(([key, preset]) => [key, cloneContextCompression(preset)]),
  ) as T
}

export function cloneLayeredConfig(config: LayeredControlPlaneConfigInput): LayeredControlPlaneConfigInput {
  return {
    workflow: config.workflow
      ? config.workflow.kind === "direct"
        ? {
            kind: "direct",
            intents: Object.fromEntries(
              Object.entries(config.workflow.intents).map(([key, intent]) => [key, { ...intent }]),
            ),
          }
        : { kind: "superpowers" }
      : undefined,
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
          contextCompression: cloneContextCompression(config.settings.contextCompression),
          superpowersCompatibility: config.settings.superpowersCompatibility
            ? { ...config.settings.superpowersCompatibility }
            : undefined,
        }
      : undefined,
    sourcePresets: config.sourcePresets
      ? Object.fromEntries(
          Object.entries(config.sourcePresets).map(([key, sourcePreset]) => [key, { routes: { ...sourcePreset.routes } }]),
        )
      : undefined,
    compressionPresets: cloneCompressionPresets(config.compressionPresets),
    authority: config.authority
      ? {
          workloadMappings: config.authority.workloadMappings.map((mapping) => ({
            path: [...mapping.path],
            workloadTags: [...mapping.workloadTags],
          })),
          policyRules: clonePolicyRules(config.authority.policyRules) ?? [],
        }
      : undefined,
    evidence: config.evidence
      ? {
          detectedPaths: config.evidence.detectedPaths.map((detectedPath) => ({
            path: detectedPath.path,
            suggestedTags: [...detectedPath.suggestedTags],
          })),
          notes: [...config.evidence.notes],
        }
      : undefined,
    policyRules: clonePolicyRules(config.policyRules),
    profiles: cloneProfiles(config.profiles),
    lanes: cloneLanes(config.lanes),
    presets: Object.fromEntries(
      Object.entries(config.presets).map(([key, preset]) => [key, clonePreset(preset)]),
    ),
  }
}

function toLayeredDocument(config: ControlPlaneConfig): LayeredControlPlaneConfigInput {
  return {
    workflow: cloneWorkflow(config),
    settings: {
      enabled: config.settings.enabled,
      activePreset: config.settings.activePreset,
      defaultLane: config.settings.defaultLane,
      laneSelection: { ...config.settings.laneSelection },
      subagentExecution: { ...config.settings.subagentExecution },
      contextCompression: cloneContextCompression(config.settings.contextCompression),
      commandPrefix: config.settings.commandPrefix,
      commands: Object.fromEntries(
        Object.entries(config.settings.commands).map(([key, command]) => [
          key,
          { name: command.name, aliases: [...command.aliases] },
        ]),
      ),
      superpowersCompatibility: { ...config.settings.superpowersCompatibility },
    },
    sourcePresets: Object.fromEntries(
      Object.entries(config.sourcePresets).map(([key, sourcePreset]) => [
        key,
        { routes: Object.fromEntries(Object.entries(sourcePreset.routes)) as Record<string, "superpowers" | "gstack" | "direct"> },
      ]),
    ),
    compressionPresets: cloneCompressionPresets(config.compressionPresets),
    policyRules: clonePolicyRules(config.policyRules),
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
    compressionPresets: config.compressionPresets ?? cloneCompressionPresets(defaults.compressionPresets),
    settings: {
      ...config.settings,
      commandPrefix: config.settings?.commandPrefix ?? defaults.settings.commandPrefix,
      commands: config.settings?.commands ?? defaults.settings.commands,
      subagentExecution: config.settings?.subagentExecution ?? defaults.settings.subagentExecution,
      contextCompression: config.settings?.contextCompression ?? cloneContextCompression(defaults.settings.contextCompression),
      superpowersCompatibility:
        config.settings?.superpowersCompatibility ?? defaults.settings.superpowersCompatibility,
    },
  }
}

async function selectWriteTarget(input: PrepareControlPlaneStateWriteInput) {
  const exists = input.exists ?? defaultExists
  const homeDirectory = input.homeDir ?? homedir()
  const projectPath = getProjectConfigPath(input.cwd)
  const globalPath = getGlobalConfigPath(homeDirectory)

  if (input.explicitPath) {
    return {
      path: input.explicitPath,
      exists: await exists(input.explicitPath),
      hasLowerPrioritySource: input.explicitPath === projectPath
        ? await exists(globalPath)
        : false,
    }
  }

  const projectExists = await exists(projectPath)
  if (projectExists) {
    return {
      path: projectPath,
      exists: true,
      hasLowerPrioritySource: await exists(globalPath),
    }
  }

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

  const nextSettings = clearInvalidSettingsDefaultLane({
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
  } else if (target.hasLowerPrioritySource) {
    nextDocument = { presets: {} }
  } else {
    nextDocument = toLayeredDocument(createDefaultControlPlaneConfig())
  }

  nextDocument = applyNextState(nextDocument, input.nextState)
  if (nextDocument.settings) {
    nextDocument.settings = clearInvalidDocumentDefaultLane(
      nextDocument.settings,
      resolvedConfig.presets[input.nextState.activePreset],
    )

    if (target.hasLowerPrioritySource && resolvedConfig.settings.defaultLane && !nextConfig.settings.defaultLane) {
      nextDocument.settings = { ...nextDocument.settings, defaultLane: null }
    }
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
