import type {
  ControlPlaneCompressionPreset,
  ControlPlaneContextCompressionEngine,
  ControlPlaneContextCompressionMode,
  ControlPlaneContextCompressionMoments,
  ControlPlaneContextCompressionSafety,
  ControlPlaneContextInlineLevel,
} from "./config.js"
import type { ContextArtifact } from "./context-artifacts.js"
import { summarizeContextProviders, type ContextProviderAvailabilitySummary } from "./context-index.js"
import type { ContextLifecycleStage } from "./context-lifecycle.js"
import type { ResolvedContextProvider } from "./context-providers.js"
import type { CanonicalRouteId, WorkflowSourceKind } from "./workflow-sources.js"

export type EffectiveContextCompressionPolicy = {
  preset?: string
  mode: ControlPlaneContextCompressionMode
  engine: ControlPlaneContextCompressionEngine
  inlineLevel: ControlPlaneContextInlineLevel
  moments: ControlPlaneContextCompressionMoments
  safety: ControlPlaneContextCompressionSafety
}

export type ContextPackId = "spec-core" | "plan-core" | "knowledge-support"

export type EffectiveContextPackSelection = {
  packIds: ContextPackId[]
  artifacts: ContextArtifact[]
  providers?: ContextProviderAvailabilitySummary
}

type ContextPackSelectionPolicy = {
  inlineLevel: ControlPlaneContextInlineLevel
  moments?: Partial<ControlPlaneContextCompressionMoments>
}

type ContextCompressionOverrideInput = {
  preset?: string | null
  mode?: ControlPlaneContextCompressionMode
  engine?: ControlPlaneContextCompressionEngine
  inlineLevel?: ControlPlaneContextInlineLevel
  moments?: Partial<ControlPlaneContextCompressionMoments>
  safety?: Partial<ControlPlaneContextCompressionSafety>
}

type ContextCompressionPresetInput = Partial<ControlPlaneCompressionPreset>

const DEFAULT_CONTEXT_COMPRESSION_MOMENTS: ControlPlaneContextCompressionMoments = {
  subagentHandoff: false,
  planCheckpoint: false,
  reviewCheckpoint: false,
  verificationCheckpoint: false,
  sessionResume: false,
  sourceSwitch: false,
  branchIntegration: false,
}

const DEFAULT_CONTEXT_COMPRESSION_SAFETY: ControlPlaneContextCompressionSafety = {
  allowConditional: false,
  requireFreshVerification: true,
}

export function resolveContextCompressionPolicy(input: {
  compressionPresets?: Record<string, ContextCompressionPresetInput>
  contextCompression?: ContextCompressionOverrideInput
}): EffectiveContextCompressionPolicy {
  const preset = input.contextCompression?.preset
  const presetName = typeof preset === "string" ? preset : undefined
  const selectedPreset = presetName ? input.compressionPresets?.[presetName] : undefined

  return {
    ...(selectedPreset && presetName ? { preset: presetName } : {}),
    mode: input.contextCompression?.mode ?? selectedPreset?.mode ?? "manual",
    engine: input.contextCompression?.engine ?? selectedPreset?.engine ?? "builtin",
    inlineLevel: input.contextCompression?.inlineLevel ?? selectedPreset?.inlineLevel ?? "minimal",
    moments: {
      ...DEFAULT_CONTEXT_COMPRESSION_MOMENTS,
      ...selectedPreset?.moments,
      ...input.contextCompression?.moments,
    },
    safety: {
      ...DEFAULT_CONTEXT_COMPRESSION_SAFETY,
      ...selectedPreset?.safety,
      ...input.contextCompression?.safety,
    },
  }
}

export function selectContextPacks(input: {
  lifecycleStage: ContextLifecycleStage
  canonicalRoute: CanonicalRouteId
  resolvedSource: WorkflowSourceKind
  artifacts: ContextArtifact[]
  policy: ContextPackSelectionPolicy
  contextProviders?: readonly ResolvedContextProvider[]
}): EffectiveContextPackSelection {
  const packIds: ContextPackId[] = []
  const providers = summarizeContextProviders(input.contextProviders)
  const hasArtifact = (kind: ContextArtifact["kind"]) => input.artifacts.some((artifact) => artifact.kind === kind)
  const canSelectPlanPacks = input.lifecycleStage === "plan"
    && input.canonicalRoute === "phase.plan"
    && (input.resolvedSource === "superpowers" || input.resolvedSource === "gstack")
    && input.policy.moments?.planCheckpoint === true

  if (canSelectPlanPacks) {
    if (hasArtifact("spec")) {
      packIds.push("spec-core")
    }

    if (hasArtifact("plan")) {
      packIds.push("plan-core")
    }
  }

  if (input.policy.inlineLevel !== "minimal" && hasArtifact("knowledge")) {
    packIds.push("knowledge-support")
  }

  const selectedPackIds = new Set(packIds)

  return {
    packIds,
    artifacts: input.artifacts.filter((artifact) =>
      (artifact.kind === "spec" && selectedPackIds.has("spec-core"))
      || (artifact.kind === "plan" && selectedPackIds.has("plan-core"))
      || (artifact.kind === "knowledge" && selectedPackIds.has("knowledge-support")),
    ),
    ...(providers ? { providers } : {}),
  }
}
