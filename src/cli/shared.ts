import path from "node:path"
import { z } from "zod"
import { BUILT_IN_PHASES, CONTROL_PLANE_COMMAND_KEYS, type ControlPlaneCommandKey, loadRouterConfig } from "../config.js"
import { getHostProjectionDecision, getControlPlaneCommandDecision, type ControlPlaneCapabilityCommand } from "../capabilities.js"
import { buildControlPlaneExplainTrace, buildControlPlaneRouteExplainTrace, summarizeLaneExplainability, summarizeEffectiveSourceReadiness, summarizeEffectiveSourceEntries, summarizeSourceToolRoleExplainability, type ExplainTrace, type LaneExplainability, type ResolveControlPlaneInput, type ResolvedControlPlane } from "../control-plane/index.js"
import { writeAuthorityWithRecoverySnapshotAtomically } from "../config-write.js"
import type { ContextIndex } from "../context-index.js"
import { CONTEXT_LIFECYCLE_STAGES } from "../context-lifecycle.js"
import { buildClaudeArtifacts } from "../claude.js"
import { evaluateProjectionReadiness, type ProjectionReadiness } from "../upstream-readiness.js"
import { normalizeWorkflowSourceRoutes, WORKFLOW_SOURCE_KINDS, type WorkflowSourceEntry } from "../workflow-sources.js"
import { toSuperpowersAvailabilityResult, mergeMatrixWithOverrides, SUPERPOWERS_COMPATIBILITY, type SuperpowersCompatibilityMode, type SuperpowersCompatibilityResult, type SuperpowersDetectionResult, type SupportedSuperpowersHost } from "../superpowers-compatibility.js"
import { listRenderedOpenCodeControlPlaneCommands } from "../opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "../router.js"
import type { CliDeps, CliHost, ExplainCliHost } from "./types.js"

export function parseArgs(argv: string[]) {
  const [command, ...rest] = argv
  const flags = new Map<string, string | true>()
  const positionals: string[] = []

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index]

    if (value === "--") {
      positionals.push(...rest.slice(index + 1))
      break
    }

    if (value?.startsWith("--")) {
      const eqIdx = value.indexOf("=")
      if (eqIdx >= 0) {
        flags.set(value.slice(0, eqIdx), value.slice(eqIdx + 1))
        continue
      }

      const next = rest[index + 1]
      if (!next || next.startsWith("-")) {
        flags.set(value, true)
        continue
      }

      flags.set(value, next)
      index += 1
      continue
    }

    if (value?.startsWith("-") && value.length === 2 && value[1] !== "-") {
      if (value === "-h") {
        flags.set("--help", true)
      } else {
        flags.set(`--${value.slice(1)}`, true)
      }
      continue
    }

    positionals.push(value)
  }

  return { command, flags, positionals }
}

export function getStringFlag(flags: Map<string, string | true>, name: string) {
  const value = flags.get(name)
  return typeof value === "string" ? value : undefined
}

export function getCommaSeparatedFlag(flags: Map<string, string | true>, name: string) {
  const value = getStringFlag(flags, name)
  if (!value) {
    return undefined
  }

  const parts = value.split(",").map((part) => part.trim()).filter((part) => part.length > 0)
  return parts.length > 0 ? parts : undefined
}

export function isAuthorRoutingMode(value: string | undefined): value is "superpowers" | "direct" {
  return value === "superpowers" || value === "direct"
}

export function isMissingFsError(error: unknown) {
  return (
    (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
    || (error instanceof Error && error.message.includes("ENOENT"))
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function toProjectRelativePath(cwd: string, filePath: string) {
  const relative = path.relative(cwd, filePath)
  return relative.startsWith("..") || path.isAbsolute(relative) ? filePath : relative || path.basename(filePath)
}

export function resolvePresetKey(resolved: ResolvedControlPlane, selector: string) {
  if (resolved.config.presets[selector]) {
    return selector
  }

  const shortMatch = Object.entries(resolved.config.presets)
    .find(([, preset]) => preset.short === selector)

  if (shortMatch) {
    return shortMatch[0]
  }

  throw new Error(`Unknown preset: ${selector}`)
}

export function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortObjectKeys(nestedValue)]),
    )
  }

  return value
}

export function canonicalizeStringArray(values: string[] | undefined) {
  return values ? [...values].sort() : undefined
}

export function canonicalizeAuthorityWorkloadMapping(mapping: { path: string[]; workloadTags: string[] }) {
  return {
    path: canonicalizeStringArray(mapping.path) ?? [],
    workloadTags: canonicalizeStringArray(mapping.workloadTags) ?? [],
  }
}

export function canonicalizePolicyRule(rule: Record<string, unknown>) {
  const canonical = sortObjectKeys(rule) as Record<string, unknown>

  const normalizeStringArrayProperties = (value: unknown): unknown => {
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return [...value].sort()
    }

    if (Array.isArray(value)) {
      return value.map(normalizeStringArrayProperties)
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, normalizeStringArrayProperties(nestedValue)]),
      )
    }

    return value
  }

  return normalizeStringArrayProperties(canonical) as Record<string, unknown>
}

export function authorityWorkloadMappingsEqual(
  left: { path: string[]; workloadTags: string[] },
  right: { path: string[]; workloadTags: string[] },
) {
  return JSON.stringify(canonicalizeAuthorityWorkloadMapping(left)) === JSON.stringify(canonicalizeAuthorityWorkloadMapping(right))
}

export function authorityPolicyRulesEqual(left: Record<string, unknown>, right: Record<string, unknown>) {
  return JSON.stringify(canonicalizePolicyRule(left)) === JSON.stringify(canonicalizePolicyRule(right))
}

export function formatCompatibilityWarning(result: SuperpowersCompatibilityResult | null) {
  if (!result || result.status === "compatible" || result.shouldBlock) {
    return ""
  }

  return `Warning: superpowers compatibility is ${result.status} for ${result.host}: ${result.reason}`
}

export function formatCompatibilityBlock(result: SuperpowersCompatibilityResult | null) {
  if (!result) {
    return ""
  }

  return `Blocked by incompatible superpowers installation for ${result.host}: ${result.reason}`
}

export function withCompatibility<T extends Record<string, unknown>>(
  payload: T,
  compatibility: SuperpowersCompatibilityResult | null,
  contextIndex: ReturnType<typeof summarizeContextIndex>,
  contextCompression: ReturnType<typeof summarizeContextCompression>,
  contextProviders: ReturnType<typeof summarizeContextProviders>,
  policyResolution?: ReturnType<typeof summarizePolicyResolution>,
  policyDiagnostics?: ResolvedControlPlane["policyDiagnostics"],
) {
  return {
    ...payload,
    compatibility,
    ...(contextIndex ? { contextIndex } : {}),
    ...(contextCompression ? { contextCompression } : {}),
    ...(contextProviders ? { contextProviders } : {}),
    ...(policyResolution ? { policyResolution } : {}),
    ...(policyDiagnostics ? { policyDiagnostics } : {}),
  }
}

export function summarizeContextIndex(index: ContextIndex | undefined) {
  if (!index) {
    return undefined
  }

  return {
    artifactCount: index.artifacts.length,
    authoritativePaths: index.artifacts
      .filter((artifact) => artifact.authority === "authoritative")
      .map((artifact) => artifact.path),
    warnings: index.warnings,
  }
}

export function summarizeContextCompression(contextCompression: ResolvedControlPlane["contextCompression"]) {
  if (!contextCompression) {
    return undefined
  }

  return {
    policy: {
      mode: contextCompression.policy.mode,
      engine: contextCompression.policy.engine,
      inlineLevel: contextCompression.policy.inlineLevel,
    },
    selection: {
      lifecycleStage: contextCompression.selection.lifecycleStage,
      packIds: [...contextCompression.selection.packIds],
      artifactPaths: contextCompression.selection.artifacts.map((artifact) => artifact.path),
    },
    readiness: {
      state: contextCompression.readiness.state,
      reason: contextCompression.readiness.reason,
      ...(contextCompression.readiness.resumePacket
        ? { resumePacket: contextCompression.readiness.resumePacket }
        : {}),
    },
    engineBundle: {
      packIds: [...contextCompression.engineBundle.packIds],
      summary: contextCompression.engineBundle.summary,
      entries: contextCompression.engineBundle.entries.map((entry) => ({ ...entry })),
      warnings: [...contextCompression.engineBundle.warnings],
    },
  }
}

export function summarizeContextProviders(contextProviders: ResolvedControlPlane["contextProviders"]) {
  const summarizedProviders = [...(contextProviders ?? [])]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((provider) => ({
      id: provider.id,
      kind: provider.kind,
      available: provider.available,
      capabilities: [...provider.capabilities],
    }))

  return summarizedProviders.length > 0 ? summarizedProviders : undefined
}

export function summarizeRecoveryWarnings(recovery: ResolvedControlPlane["recovery"]) {
  if (recovery?.activeSource !== "last-known-good" || !recovery.lastKnownGoodPath) {
    return undefined
  }

  return [
    `Authority config failed to load; using last-known-good from ${recovery.lastKnownGoodPath}.`,
  ]
}

export function summarizePolicyResolution(policyResolution: ResolvedControlPlane["policyResolution"]) {
  if (!policyResolution) {
    return undefined
  }

  return {
    snapshot: {
      cwd: policyResolution.snapshot.cwd,
      relativePath: policyResolution.snapshot.relativePath,
      lifecycleStage: policyResolution.snapshot.lifecycleStage,
      workflowSource: policyResolution.snapshot.workflowSource,
      agentRole: policyResolution.snapshot.agentRole,
      workloadTags: [...policyResolution.snapshot.workloadTags],
      modalityRequirements: [...policyResolution.snapshot.modalityRequirements],
    },
    ...(policyResolution.provenance ? { provenance: { ...policyResolution.provenance } } : {}),
    matchedRuleIds: [...policyResolution.matchedRuleIds],
    policy: {
      ...(policyResolution.policy.modelPolicy ? {
        modelPolicy: {
          ...policyResolution.policy.modelPolicy,
          preferredProfiles: policyResolution.policy.modelPolicy.preferredProfiles
            ? [...policyResolution.policy.modelPolicy.preferredProfiles]
            : undefined,
          requiredCapabilities: policyResolution.policy.modelPolicy.requiredCapabilities
            ? [...policyResolution.policy.modelPolicy.requiredCapabilities]
            : undefined,
        },
      } : {}),
      ...(policyResolution.policy.contextPolicy ? { contextPolicy: { ...policyResolution.policy.contextPolicy } } : {}),
      ...(policyResolution.policy.toolPolicy ? {
        toolPolicy: {
          ...policyResolution.policy.toolPolicy,
          allowedSkillTags: policyResolution.policy.toolPolicy.allowedSkillTags
            ? [...policyResolution.policy.toolPolicy.allowedSkillTags]
            : undefined,
          allowedMcpTags: policyResolution.policy.toolPolicy.allowedMcpTags
            ? [...policyResolution.policy.toolPolicy.allowedMcpTags]
            : undefined,
          blockedToolTags: policyResolution.policy.toolPolicy.blockedToolTags
            ? [...policyResolution.policy.toolPolicy.blockedToolTags]
            : undefined,
        },
      } : {}),
    },
  }
}

export function formatExplainOutput(
  payload: unknown,
  compatibility: SuperpowersCompatibilityResult | null,
  contextIndex: ReturnType<typeof summarizeContextIndex>,
  contextCompression: ReturnType<typeof summarizeContextCompression>,
  contextProviders: ReturnType<typeof summarizeContextProviders>,
  warnings?: string[],
  policyResolution?: ReturnType<typeof summarizePolicyResolution>,
  policyDiagnostics?: ResolvedControlPlane["policyDiagnostics"],
) {
  if (Array.isArray(payload)) {
    return payload.map((item) => (
      item && typeof item === "object" && !Array.isArray(item)
        ? {
            ...withCompatibility(
            item as Record<string, unknown>,
            compatibility,
            contextIndex,
            contextCompression,
            contextProviders,
            policyResolution,
            policyDiagnostics,
          ),
            ...(warnings ? { warnings } : {}),
          }
        : item
    ))
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...withCompatibility(
      payload as Record<string, unknown>,
      compatibility,
      contextIndex,
      contextCompression,
      contextProviders,
      policyResolution,
      policyDiagnostics,
    ),
      ...(warnings ? { warnings } : {}),
    }
  }

  return {
    result: payload,
    compatibility,
    ...(contextIndex ? { contextIndex } : {}),
    ...(contextCompression ? { contextCompression } : {}),
    ...(contextProviders ? { contextProviders } : {}),
    ...(warnings ? { warnings } : {}),
    ...(policyResolution ? { policyResolution } : {}),
    ...(policyDiagnostics ? { policyDiagnostics } : {}),
  }
}

export function withExplainTrace(payload: Record<string, unknown>, trace: ExplainTrace) {
  return {
    ...payload,
    routeSource: typeof payload.routeSource === "string" ? payload.routeSource : trace.routeSource,
    configSource: typeof payload.configSource === "string" ? payload.configSource : trace.configSource,
    reuseRelationship: typeof payload.reuseRelationship === "string" ? payload.reuseRelationship : trace.reuseRelationship,
    resolvedSource: typeof payload.resolvedSource === "string" ? payload.resolvedSource : trace.resolvedSource,
    sourceEntry: isRecord(payload.sourceEntry) ? payload.sourceEntry : trace.sourceEntry,
  }
}

export function withExplainReadiness(payload: Record<string, unknown>, readiness: ProjectionReadiness) {
  return {
    ...payload,
    readiness,
  }
}

export function buildExplainTraceForPayloadItem(
  item: Record<string, unknown>,
  input: { cwd: string; resolved: ResolvedControlPlane },
) {
  if (typeof item.phase === "string" && BUILT_IN_PHASES.includes(item.phase as BuiltInPhase)) {
    return buildControlPlaneExplainTrace({
      cwd: input.cwd,
      resolved: input.resolved,
      phase: item.phase as BuiltInPhase,
    })
  }

  if (typeof item.intent === "string") {
    return buildControlPlaneRouteExplainTrace({
      cwd: input.cwd,
      resolved: input.resolved,
      routeId: item.intent,
    })
  }

  return null
}

export function attachExplainTrace(
  payload: unknown,
  input: { cwd: string; resolved: ResolvedControlPlane },
) {
  if (Array.isArray(payload)) {
    return payload.map((item) => {
      if (!isRecord(item)) {
        return item
      }

      const trace = buildExplainTraceForPayloadItem(item, input)
      if (!trace) {
        return item
      }

      return withExplainTrace(item, trace)
    })
  }

  if (!isRecord(payload)) {
    return payload
  }

  const trace = buildExplainTraceForPayloadItem(payload, input)
  return trace ? withExplainTrace(payload, trace) : payload
}

export async function attachExplainReadiness(
  payload: unknown,
  input: {
    cwd: string
    resolved: ResolvedControlPlane
    resolveReadiness: (sourceEntry: WorkflowSourceEntry) => Promise<ProjectionReadiness>
  },
) {
  const attachReadiness = async (item: Record<string, unknown>) => {
    const trace = buildExplainTraceForPayloadItem(item, input)
    if (!trace) {
      return item
    }

    return withExplainReadiness(item, await input.resolveReadiness(trace.sourceEntry))
  }

  if (Array.isArray(payload)) {
    return Promise.all(payload.map((item) => (
      isRecord(item)
        ? attachReadiness(item)
        : item
    )))
  }

  if (!isRecord(payload)) {
    return payload
  }

  return attachReadiness(payload)
}

export function withLaneExplainability(payload: Record<string, unknown>, laneExplainability: LaneExplainability) {
  return {
    ...payload,
    ...laneExplainability,
  }
}

export function attachLaneExplainability(payload: unknown, resolved: ResolvedControlPlane) {
  const laneExplainability = summarizeLaneExplainability(resolved)

  if (Array.isArray(payload)) {
    return payload.map((item) => (
      isRecord(item)
        ? withLaneExplainability(item, laneExplainability)
        : item
    ))
  }

  if (!isRecord(payload)) {
    return payload
  }

  return withLaneExplainability(payload, laneExplainability)
}

export function createFallbackCompatibility(
  host: SupportedSuperpowersHost,
  policyMode: SuperpowersCompatibilityMode,
  source: string,
  error: unknown,
): SuperpowersCompatibilityResult {
  return {
    host,
    source,
    detectedVersion: null,
    detectedRef: null,
    status: "not_detected",
    reason: error instanceof Error ? `Compatibility check failed: ${error.message}` : `Compatibility check failed: ${String(error)}`,
    policyMode,
    shouldBlock: false,
  }
}

export async function resolveCompatibilityForHost(
  host: SupportedSuperpowersHost,
  policyMode: SuperpowersCompatibilityMode,
  deps: CliDeps,
  allowUntested: "warn" | "block" = "warn",
  overrides?: Record<string, { minimumSupportedVersion?: string; testedRanges?: string[]; knownBadRanges?: string[] }>,
): Promise<SuperpowersCompatibilityResult> {
  let detection: SuperpowersDetectionResult

  try {
    detection = host === "opencode"
      ? await deps.detectOpenCodeSuperpowers()
      : await deps.detectCodexSuperpowers()
  } catch (error) {
    return createFallbackCompatibility(host, policyMode, "compatibility-monitor", error)
  }

  try {
    const matrix = mergeMatrixWithOverrides(SUPERPOWERS_COMPATIBILITY, overrides)
    return deps.evaluateSuperpowersCompatibility(detection, policyMode, matrix, allowUntested)
  } catch (error) {
    return createFallbackCompatibility(host, policyMode, detection.source, error)
  }
}

export function isCompatibilityHost(host: CliHost): host is SupportedSuperpowersHost {
  return host === "opencode" || host === "codex"
}

export async function resolveCompatibilityForCliHost(
  host: CliHost,
  policyMode: SuperpowersCompatibilityMode,
  deps: CliDeps,
  allowUntested: "warn" | "block" = "warn",
  overrides?: Record<string, { minimumSupportedVersion?: string; testedRanges?: string[]; knownBadRanges?: string[] }>,
) {
  if (!isCompatibilityHost(host)) {
    return null
  }

  return resolveCompatibilityForHost(host, policyMode, deps, allowUntested, overrides)
}

export function toUpstreamCompatibilityResult(compatibility: SuperpowersCompatibilityResult) {
  return {
    status: compatibility.status,
    reason: compatibility.reason,
  } as const
}

export function createProjectionReadinessResolver(input: {
  cwd: string
  host: CliHost
  config: ResolvedControlPlane["config"]
  deps: CliDeps
  compatibility?: SuperpowersCompatibilityResult | null
}) {
  let compatibilityPromise: Promise<SuperpowersCompatibilityResult> | null = input.compatibility
    ? Promise.resolve(input.compatibility)
    : null
  let claudeGstackAvailabilityPromise: Promise<{ status: "available" | "not_detected" | "error"; reason: string }> | null = null
  let qwenUpstreamSkillsPromise: Promise<Record<string, string | undefined>> | null = null

  return async (sourceEntry: WorkflowSourceEntry): Promise<ProjectionReadiness> => {
    const readinessInput = {
      host: input.host,
      workflowKind: input.config.workflow.kind,
      sourceEntry,
    } as const
    const support = getHostProjectionDecision(readinessInput)

    if (!support.supported) {
      return { support }
    }

    if (sourceEntry.source === "superpowers" && isCompatibilityHost(input.host)) {
      compatibilityPromise ??= resolveCompatibilityForHost(
        input.host,
        input.config.settings.superpowersCompatibility.mode,
        input.deps,
      )
      const compatibility = await compatibilityPromise

      return evaluateProjectionReadiness(readinessInput, {
        availabilityBySource: {
          superpowers: () => toSuperpowersAvailabilityResult(compatibility),
        },
        compatibilityBySource: {
          superpowers: () => toUpstreamCompatibilityResult(compatibility),
        },
      })
    }

    if (sourceEntry.source === "superpowers" && input.host === "qwen") {
      let upstreamSkills: Record<string, string | undefined>

      try {
        qwenUpstreamSkillsPromise ??= input.deps.discoverQwenUpstreamSkills({ cwd: input.cwd })
        upstreamSkills = await qwenUpstreamSkillsPromise
      } catch (error) {
        return {
          support,
          availability: {
            status: "error",
            reason: error instanceof Error
              ? `Qwen upstream skill discovery failed: ${error.message}`
              : `Qwen upstream skill discovery failed: ${String(error)}`,
          },
          compatibility: null,
        }
      }

      const workflowEntryName = sourceEntry.entryName ?? sourceEntry.canonicalRoute
      const skillPath = upstreamSkills[workflowEntryName]

      return evaluateProjectionReadiness(readinessInput, {
        availabilityBySource: {
          superpowers: () => skillPath
            ? {
                status: "available",
                reason: `Detected Qwen upstream workflow entry at ${skillPath}.`,
              }
            : {
                status: "not_detected",
                reason: `Required Qwen upstream workflow entry is not installed: ${workflowEntryName}.`,
              },
        },
      })
    }

    if (sourceEntry.source === "gstack" && input.host === "claude") {
      claudeGstackAvailabilityPromise ??= input.deps.detectClaudeGstackAvailability({ cwd: input.cwd })
        .then((result) => ({
          status: result.status,
          reason: result.reason,
        }))
        .catch((error) => ({
          status: "error" as const,
          reason: error instanceof Error
            ? `Claude gstack availability check failed: ${error.message}`
            : `Claude gstack availability check failed: ${String(error)}`,
        }))
      const availability = await claudeGstackAvailabilityPromise

      return evaluateProjectionReadiness(readinessInput, {
        availabilityBySource: {
          gstack: () => availability,
        },
      })
    }

    return evaluateProjectionReadiness(readinessInput)
  }
}

export function shouldSkipExpectedArtifactBuild(
  host: CliHost,
  effectiveSourceReadiness: Awaited<ReturnType<typeof summarizeEffectiveSourceReadiness>>,
) {
  return host === "qwen" && Object.values(effectiveSourceReadiness).some((entry) => (
    entry?.readiness.support.supported === false
  ))
}

export function createEmptyArtifactInspection() {
  return {
    present: [] as string[],
    missing: [] as string[],
    expectedPresent: [] as string[],
    stale: [] as string[],
  }
}

export function joinStderr(parts: Array<string | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.length > 0)).join("\n")
}

export function isDirectWorkflowHostSupported(
  config: { workflow: ResolvedControlPlane["config"]["workflow"] },
  host: CliHost | SupportedSuperpowersHost,
) {
  if (config.workflow.kind !== "direct") {
    return false
  }

  return host === "opencode" || host === "codex" || host === "qwen"
}

export function assertWorkflowSupport(
  config: { workflow: ResolvedControlPlane["config"]["workflow"] },
  command: ControlPlaneCapabilityCommand,
  host: CliHost | SupportedSuperpowersHost,
) {
  const decision = getControlPlaneCommandDecision({
    host,
    command,
    workflowKind: config.workflow.kind,
  })

  if (decision.supported) {
    return
  }

  if (decision.reasonCode === "unsupported_workflow_mode") {
    throw new Error(`Direct workflow is not yet supported for ${command} --host ${host}`)
  }

  throw new Error(`Command ${command} is not supported for --host ${host}`)
}

export function isGloballyUnsupportedControlPlaneCommand(
  host: CliHost | SupportedSuperpowersHost,
  command: ControlPlaneCapabilityCommand,
) {
  return (["superpowers", "direct"] as const).every((workflowKind) => {
    const decision = getControlPlaneCommandDecision({
      host,
      command,
      workflowKind,
    })

    return !decision.supported && decision.reasonCode === "unsupported_control_plane_command"
  })
}

export function toRouterConfig(
  config: ResolvedControlPlane["config"],
  laneState?: ResolvedControlPlane["laneState"],
): Awaited<ReturnType<typeof loadRouterConfig>>["config"] {
  const activePreset = config.presets[config.settings.activePreset]
  if (!activePreset) {
    throw new Error(`Unknown preset: ${config.settings.activePreset}`)
  }

  const effectiveSources = normalizeWorkflowSourceRoutes(config.workflow, {
    ...(activePreset.sourcePreset ? (config.sourcePresets[activePreset.sourcePreset]?.routes ?? {}) : {}),
    ...(activePreset.sourceRoutes ?? {}),
  })

  return {
    workflow: config.workflow,
    profiles: {
      ...(config.profiles ?? {}),
      ...(activePreset.profiles ?? {}),
    },
    lanes: config.lanes,
    availableLanes: laneState?.allowedLanes ?? activePreset.usesLanes ?? [],
    effectiveSources,
    routes: activePreset.routes,
    defaultRoute: activePreset.defaultRoute,
    effectiveLane: laneState?.effectiveLane ?? config.settings.defaultLane ?? activePreset.defaultLane,
    superpowersCompatibility: config.settings.superpowersCompatibility,
  }
}

export function formatControlPlaneSource(resolved: ResolvedControlPlane) {
  if (resolved.source.kind === "default") {
    return {
      kind: "default" as const,
      hasRealSource: false,
      sources: [],
    }
  }

  return {
    kind: "file" as const,
    hasRealSource: true,
    path: resolved.source.path,
    sources: resolved.source.sources,
  }
}

export function formatPostWriteControlPlaneSource(
  resolved: ResolvedControlPlane,
  prepared: Awaited<ReturnType<typeof import("../control-plane/index.js")["prepareControlPlaneStateWrite"]>>,
) {
  if (resolved.source.kind === "default") {
    return {
      kind: "file" as const,
      hasRealSource: true,
      path: prepared.path,
      sources: [prepared.path],
    }
  }

  if (resolved.source.path !== prepared.path || !resolved.source.sources.includes(prepared.path)) {
    return {
      kind: "file" as const,
      hasRealSource: true,
      path: prepared.path,
      sources: resolved.source.sources.includes(prepared.path)
        ? resolved.source.sources
        : [...resolved.source.sources, prepared.path],
    }
  }

  return formatControlPlaneSource(resolved)
}

export function buildUseRouteImpact(previous: ResolvedControlPlane["config"], next: ResolvedControlPlane["config"]) {
  const previousRouter = toRouterConfig(previous)
  const nextRouter = toRouterConfig(next)

  return {
    changedPhases: BUILT_IN_PHASES.filter((phase) => {
      const previousResolved = resolvePhase(previousRouter, phase)
      const nextResolved = resolvePhase(nextRouter, phase)
      const previousRouteFingerprint = {
        profileId: previousResolved.profileId,
        model: previousResolved.selection.model,
        variant: previousResolved.selection.variant,
        temperature: previousResolved.selection.temperature,
        codexFast: previousResolved.selection.codexFast,
        resolvedSource: previousResolved.resolvedSource,
        sourceEntry: previousResolved.sourceEntry,
      }
      const nextRouteFingerprint = {
        profileId: nextResolved.profileId,
        model: nextResolved.selection.model,
        variant: nextResolved.selection.variant,
        temperature: nextResolved.selection.temperature,
        codexFast: nextResolved.selection.codexFast,
        resolvedSource: nextResolved.resolvedSource,
        sourceEntry: nextResolved.sourceEntry,
      }

      return JSON.stringify(previousRouteFingerprint) !== JSON.stringify(nextRouteFingerprint)
    }),
  }
}

export function filterRenderedOpenCodeCommandsForWorkflow(
  rendered: Record<string, string[]>,
  workflow: ResolvedControlPlane["config"]["workflow"],
) {
  return Object.fromEntries(
    getSupportedControlPlaneCommandKeys("opencode", workflow).map((commandKey) => [commandKey, rendered[commandKey]]),
  )
}

export function getSupportedControlPlaneCommandKeys(
  host: CliHost,
  workflow: ResolvedControlPlane["config"]["workflow"],
): ControlPlaneCommandKey[] {
  return CONTROL_PLANE_COMMAND_KEYS.filter((commandKey) => getControlPlaneCommandDecision({
    host,
    command: commandKey,
    workflowKind: workflow.kind,
  }).supported)
}

export function filterNamedCommandsForWorkflow<T>(
  commands: Record<string, T>,
  workflow: ResolvedControlPlane["config"]["workflow"],
  host: CliHost,
) {
  return Object.fromEntries(
    getSupportedControlPlaneCommandKeys(host, workflow).map((commandKey) => [commandKey, commands[commandKey]]),
  )
}

export async function writePreparedConfig(
  prepared: Awaited<ReturnType<typeof import("../control-plane/index.js")["prepareControlPlaneStateWrite"]>>,
  deps: CliDeps,
) {
  await writeAuthorityWithRecoverySnapshotAtomically(prepared.path, prepared.content, deps)
}

export function assertQwenProjectionSupport(config: Awaited<ReturnType<typeof loadRouterConfig>>["config"]) {
  if (config.workflow.kind === "direct") {
    return
  }

  const unsupportedEntries = BUILT_IN_PHASES
    .map((phase) => resolvePhase(config, phase).sourceEntry)
    .filter((sourceEntry) => sourceEntry.source === "gstack")
    .map((sourceEntry) => ({
      canonicalRoute: sourceEntry.canonicalRoute,
      renderedEntry: `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`,
    }))
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.renderedEntry === entry.renderedEntry) === index)

  if (unsupportedEntries.length === 0) {
    return
  }

  throw new Error(
    `Qwen cannot project gstack routes in this slice. Use --host opencode or --host codex instead. Unsupported source entries: ${unsupportedEntries.map((entry) => `${entry.renderedEntry} (${entry.canonicalRoute})`).join(", ")}`,
  )
}

export function maybeResolveCompatibility(
  config: { workflow: ResolvedControlPlane["config"]["workflow"] },
  host: CliHost,
  resolve: () => Promise<SuperpowersCompatibilityResult | null>,
) {
  return isDirectWorkflowHostSupported(config, host) ? Promise.resolve(null) : resolve()
}

export function formatRenderedDocumentDiff(previousRenderedDocument: string, renderedDocument: string) {
  const previousLines = previousRenderedDocument.length > 0 ? previousRenderedDocument.trimEnd().split("\n") : []
  const nextLines = renderedDocument.trimEnd().split("\n")

  if (previousLines.length === 0) {
    return nextLines.map((line) => `+ ${line}`)
  }

  const diffLines: string[] = []
  const linePairs = buildLineDiff(previousLines, nextLines)

  for (const pair of linePairs) {
    if (pair.type === "unchanged") {
      diffLines.push(`  ${pair.line}`)
      continue
    }

    if (pair.type === "removed") {
      diffLines.push(`- ${pair.line}`)
      continue
    }

    diffLines.push(`+ ${pair.line}`)
  }

  return diffLines
}

export function buildLineDiff(previousLines: string[], nextLines: string[]) {
  const lcs = Array.from({ length: previousLines.length + 1 }, () => Array<number>(nextLines.length + 1).fill(0))

  for (let previousIndex = previousLines.length - 1; previousIndex >= 0; previousIndex--) {
    for (let nextIndex = nextLines.length - 1; nextIndex >= 0; nextIndex--) {
      lcs[previousIndex][nextIndex] = previousLines[previousIndex] === nextLines[nextIndex]
        ? lcs[previousIndex + 1][nextIndex + 1] + 1
        : Math.max(lcs[previousIndex + 1][nextIndex], lcs[previousIndex][nextIndex + 1])
    }
  }

  const diffLines: Array<
    | { type: "unchanged"; line: string }
    | { type: "removed"; line: string }
    | { type: "added"; line: string }
  > = []

  let previousIndex = 0
  let nextIndex = 0

  while (previousIndex < previousLines.length && nextIndex < nextLines.length) {
    if (previousLines[previousIndex] === nextLines[nextIndex]) {
      diffLines.push({ type: "unchanged", line: previousLines[previousIndex] })
      previousIndex++
      nextIndex++
      continue
    }

    if (lcs[previousIndex + 1][nextIndex] >= lcs[previousIndex][nextIndex + 1]) {
      diffLines.push({ type: "removed", line: previousLines[previousIndex] })
      previousIndex++
      continue
    }

    diffLines.push({ type: "added", line: nextLines[nextIndex] })
    nextIndex++
  }

  while (previousIndex < previousLines.length) {
    diffLines.push({ type: "removed", line: previousLines[previousIndex] })
    previousIndex++
  }

  while (nextIndex < nextLines.length) {
    diffLines.push({ type: "added", line: nextLines[nextIndex] })
    nextIndex++
  }

  return diffLines
}

export function formatAuthorRoutingOutput(result: {
  mode: string
  summaryText: string
  diffText: string
  preview: { path: string; operation: string }
  written: boolean
}) {
  return [
    "Summary",
    result.summaryText,
    "",
    "Diff",
    result.diffText,
    "",
    "Result",
    `Target: ${result.preview.path}`,
    `Operation: ${result.preview.operation}`,
    `Written: ${result.written ? "yes" : "no"}`,
  ].join("\n")
}

export function formatAuthorRoutingSummary(input: {
  mode: "superpowers" | "direct"
  write: boolean
  operation: "create" | "update"
  targetPath: string
  suggestedLanes: string[]
  proposal: { profiles: Record<string, unknown>; presets: Record<string, unknown> }
}) {
  const lanes = input.suggestedLanes.length > 0 ? input.suggestedLanes.join(", ") : "none"
  const profiles = Object.keys(input.proposal.profiles).join(", ")
  const presets = Object.keys(input.proposal.presets).join(", ")

  return [
    `Routing authoring ${input.write ? "write" : "preview"}`,
    `Mode: ${input.mode}`,
    `Operation: ${input.operation}`,
    `Target: ${input.targetPath}`,
    `Detected lanes: ${lanes}`,
    `Profiles: ${profiles}`,
    `Presets: ${presets}`,
  ].join("\n")
}

export function formatAuthorRoutingDiff(input: {
  previousRenderedDocument: string
  renderedDocument: string
  operation: "create" | "update"
  targetPath: string
}) {
  return [
    `Target: ${input.targetPath}`,
    `Operation: ${input.operation}`,
    ...formatRenderedDocumentDiff(input.previousRenderedDocument, input.renderedDocument),
  ].join("\n")
}

export function formatAuthorPolicyOutput(result: {
  summaryText: string
  preview: { path: string; operation: string }
  written: boolean
}) {
  return [
    "Summary",
    result.summaryText,
    "",
    "Result",
    `Target: ${result.preview.path}`,
    `Operation: ${result.preview.operation}`,
    `Written: ${result.written ? "yes" : "no"}`,
  ].join("\n")
}

export function inferHomeDirFromGlobalConfigPath(filePath: string) {
  const configDirectory = path.dirname(filePath)
  const parentDirectory = path.dirname(configDirectory)

  if (path.basename(configDirectory) !== "oh-my-superagents" || path.basename(parentDirectory) !== ".config") {
    return undefined
  }

  return path.dirname(parentDirectory)
}
