import { summarizeControlPlaneArtifacts, summarizeEffectiveSourceEntries, summarizeEffectiveSourceReadiness, summarizeLaneExplainability, summarizeRoutingValidation, summarizeSubagentExecutionDiagnostics, type ResolvedControlPlane } from "../control-plane/index.js"
import { listRenderedOpenCodeControlPlaneCommands } from "../opencode.js"
import { assertWorkflowSupport, filterRenderedOpenCodeCommandsForWorkflow, filterNamedCommandsForWorkflow, formatControlPlaneSource, summarizeContextIndex, summarizeContextCompression, summarizeContextProviders, summarizeRecoveryWarnings, summarizePolicyResolution, resolveCompatibilityForCliHost, maybeResolveCompatibility, createProjectionReadinessResolver, shouldSkipExpectedArtifactBuild, createEmptyArtifactInspection } from "./shared.js"
import { getExpectedArtifacts, inspectArtifacts, formatArtifactInspection } from "./artifacts.js"
import { buildOpenCodeCodexFastRuntimeDiagnostics } from "./diagnostics.js"
import type { CliDeps, CliHost, CliRuntimeSelectorInputs } from "./types.js"

export async function buildControlPlaneDoctor(
  cwd: string,
  explicitPath: string | undefined,
  host: CliHost,
  runtimeLane: string | undefined,
  runtimeSelectorInputs: CliRuntimeSelectorInputs,
  deps: CliDeps,
) {
  const resolved = await deps.resolveControlPlane({ command: "doctor", cwd, explicitPath, runtimeLane, ...runtimeSelectorInputs })
  assertWorkflowSupport(resolved.config, "doctor", host)
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

  const doctorIssues: Array<{
    level: "error" | "warning"
    message: string
    suggestion: string
  }> = []

  if (compatibility?.status === "untested") {
    const allowUntested = resolved.config.settings.superpowersCompatibility.allowUntested
    const level = allowUntested === "block" ? "error" as const : "warning" as const
    doctorIssues.push({
      level,
      message: `Superpowers version ${compatibility.detectedVersion} is untested with this release of oh-my-superagents.`,
      suggestion: allowUntested === "block"
        ? "Set compatibility.allowUntested to 'warn' or upgrade/downgrade superpowers."
        : "Consider testing thoroughly before production use.",
    })
  }
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
  const artifactSummary = host === "opencode"
    ? summarizeControlPlaneArtifacts({
      present: artifacts.expectedPresent,
      missing: artifacts.missing,
      stale: artifacts.stale,
    })
    : undefined
  const subagentExecution = host === "opencode" && resolved.config.workflow.kind === "superpowers"
    ? summarizeSubagentExecutionDiagnostics(resolved)
    : undefined

  return {
    activePreset: {
      key: resolved.activePreset.key,
      label: resolved.activePreset.preset.label,
      short: resolved.activePreset.preset.short,
    },
    source: formatControlPlaneSource(resolved),
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
    commands: {
      prefix: resolved.config.settings.commandPrefix,
      ...(host === "opencode"
        ? {
          rendered: filterRenderedOpenCodeCommandsForWorkflow(
            listRenderedOpenCodeControlPlaneCommands(resolved.config.settings),
            resolved.config.workflow,
          ),
        }
        : filterNamedCommandsForWorkflow(resolved.config.settings.commands, resolved.config.workflow, host)),
    },
    compatibility,
    ...(doctorIssues.length > 0 ? { doctorIssues } : {}),
    artifacts: formattedArtifacts,
    ...summarizeLaneExplainability(resolved),
    ...(subagentExecution ? { subagentExecution } : {}),
    ...(artifactSummary ? { artifactSummary } : {}),
    ...(host === "opencode"
      ? {
          routing: summarizeRoutingValidation(
            resolved.config,
            resolved.activePreset.key,
            resolved.trace?.activePresetDefinition?.preset,
          ),
          codexFastRuntime: buildOpenCodeCodexFastRuntimeDiagnostics(cwd, resolved.config, resolved.laneState, deps),
        }
      : {}),
  }
}
