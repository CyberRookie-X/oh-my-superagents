import { mergePolicyFamilies, type PolicyFamilies, type PolicyRule } from "./policy-families.js"
import { matchesPolicySelector, type RuntimeContextSnapshot } from "./policy-selectors.js"

export type ResolvedPolicyFamilies = {
  snapshot: RuntimeContextSnapshot
  provenance?: RuntimeSelectorProvenance
  matchedRuleIds: string[]
  policy: PolicyFamilies
}

export type RuntimeSelectorProvenance = {
  lifecycleStage: "explicit" | "defaulted"
  workflowSource: "explicit" | "derived"
  relativePath: "explicit" | "defaulted"
  workloadTags: "explicit" | "derived"
  modalityRequirements: "explicit" | "defaulted"
  agentRole: "explicit" | "defaulted"
}

export function resolvePolicyFamilies(
  snapshot: RuntimeContextSnapshot,
  rules: readonly PolicyRule[],
  provenance?: RuntimeSelectorProvenance,
): ResolvedPolicyFamilies {
  let policy: PolicyFamilies = {}
  const matchedRuleIds: string[] = []

  for (const [index, rule] of rules.entries()) {
    if (rule.selector.path && snapshot.relativePath.length === 0) {
      continue
    }

    if (!matchesPolicySelector(snapshot, rule.selector)) {
      continue
    }

    policy = mergePolicyFamilies(policy, rule.policy)
    const ruleId = rule.id ?? `rule-${index + 1}`
    if (!matchedRuleIds.includes(ruleId)) {
      matchedRuleIds.push(ruleId)
    }
  }

  return {
    snapshot,
    ...(provenance ? { provenance } : {}),
    matchedRuleIds,
    policy,
  }
}
