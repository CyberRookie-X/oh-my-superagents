import { describe, expect, it } from "vitest"
import { renderCopilotAgentFile } from "../src/copilot.js"

describe("renderCopilotAgentFile", () => {
  it("renders a superpowers phase agent with correct front matter", () => {
    const result = renderCopilotAgentFile({
      name: "oms-brainstorm",
      description: "Route brainstorming phase through OMS profile default",
      model: "gpt-4.1",
      phase: "brainstorming",
      profileId: "default",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(result).toContain("---")
    expect(result).toContain("name: oms-brainstorm")
    expect(result).toContain("description:")
    expect(result).toContain("tools:")
    expect(result).toContain("generated-by: oh-my-superagents")
    expect(result).toContain("oms-route: stage=3; host=copilot")
    expect(result).toContain("route=phase.brainstorm")
    expect(result).toContain("source=superpowers")
    expect(result).toContain("projection=agent")
    expect(result).toContain("canonical route: `phase.brainstorm`")
    expect(result).toContain("model: `gpt-4.1`")
    expect(result).toContain("profile: `default`")
    expect(result).toContain("superpowers/brainstorming")
  })

  it("renders a direct mode agent", () => {
    const result = renderCopilotAgentFile({
      name: "rt-review",
      description: "rt-review routing agent for review",
      model: "gpt-4.1",
      intent: "review",
      sourceEntry: {
        canonicalRoute: "intent.review",
        source: "direct",
      },
    })

    expect(result).toContain("name: rt-review")
    expect(result).toContain("route=intent.review")
    expect(result).toContain("source=direct")
    expect(result).toContain("projection=agent")
    expect(result).not.toContain("workflow entry")
  })

  it("includes variant and temperature when provided", () => {
    const result = renderCopilotAgentFile({
      name: "oms-plan",
      description: "plan agent",
      model: "gpt-4.1",
      variant: "fast",
      temperature: 0.5,
      phase: "writing-plans",
      profileId: "default",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "superpowers",
        entryName: "writing-plans",
      },
      workflowEntryName: "superpowers/writing-plans",
    })

    expect(result).toContain("variant: fast")
    expect(result).toContain("temperature: 0.5")
  })

  it("includes lane info for subagent-driven-development", () => {
    const result = renderCopilotAgentFile({
      name: "spr-build--frontend",
      description: "spr-build--frontend helper for subagent-driven-development",
      model: "gpt-4.1",
      phase: "subagent-driven-development",
      profileId: "frontend",
      effectiveLane: "frontend",
      sourceEntry: {
        canonicalRoute: "phase.execute",
        source: "superpowers",
        entryName: "subagent-driven-development",
      },
      workflowEntryName: "superpowers/subagent-driven-development",
    })

    expect(result).toContain("lane: frontend")
    expect(result).toContain("spr-build--frontend")
  })
})
