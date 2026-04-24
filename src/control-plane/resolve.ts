import path from "node:path"
import {
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type ControlPlanePreset,
  type LayeredControlPlaneConfigInput,
  type LoadedControlPlaneConfig,
  createDefaultControlPlaneConfig,
  getGlobalConfigPath,
  getProjectConfigPath,
  loadControlPlaneConfig,
  MissingControlPlaneConfigError,
} from "../config.js"
import { MissingConfigError } from "../errors.js"
import { resolveRoute, type BuiltInPhase } from "../router.js"
import {
  resolveContextProviders as defaultResolveContextProviders,
  type ResolvedContextProvider,
  type ResolveContextProvidersInput,
} from "../context-providers.js"
import { resolvePolicyFamilies } from "../policy-resolution.js"
import type { ResolvedControlPlane, ResolveControlPlaneInput, ExplainTrace } from "./types.js"
import { validateControlPlaneConfig, resolveLaneState, getEffectiveSources } from "./doctor.js"
import { resolveContextIndex, buildPolicyRuntimeSnapshot, buildPolicyDiagnostics } from "./policy.js"
import { resolveEffectiveContextCompression } from "./compression.js"

const READ_ONLY_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "doctor"])

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

export function buildControlPlaneRouteExplainTrace(input: {
  cwd: string
  resolved: ResolvedControlPlane
  routeId: string
}): ExplainTrace {
  const laneState = input.resolved.laneState ?? resolveLaneState(input.resolved.config, input.resolved.activePreset)
  const routerConfig = {
    workflow: input.resolved.config.workflow,
    profiles: {
      ...(input.resolved.config.profiles ?? {}),
      ...(input.resolved.activePreset.preset.profiles ?? {}),
    },
    lanes: input.resolved.config.lanes,
    routes: input.resolved.activePreset.preset.routes,
    defaultRoute: input.resolved.activePreset.preset.defaultRoute,
    effectiveSources: input.resolved.effectiveSources,
    effectiveLane: laneState.effectiveLane,
    superpowersCompatibility: input.resolved.config.settings.superpowersCompatibility,
  }
  const resolvedRoute = resolveRoute(routerConfig, input.routeId)
  const activeDefinition = input.resolved.trace?.activePresetDefinition
  const parentDefinition = input.resolved.trace?.parentPresetDefinition
  const fallbackPath = input.resolved.source.kind === "file" ? input.resolved.source.path : undefined
  const selectedProfileId = resolvedRoute.profileId
  const laneDefinition = laneState.effectiveLane
    ? resolveLaneDefinitionFromLayers(input.resolved.layers ?? [], laneState.effectiveLane)
    : undefined
  const decisivePath = resolvedRoute.routeSource === "preset-route"
    ? activeDefinition?.preset.routes[input.routeId]
      ? activeDefinition.path
      : parentDefinition?.preset.routes[input.routeId]
        ? parentDefinition.path
        : activeDefinition?.path ?? fallbackPath
    : resolvedRoute.routeSource === "lane-route" || resolvedRoute.routeSource === "lane-default"
      ? laneDefinition?.path ?? fallbackPath
      : activeDefinition?.path ?? fallbackPath
  const selectedProfilePath = activeDefinition?.preset.profiles?.[selectedProfileId]
    ? activeDefinition.path
    : parentDefinition?.preset.profiles?.[selectedProfileId]
      ? parentDefinition.path
      : resolveTopLevelProfileDefinitionFromLayers(input.resolved.layers ?? [], selectedProfileId)?.path
        ?? (input.resolved.config.profiles?.[selectedProfileId] ? fallbackPath : undefined)

  return {
    routeSource: resolvedRoute.routeSource === "preset-route" ? "explicit_route" : "default_route",
    configSource: input.resolved.source.kind === "default"
      ? "default"
      : chooseMostLocalConfigSource([decisivePath, selectedProfilePath], input.cwd),
    reuseRelationship: input.resolved.activePreset.preset.extends ? "extends" : "none",
    resolvedSource: resolvedRoute.resolvedSource,
    sourceEntry: resolvedRoute.sourceEntry,
  }
}

export function buildControlPlaneExplainTrace(input: {
  cwd: string
  resolved: ResolvedControlPlane
  phase: BuiltInPhase
}): ExplainTrace {
  return buildControlPlaneRouteExplainTrace({
    cwd: input.cwd,
    resolved: input.resolved,
    routeId: input.phase,
  })
}

function resolveLaneDefinitionFromLayers(
  layers: Array<{ path: string; config: LayeredControlPlaneConfigInput }>,
  laneKey: string,
) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]!
    const lane = layer.config.lanes?.[laneKey]
    if (lane) {
      return { path: layer.path, lane }
    }
  }

  return undefined
}

function resolveTopLevelProfileDefinitionFromLayers(
  layers: Array<{ path: string; config: LayeredControlPlaneConfigInput }>,
  profileKey: string,
) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]!
    const profile = layer.config.profiles?.[profileKey]
    if (profile) {
      return { path: layer.path, profile }
    }
  }

  return undefined
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

async function resolveConfiguredContextProviders(input: {
  config: ControlPlaneConfig["contextProviders"]
  baseDir: string
  resolveContextProviders?: ResolveControlPlaneInput["resolveContextProviders"]
}): Promise<ResolvedContextProvider[]> {
  const resolveContextProviders = input.resolveContextProviders ?? defaultResolveContextProviders
  return resolveContextProviders({
    baseDir: input.baseDir,
    config: input.config,
  })
}

export async function resolveControlPlane(input: ResolveControlPlaneInput): Promise<ResolvedControlPlane> {
  try {
    const loadConfig = input.loadControlPlaneConfig ?? loadControlPlaneConfig
    const loaded = await loadConfig(input)
    const { activePreset, laneState } = validateControlPlaneConfig(loaded.config, input.runtimeLane)
    const effectiveSources = getEffectiveSources(loaded.config, activePreset.preset)
    const contextProviders = await resolveConfiguredContextProviders({
      config: loaded.config.contextProviders,
      baseDir: path.dirname(loaded.path),
      resolveContextProviders: input.resolveContextProviders,
    })
    const contextIndex = await resolveContextIndex({
      ...input,
      contextProviders,
    })
    const policyResolution = loaded.config.policyRules && loaded.config.policyRules.length > 0
      ? (() => {
          const authorityWorkloadMappings = loaded.layers.flatMap((layer) => layer.config.authority?.workloadMappings ?? [])
          const policyRuntime = buildPolicyRuntimeSnapshot({
            cwd: input.cwd,
            command: input.command,
            config: loaded.config,
            authorityWorkloadMappings,
            contextIndex,
            effectiveSources,
            runtimeLifecycleStage: input.runtimeLifecycleStage,
            runtimeWorkflowSource: input.runtimeWorkflowSource,
            runtimeRelativePath: input.runtimeRelativePath,
            runtimeWorkloadTags: input.runtimeWorkloadTags,
            runtimeModalityRequirements: input.runtimeModalityRequirements,
            runtimeAgentRole: input.runtimeAgentRole,
          })

          return resolvePolicyFamilies(policyRuntime.snapshot, loaded.config.policyRules, policyRuntime.provenance)
        })()
      : undefined
    const policyDiagnostics = buildPolicyDiagnostics(loaded.config, loaded.layers)
    const contextCompression = await resolveEffectiveContextCompression({
      command: input.command,
      cwd: input.cwd,
      now: input.now,
      readFile: input.readFile,
      config: loaded.config,
      layers: loaded.layers,
      contextIndex,
      effectiveSources,
      contextProviders,
      policyResolution,
    })
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
      recovery: loaded.recovery,
      activePreset,
      layers: loaded.layers,
      laneState,
      contextProviders,
      contextIndex,
      policyResolution,
      policyDiagnostics,
      contextCompression,
      effectiveSources,
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
      throw new MissingConfigError(input.command)
    }

    const config = createDefaultControlPlaneConfig()
    const { activePreset, laneState } = validateControlPlaneConfig(config, input.runtimeLane)
    const effectiveSources = getEffectiveSources(config, activePreset.preset)
    const contextProviders = await resolveConfiguredContextProviders({
      config: config.contextProviders,
      baseDir: input.cwd,
      resolveContextProviders: input.resolveContextProviders,
    })
    const contextIndex = await resolveContextIndex({
      ...input,
      contextProviders,
    })
    const policyResolution = config.policyRules && config.policyRules.length > 0
      ? (() => {
          const policyRuntime = buildPolicyRuntimeSnapshot({
            cwd: input.cwd,
            command: input.command,
            config,
            authorityWorkloadMappings: [],
            contextIndex,
            effectiveSources,
            runtimeLifecycleStage: input.runtimeLifecycleStage,
            runtimeWorkflowSource: input.runtimeWorkflowSource,
            runtimeRelativePath: input.runtimeRelativePath,
            runtimeWorkloadTags: input.runtimeWorkloadTags,
            runtimeModalityRequirements: input.runtimeModalityRequirements,
            runtimeAgentRole: input.runtimeAgentRole,
          })

          return resolvePolicyFamilies(policyRuntime.snapshot, config.policyRules, policyRuntime.provenance)
        })()
      : undefined
    const policyDiagnostics = buildPolicyDiagnostics(config, [])
    const contextCompression = await resolveEffectiveContextCompression({
      command: input.command,
      cwd: input.cwd,
      now: input.now,
      readFile: input.readFile,
      config,
      layers: [],
      contextIndex,
      effectiveSources,
      contextProviders,
      policyResolution,
    })

    return {
      source: {
        kind: "default",
        hasRealSource: false,
        sources: [],
      },
      config,
      activePreset,
      layers: [],
      laneState,
      contextProviders,
      contextIndex,
      policyResolution,
      policyDiagnostics,
      contextCompression,
      effectiveSources,
    }
  }
}
