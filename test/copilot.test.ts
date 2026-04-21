import { describe, expect, it } from "vitest"
import {
  buildCopilotArtifacts,
  explainCopilotPhase,
  explainAllCopilot,
  renderCopilotAgentFile,
  renderCopilotPluginJson,
  renderCopilotHooksJson,
  renderCopilotSkillFile,
} from "../src/copilot.js"

describe("renderCopilotAgentFile", () => {
  it("renders a copilot agent file with YAML frontmatter and instructions", () => {
    const output = renderCopilotAgentFile({
      name: "oms-brainstorm",
      description: "brainstorming phase agent for oh-my-superagents",
      instructions: [
        "You are the oms-brainstorm phase agent for oh-my-superagents.",
        "Use the workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.",
        "Stay focused on the current phase.",
      ].join("\n"),
    })

    expect(output).toContain("---")
    expect(output).toContain("name: oms-brainstorm")
    expect(output).toContain("description: brainstorming phase agent for oh-my-superagents")
    expect(output).toContain("tools:")
    expect(output).toContain("- bash")
    expect(output).toContain("- edit")
    expect(output).toContain("- read")
    expect(output).toContain("- glob")
    expect(output).toContain("- grep")
    expect(output).toContain("---")
    expect(output).toContain("generated-by: oh-my-superagents; do-not-edit: true")
    expect(output).toContain("You are the oms-brainstorm phase agent for oh-my-superagents.")
  })

  it("includes route ownership metadata in the agent file body", () => {
    const output = renderCopilotAgentFile({
      name: "oms-plan",
      description: "writing-plans phase agent for oh-my-superagents",
      instructions: [
        "<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.plan; projection=agent; rendered-name=oms-plan -->",
        "You are the oms-plan phase agent for oh-my-superagents.",
      ].join("\n"),
    })

    expect(output).toContain("oms-route: stage=1; host=copilot; source=superpowers; route=phase.plan")
    expect(output).toContain("rendered-name=oms-plan")
  })
})

describe("renderCopilotPluginJson", () => {
  it("renders valid plugin.json with all required fields", () => {
    const output = renderCopilotPluginJson({ version: "0.1.0" })

    const parsed = JSON.parse(output)
    expect(parsed.name).toBe("oh-my-superagents-copilot")
    expect(parsed.description).toContain("oh-my-superagents")
    expect(parsed.version).toBe("0.1.0")
    expect(parsed.agents).toBe("agents/")
    expect(parsed.skills).toEqual(["skills/"])
    expect(parsed.hooks).toBe("hooks.json")
  })
})

describe("renderCopilotHooksJson", () => {
  it("renders valid hooks.json with sessionStart and preToolUse hooks", () => {
    const output = renderCopilotHooksJson()

    const parsed = JSON.parse(output)
    expect(parsed.sessionStart).toBeDefined()
    expect(parsed.preToolUse).toBeDefined()
    expect(parsed.sessionStart[0].command).toBe("oh-my-superagents")
    expect(parsed.sessionStart[0].args).toContain("status")
    expect(parsed.sessionStart[0].args).toContain("copilot")
    expect(parsed.preToolUse[0].command).toBe("oh-my-superagents")
    expect(parsed.preToolUse[0].args).toContain("sync")
  })
})

describe("renderCopilotSkillFile", () => {
  it("renders a control plane skill file with ownership metadata", () => {
    const output = renderCopilotSkillFile({
      name: "oms-status",
      description: "Show OMS status for Copilot CLI.",
      logicalCommand: "status",
    })

    expect(output).toContain("# generated-by: oh-my-superagents; do-not-edit: true")
    expect(output).toContain("oms-control-plane:")
    expect(output).toContain("host=copilot")
    expect(output).toContain("logical-command=status")
    expect(output).toContain("rendered-name=oms-status")
    expect(output).toContain("# Skill: oms-status")
    expect(output).toContain("Show OMS status for Copilot CLI")
    expect(output).toContain("oh-my-superagents status --host copilot")
  })

  it("renders different control plane commands correctly", () => {
    const output = renderCopilotSkillFile({
      name: "oms-sync",
      description: "Sync OMS artifacts for Copilot CLI.",
      logicalCommand: "sync",
    })

    expect(output).toContain("# Skill: oms-sync")
    expect(output).toContain("oh-my-superagents sync --host copilot")
    expect(output).toContain("logical-command=sync")
  })
})

describe("buildCopilotArtifacts", () => {
  it("materializes one Copilot agent per built-in phase", () => {
    const artifacts = buildCopilotArtifacts({
      profiles: { build: { model: "gpt-5.4", effort: "balanced" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(artifacts.agents.map((item) => item.fileName)).toEqual([
      "oms-brainstorm.agent.md",
      "oms-plan.agent.md",
      "oms-execute.agent.md",
      "oms-review.agent.md",
      "oms-verify.agent.md",
      "oms-visual.agent.md",
      "oms-web-test.agent.md",
    ])

    const planAgent = artifacts.agents.find((item) => item.fileName === "oms-plan.agent.md")
    expect(planAgent?.content).toContain(
      "Use the workflow entry `superpowers/writing-plans` for `phase.plan` whenever it is relevant.",
    )
  })

  it("renders direct-mode Copilot agents for workflow intents", () => {
    const artifacts = buildCopilotArtifacts({
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

    expect(artifacts.agents.map((item) => item.fileName)).toEqual([
      "rt-plan.agent.md",
      "rt-build.agent.md",
    ])
  })

  it("does not delegate to upstream superpowers skills in direct mode", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.agents[0]?.content).not.toContain("Use the workflow entry")
  })

  it("rejects unsafe direct intent ids before generating filenames", () => {
    expect(() =>
      buildCopilotArtifacts({
        workflow: { kind: "direct", intents: { "foo/bar": { label: "Bad" } } },
        profiles: { planner: { model: "openai/gpt-5" } },
        routes: { "foo/bar": "planner" },
        defaultRoute: "planner",
      } as never),
    ).toThrow("Invalid direct intent id: foo/bar")
  })

  it("produces control plane skill files for superpowers workflow mode", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "gpt-5.4", effort: "balanced" } },
      routes: {},
      defaultRoute: "build",
    })

    const skillFileNames = artifacts.skills.map((item) => item.fileName)
    expect(skillFileNames).toContain("oms-status.md")
    expect(skillFileNames).toContain("oms-use.md")
    expect(skillFileNames).toContain("oms-disable.md")
    expect(skillFileNames).toContain("oms-sync.md")
    expect(skillFileNames).toContain("oms-doctor.md")
  })

  it("asserts capability policy for unsupported gstack source routes", () => {
    expect(() =>
      buildCopilotArtifacts({
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "gpt-5.4" } },
        routes: {},
        defaultRoute: "planner",
        effectiveSources: {
          "phase.brainstorm": "gstack",
        },
      } as never),
    ).toThrow(/capability policy.*unsupported_source_route.*phase\.brainstorm/i)
  })
})

describe("explainCopilotPhase", () => {
  it("returns phase diagnostic data with agent name", () => {
    const explained = explainCopilotPhase(
      {
        profiles: { build: { model: "gpt-5.4", effort: "balanced" } },
        routes: {},
        defaultRoute: "build",
      },
      "writing-plans",
    )

    expect(explained.phase).toBe("writing-plans")
    expect(explained.agentName).toBe("oms-plan")
    expect(explained.canonicalRoute).toBe("phase.plan")
    expect(explained.model).toBe("gpt-5.4")
    expect(explained.profileId).toBe("build")
  })
})

describe("explainAllCopilot", () => {
  it("returns diagnostic data for all built-in phases", () => {
    const all = explainAllCopilot({
      profiles: { build: { model: "gpt-5.4", effort: "balanced" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(all).toHaveLength(7)
    expect(all[0]?.phase).toBe("brainstorming")
    expect(all[0]?.agentName).toBe("oms-brainstorm")
  })
})
