import path from "node:path"
import type { ControlPlaneConfig, LayeredControlPlaneConfigInput } from "../config.js"
import { defaultReadFile } from "../config.js"
import type { ContextArtifact, ContextArtifactFreshness } from "../context-artifacts.js"
import {
  buildBuiltinCompressionBundle,
  enhanceCompressionBundleWithSummary,
  evaluateCompressionReadiness,
  type EnhancedCompressionBundle,
} from "../context-compression.js"
import {
  resolveContextCompressionPolicy,
  selectContextPacks,
  type EffectiveContextCompressionPolicy,
  type EffectiveContextPackSelection,
} from "../context-packs.js"
import type { ContextIndex } from "../context-index.js"
import { assertSafeArtifactPath } from "../materialize.js"
import { deriveLifecycleStage, type ContextLifecycleStage } from "../context-lifecycle.js"
import { matchesPolicySelector } from "../policy-selectors.js"
import { getWorkflowSourceEntry } from "../workflow-sources.js"
import type { CanonicalRouteId, WorkflowSourceKind } from "../workflow-sources.js"
import type { ResolvedContextProvider } from "../context-providers.js"
import type { ResolvedPolicyFamilies } from "../policy-resolution.js"
import type { ResolvedControlPlane, ResolveControlPlaneInput } from "./types.js"
import { cloneContextCompression } from "./state-write.js"

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

export function resolveContextCompressionCanonicalRoute(input: {
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

export async function buildCompressionEngineBundle(input: {
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

export async function resolveEffectiveContextCompression(input: {
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
