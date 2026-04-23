import { describe, expect, it } from "vitest"
import { renderCopilotSkillFile } from "../src/copilot.js"

describe("renderCopilotSkillFile", () => {
  it("renders a superpowers phase skill with correct structure", () => {
    const result = renderCopilotSkillFile({
      name: "oms-brainstorm",
      phase: "brainstorming",
      profileId: "default",
      model: "gpt-4.1",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(result).toContain("# Skill: oms-brainstorm")
    expect(result).toContain("## Purpose")
    expect(result).toContain("## Instructions")
    expect(result).toContain("## Route Metadata")
    expect(result).toContain("generated-by: oh-my-superagents")
    expect(result).toContain("oms-route: stage=3; host=copilot")
    expect(result).toContain("route=phase.brainstorm")
    expect(result).toContain("projection=skill")
    expect(result).toContain("canonical route: `phase.brainstorm`")
    expect(result).toContain("model: `gpt-4.1`")
  })

  it("renders direct mode skill", () => {
    const result = renderCopilotSkillFile({
      name: "rt-review",
      intent: "review",
      profileId: "default",
      model: "gpt-4.1",
      sourceEntry: {
        canonicalRoute: "intent.review",
        source: "direct",
      },
    })

    expect(result).toContain("route=intent.review")
    expect(result).toContain("source=direct")
    expect(result).toContain("projection=skill")
  })
})
