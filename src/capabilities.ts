import type { ControlPlaneCommandKey, WorkflowConfig } from "./config.js"
import type { SupportedSuperpowersHost } from "./superpowers-compatibility.js"
import { getGstackSourceEntry } from "./workflow-gstack.js"
import { getSuperpowersSourceEntry } from "./workflow-superpowers.js"
import type { CanonicalRouteId, WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

export const CAPABILITY_REASON_CODES = [
  "unsupported_source_route",
  "unsupported_host_source_projection",
  "unsupported_host_direct_projection",
  "unsupported_control_plane_command",
  "unsupported_workflow_mode",
] as const

export type CapabilityReasonCode = (typeof CAPABILITY_REASON_CODES)[number]
export type CapabilityDecision =
  | {
      supported: true
    }
  | {
      supported: false
      reasonCode: CapabilityReasonCode
    }
export type CapabilityHost = SupportedSuperpowersHost | "qwen" | "claude" | "copilot"
export type ControlPlaneCapabilityCommand = ControlPlaneCommandKey | "explain"

type WorkflowKind = WorkflowConfig["kind"]

function supportedDecision(): CapabilityDecision {
  return {
    supported: true,
  }
}

function unsupportedDecision(
  reasonCode: CapabilityReasonCode,
): CapabilityDecision {
  return {
    supported: false,
    reasonCode,
  }
}

export function isSourceRouteSupported(source: WorkflowSourceKind, canonicalRoute: CanonicalRouteId): boolean {
  switch (source) {
    case "superpowers":
      return Boolean(getSuperpowersSourceEntry(canonicalRoute))
    case "gstack":
      return Boolean(getGstackSourceEntry(canonicalRoute))
    case "direct":
      return canonicalRoute.startsWith("intent.")
  }
}

export function getHostProjectionDecision(input: {
  host: CapabilityHost
  workflowKind: WorkflowKind
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  if (!isSourceRouteSupported(input.sourceEntry.source, input.sourceEntry.canonicalRoute)) {
    return unsupportedDecision("unsupported_source_route")
  }

  if (input.host === "claude" && input.workflowKind === "direct") {
    return unsupportedDecision("unsupported_host_direct_projection")
  }

  if (input.host === "copilot" && input.workflowKind === "direct") {
    return unsupportedDecision("unsupported_host_direct_projection")
  }

  if (input.host === "qwen" && input.workflowKind === "superpowers" && input.sourceEntry.source === "gstack") {
    return unsupportedDecision("unsupported_host_source_projection")
  }

  return supportedDecision()
}

export function getControlPlaneCommandDecision(input: {
  host: CapabilityHost
  command: ControlPlaneCapabilityCommand
  workflowKind: WorkflowKind
}): CapabilityDecision {
  if (input.command === "explain" && input.host === "qwen") {
    return unsupportedDecision("unsupported_control_plane_command")
  }

  if (input.workflowKind === "direct" && input.host === "claude") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (input.workflowKind === "direct" && input.host === "copilot") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (input.workflowKind === "direct" && (input.command === "use" || input.command === "disable")) {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  if (input.workflowKind === "direct" && input.command === "explain" && input.host !== "opencode" && input.host !== "codex") {
    return unsupportedDecision("unsupported_workflow_mode")
  }

  return supportedDecision()
}
