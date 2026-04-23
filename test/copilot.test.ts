import { describe, expect, it } from "vitest"
import {
  buildCopilotArtifacts,
  renderCopilotAgentFile,
  renderCopilotCommandFile,
  renderCopilotSkillFile,
  COPILOT_BASE_DIR,
} from "../src/copilot.js"

describe("renderCopilotAgentFile", () => {
  it("renders agent with YAML frontmatter and markers", () => {
    const output = renderCopilotAgentFile({
      agentName: "oms-brainstorm",
      description: "oms-brainstorm helper for brainstorming",
      model: "gpt-4o",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(output).toContain("name: oms-brainstorm")
    expect(output).toContain("model: gpt-4o")
    expect(output).toContain("tools: ['bash', 'edit', 'view', 'glob', 'rg']")
    expect(output).toContain("route=phase.brainstorm")
    expect(output).toContain("host=copilot")
    expect(output).toContain("projection=agent")
    expect(output).toContain("Load and follow the upstream workflow entry `superpowers/brainstorming`")
  })

  it("falls back to unknown route when sourceEntry is omitted", () => {
    const output = renderCopilotAgentFile({
      agentName: "oms-plan",
      description: "oms-plan helper",
      model: "gpt-4o",
    })

    expect(output).toContain("route=phase.unknown")
    expect(output).toContain("source=superpowers")
    expect(output).toContain("Load and follow the upstream workflow entry named in the invoking command exactly")
  })
})

describe("renderCopilotSkillFile", () => {
  it("renders skill with route metadata and instructions", () => {
    const output = renderCopilotSkillFile({
      skillName: "oms-brainstorm",
      description: "oms-brainstorm routing skill",
      model: "gpt-4o",
      phase: "brainstorming",
      profileId: "strategy",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
    })

    expect(output).toContain("name: oms-brainstorm")
    expect(output).toContain("projection=skill")
    expect(output).toContain("route=phase.brainstorm")
    expect(output).toContain("host=copilot")
    expect(output).toContain("This skill routes the `brainstorming` phase")
    expect(output).toContain("source: `superpowers`")
    expect(output).toContain("profile: `strategy`")
    expect(output).toContain("model: `gpt-4o`")
  })
})

describe("renderCopilotCommandFile", () => {
  it("renders command with router context", () => {
    const output = renderCopilotCommandFile({
      description: "Route brainstorming through oms-brainstorm",
      agentName: "oms-brainstorm",
      renderedName: "sp-brainstorm",
      skillName: "superpowers/brainstorming",
      phase: "brainstorming",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
      },
    })

    expect(output).toContain("route=phase.brainstorm")
    expect(output).toContain("projection=command")
    expect(output).toContain("- phase: brainstorming")
    expect(output).toContain("- arguments: $ARGUMENTS")
  })
})

describe("buildCopilotArtifacts", () => {
  const controlPlaneSettings = {
    commandPrefix: "oms",
    commands: {
      status: { name: "status", aliases: ["st"] },
      use: { name: "use", aliases: ["u"] },
      disable: { name: "off", aliases: ["o"] },
      sync: { name: "sync", aliases: ["sy"] },
      doctor: { name: "doctor", aliases: ["dr"] },
    },
  }

  it("builds agents, commands, skills, plugin manifest, and hooks for superpowers workflow", () => {
    const artifacts = buildCopilotArtifacts(
      {
        workflow: { kind: "superpowers" },
        profiles: {
          strategy: { model: "gpt-4o" },
          builder: { model: "gpt-4o-mini" },
        },
        routes: {
          brainstorming: "strategy",
          "writing-plans": "strategy",
        },
        defaultRoute: "builder",
      } as never,
      controlPlaneSettings,
    )

    expect(artifacts.agents.length).toBe(7)
    expect(artifacts.skills.length).toBe(7)
    expect(artifacts.commands.length).toBe(7 + 5 * 2) // 7 phase + 5 control plane (each with name+alias)
    expect(artifacts.pluginManifest.fileName).toBe("plugin.json")
    expect(artifacts.hooksConfig.fileName).toBe("hooks.json")

    for (const agent of artifacts.agents) {
      expect(agent.directory).toBe(`${COPILOT_BASE_DIR}/agents`)
      expect(agent.kind).toBe("agent")
    }

    for (const skill of artifacts.skills) {
      expect(skill.directory).toContain(`${COPILOT_BASE_DIR}/skills/`)
      expect(skill.fileName).toBe("SKILL.md")
      expect(skill.kind).toBe("skill")
    }

    expect(artifacts.pluginManifest.directory).toBe(COPILOT_BASE_DIR)
    expect(artifacts.hooksConfig.directory).toBe(COPILOT_BASE_DIR)
    expect(artifacts.pluginManifest.content).toContain('"name": "oh-my-superagents"')
    expect(artifacts.hooksConfig.content).toContain("sessionStart")
  })

  it("builds direct-mode agents and commands for intents", () => {
    const artifacts = buildCopilotArtifacts(
      {
        workflow: {
          kind: "direct",
          intents: {
            plan: { label: "Plan" },
            build: { label: "Build" },
          },
        },
        profiles: {
          planner: { model: "gpt-4o" },
          builder: { model: "gpt-4o-mini" },
        },
        routes: { plan: "planner" },
        defaultRoute: "builder",
      } as never,
      controlPlaneSettings,
    )

    expect(artifacts.agents.map((a) => a.fileName)).toEqual(
      expect.arrayContaining(["rt-plan.md", "rt-build.md"]),
    )
    expect(artifacts.commands.map((c) => c.fileName)).toEqual(
      expect.arrayContaining(["ai-plan.md", "ai-build.md"]),
    )
    expect(artifacts.skills).toEqual([])

    const planAgent = artifacts.agents.find((a) => a.fileName === "rt-plan.md")
    expect(planAgent?.content).toContain("routing agent for the plan intent")
    expect(planAgent?.content).toContain("host=copilot")
  })

  it("omits use and disable control plane commands in direct mode", () => {
    const artifacts = buildCopilotArtifacts(
      {
        workflow: {
          kind: "direct",
          intents: {
            plan: { label: "Plan" },
          },
        },
        profiles: {
          planner: { model: "gpt-4o" },
        },
        routes: { plan: "planner" },
        defaultRoute: "planner",
      } as never,
      controlPlaneSettings,
    )

    const fileNames = artifacts.commands.map((c) => c.fileName)
    expect(fileNames).not.toContain("oms-use.md")
    expect(fileNames).not.toContain("oms-u.md")
    expect(fileNames).not.toContain("oms-off.md")
    expect(fileNames).not.toContain("oms-o.md")
  })

  it("rejects invalid direct intent ids", () => {
    expect(() =>
      buildCopilotArtifacts(
        {
          workflow: {
            kind: "direct",
            intents: {
              "foo/bar": { label: "Foo" },
            },
          },
          profiles: {
            planner: { model: "gpt-4o" },
          },
          routes: { "foo/bar": "planner" },
          defaultRoute: "planner",
        } as never,
        controlPlaneSettings,
      ),
    ).toThrow(/invalid direct intent id/i)
  })
})
