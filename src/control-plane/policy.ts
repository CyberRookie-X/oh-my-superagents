import type { ControlPlaneConfig, ControlPlaneCommandKey, LayeredControlPlaneConfigInput } from "../config.js"
import { deriveLifecycleStage, type ContextLifecycleStage } from "../context-lifecycle.js"
import type { CanonicalRouteId, WorkflowSourceKind } from "../workflow-sources.js"
import { getWorkflowSourceEntry } from "../workflow-sources.js"
import { buildRuntimeContextSnapshot } from "../policy-selectors.js"
import { type RuntimeSelectorProvenance } from "../policy-resolution.js"
import { matchesGlobPattern } from "../utils/glob-utils.js"
import { buildContextIndex as buildCtxIndex, summarizeContextProviders, type ContextIndex } from "../context-index.js"
import type { ResolvedContextProvider } from "../context-providers.js"
import type { PolicyDiagnostics, ResolveControlPlaneInput } from "./types.js"
import { resolveContextCompressionCanonicalRoute } from "./compression.js"

export function buildPolicyRuntimeSnapshot(input: {
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

export async function resolveContextIndex(input: Pick<ResolveControlPlaneInput, "cwd" | "buildContextIndex"> & {
  contextProviders: readonly ResolvedContextProvider[]
}): Promise<ContextIndex> {
  const buildIndex = input.buildContextIndex ?? buildCtxIndex

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

export function buildPolicyDiagnostics(
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
