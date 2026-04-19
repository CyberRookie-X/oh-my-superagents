import type { ContextLifecycleStage } from "./context-lifecycle.js"

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

function normalizeRelativePath(relativePath: string) {
  return relativePath.replaceAll("\\", "/")
}

export function buildRuntimeContextSnapshot(input: RuntimeContextSnapshot): RuntimeContextSnapshot {
  return {
    ...input,
    relativePath: normalizeRelativePath(input.relativePath),
    workloadTags: [...new Set(input.workloadTags)].sort(),
    modalityRequirements: [...new Set(input.modalityRequirements)].sort(),
  }
}

function matchesGlobPattern(value: string, pattern: string) {
  const regex = new RegExp(`^${escapeGlobPattern(normalizeRelativePath(pattern))}$`)
  return regex.test(value)
}

function escapeGlobPattern(pattern: string) {
  let escaped = ""

  for (let index = 0; index < pattern.length; index += 1) {
    const current = pattern[index]
    const next = pattern[index + 1]
    const nextNext = pattern[index + 2]

    if (current === "*" && next === "*" && nextNext === "/") {
      escaped += "(?:.*/)?"
      index += 2
      continue
    }

    if (current === "*" && next === "*") {
      escaped += ".*"
      index += 1
      continue
    }

    if (current === "*") {
      escaped += "[^/]*"
      continue
    }

    if (current === "?") {
      escaped += "."
      continue
    }

    if (/[|\\{}()[\]^$+?.]/.test(current)) {
      escaped += `\\${current}`
      continue
    }

    escaped += current
  }

  return escaped
}

export function matchesPolicySelector(snapshot: RuntimeContextSnapshot, selector: PolicySelector): boolean {
  if (selector.path && !selector.path.some((pattern) => matchesGlobPattern(snapshot.relativePath, pattern))) {
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
