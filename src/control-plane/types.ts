import type {
  ControlPlaneCommandKey,
  ControlPlaneConfig,
  ControlPlanePreset,
  LayeredControlPlaneConfigInput,
  LoadedControlPlaneConfig,
  LoadControlPlaneConfigInput,
} from "../config.js"
import type { ResolvedPolicyFamilies, RuntimeSelectorProvenance } from "../policy-resolution.js"
import type { ContextLifecycleStage } from "../context-lifecycle.js"
import type { ContextArtifact, ContextArtifactFreshness } from "../context-artifacts.js"
import type { CompressionReadiness, EnhancedCompressionBundle } from "../context-compression.js"
import type {
  EffectiveContextCompressionPolicy,
  EffectiveContextPackSelection,
} from "../context-packs.js"
import type { ContextIndex } from "../context-index.js"
import type { BuiltInPhase } from "../router.js"
import type { SuperpowersCompatibilityResult, SupportedSuperpowersHost } from "../superpowers-compatibility.js"
import type { ProjectionReadiness } from "../upstream-readiness.js"
import type {
  CanonicalRouteId,
  WorkflowSourceEntry,
  WorkflowSourceKind,
} from "../workflow-sources.js"
import type {
  ResolvedContextProvider,
  ResolveContextProvidersInput,
} from "../context-providers.js"

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

export type RoutingValidationSummary = {
  defaultRoutedPhases: string[]
  explicitRoutedPhases: string[]
  unusedProfiles: string[]
  reuseRelationship:
    | { kind: "none"; parentPresetKey: null; resolvable: true }
    | { kind: "extends"; parentPresetKey: string; resolvable: boolean }
}

export const STAGE_1_SUGGESTION_MESSAGE =
  "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session."
