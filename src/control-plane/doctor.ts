import type { ControlPlaneConfig, ControlPlanePreset } from "../config.js"
import { getWorkflowRouteIds, resolvePresetReuse } from "../config.js"
import { listLaneExecutionUnits } from "../lane-execution.js"
import type { PolicyDiagnostics, RoutingValidationSummary } from "./types.js"
import { STAGE_1_SUGGESTION_MESSAGE } from "./types.js"

const NAME_PATTERN = /^[a-z0-9-]+$/

function validatePresetGraph(config: ControlPlaneConfig, presetKey: string, preset: ControlPlanePreset) {
  const allowedLanes = preset.usesLanes ?? []
  const effectiveProfiles = getEffectiveProfiles(config, preset)
  const validRouteIds = new Set(getWorkflowRouteIds(config.workflow))

  if (preset.defaultLane && !allowedLanes.includes(preset.defaultLane)) {
    throw new Error(`Preset ${presetKey} defaultLane must be included in usesLanes: ${preset.defaultLane}`)
  }

  if (!effectiveProfiles[preset.defaultRoute]) {
    throw new Error(`Preset ${presetKey} has unknown defaultRoute profile: ${preset.defaultRoute}`)
  }

  for (const routeId of Object.keys(preset.routes)) {
    if (!validRouteIds.has(routeId)) {
      throw new Error(config.workflow.kind === "direct" ? `Unknown intent: ${routeId}` : `Unknown phase: ${routeId}`)
    }

    const target = preset.routes[routeId]
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

export function resolveLaneState(
  config: ControlPlaneConfig,
  activePreset: { key: string; preset: ControlPlanePreset },
  runtimeLane?: string,
) {
  const allowedLanes = [...(activePreset.preset.usesLanes ?? [])]
  const laneSelection = config.settings.laneSelection ?? { mode: "suggest" as const }

  if (config.settings.defaultLane && !allowedLanes.includes(config.settings.defaultLane)) {
    throw new Error(
      `settings.defaultLane must reference a lane allowed by preset ${activePreset.key}: ${config.settings.defaultLane}`,
    )
  }

  if (runtimeLane && !allowedLanes.includes(runtimeLane)) {
    throw new Error(`runtime lane must reference a lane allowed by preset ${activePreset.key}: ${runtimeLane}`)
  }

  const baselineLane = config.settings.defaultLane ?? activePreset.preset.defaultLane
  const effectiveLane = laneSelection.mode === "auto"
    ? runtimeLane ?? baselineLane
    : baselineLane

  return {
    allowedLanes,
    presetDefaultLane: activePreset.preset.defaultLane,
    defaultLane: config.settings.defaultLane,
    effectiveLane,
    runtimeLane,
    mode: laneSelection.mode,
    nonApplyingReason: laneSelection.mode === "suggest" ? STAGE_1_SUGGESTION_MESSAGE : undefined,
  }
}

export function clearInvalidSettingsDefaultLane(settings: ControlPlaneConfig["settings"], preset: ControlPlanePreset | undefined) {
  if (!settings.defaultLane || !preset) {
    return settings
  }

  return (preset.usesLanes ?? []).includes(settings.defaultLane)
    ? settings
    : { ...settings, defaultLane: undefined }
}

export function clearInvalidDocumentDefaultLane(
  settings: LayeredControlPlaneConfigInput["settings"],
  preset: ControlPlanePreset | undefined,
) {
  if (!settings?.defaultLane || !preset) {
    return settings
  }

  return (preset.usesLanes ?? []).includes(settings.defaultLane)
    ? settings
    : { ...settings, defaultLane: null }
}

import type { LayeredControlPlaneConfigInput } from "../config.js"
import { normalizeWorkflowSourceRoutes } from "../workflow-sources.js"

export function getEffectiveProfiles(config: ControlPlaneConfig, preset: ControlPlanePreset) {
  return {
    ...config.profiles,
    ...(preset.profiles ?? {}),
  }
}

export function getEffectiveSources(config: ControlPlaneConfig, preset: ControlPlanePreset) {
  return normalizeWorkflowSourceRoutes(
    config.workflow,
    {
      ...(preset.sourcePreset ? (config.sourcePresets[preset.sourcePreset]?.routes ?? {}) : {}),
      ...(preset.sourceRoutes ?? {}),
    },
  )
}

export function validateControlPlaneConfig(config: ControlPlaneConfig, runtimeLane?: string) {
  const activePreset = config.presets[config.settings.activePreset]
  if (!activePreset) {
    throw new Error(`settings.activePreset must reference an existing preset: ${config.settings.activePreset}`)
  }

  validatePresetShorts(config)
  validateCommandNames(config)

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    validatePresetGraph(config, presetKey, preset)
  }

  if (config.workflow.kind === "superpowers") {
    listLaneExecutionUnits({
      activePresetKey: config.settings.activePreset,
      activePreset,
    })
  }

  return {
    activePreset: {
      key: config.settings.activePreset,
      preset: activePreset,
    },
      laneState: resolveLaneState(config, {
        key: config.settings.activePreset,
        preset: activePreset,
      }, runtimeLane),
  }
}

function collectUsedLaneProfiles(config: ControlPlaneConfig, preset: ControlPlanePreset) {
  const usedProfiles = new Set<string>()

  for (const laneKey of preset.usesLanes ?? []) {
    const lane = config.lanes[laneKey]
    if (!lane) {
      continue
    }

    usedProfiles.add(lane.defaultRoute)
    for (const profileKey of Object.values(lane.routes)) {
      usedProfiles.add(profileKey)
    }
  }

  return usedProfiles
}

function isPresetReuseResolvable(config: ControlPlaneConfig, presetKey: string) {
  try {
    resolvePresetReuse(config)
    return true
  } catch {
    return false
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
  const routeIds = getWorkflowRouteIds(config.workflow)
  const explicitRoutedPhases = routeIds.filter((routeId) => routeId in explicitRouteSource.routes)
  const defaultRoutedPhases = routeIds.filter((routeId) => !(routeId in explicitRouteSource.routes))
  const effectiveProfiles = getEffectiveProfiles(config, preset)
  const usedProfiles = new Set<string>([
    preset.defaultRoute,
    ...Object.values(preset.routes),
    ...collectUsedLaneProfiles(config, preset),
  ])
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
