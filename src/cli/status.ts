import { summarizeControlPlaneArtifacts, summarizeEffectiveSourceEntries, summarizeEffectiveSourceReadiness, summarizeLaneExplainability, summarizeSourceToolRoleExplainability, summarizeSubagentExecutionDiagnostics, type ResolvedControlPlane } from "../control-plane/index.js"
import { buildOpenCodeStatusState, buildOpenCodeNextAction } from "../control-plane/index.js"
import { assertWorkflowSupport, formatControlPlaneSource, summarizeContextIndex, summarizeContextCompression, summarizeContextProviders, summarizeRecoveryWarnings, summarizePolicyResolution, resolveCompatibilityForCliHost, maybeResolveCompatibility, createProjectionReadinessResolver, shouldSkipExpectedArtifactBuild, createEmptyArtifactInspection } from "./shared.js"
import { getExpectedArtifacts, inspectArtifacts, formatArtifactInspection } from "./artifacts.js"
import type { CliDeps, CliHost, CliRuntimeSelectorInputs } from "./types.js"

export async function buildControlPlaneStatus(
  cwd: string,
  explicitPath: string | undefined,
  host: CliHost,
  runtimeLane: string | undefined,
  runtimeSelectorInputs: CliRuntimeSelectorInputs,
  deps: CliDeps,
) {
  const resolved = await deps.resolveControlPlane({ command: "status", cwd, explicitPath, runtimeLane, ...runtimeSelectorInputs })
  assertWorkflowSupport(resolved.config, "status", host)
  const contextIndex = summarizeContextIndex(resolved.contextIndex)
  const contextCompression = summarizeContextCompression(resolved.contextCompression)
  const contextProviders = summarizeContextProviders(resolved.contextProviders)
  const warnings = summarizeRecoveryWarnings(resolved.recovery)
  const policyResolution = summarizePolicyResolution(resolved.policyResolution)
  const policyDiagnostics = resolved.policyDiagnostics
  const compatibility = await maybeResolveCompatibility(
    resolved.config,
    host,
    () => resolveCompatibilityForCliHost(host, resolved.config.settings.superpowersCompatibility.mode, deps, resolved.config.settings.superpowersCompatibility.allowUntested, resolved.config.settings.superpowersCompatibility.overrides),
  )
  const effectiveSourceReadiness = await summarizeEffectiveSourceReadiness({
    resolved,
    evaluateReadiness: createProjectionReadinessResolver({
      cwd,
      host,
      config: resolved.config,
      deps,
      compatibility,
    }),
  })
  const skipExpectedArtifacts = shouldSkipExpectedArtifactBuild(host, effectiveSourceReadiness)
  const expectedArtifacts = resolved.config.settings.enabled && !skipExpectedArtifacts
    ? await getExpectedArtifacts(cwd, resolved.config, resolved.laneState, host, deps)
    : []
  const artifacts = skipExpectedArtifacts
    ? createEmptyArtifactInspection()
    : await inspectArtifacts(
      cwd,
      expectedArtifacts,
      host,
      deps,
    )
  const formattedArtifacts = formatArtifactInspection(artifacts)
  const openCodeStatus = host === "opencode"
    ? (() => {
      const artifactSummary = summarizeControlPlaneArtifacts({
        present: artifacts.expectedPresent,
        missing: artifacts.missing,
        stale: artifacts.stale,
      })
      const state = buildOpenCodeStatusState({
        host,
        source: resolved.source,
        enabled: resolved.config.settings.enabled,
        compatibility,
        effectiveSourceReadiness,
        artifactSummary,
      })
      const nextAction = buildOpenCodeNextAction({
        host,
        workflow: resolved.config.workflow,
        state,
        activePresetShort: resolved.activePreset.preset.short,
      })

      return { state, ...(nextAction ? { nextAction } : {}), artifactSummary }
    })()
    : undefined
  const subagentExecution = host === "opencode" && resolved.config.workflow.kind === "superpowers"
    ? summarizeSubagentExecutionDiagnostics(resolved)
    : undefined

  return {
    enabled: resolved.config.settings.enabled,
    activePreset: {
      key: resolved.activePreset.key,
      label: resolved.activePreset.preset.label,
      short: resolved.activePreset.preset.short,
      description: resolved.activePreset.preset.description,
    },
    presets: Object.entries(resolved.config.presets)
      .map(([key, preset]) => ({ key, label: preset.label, short: preset.short, description: preset.description }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    source: formatControlPlaneSource(resolved),
    sourceToolRoles: summarizeSourceToolRoleExplainability(resolved),
    ...(contextProviders ? { contextProviders } : {}),
    ...(contextIndex ? { contextIndex } : {}),
    ...(contextCompression ? { contextCompression } : {}),
    ...(policyResolution ? { policyResolution } : {}),
    ...(policyDiagnostics ? { policyDiagnostics } : {}),
    ...(warnings ? { warnings } : {}),
    effectiveSources: resolved.effectiveSources,
    effectiveSourceEntries: summarizeEffectiveSourceEntries(resolved),
    effectiveSourceReadiness,
    host,
    compatibility,
    artifacts: formattedArtifacts,
    ...summarizeLaneExplainability(resolved),
    ...(subagentExecution ? { subagentExecution } : {}),
    ...openCodeStatus,
  }
}
