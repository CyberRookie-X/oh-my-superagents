import type { ControlPlaneConfig } from "../config.js"
import { classifyOpenSpecArtifact } from "../openspec.js"
import { resolveEffectiveSources } from "../router.js"
import type { CanonicalRouteId, WorkflowSourceEntry, WorkflowSourceKind } from "../workflow-sources.js"
import { getWorkflowSourceEntry, normalizeWorkflowSourceRoutes, WORKFLOW_SOURCE_KINDS } from "../workflow-sources.js"
import type { SuperpowersCompatibilityResult, SupportedSuperpowersHost } from "../superpowers-compatibility.js"
import type { ProjectionReadiness } from "../upstream-readiness.js"
import type {
  ControlPlaneArtifactSummary,
  ControlPlaneNextAction,
  EffectiveSourceReadiness,
  EffectiveSourceReadinessEntry,
  OpenCodeStatusState,
  ResolvedControlPlane,
  SourceToolRoleExplainability,
} from "./types.js"

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
