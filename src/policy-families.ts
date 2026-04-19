import type { PolicySelector } from "./policy-selectors.js"

export type ModelPolicy = {
  preferredProfiles?: string[]
  effort?: "fast" | "balanced" | "deep" | "max" | null
  preferWindowClass?: "small" | "medium" | "large" | null
  requiredCapabilities?: string[]
}

export type ContextPolicy = {
  compressionPreset?: string | null
  packetFirst?: boolean | null
  maxCharsBeforeCompression?: number | null
}

export type ToolPolicy = {
  allowedSkillTags?: string[]
  allowedMcpTags?: string[]
  blockedToolTags?: string[]
}

export type PolicyFamilies = {
  modelPolicy?: ModelPolicy
  contextPolicy?: ContextPolicy
  toolPolicy?: ToolPolicy
}

export type PolicyRule = {
  id?: string
  selector: PolicySelector
  policy: PolicyFamilies
}

export function clonePolicyFamilies(input: PolicyFamilies | undefined): PolicyFamilies | undefined {
  if (!input) {
    return undefined
  }

  return {
    modelPolicy: input.modelPolicy
      ? {
          ...input.modelPolicy,
          preferredProfiles: input.modelPolicy.preferredProfiles ? [...input.modelPolicy.preferredProfiles] : undefined,
          requiredCapabilities: input.modelPolicy.requiredCapabilities ? [...input.modelPolicy.requiredCapabilities] : undefined,
        }
      : undefined,
    contextPolicy: input.contextPolicy ? { ...input.contextPolicy } : undefined,
    toolPolicy: input.toolPolicy
      ? {
          ...input.toolPolicy,
          allowedSkillTags: input.toolPolicy.allowedSkillTags ? [...input.toolPolicy.allowedSkillTags] : undefined,
          allowedMcpTags: input.toolPolicy.allowedMcpTags ? [...input.toolPolicy.allowedMcpTags] : undefined,
          blockedToolTags: input.toolPolicy.blockedToolTags ? [...input.toolPolicy.blockedToolTags] : undefined,
        }
      : undefined,
  }
}

export function clonePolicyRules(input: PolicyRule[] | undefined): PolicyRule[] | undefined {
  return input?.map((rule) => ({
    ...(rule.id ? { id: rule.id } : {}),
    selector: {
      path: rule.selector.path ? [...rule.selector.path] : undefined,
      lifecycleStage: rule.selector.lifecycleStage ? [...rule.selector.lifecycleStage] : undefined,
      workflowSource: rule.selector.workflowSource ? [...rule.selector.workflowSource] : undefined,
      agentRole: rule.selector.agentRole ? [...rule.selector.agentRole] : undefined,
      workloadTags: rule.selector.workloadTags ? [...rule.selector.workloadTags] : undefined,
      modalityRequirements: rule.selector.modalityRequirements ? [...rule.selector.modalityRequirements] : undefined,
    },
    policy: clonePolicyFamilies(rule.policy) ?? {},
  }))
}

function compactObject<T extends Record<string, unknown>>(input: T | undefined) {
  if (!input) {
    return undefined
  }

  const entries = Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
  return entries.length > 0 ? Object.fromEntries(entries) as T : undefined
}

function cloneStringArray(values: string[] | undefined) {
  return values ? [...values] : values
}

export function mergePolicyFamilies(base: PolicyFamilies, override: PolicyFamilies): PolicyFamilies {
  const modelPolicy = compactObject({
    ...base.modelPolicy,
    ...override.modelPolicy,
    preferredProfiles: cloneStringArray(override.modelPolicy?.preferredProfiles ?? base.modelPolicy?.preferredProfiles),
    requiredCapabilities: cloneStringArray(override.modelPolicy?.requiredCapabilities ?? base.modelPolicy?.requiredCapabilities),
  })
  const contextPolicy = compactObject({
    ...base.contextPolicy,
    ...override.contextPolicy,
  })
  const toolPolicy = compactObject({
    ...base.toolPolicy,
    ...override.toolPolicy,
    allowedSkillTags: cloneStringArray(override.toolPolicy?.allowedSkillTags ?? base.toolPolicy?.allowedSkillTags),
    allowedMcpTags: cloneStringArray(override.toolPolicy?.allowedMcpTags ?? base.toolPolicy?.allowedMcpTags),
    blockedToolTags: cloneStringArray(override.toolPolicy?.blockedToolTags ?? base.toolPolicy?.blockedToolTags),
  })

  return {
    ...(modelPolicy ? { modelPolicy } : {}),
    ...(contextPolicy ? { contextPolicy } : {}),
    ...(toolPolicy ? { toolPolicy } : {}),
  }
}
