import { homedir } from "node:os"
import path from "node:path"
import {
  BUILT_IN_PHASES,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type LoadedControlPlaneConfig,
  type ControlPlanePreset,
  defaultExists,
  defaultReadFile,
  defaultIsWritable,
  MissingControlPlaneConfigError,
  createDefaultControlPlaneConfig,
  getGlobalConfigPath,
  getProjectConfigPath,
  getWorkflowRouteIds,
  type LayeredControlPlaneConfigInput,
  loadControlPlaneConfig,
  type LoadControlPlaneConfigInput,
  readControlPlaneSourceDocument,
  resolvePresetReuse,
} from "./config.js"
import { clonePolicyRules } from "./policy-families.js"
import { escapeGlobPattern, matchesGlobPattern, normalizeRelativePath } from "./utils/glob-utils.js"
import {
  resolvePolicyFamilies,
  type ResolvedPolicyFamilies,
  type RuntimeSelectorProvenance,
} from "./policy-resolution.js"
import { assertSafeArtifactPath } from "./materialize.js"
import { buildRuntimeContextSnapshot, matchesPolicySelector } from "./policy-selectors.js"
import {
  deriveLifecycleStage,
  type ContextLifecycleStage,
} from "./context-lifecycle.js"
import type { ContextArtifact, ContextArtifactFreshness } from "./context-artifacts.js"
import {
  buildBuiltinCompressionBundle,
  enhanceCompressionBundleWithSummary,
  evaluateCompressionReadiness,
  type CompressionReadiness,
  type EnhancedCompressionBundle,
} from "./context-compression.js"
import {
  resolveContextCompressionPolicy,
  selectContextPacks,
  type EffectiveContextCompressionPolicy,
  type EffectiveContextPackSelection,
} from "./context-packs.js"
import { buildContextIndex, summarizeContextProviders, type ContextIndex } from "./context-index.js"
import { listLaneExecutionUnits } from "./lane-execution.js"
import { classifyOpenSpecArtifact } from "./openspec.js"
import { resolveEffectiveSources, resolveRoute, type BuiltInPhase } from "./router.js"
import type { SuperpowersCompatibilityResult, SupportedSuperpowersHost } from "./superpowers-compatibility.js"
import type { ProjectionReadiness } from "./upstream-readiness.js"
import {
  getWorkflowSourceEntry,
  normalizeWorkflowSourceRoutes,
  WORKFLOW_SOURCE_KINDS,
  type CanonicalRouteId,
  type WorkflowSourceEntry,
  type WorkflowSourceKind,
} from "./workflow-sources.js"
import {
  resolveContextProviders as defaultResolveContextProviders,
  type ResolvedContextProvider,
  type ResolveContextProvidersInput,
} from "./context-providers.js"

const READ_ONLY_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "doctor"])
const NAME_PATTERN = /^[a-z0-9-]+$/

export type ResolveControlPlaneInput = LoadControlPlaneConfigInput & {
  command: ControlPlaneCommandKey
  runtimeLane?: string
  runtimeLifecycleStage?: ContextLifecycleStage
  runtimeWorkflowSource?: WorkflowSourceKind
  runtimeRelativePath?: string
  runtimeWorkloadTags?: string[]
  runtimeModalityRequirements?: string[]
  runtimeAgentRole?: "primary" | "subagent"
  now?: string
  loadControlPlaneConfig?: (input: LoadControlPlaneConfigInput) => Promise<LoadedControlPlaneConfig>
  buildContextIndex?: (input: { cwd: string; contextProviders?: readonly ResolvedContextProvider[] }) => Promise<ContextIndex>
  resolveContextProviders?: (input: ResolveContextProvidersInput) => Promise<ResolvedContextProvider[]>
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
  recovery?: LoadedControlPlaneConfig["recovery"]
  activePreset: {
    key: string
    preset: ControlPlanePreset
  }
  trace?: {
    activePresetDefinition?: { path: string; preset: ControlPlanePreset }
    parentPresetDefinition?: { path: string; preset: ControlPlanePreset }
  }
  layers?: Array<{
    path: string
    config: LayeredControlPlaneConfigInput
  }>
  laneState: {
    allowedLanes: string[]
    presetDefaultLane?: string
    defaultLane?: string
    effectiveLane?: string
    runtimeLane?: string
    mode: ControlPlaneConfig["settings"]["laneSelection"]["mode"]
    nonApplyingReason?: string
  }
  contextProviders: ResolvedContextProvider[]
  contextIndex?: ContextIndex
  policyResolution?: ResolvedPolicyFamilies
  policyDiagnostics?: PolicyDiagnostics
  contextCompression?: {
    policy: EffectiveContextCompressionPolicy
    selection: EffectiveContextPackSelection & { lifecycleStage: ContextLifecycleStage }
    readiness: CompressionReadiness
    engineBundle: EnhancedCompressionBundle
  }
  effectiveSources: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
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

export type EffectiveSourceReadinessEntry = WorkflowSourceEntry & {
  readiness: ProjectionReadiness
}

export type EffectiveSourceReadiness = Partial<Record<CanonicalRouteId, EffectiveSourceReadinessEntry>>

export type SourceToolRoleExplainability = {
  workflowSources: WorkflowSourceKind[]
  artifactDialects: string[]
  externalCapabilityScope: {
    included: string[]
    excluded: string[]
  }
  lines: string[]
}

const EXTERNAL_CAPABILITY_SCOPE = ["user-installed skills", "plugins", "MCPs", "providers"] as const
const EXCLUDED_EXTERNAL_CAPABILITY_SCOPE = ["upstream workflow-internal skills"] as const

function isSupportedUnavailableReadinessEntry(
  entry: EffectiveSourceReadinessEntry | undefined,
): entry is EffectiveSourceReadinessEntry & {
  readiness: Extract<ProjectionReadiness, { support: { supported: true } }>
} {
  if (!entry || !("availability" in entry.readiness)) {
    return false
  }

  return entry.readiness.availability.status === "not_detected"
}

export type ExplainTrace = {
  routeSource: "explicit_route" | "default_route"
  configSource: "project" | "global" | "default"
  reuseRelationship: "none" | "extends"
  resolvedSource: WorkflowSourceKind
  sourceEntry: WorkflowSourceEntry
}

export type LaneExplainability = ResolvedControlPlane["laneState"] & {
  laneSelection: ControlPlaneConfig["settings"]["laneSelection"]
}

export type SubagentExecutionDiagnostics = {
  mode: ControlPlaneConfig["settings"]["subagentExecution"]["mode"]
  availableLanes: string[]
  commandsByLane: Record<string, string>
}

export type PolicyDiagnostics = {
  authorityWorkloadMappingCount: number
  authorityRuleCount: number
  evidenceDetectedPathCount: number
  evidenceIgnoredForRuntime: boolean
}

const STAGE_1_SUGGESTION_MESSAGE =
  "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session."
const BUILTIN_ENGINE_BUNDLE_MAX_CHARS = 160
const CONTEXT_LIFECYCLE_STAGE_PRIORITY = {
  bootstrap: 0,
  design: 1,
  prepare_workspace: 2,
  plan: 3,
  execute_task: 4,
  review: 5,
  verify: 6,
  integrate_branch: 7,
  checkpoint: 8,
  resume: 9,
} as const satisfies Record<ContextLifecycleStage, number>

export type RoutingValidationSummary = {
  defaultRoutedPhases: string[]
  explicitRoutedPhases: string[]
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

export function summarizeLaneExplainability(resolved: ResolvedControlPlane): LaneExplainability {
  const laneState = (resolved as ResolvedControlPlane & { laneState?: ResolvedControlPlane["laneState"] }).laneState
    ?? resolveLaneState(resolved.config, resolved.activePreset)
  const laneSelection = { ...(resolved.config.settings.laneSelection ?? { mode: "suggest" as const }) }
  const mode = laneState.mode ?? laneSelection.mode

  return {
    allowedLanes: [...laneState.allowedLanes],
    presetDefaultLane: laneState.presetDefaultLane,
    defaultLane: laneState.defaultLane,
    effectiveLane: laneState.effectiveLane,
    runtimeLane: laneState.runtimeLane,
    mode,
    nonApplyingReason: laneState.nonApplyingReason ?? (mode === "suggest" ? STAGE_1_SUGGESTION_MESSAGE : undefined),
    laneSelection,
  }
}

export function summarizeSubagentExecutionDiagnostics(resolved: ResolvedControlPlane): SubagentExecutionDiagnostics {
  const laneState = (resolved as ResolvedControlPlane & { laneState?: ResolvedControlPlane["laneState"] }).laneState
    ?? resolveLaneState(resolved.config, resolved.activePreset)
  const availableLanes = [...laneState.allowedLanes]
  const units = listLaneExecutionUnits({
    activePresetKey: resolved.activePreset.key,
    activePreset: { usesLanes: availableLanes },
  })

  return {
    mode: resolved.config.settings.subagentExecution?.mode ?? "suggest",
    availableLanes,
    commandsByLane: Object.fromEntries(
      units.map((unit) => [unit.lane, unit.commandFileName.replace(/\.md$/, "")]),
    ),
  }
}

export function buildOpenCodeStatusState(input: {
  host: SupportedSuperpowersHost | "qwen"
  source: ResolvedControlPlane["source"]
  enabled: boolean
  compatibility: SuperpowersCompatibilityResult | null
  effectiveSourceReadiness?: EffectiveSourceReadiness
  artifactSummary: ControlPlaneArtifactSummary
}): OpenCodeStatusState {
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

  const unavailableReadiness = Object.values(input.effectiveSourceReadiness ?? {}).find(isSupportedUnavailableReadinessEntry)

  if (unavailableReadiness) {
    return {
      code: "upstream_not_detected",
      category: "upstream",
      reason: unavailableReadiness.readiness.availability.reason,
    }
  }

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

export function summarizeEffectiveSourceEntries(resolved: ResolvedControlPlane) {
  const effectiveSources = resolveEffectiveSources({
    workflow: resolved.config.workflow,
    effectiveSources: normalizeWorkflowSourceRoutes(
      resolved.config.workflow,
      resolved.effectiveSources,
    ),
  })

  return Object.fromEntries(
    Object.entries(effectiveSources)
      .filter((entry): entry is [string, WorkflowSourceKind] => entry[1] !== undefined)
      .map(([canonicalRoute, source]) => [
        canonicalRoute,
        getWorkflowSourceEntry(canonicalRoute as CanonicalRouteId, source),
      ]),
  ) as Partial<Record<CanonicalRouteId, WorkflowSourceEntry>>
}

export async function summarizeEffectiveSourceReadiness(input: {
  resolved: ResolvedControlPlane
  evaluateReadiness: (sourceEntry: WorkflowSourceEntry) => Promise<ProjectionReadiness>
}): Promise<EffectiveSourceReadiness> {
  const sourceEntries = Object.entries(summarizeEffectiveSourceEntries(input.resolved))
    .filter((entry): entry is [string, WorkflowSourceEntry] => entry[1] !== undefined)
  const readinessEntries = await Promise.all(
    sourceEntries.map(async ([canonicalRoute, sourceEntry]) => ([
      canonicalRoute as CanonicalRouteId,
      {
        ...sourceEntry,
        readiness: await input.evaluateReadiness(sourceEntry),
      },
    ] as const)),
  )

  return Object.fromEntries(readinessEntries) as EffectiveSourceReadiness
}

export function summarizeSourceToolRoleExplainability(
  resolved: ResolvedControlPlane,
): SourceToolRoleExplainability {
  const workflowSources = [...new Set(
    Object.values(summarizeEffectiveSourceEntries(resolved))
      .flatMap((entry) => (entry ? [entry.source] : [])),
  )].sort((left, right) => WORKFLOW_SOURCE_KINDS.indexOf(left) - WORKFLOW_SOURCE_KINDS.indexOf(right))

  const artifactDialects = [...new Set(
    (resolved.contextIndex?.artifacts ?? [])
      .flatMap((artifact) => {
        const dialect = classifyOpenSpecArtifact(artifact.path)?.dialect
        return dialect ? [dialect] : []
      }),
  )].sort()

  return {
    workflowSources,
    artifactDialects,
    externalCapabilityScope: {
      included: [...EXTERNAL_CAPABILITY_SCOPE],
      excluded: [...EXCLUDED_EXTERNAL_CAPABILITY_SCOPE],
    },
    lines: [
      `Workflow sources: ${workflowSources.join(", ")}`,
      `Artifact dialects: ${artifactDialects.join(", ") || "none detected"}`,
      "External capability policy targets user-installed skills, plugins, MCPs, and providers only.",
      "Excluded from OMS capability policy: upstream workflow-internal skills.",
    ],
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

function getEffectiveSources(config: ControlPlaneConfig, preset: ControlPlanePreset) {
  return normalizeWorkflowSourceRoutes(
    config.workflow,
    {
      ...(preset.sourcePreset ? (config.sourcePresets[preset.sourcePreset]?.routes ?? {}) : {}),
      ...(preset.sourceRoutes ?? {}),
    },
  )
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
  workflow: ControlPlaneConfig["workflow"]
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
      if (input.workflow.kind === "direct" && input.host === "opencode") {
        return null
      }

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

function resolveLaneState(
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

function clearInvalidSettingsDefaultLane(settings: ControlPlaneConfig["settings"], preset: ControlPlanePreset | undefined) {
  if (!settings.defaultLane || !preset) {
    return settings
  }

  return (preset.usesLanes ?? []).includes(settings.defaultLane)
    ? settings
    : { ...settings, defaultLane: undefined }
}

function clearInvalidDocumentDefaultLane(
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

function validateControlPlaneConfig(config: ControlPlaneConfig, runtimeLane?: string) {
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

function clonePreset(preset: ControlPlanePreset): ControlPlanePreset {
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

function cloneContextCompression<
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

function cloneLayeredConfig(config: LayeredControlPlaneConfigInput): LayeredControlPlaneConfigInput {
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

async function resolveContextIndex(input: Pick<ResolveControlPlaneInput, "cwd" | "buildContextIndex"> & {
  contextProviders: readonly ResolvedContextProvider[]
}): Promise<ContextIndex> {
  const buildIndex = input.buildContextIndex ?? buildContextIndex

  try {
    const contextIndex = await buildIndex({ cwd: input.cwd, contextProviders: input.contextProviders })
    const providers = contextIndex.providers ?? summarizeContextProviders(input.contextProviders)

    return {
      ...contextIndex,
      ...(providers ? { providers } : {}),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const providers = summarizeContextProviders(input.contextProviders)

    return {
      artifacts: [],
      warnings: [`Failed to build context index: ${message}`],
      ...(providers ? { providers } : {}),
    }
  }
}

function resolveIndexedLifecycleStage(
  contextIndex: ContextIndex,
  workflowKind: ControlPlaneConfig["workflow"]["kind"],
): ContextLifecycleStage {
  const indexedStage = contextIndex.artifacts
    .flatMap((artifact) => (artifact.lifecycleStage ? [artifact.lifecycleStage] : []))
    .sort((left, right) => CONTEXT_LIFECYCLE_STAGE_PRIORITY[right] - CONTEXT_LIFECYCLE_STAGE_PRIORITY[left])[0]

  if (indexedStage) {
    return indexedStage
  }

  return workflowKind === "superpowers" ? "plan" : "execute_task"
}

function resolveContextCompressionCanonicalRoute(input: {
  workflow: ControlPlaneConfig["workflow"]
  effectiveSources: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
  lifecycleStage: ContextLifecycleStage
}): CanonicalRouteId {
  if (input.workflow.kind === "direct") {
    return Object.keys(input.effectiveSources).find((canonicalRoute) => canonicalRoute.startsWith("intent.")) as CanonicalRouteId
      ?? "intent.default" as CanonicalRouteId
  }

  switch (input.lifecycleStage) {
    case "design":
    case "bootstrap":
      return "phase.brainstorm"
    case "plan":
    case "checkpoint":
    case "resume":
      return "phase.plan"
    case "review":
      return "phase.review"
    case "verify":
      return "phase.verify"
    default:
      return "phase.execute"
  }
}

function resolveAuthoredContextCompressionFromLayers(
  layers: Array<{ path: string; config: LayeredControlPlaneConfigInput }>,
): NonNullable<LayeredControlPlaneConfigInput["settings"]>["contextCompression"] | undefined {
  let merged: NonNullable<LayeredControlPlaneConfigInput["settings"]>["contextCompression"] | undefined

  for (const layer of layers) {
    const authoredContextCompression = layer.config.settings?.contextCompression
    if (!authoredContextCompression) {
      continue
    }

    merged = merged
      ? {
          ...merged,
          ...authoredContextCompression,
          moments: {
            ...merged.moments,
            ...authoredContextCompression.moments,
          },
          safety: {
            ...merged.safety,
            ...authoredContextCompression.safety,
          },
        }
      : cloneContextCompression(authoredContextCompression)

    if (Object.prototype.hasOwnProperty.call(authoredContextCompression, "preset")
      && authoredContextCompression.preset === null) {
      merged = { ...merged, preset: null }
    }
  }

  return merged ? cloneContextCompression(merged) : undefined
}

function getBoundaryRelevantAuthoritativeArtifacts(
  artifacts: ContextArtifact[],
  lifecycleStage: ContextLifecycleStage,
) {
  return artifacts.filter((artifact) => artifact.authority === "authoritative" && artifact.lifecycleStage === lifecycleStage)
}

function deriveBestEffortCompressionFreshness(
  artifacts: ContextArtifact[],
): ContextArtifactFreshness | undefined {
  const freshness: ContextArtifactFreshness = {}
  const headCommits = new Set(
    artifacts.flatMap((artifact) => (artifact.headCommit === undefined ? [] : [artifact.headCommit])),
  )
  const reviewedCommits = new Set(
    artifacts.flatMap((artifact) => (artifact.reviewedCommit === undefined ? [] : [artifact.reviewedCommit])),
  )
  const commitsSinceArtifact = artifacts
    .flatMap((artifact) => (artifact.commitsSinceArtifact === undefined ? [] : [artifact.commitsSinceArtifact]))
  const staleAfter = artifacts
    .flatMap((artifact) => (artifact.staleAfter === undefined ? [] : [artifact.staleAfter]))
    .sort()[0]
  const hasConflictingCommitMetadata = headCommits.size > 1 || reviewedCommits.size > 1
  const hasIncompleteFreshnessMetadata = artifacts.some((artifact) => !hasCompleteFreshnessStrategy(artifact))

  if (headCommits.size === 1) {
    freshness.headCommit = Array.from(headCommits)[0]
  }

  if (reviewedCommits.size === 1) {
    freshness.reviewedCommit = Array.from(reviewedCommits)[0]
  }

  if (commitsSinceArtifact.length > 0) {
    freshness.commitsSinceArtifact = Math.max(...commitsSinceArtifact)
  }

  if (hasConflictingCommitMetadata || hasIncompleteFreshnessMetadata) {
    freshness.commitsSinceArtifact = Math.max(freshness.commitsSinceArtifact ?? 0, 1)
  }

  if (staleAfter !== undefined) {
    freshness.staleAfter = staleAfter
  }

  return Object.keys(freshness).length > 0 ? freshness : undefined
}

function hasCompleteFreshnessStrategy(artifact: ContextArtifact) {
  return artifact.staleAfter !== undefined
    || artifact.commitsSinceArtifact !== undefined
    || (artifact.headCommit !== undefined && artifact.reviewedCommit !== undefined)
}

async function buildCompressionEngineBundle(input: {
  cwd: string
  readFile?: ResolveControlPlaneInput["readFile"]
  selection: EffectiveContextPackSelection & { lifecycleStage: ContextLifecycleStage }
  policy: EffectiveContextCompressionPolicy
}): Promise<{
  bundle: EnhancedCompressionBundle
  unreadableSelectedAuthoritativeArtifactPaths: string[]
}> {
  const readFile = input.readFile ?? defaultReadFile
  const artifactReadResults = await Promise.all(input.selection.artifacts.map(async (artifact) => {
    try {
      return {
        artifact: {
          ...artifact,
          content: (assertSafeArtifactPath(input.cwd, artifact.path), await readFile(path.join(input.cwd, artifact.path))),
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      return {
        artifact: {
          ...artifact,
          content: "",
        },
        warning: `Failed to read context artifact ${artifact.path}: ${message}`,
        unreadableSelectedAuthoritativeArtifactPath: artifact.authority === "authoritative"
          ? artifact.path
          : undefined,
      }
    }
  }))
  const artifactsWithContent = artifactReadResults.map((result) => result.artifact)
  const warnings = artifactReadResults.flatMap((result) => result.warning ? [result.warning] : [])
  const unreadableSelectedAuthoritativeArtifactPaths = artifactReadResults.flatMap((result) => (
    result.unreadableSelectedAuthoritativeArtifactPath
      ? [result.unreadableSelectedAuthoritativeArtifactPath]
      : []
  ))

  return {
    bundle: enhanceCompressionBundleWithSummary({
      bundle: buildBuiltinCompressionBundle({
        selection: {
          ...input.selection,
          policy: input.policy,
          artifacts: artifactsWithContent,
        },
        maxCharsPerArtifact: BUILTIN_ENGINE_BUNDLE_MAX_CHARS,
      }),
      warnings,
    }),
    unreadableSelectedAuthoritativeArtifactPaths,
  }
}

async function resolveEffectiveContextCompression(input: {
  command: ResolveControlPlaneInput["command"]
  cwd: string
  now?: string
  readFile?: ResolveControlPlaneInput["readFile"]
  config: ControlPlaneConfig
  layers: Array<{ path: string; config: LayeredControlPlaneConfigInput }>
  contextIndex: ContextIndex
  effectiveSources: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
  contextProviders: readonly ResolvedContextProvider[]
  policyResolution?: ResolvedPolicyFamilies
}): Promise<ResolvedControlPlane["contextCompression"]> {
  const lifecycleHint = resolveIndexedLifecycleStage(input.contextIndex, input.config.workflow.kind)
  const canonicalRoute = resolveContextCompressionCanonicalRoute({
    workflow: input.config.workflow,
    effectiveSources: input.effectiveSources,
    lifecycleStage: lifecycleHint,
  })
  const resolvedSource = input.effectiveSources[canonicalRoute]
    ?? (input.config.workflow.kind === "direct" ? "direct" : "superpowers")
  const sourceEntry = getWorkflowSourceEntry(canonicalRoute, resolvedSource)
  const lifecycleStage = deriveLifecycleStage({
    command: input.command,
    canonicalRoute,
    sourceEntry,
    lifecycleHint,
  })
  const authoredContextCompression = resolveAuthoredContextCompressionFromLayers(input.layers)
  let selectorCompressionPresetOverride: string | null | undefined
  let hasSelectorCompressionPresetOverride = false

  for (const rule of input.config.policyRules ?? []) {
    if (!input.policyResolution) {
      break
    }

    if (rule.selector.path && input.policyResolution.snapshot.relativePath.length === 0) {
      continue
    }

    if (!matchesPolicySelector(input.policyResolution.snapshot, rule.selector)) {
      continue
    }

    if (Object.prototype.hasOwnProperty.call(rule.policy.contextPolicy ?? {}, "compressionPreset")) {
      hasSelectorCompressionPresetOverride = true
      selectorCompressionPresetOverride = rule.policy.contextPolicy?.compressionPreset
    }
  }

  const selectorContextCompression = hasSelectorCompressionPresetOverride
    ? { preset: selectorCompressionPresetOverride ?? null }
    : undefined
  const policy = resolveContextCompressionPolicy({
    compressionPresets: input.config.compressionPresets,
    contextCompression: {
      ...authoredContextCompression,
      ...selectorContextCompression,
    },
  })
  const selection = selectContextPacks({
    lifecycleStage,
    canonicalRoute,
    resolvedSource,
    artifacts: input.contextIndex.artifacts,
    policy,
    contextProviders: input.contextProviders,
  })
  const resolvedSelection = {
    lifecycleStage,
    ...selection,
  }
  const boundaryRelevantArtifacts = getBoundaryRelevantAuthoritativeArtifacts(input.contextIndex.artifacts, lifecycleStage)
  let readiness = evaluateCompressionReadiness({
    lifecycleStage,
    policy,
    artifacts: boundaryRelevantArtifacts,
    unresolvedDecisions: [],
    freshness: deriveBestEffortCompressionFreshness(boundaryRelevantArtifacts),
    now: input.now,
    contextProviders: input.contextProviders,
  })
  const { bundle: engineBundle, unreadableSelectedAuthoritativeArtifactPaths } = await buildCompressionEngineBundle({
    cwd: input.cwd,
    readFile: input.readFile,
    selection: resolvedSelection,
    policy,
  })

  if (unreadableSelectedAuthoritativeArtifactPaths.length > 0) {
    readiness = {
      ...readiness,
      state: "unsafe",
      reason: "One or more selected authoritative artifacts could not be read for compression diagnostics.",
    }
  }

  return {
    policy,
    selection: resolvedSelection,
    readiness,
    engineBundle,
  }
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

function buildPolicyRuntimeSnapshot(input: {
  cwd: string
  command: ControlPlaneCommandKey
  config: ControlPlaneConfig
  authorityWorkloadMappings: Array<{ path: string[]; workloadTags: string[] }>
  contextIndex: ContextIndex
  effectiveSources: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
  runtimeLifecycleStage?: ContextLifecycleStage
  runtimeWorkflowSource?: WorkflowSourceKind
  runtimeRelativePath?: string
  runtimeWorkloadTags?: string[]
  runtimeModalityRequirements?: string[]
  runtimeAgentRole?: "primary" | "subagent"
}) {
  const defaultLifecycleStage = input.config.workflow.kind === "superpowers" ? "plan" : "execute_task"
  const lifecycleHint = input.runtimeLifecycleStage ?? defaultLifecycleStage
  const canonicalRoute = resolveContextCompressionCanonicalRoute({
    workflow: input.config.workflow,
    effectiveSources: input.effectiveSources,
    lifecycleStage: lifecycleHint,
  })
  const resolvedSource = input.runtimeWorkflowSource
    ?? input.effectiveSources[canonicalRoute]
    ?? (input.config.workflow.kind === "direct" ? "direct" : "superpowers")
  const sourceEntry = getWorkflowSourceEntry(canonicalRoute, resolvedSource)
  const lifecycleStage = input.runtimeLifecycleStage
    ?? deriveLifecycleStage({
      command: input.command,
      canonicalRoute,
      sourceEntry,
      lifecycleHint,
    })
  const relativePath = input.runtimeRelativePath ?? ""
  const authorityWorkloadTags = relativePath.length > 0
    ? [...new Set(
        input.authorityWorkloadMappings.flatMap((mapping) => (
          mapping.path.some((pattern) => matchesGlobPattern(pattern, relativePath))
            ? mapping.workloadTags
            : []
        ))
      )]
    : []

  const snapshot = buildRuntimeContextSnapshot({
    cwd: input.cwd,
    relativePath,
    lifecycleStage,
    workflowSource: resolvedSource,
    agentRole: input.runtimeAgentRole ?? "primary",
    workloadTags: input.runtimeWorkloadTags ?? authorityWorkloadTags,
    modalityRequirements: input.runtimeModalityRequirements ?? [],
  })

  const provenance: RuntimeSelectorProvenance = {
    lifecycleStage: input.runtimeLifecycleStage ? "explicit" : "defaulted",
    workflowSource: input.runtimeWorkflowSource ? "explicit" : "derived",
    relativePath: input.runtimeRelativePath ? "explicit" : "defaulted",
    workloadTags: input.runtimeWorkloadTags ? "explicit" : "derived",
    modalityRequirements: input.runtimeModalityRequirements ? "explicit" : "defaulted",
    agentRole: input.runtimeAgentRole ? "explicit" : "defaulted",
  }

  return { snapshot, provenance }
}

function buildPolicyDiagnostics(
  config: ControlPlaneConfig,
  layers: Array<{ path: string; config: LayeredControlPlaneConfigInput }>,
): PolicyDiagnostics | undefined {
  const authorityWorkloadMappingCount = layers.reduce(
    (count, layer) => count + (layer.config.authority?.workloadMappings.length ?? 0),
    0,
  )
  const authorityRuleCount = layers.reduce(
    (count, layer) => count + (layer.config.authority?.policyRules.length ?? 0),
    0,
  )
  const evidenceDetectedPathCount = layers.reduce(
    (count, layer) => count + (layer.config.evidence?.detectedPaths.length ?? 0),
    0,
  )

  if (authorityWorkloadMappingCount === 0 && authorityRuleCount === 0 && evidenceDetectedPathCount === 0) {
    return undefined
  }

  return {
    authorityWorkloadMappingCount,
    authorityRuleCount,
    evidenceDetectedPathCount,
    evidenceIgnoredForRuntime: evidenceDetectedPathCount > 0,
  }
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
      throw new Error(`Command ${input.command} requires a real config source`)
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
