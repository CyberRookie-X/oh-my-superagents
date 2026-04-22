import { describe, expect, it } from "vitest"
import { renderCopilotPromptFile, buildCopilotArtifacts, buildCopilotControlPlaneArtifacts } from "../src/copilot.js"

describe("renderCopilotPromptFile", () => {
  it("renders a Copilot prompt file with YAML frontmatter and OMS marker", () => {
    const output = renderCopilotPromptFile({
      name: "oms-plan",
      description: "Plan a task using the writing-plans phase",
      model: "gpt-5",
      phase: "writing-plans",
      profileId: "planner",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "superpowers",
      },
      workflowEntryName: "superpowers/writing-plans",
    })

    expect(output).toContain("---")
    expect(output).toContain("name: oms-plan")
    expect(output).toContain("description: 'Plan a task using the writing-plans phase'")
    expect(output).toContain("model: gpt-5")
    expect(output).toContain("---")
    expect(output).toContain("<!-- generated-by: oh-my-superagents; do-not-edit: true -->")
    expect(output).toContain("<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.plan; projection=prompt; rendered-name=oms-plan -->")
    expect(output).toContain("Use the workflow entry `superpowers/writing-plans` for `phase.plan` whenever it is relevant.")
    expect(output).toContain("Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.")
  })

  it("escapes single quotes in YAML scalars", () => {
    const output = renderCopilotPromptFile({
      name: "oms-review",
      description: "It's a review phase",
      model: "gpt-5",
      phase: "requesting-code-review",
      profileId: "reviewer",
      sourceEntry: {
        canonicalRoute: "phase.review",
        source: "superpowers",
      },
      workflowEntryName: "superpowers/requesting-code-review",
    })

    expect(output).toContain("description: 'It''s a review phase'")
  })
})

describe("buildCopilotArtifacts", () => {
  it("generates 7 phase prompts for superpowers workflow", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "gpt-5" } },
      routes: {},
      defaultRoute: "planner",
    } as never)

    expect(artifacts.prompts.map((item) => item.fileName)).toEqual([
      "oms-brainstorm.md",
      "oms-plan.md",
      "oms-execute.md",
      "oms-review.md",
      "oms-verify.md",
      "oms-visual.md",
      "oms-web-test.md",
    ])

    const planPrompt = artifacts.prompts.find((item) => item.fileName === "oms-plan.md")
    expect(planPrompt?.directory).toBe(".github/prompts")
    expect(planPrompt?.content).toContain("name: oms-plan")
    expect(planPrompt?.content).toContain("writing-plans")
    expect(planPrompt?.content).toContain("route=phase.plan")
  })

  it("generates intent prompts for direct workflow", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: {
        kind: "direct",
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      profiles: {
        planner: { model: "gpt-5" },
        builder: { model: "gpt-5.4" },
      },
      routes: { plan: "planner", build: "builder" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.prompts.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["rt-plan.md", "rt-build.md"]),
    )

    const planPrompt = artifacts.prompts.find((item) => item.fileName === "rt-plan.md")
    expect(planPrompt?.content).toContain("name: rt-plan")
    expect(planPrompt?.content).toContain("intent: plan")
    expect(planPrompt?.content).toContain("route=intent.plan")
  })

  it("rejects invalid direct intent ids", () => {
    expect(() =>
      buildCopilotArtifacts({
        workflow: {
          kind: "direct",
          intents: {
            "foo/bar": { label: "Foo" },
          },
        },
        profiles: { planner: { model: "gpt-5" } },
        routes: { "foo/bar": "planner" },
        defaultRoute: "planner",
      } as never),
    ).toThrow(/invalid direct intent id|foo\/bar/i)
  })

  it("fails through capability policy for unsupported source entries", () => {
    expect(() =>
      buildCopilotArtifacts({
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "gpt-5" } },
        routes: {},
        defaultRoute: "planner",
        effectiveSources: {
          "phase.brainstorm": "gstack",
        },
      } as never),
    ).toThrow(/capability policy.*unsupported_source_route.*phase\.brainstorm/i)
  })
})

describe("buildCopilotControlPlaneArtifacts", () => {
  it("generates control plane command prompts", () => {
    const artifacts = buildCopilotControlPlaneArtifacts({
      commandPrefix: "oms",
      commands: {
        status: { name: "status", aliases: ["st"] },
        use: { name: "use", aliases: ["u"] },
        disable: { name: "off", aliases: ["o"] },
        sync: { name: "sync", aliases: ["sy"] },
        doctor: { name: "doctor", aliases: ["dr"] },
      },
    })

    expect(artifacts.map((item) => item.fileName)).toEqual([
      "oms-status.md",
      "oms-st.md",
      "oms-use.md",
      "oms-u.md",
      "oms-off.md",
      "oms-o.md",
      "oms-sync.md",
      "oms-sy.md",
      "oms-doctor.md",
      "oms-dr.md",
    ])

    const statusPrompt = artifacts.find((item) => item.fileName === "oms-status.md")
    expect(statusPrompt?.directory).toBe(".github/prompts")
    expect(statusPrompt?.content).toContain("description: 'Show OMS status for Copilot.'")
    expect(statusPrompt?.content).toContain("oms-control-plane: stage=1; host=copilot; artifact=command; logical-command=status; rendered-name=oms-status")
    expect(statusPrompt?.content).toContain("Run `oh-my-superagents status --host copilot $ARGUMENTS`")
  })
})
