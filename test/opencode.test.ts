import { describe, expect, it } from "vitest"
import { buildArtifacts, renderAgentFile, renderCommandFile } from "../src/opencode.js"

describe("renderAgentFile", () => {
  it("renders hidden subagent frontmatter and marker", () => {
    const output = renderAgentFile({
      agentName: "spr-build",
      description: "Implementation lane",
      model: "openai/gpt-5",
      variant: "medium",
      temperature: 0.1,
      permissionTask: { "*": "deny", "spr-review": "allow", "spr-verify": "allow" },
    })

    expect(output).toContain("mode: subagent")
    expect(output).toContain("hidden: true")
    expect(output).toContain("generated-by: oh-my-superagents")
    expect(output).toContain("spr-review")
  })
})

describe("renderCommandFile", () => {
  it("renders exact skill handoff payload", () => {
    const output = renderCommandFile({
      description: "Route brainstorming",
      agentName: "spr-strategy",
      skillName: "superpowers/brainstorming",
      phase: "brainstorming",
    })

    expect(output).toContain("agent: 'spr-strategy'")
    expect(output).toContain("subtask: true")
    expect(output).toContain("superpowers/brainstorming")
    expect(output).toContain("arguments: $ARGUMENTS")
  })
})

describe("buildArtifacts", () => {
  it("materializes the full fixed v1 command set", () => {
    const artifacts = buildArtifacts({
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(artifacts.commands.map((item: { fileName: string }) => item.fileName)).toEqual([
      "sp-brainstorm.md",
      "sp-plan.md",
      "sp-execute.md",
      "sp-review.md",
      "sp-verify.md",
      "sp-visual.md",
      "sp-web-test.md",
    ])
  })

  it("fails when a built-in phase has no route and no defaultRoute", () => {
    expect(() =>
      buildArtifacts({
        profiles: { review: { model: "anthropic/claude-sonnet-4-5" } },
        routes: { "requesting-code-review": "review" },
      }),
    ).toThrow(/brainstorming/)
  })

  it("fails when shared agent phases resolve to different selections", () => {
    expect(() =>
      buildArtifacts({
        profiles: {
          visualA: { model: "google/gemini-2.5-pro", variant: "high" },
          visualB: { model: "google/gemini-2.5-flash", variant: "low" },
        },
        routes: {
          "frontend-design": "visualA",
          "webapp-testing": "visualB",
        },
        defaultRoute: "visualA",
      }),
    ).toThrow(/spr-visual/)
  })
})
