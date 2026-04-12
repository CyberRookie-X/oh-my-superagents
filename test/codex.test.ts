import { describe, expect, expectTypeOf, it } from "vitest"
import { buildCodexArtifacts, explainCodexPhase, renderCodexAgentFile } from "../src/codex.js"

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

  it("renders direct-mode Codex agents for workflow intents", () => {
    const artifacts = buildCodexArtifacts({
      workflow: {
        kind: "direct",
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      profiles: {
        planner: { model: "openai/gpt-5" },
        builder: { model: "gpt-5.4" },
      },
      routes: { plan: "planner" },
      defaultRoute: "builder",
    } as never)

    expect(artifacts.agents.map((item) => item.fileName)).toEqual(["rt-plan.toml", "rt-build.toml"])
  })

  it("does not delegate to upstream superpowers skills in direct mode", () => {
    const artifacts = buildCodexArtifacts({
      workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.agents[0]?.content).not.toContain("Use the superpowers skill")
  })

  it("rejects unsafe direct intent ids before generating filenames", () => {
    expect(() =>
      buildCodexArtifacts({
        workflow: { kind: "direct", intents: { "foo/bar": { label: "Bad" } } },
        profiles: { planner: { model: "openai/gpt-5" } },
        routes: { "foo/bar": "planner" },
        defaultRoute: "planner",
      } as never),
    ).toThrow("Invalid direct intent id: foo/bar")
  })

  it('sanitizes direct-mode developer instructions for TOML multiline strings', () => {
    const artifacts = buildCodexArtifacts({
      workflow: {
        kind: "direct",
        intents: {
          plan: { label: 'Plan """ safely', description: 'Keep """ literal text intact' },
        },
      },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.agents[0]?.content.match(/"""/g)).toHaveLength(2)
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

  it("enables native Codex fast tier when codexFast is true without changing deep effort", () => {
    const artifacts = buildCodexArtifacts({
      profiles: { build: { model: "gpt-5.4", effort: "deep", codexFast: true } },
      routes: {},
      defaultRoute: "build",
    })

    const agent = artifacts.agents.find((item) => item.fileName === "oms-plan.toml")
    expect(agent?.content).toContain('model_reasoning_effort = "high"')
    expect(agent?.content).toContain('service_tier = "fast"')
  })

  it("preserves existing Codex fast behavior for legacy effort-fast profiles", () => {
    const artifacts = buildCodexArtifacts({
      profiles: { build: { model: "gpt-5.4", effort: "fast" } },
      routes: {},
      defaultRoute: "build",
    })

    const agent = artifacts.agents.find((item) => item.fileName === "oms-plan.toml")
    expect(agent?.content).toContain('model_reasoning_effort = "low"')
    expect(agent?.content).toContain('service_tier = "fast"')
  })

  it("keeps the explained Codex service tier typed as the native fast literal", () => {
    const explained = explainCodexPhase(
      {
        profiles: { build: { model: "gpt-5.4", effort: "deep", codexFast: true } },
        routes: {},
        defaultRoute: "build",
      },
      "writing-plans",
    )

    expectTypeOf(explained.serviceTier).toEqualTypeOf<"fast" | undefined>()
  })
})
