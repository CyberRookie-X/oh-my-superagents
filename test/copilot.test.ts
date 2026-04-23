import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

describe("renderCopilotAgentFile", () => {
  it("renders a Copilot-native agent file with source-aware instructions", () => {
    const output = library.renderCopilotAgentFile({
      name: "oms-plan",
      phase: "writing-plans",
      profileId: "planner",
      model: "anthropic/claude-sonnet-4-5",
      sourceEntry: {
        canonicalRoute: "phase.plan",
        source: "superpowers",
        entryName: "writing-plans",
      },
      workflowEntryName: "superpowers/writing-plans",
    })

    expect(output).toContain("# generated-by: oh-my-superagents; do-not-edit: true")
    expect(output).toContain(
      "<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.plan; projection=agent; rendered-name=oms-plan -->",
    )
    expect(output).toContain("# Agent: oms-plan")
    expect(output).toContain("Use the workflow entry `superpowers/writing-plans` for `phase.plan` whenever it is relevant.")
    expect(output).toContain(
      "If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.",
    )
    expect(output).toContain("- profile: `planner`")
    expect(output).toContain("- model: `anthropic/claude-sonnet-4-5`")
  })

  it("renders gstack source entry with gstack-specific guidance", () => {
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

    expect(output).toContain("Use the gstack workflow entry `gstack/plan-eng-review` for `phase.plan` whenever it is relevant.")
    expect(output).toContain("If that gstack entry is unavailable")
  })
})

describe("renderCopilotSkillFile", () => {
  it("renders a Copilot-native skill file for control-plane commands", () => {
    const output = library.renderCopilotSkillFile({
      name: "oms-status",
      command: "status",
    })

    expect(output).toContain("# generated-by: oh-my-superagents; do-not-edit: true")
    expect(output).toContain(
      "<!-- oms-control-plane: stage=1; host=copilot; artifact=skill; logical-command=status; rendered-name=oms-status -->",
    )
    expect(output).toContain("# Skill: oms-status")
    expect(output).toContain("Show OMS status for Copilot CLI.")
    expect(output).toContain("Run `oh-my-superagents status --host copilot` and present the results.")
  })
})

describe("buildCopilotArtifacts", () => {
  it("materializes one Copilot agent per canonical phase route", () => {
    const artifacts = library.buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
    } as never)

    expect(artifacts.agents.map((item) => `${item.directory}/${item.fileName}`)).toEqual([
      ".github/copilot/agents/oms-brainstorm.md",
      ".github/copilot/agents/oms-plan.md",
      ".github/copilot/agents/oms-execute.md",
      ".github/copilot/agents/oms-review.md",
      ".github/copilot/agents/oms-verify.md",
      ".github/copilot/agents/oms-visual.md",
      ".github/copilot/agents/oms-web-test.md",
    ])

    const planAgent = artifacts.agents.find((item) => item.fileName === "oms-plan.md")
    expect(planAgent?.content).toContain("route=phase.plan")
    expect(planAgent?.content).toContain("source=superpowers")
  })

  it("materializes skill files for all control-plane commands", () => {
    const artifacts = library.buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
    } as never)

    expect(artifacts.skills.map((item) => `${item.directory}/${item.fileName}`)).toEqual([
      ".github/copilot/skills/oms-status/SKILL.md",
      ".github/copilot/skills/oms-use/SKILL.md",
      ".github/copilot/skills/oms-disable/SKILL.md",
      ".github/copilot/skills/oms-sync/SKILL.md",
      ".github/copilot/skills/oms-doctor/SKILL.md",
    ])
  })

  it("renders pre and post command hooks", () => {
    const artifacts = library.buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
    } as never)

    expect(artifacts.hooks.map((item) => `${item.directory}/${item.fileName}`)).toEqual([
      ".github/copilot/hooks/pre-command.sh",
      ".github/copilot/hooks/post-command.sh",
    ])

    const preHook = artifacts.hooks.find((item) => item.fileName === "pre-command.sh")
    expect(preHook?.content).toContain("#!/bin/bash")
    expect(preHook?.content).toContain("generated-by: oh-my-superagents")
    expect(preHook?.executable).toBe(true)
  })

  it("renders gstack source entries correctly", () => {
    const artifacts = library.buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
      routes: {},
      defaultRoute: "planner",
      effectiveSources: {
        "phase.plan": "gstack",
      },
    } as never)

    const planAgent = artifacts.agents.find((item) => item.fileName === "oms-plan.md")
    expect(planAgent?.content).toContain("source=gstack")
    expect(planAgent?.content).toContain("gstack/plan-eng-review")
  })
})
