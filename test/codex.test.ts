import { describe, expect, it } from "vitest"
import { buildCodexArtifacts, renderCodexAgentFile } from "../src/codex.js"

describe("renderCodexAgentFile", () => {
  it("renders a codex custom agent with model and developer instructions", () => {
    const output = renderCodexAgentFile({
      name: "oms-brainstorm",
      description: "Brainstorm phase agent",
      developerInstructions: "Activate and follow the brainstorming skill.",
      model: "gpt-5.4",
      reasoningEffort: "high",
    })

    expect(output).toContain('name = "oms-brainstorm"')
    expect(output).toContain('description = "Brainstorm phase agent"')
    expect(output).toContain('model = "gpt-5.4"')
    expect(output).toContain('model_reasoning_effort = "high"')
    expect(output).toContain("developer_instructions = \"\"\"")
  })

  it("adds service_tier fast for fast effort profiles", () => {
    const output = renderCodexAgentFile({
      name: "oms-review",
      description: "Review phase agent",
      developerInstructions: "Activate and follow the requesting-code-review skill.",
      model: "gpt-5.3-codex-spark",
      reasoningEffort: "low",
      serviceTier: "fast",
    })

    expect(output).toContain('service_tier = "fast"')
  })
})

describe("buildCodexArtifacts", () => {
  it("materializes one Codex agent per built-in phase", () => {
    const artifacts = buildCodexArtifacts({
      profiles: { build: { model: "gpt-5.4", effort: "balanced" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(artifacts.agents.map((item) => item.fileName)).toEqual([
      "oms-brainstorm.toml",
      "oms-plan.toml",
      "oms-execute.toml",
      "oms-review.toml",
      "oms-verify.toml",
      "oms-visual.toml",
      "oms-web-test.toml",
    ])
  })

  it("maps max effort to xhigh reasoning", () => {
    const artifacts = buildCodexArtifacts({
      profiles: { review: { model: "gpt-5.4", effort: "max" } },
      routes: { "requesting-code-review": "review" },
      defaultRoute: "review",
    })

    const review = artifacts.agents.find((item) => item.fileName === "oms-review.toml")
    expect(review?.content).toContain('model_reasoning_effort = "xhigh"')
  })
})
