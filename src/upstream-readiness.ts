import type { WorkflowConfig } from "./config.js"
import {
  getHostProjectionDecision,
  type CapabilityDecision,
  type CapabilityHost,
} from "./capabilities.js"
import type { WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

export const UPSTREAM_AVAILABILITY_STATUSES = [
  "available",
  "not_detected",
  "error",
  "not_implemented",
] as const

export type UpstreamAvailabilityStatus = (typeof UPSTREAM_AVAILABILITY_STATUSES)[number]

export type UpstreamAvailabilityResult = {
  status: UpstreamAvailabilityStatus
  reason: string
}

export const UPSTREAM_BACKED_SOURCE_KINDS = ["superpowers", "gstack"] as const

export type UpstreamBackedSourceKind = (typeof UPSTREAM_BACKED_SOURCE_KINDS)[number]

export const UPSTREAM_COMPATIBILITY_STATUSES = [
  "compatible",
  "untested",
  "incompatible",
  "not_detected",
] as const

export type UpstreamCompatibilityStatus = (typeof UPSTREAM_COMPATIBILITY_STATUSES)[number]

export type UpstreamCompatibilityResult = {
  status: UpstreamCompatibilityStatus
  reason: string
}

export type ProjectionReadinessInput = {
  host: CapabilityHost
  workflowKind: WorkflowConfig["kind"]
  sourceEntry: WorkflowSourceEntry
}

export type ProjectionReadinessEvaluator<T> = (input: ProjectionReadinessInput) => T | null

export type ProjectionReadinessEvaluators = {
  availabilityBySource?: Partial<Record<UpstreamBackedSourceKind, ProjectionReadinessEvaluator<UpstreamAvailabilityResult>>>
  compatibilityBySource?: Partial<Record<UpstreamBackedSourceKind, ProjectionReadinessEvaluator<UpstreamCompatibilityResult>>>
}

export type ProjectionReadiness =
  | {
      support: Extract<CapabilityDecision, { supported: false }>
    }
  | {
      support: Extract<CapabilityDecision, { supported: true }>
      availability: UpstreamAvailabilityResult
      compatibility: UpstreamCompatibilityResult | null
    }

export function evaluateProjectionReadiness(
  input: ProjectionReadinessInput,
  evaluators: ProjectionReadinessEvaluators = {},
): ProjectionReadiness {
  const support = getHostProjectionDecision(input)
  if (!support.supported) {
    return { support }
  }

  return {
    support,
    availability: evaluateAvailability(input, evaluators),
    compatibility: evaluateCompatibility(input, evaluators),
  }
}

function evaluateAvailability(
  input: ProjectionReadinessInput,
  evaluators: ProjectionReadinessEvaluators,
): UpstreamAvailabilityResult {
  const source = input.sourceEntry.source
  if (!isUpstreamBackedSource(source)) {
    return createNotImplementedAvailability(source)
  }

  const evaluator = evaluators.availabilityBySource?.[source]
  if (!evaluator) {
    return createNotImplementedAvailability(source)
  }

  try {
    return evaluator(input) ?? createNotImplementedAvailability(source)
  } catch (error) {
    return {
      status: "error",
      reason: `Upstream availability evaluator failed for ${source}: ${formatErrorMessage(error)}`,
    }
  }
}

function evaluateCompatibility(
  input: ProjectionReadinessInput,
  evaluators: ProjectionReadinessEvaluators,
): UpstreamCompatibilityResult | null {
  const source = input.sourceEntry.source
  if (!isUpstreamBackedSource(source)) {
    return null
  }

  const evaluator = evaluators.compatibilityBySource?.[source]
  if (!evaluator) {
    return null
  }

  try {
    return evaluator(input)
  } catch (error) {
    return {
      status: "not_detected",
      reason: `Upstream compatibility evaluator failed for ${source}: ${formatErrorMessage(error)}`,
    }
  }
}

function isUpstreamBackedSource(source: WorkflowSourceKind): source is UpstreamBackedSourceKind {
  return source === "superpowers" || source === "gstack"
}

function createNotImplementedAvailability(source: WorkflowSourceKind): UpstreamAvailabilityResult {
  return {
    status: "not_implemented",
    reason: `No upstream availability evaluator is implemented for ${source} sources.`,
  }
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
