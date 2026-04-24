import type { ContextLifecycleStage } from "./context-lifecycle.js"
import { matchesGlobPattern, normalizeRelativePath } from "./utils/glob-utils.js"

export type RuntimeContextSnapshot = {
  cwd: string
  relativePath: string
  lifecycleStage: ContextLifecycleStage
  workflowSource: "superpowers" | "gstack" | "direct"
  agentRole: "primary" | "subagent"
  workloadTags: string[]
  modalityRequirements: string[]
}

export type PolicySelector = {
  path?: string[]
  lifecycleStage?: ContextLifecycleStage[]
  workflowSource?: Array<RuntimeContextSnapshot["workflowSource"]>
  agentRole?: Array<RuntimeContextSnapshot["agentRole"]>
  workloadTags?: string[]
  modalityRequirements?: string[]
}

export function buildRuntimeContextSnapshot(input: RuntimeContextSnapshot): RuntimeContextSnapshot {
  return {
    ...input,
    relativePath: normalizeRelativePath(input.relativePath),
    workloadTags: [...new Set(input.workloadTags)].sort(),
    modalityRequirements: [...new Set(input.modalityRequirements)].sort(),
  }
}

export function matchesPolicySelector(snapshot: RuntimeContextSnapshot, selector: PolicySelector): boolean {
  if (selector.path && !selector.path.some((pattern) => matchesGlobPattern(pattern, snapshot.relativePath))) {
    return false
  }

  if (selector.lifecycleStage && !selector.lifecycleStage.includes(snapshot.lifecycleStage)) {
    return false
  }

  if (selector.workflowSource && !selector.workflowSource.includes(snapshot.workflowSource)) {
    return false
  }

  if (selector.agentRole && !selector.agentRole.includes(snapshot.agentRole)) {
    return false
  }

  if (selector.workloadTags && !selector.workloadTags.every((tag) => snapshot.workloadTags.includes(tag))) {
    return false
  }

  if (
    selector.modalityRequirements
    && !selector.modalityRequirements.every((tag) => snapshot.modalityRequirements.includes(tag))
  ) {
    return false
  }

  return true
}
