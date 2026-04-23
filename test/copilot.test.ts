import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

describe("PHASE_TO_COPILOT_AGENT", () => {
  it("maps all 7 built-in phases to copilot agent names", () => {
    const phases = [
      "brainstorming",
      "writing-plans",
      "subagent-driven-development",
      "requesting-code-review",
      "verification-before-completion",
      "frontend-design",
      "webapp-testing",
    ] as const

    for (const phase of phases) {
      expect(library.PHASE_TO_COPILOT_AGENT[phase]).toBeDefined()
      expect(library.PHASE_TO_COPILOT_AGENT[phase]).toMatch(/^oms-/)
    }
  })
})

describe("renderCopilotAgentFile", () => {
  it("renders a Copilot agent file with correct format and metadata", () => {
    const output = library.renderCopilotAgentFile({
      name: "oms-plan",
      phase: "writing-plans",
      profileId: "planner",
      model: "anthropic/claude-sonnet-4-5",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "gstack",
        entryName: "plan-eng-review",
      },
      workflowEntryName: "gstack/plan-eng-review",
    })

    expect(output).toContain("# generated-by: oh-my-superagents; do-not-edit: true")
    expect(output).toContain(
      "<!-- oms-route: stage=1; host=copilot; source=gstack; route=phase.plan; projection=agent; rendered-name=oms-plan -->",
    )
    expect(output).toContain("# Agent: oms-plan")
    expect(output).toContain("Use the gstack workflow entry `gstack/plan-eng-review` for `phase.plan` whenever it is relevant.")
    expect(output).toContain(
      "If that gstack entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.",
    )
    expect(output).toContain("- profile: `planner`")
    expect(output).toContain("- model: `anthropic/claude-sonnet-4-5`")
  })

  it("uses generic workflow guidance for non-gstack sources", () => {
    const output = library.renderCopilotAgentFile({
      name: "oms-brainstorm",
      phase: "brainstorming",
      profileId: "strategy",
      model: "anthropic/claude-sonnet-4-5",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(output).toContain("Use the workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.")
  })
})

describe("buildCopilotArtifacts", () => {
  it("materializes one Copilot agent per canonical phase route", () => {
    const artifacts = library.buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
      effectiveSources: {
        "phase.plan": "gstack",
      },
    } as never)

    expect(artifacts.agents.map((item) => `${item.directory}/${item.fileName}`)).toEqual([
      ".github/agents/oms-brainstorm/oms-brainstorm.agent.md",
      ".github/agents/oms-plan/oms-plan.agent.md",
      ".github/agents/oms-execute/oms-execute.agent.md",
      ".github/agents/oms-review/oms-review.agent.md",
      ".github/agents/oms-verify/oms-verify.agent.md",
      ".github/agents/oms-visual/oms-visual.agent.md",
      ".github/agents/oms-web-test/oms-web-test.agent.md",
    ])

    const planAgent = artifacts.agents.find((item) => item.directory === ".github/agents/oms-plan")
    const brainstormAgent = artifacts.agents.find((item) => item.directory === ".github/agents/oms-brainstorm")

    expect(planAgent?.content).toContain("route=phase.plan")
    expect(planAgent?.content).toContain("source=gstack")
    expect(planAgent?.content).toContain("gstack/plan-eng-review")
    expect(brainstormAgent?.content).toContain("Use the workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.")
  })

  it("fails through the shared capability policy when a Copilot phase resolves to an unsupported source entry", () => {
    expect(() =>
      library.buildCopilotArtifacts({
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
        effectiveSources: {
          "phase.brainstorm": "gstack",
        },
      } as never)
    ).toThrow(/capability policy.*unsupported_source_route.*phase\.brainstorm/i)
  })

  it("fails closed for direct workflow configs", () => {
    expect(() =>
      library.buildCopilotArtifacts({
        workflow: {
          kind: "direct",
          intents: {
            plan: { label: "Plan" },
          },
        },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: { plan: "planner" },
        defaultRoute: "planner",
      } as never)
    ).toThrow(/Copilot direct workflow projection is not implemented/i)
  })
})
