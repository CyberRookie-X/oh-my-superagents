import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

describe("renderClaudeSkillFile", () => {
  it("renders a Claude-native SKILL.md wrapper with source-aware instructions", () => {
    const output = library.renderClaudeSkillFile({
      name: "oms-plan",
      phase: "writing-plans",
      profileId: "planner",
      model: "anthropic/claude-sonnet-4-5",
      sourceEntry: {
        canonicalRoute: "phase.writing-plans",
        source: "gstack",
        entryName: "plan-eng-review",
      },
      workflowEntryName: "gstack/plan-eng-review",
    })

    expect(output).toContain("# generated-by: oh-my-superagents; do-not-edit: true")
    expect(output).toContain(
      "<!-- oms-route: stage=1; host=claude; source=gstack; route=phase.writing-plans; projection=skill; rendered-name=oms-plan -->",
    )
    expect(output).toContain("# Skill: oms-plan")
    expect(output).toContain("Use the gstack workflow entry `gstack/plan-eng-review` for `phase.writing-plans` whenever it is relevant.")
    expect(output).toContain(
      "If that gstack entry is unavailable, say that the required workflow source is not installed for Claude and stop instead of improvising a replacement workflow.",
    )
    expect(output).toContain("- profile: `planner`")
    expect(output).toContain("- model: `anthropic/claude-sonnet-4-5`")
  })
})

describe("buildClaudeArtifacts", () => {
  it("materializes one Claude skill per canonical phase route", () => {
    const artifacts = library.buildClaudeArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
      effectiveSources: {
        "phase.writing-plans": "gstack",
      },
    } as never)

    expect(artifacts.skills.map((item) => `${item.directory}/${item.fileName}`)).toEqual([
      ".claude/skills/oms-brainstorm/SKILL.md",
      ".claude/skills/oms-plan/SKILL.md",
      ".claude/skills/oms-execute/SKILL.md",
      ".claude/skills/oms-review/SKILL.md",
      ".claude/skills/oms-verify/SKILL.md",
      ".claude/skills/oms-visual/SKILL.md",
      ".claude/skills/oms-web-test/SKILL.md",
    ])

    const planSkill = artifacts.skills.find((item) => item.directory === ".claude/skills/oms-plan")

    expect(planSkill?.content).toContain("route=phase.writing-plans")
    expect(planSkill?.content).toContain("source=gstack")
    expect(planSkill?.content).toContain("gstack/plan-eng-review")
  })

  it("fails closed for direct workflow configs", () => {
    expect(() =>
      library.buildClaudeArtifacts({
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
    ).toThrow(/not supported/i)
  })
})
