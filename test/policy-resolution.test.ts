import { describe, expect, it } from "vitest"
import { buildRuntimeContextSnapshot } from "../src/policy-selectors.js"
import { resolvePolicyFamilies } from "../src/policy-resolution.js"

describe("resolvePolicyFamilies", () => {
  it("applies matching rules in declaration order and records matched rule ids", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend"],
      modalityRequirements: ["vision-input"],
    })

    const resolved = resolvePolicyFamilies(snapshot, [
      {
        id: "frontend-base",
        selector: { path: ["frontend/**"] },
        policy: { modelPolicy: { preferredProfiles: ["frontend-base"] } },
      },
      {
        id: "frontend-verify",
        selector: { path: ["frontend/**"], lifecycleStage: ["verify"] },
        policy: { modelPolicy: { preferredProfiles: ["vision-review"] } },
      },
    ])

    expect(resolved.matchedRuleIds).toEqual(["frontend-base", "frontend-verify"])
    expect(resolved.policy.modelPolicy?.preferredProfiles).toEqual(["vision-review"])
  })

  it("uses declaration index when synthesizing ids for anonymous matching rules", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend"],
      modalityRequirements: ["vision-input"],
    })

    const resolved = resolvePolicyFamilies(snapshot, [
      {
        selector: { path: ["backend/**"] },
        policy: { modelPolicy: { preferredProfiles: ["backend-only"] } },
      },
      {
        selector: { path: ["frontend/**"] },
        policy: { modelPolicy: { preferredProfiles: ["frontend-only"] } },
      },
    ])

    expect(resolved.matchedRuleIds).toEqual(["rule-2"])
    expect(resolved.policy.modelPolicy?.preferredProfiles).toEqual(["frontend-only"])
  })
})
