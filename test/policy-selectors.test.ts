import { describe, expect, it } from "vitest"
import { buildRuntimeContextSnapshot, matchesPolicySelector } from "../src/policy-selectors.js"

describe("buildRuntimeContextSnapshot", () => {
  it("normalizes runtime facts into a stable snapshot", () => {
    expect(buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["web-test", "frontend", "frontend"],
      modalityRequirements: ["browser-observation", "vision-input", "vision-input"],
    })).toMatchObject({
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend", "web-test"],
      modalityRequirements: ["browser-observation", "vision-input"],
    })
  })
})

describe("matchesPolicySelector", () => {
  it("matches path, stage, role, and workload tags together", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend", "visual"],
      modalityRequirements: ["vision-input"],
    })

    expect(matchesPolicySelector(snapshot, {
      path: ["frontend/**"],
      lifecycleStage: ["verify"],
      workflowSource: ["superpowers"],
      agentRole: ["subagent"],
      workloadTags: ["frontend"],
      modalityRequirements: ["vision-input"],
    })).toBe(true)
  })

  it("rejects a selector when workflowSource does not match", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend", "visual"],
      modalityRequirements: ["vision-input"],
    })

    expect(matchesPolicySelector(snapshot, {
      workflowSource: ["gstack"],
    })).toBe(false)
  })

  it("rejects a selector when modality requirements are missing", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend", "visual"],
      modalityRequirements: ["vision-input"],
    })

    expect(matchesPolicySelector(snapshot, {
      modalityRequirements: ["browser-observation"],
    })).toBe(false)
  })

  it("matches glob selectors that use **/ for direct-child files", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "src/index.ts",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "primary",
      workloadTags: ["backend"],
      modalityRequirements: [],
    })

    expect(matchesPolicySelector(snapshot, {
      path: ["src/**/*.ts"],
    })).toBe(true)
  })

  it("normalizes windows-style paths before evaluating path selectors", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "C:/repo",
      relativePath: "frontend\\app\\page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "primary",
      workloadTags: ["frontend"],
      modalityRequirements: [],
    })

    expect(snapshot.relativePath).toBe("frontend/app/page.tsx")
    expect(matchesPolicySelector(snapshot, {
      path: ["frontend/**"],
    })).toBe(true)
  })

  it("normalizes windows-style selector patterns before matching", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "C:/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "primary",
      workloadTags: ["frontend"],
      modalityRequirements: [],
    })

    expect(matchesPolicySelector(snapshot, {
      path: ["frontend\\**"],
    })).toBe(true)
  })
})
