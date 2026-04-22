import { describe, expect, it } from "vitest"
import {
  buildCopilotArtifacts,
  explainAllCopilot,
  explainCopilotPhase,
  renderCopilotAgentFile,
  renderCopilotSkillFile,
} from "../src/copilot.js"

describe("renderCopilotAgentFile", () => {
  it("renders YAML frontmatter with name, description, model, and tools", () => {
    const output = renderCopilotAgentFile({
      name: "oms-brainstorm",
      description: "Brainstorm phase agent",
      model: "anthropic/claude-sonnet-4-5",
      tools: ["Read", "Write", "Edit", "Bash"],
      developerInstructions: "Follow the brainstorming skill.",
    })

    expect(output).toContain("---")
    expect(output).toContain("name: 'oms-brainstorm'")
    expect(output).toContain("description: 'Brainstorm phase agent'")
    expect(output).toContain("tools:")
    expect(output).toContain("  use:")
    expect(output).toContain("    - Read")
    expect(output).toContain("    - Write")
    expect(output).toContain("    - Edit")
    expect(output).toContain("    - Bash")
  })

  it("includes developer instructions after frontmatter", () => {
    const output = renderCopilotAgentFile({
      name: "oms-plan",
      description: "Plan phase agent",
      model: "openai/gpt-5",
      tools: ["Read", "Write"],
      developerInstructions: "Activate and follow the writing-plans skill.",
    })

    expect(output).toContain("Activate and follow the writing-plans skill.")
  })

  it("escapes single quotes in YAML frontmatter values", () => {
    const output = renderCopilotAgentFile({
      name: "test-agent",
      description: "Agent with 'quotes' in description",
      model: "openai/gpt-5",
      tools: ["Read"],
      developerInstructions: "Instructions",
    })

    expect(output).toContain("description: 'Agent with ''quotes'' in description'")
  })

  it("renders with different tool arrays", () => {
    const output = renderCopilotAgentFile({
      name: "oms-verify",
      description: "Verify phase agent",
      model: "anthropic/claude-sonnet-4-5",
      tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      developerInstructions: "Run verification steps.",
    })

    expect(output).toContain("    - Read")
    expect(output).toContain("    - Write")
    expect(output).toContain("    - Edit")
    expect(output).toContain("    - Bash")
    expect(output).toContain("    - Glob")
    expect(output).toContain("    - Grep")
  })
})

describe("renderCopilotSkillFile", () => {
  it("renders YAML frontmatter with name and description", () => {
    const output = renderCopilotSkillFile({
      name: "brainstorming",
      description: "Brainstorming skill",
      logicalCommand: "phase-brainstorming",
    })

    expect(output).toContain("---")
    expect(output).toContain("name: 'brainstorming'")
    expect(output).toContain("description: 'Brainstorming skill'")
  })

  it("includes control plane metadata comment", () => {
    const output = renderCopilotSkillFile({
      name: "writing-plans",
      description: "Writing plans skill",
      logicalCommand: "phase-writing-plans",
    })

    expect(output).toContain(
      "<!-- oms-control-plane: stage=1; host=copilot; artifact=skill; logical-command=phase-writing-plans; rendered-name=writing-plans -->",
    )
  })

  it("includes the command instruction text", () => {
    const output = renderCopilotSkillFile({
      name: "verification-before-completion",
      description: "Verification skill",
      logicalCommand: "phase-verification-before-completion",
    })

    expect(output).toContain(
      "Run `oh-my-superagents phase-verification-before-completion --host copilot $ARGUMENTS` from the repository root.",
    )
  })
})

describe("buildCopilotArtifacts (superpowers workflow)", () => {
  it("creates 7 agents (one per built-in phase)", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(artifacts.agents).toHaveLength(7)
  })

  it("creates 7 skills (one per built-in phase)", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(artifacts.skills).toHaveLength(7)
  })

  it("generates agent file names matching expected pattern", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(artifacts.agents.map((a) => a.fileName)).toEqual([
      "oms-brainstorm.agent.md",
      "oms-plan.agent.md",
      "oms-execute.agent.md",
      "oms-review.agent.md",
      "oms-verify.agent.md",
      "oms-visual.agent.md",
      "oms-web-test.agent.md",
    ])
  })

  it("generates skill directory names matching expected pattern", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(artifacts.skills.map((s) => s.directory)).toEqual([
      "plugins/oh-my-superagents-copilot/skills/brainstorming",
      "plugins/oh-my-superagents-copilot/skills/writing-plans",
      "plugins/oh-my-superagents-copilot/skills/subagent-driven-development",
      "plugins/oh-my-superagents-copilot/skills/requesting-code-review",
      "plugins/oh-my-superagents-copilot/skills/verification-before-completion",
      "plugins/oh-my-superagents-copilot/skills/frontend-design",
      "plugins/oh-my-superagents-copilot/skills/webapp-testing",
    ])
  })

  it("sets agent directory to .copilot/agents", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    for (const agent of artifacts.agents) {
      expect(agent.directory).toBe(".copilot/agents")
    }
  })

  it("sets skill file name to SKILL.md", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    for (const skill of artifacts.skills) {
      expect(skill.fileName).toBe("SKILL.md")
    }
  })

  it("agent content includes phase-specific instructions", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    const brainstormAgent = artifacts.agents.find((a) => a.fileName === "oms-brainstorm.agent.md")
    expect(brainstormAgent?.content).toContain("oms-brainstorm phase agent")
    expect(brainstormAgent?.content).toContain("superpowers/brainstorming")
    expect(brainstormAgent?.content).toContain("phase.brainstorm")
  })

  it("skill content includes control plane command", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    const brainstormSkill = artifacts.skills.find((s) => s.directory.endsWith("/brainstorming"))
    expect(brainstormSkill?.content).toContain("phase-brainstorming")
    expect(brainstormSkill?.content).toContain("--host copilot")
  })

  it("uses superpowers workflow guidance for agent instructions", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    const planAgent = artifacts.agents.find((a) => a.fileName === "oms-plan.agent.md")
    expect(planAgent?.content).toContain(
      "Use the workflow entry `superpowers/writing-plans` for `phase.plan` whenever it is relevant.",
    )
  })

  it("uses gstack developer instructions when effective source is gstack", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
      effectiveSources: {
        "phase.plan": "gstack",
      },
    } as never)

    const planAgent = artifacts.agents.find((a) => a.fileName === "oms-plan.agent.md")
    expect(planAgent?.content).toContain("Use the gstack developer instructions")
    expect(planAgent?.content).toContain("gstack/plan-eng-review")
  })
})

describe("buildCopilotArtifacts (direct workflow)", () => {
  it("creates agents for each intent", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: {
        kind: "direct",
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.agents).toHaveLength(2)
  })

  it("creates rt-<intent>.agent.md files", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: {
        kind: "direct",
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.agents.map((a) => a.fileName)).toEqual(["rt-plan.agent.md", "rt-build.agent.md"])
  })

  it("creates no skills for direct workflow", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: {
        kind: "direct",
        intents: {
          plan: { label: "Plan" },
        },
      },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.skills).toHaveLength(0)
  })

  it("rejects unsafe direct intent ids", () => {
    expect(() =>
      buildCopilotArtifacts({
        workflow: {
          kind: "direct",
          intents: {
            "foo/bar": { label: "Bad" },
          },
        },
        profiles: { planner: { model: "openai/gpt-5" } },
        routes: { "foo/bar": "planner" },
        defaultRoute: "planner",
      } as never),
    ).toThrow("Invalid direct intent id: foo/bar")
  })

  it("agent content includes direct-mode intent instructions", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: {
        kind: "direct",
        intents: {
          plan: { label: "Plan", description: "Create a plan" },
        },
      },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never)

    expect(artifacts.agents[0]?.content).toContain("rt-plan direct-mode agent")
    expect(artifacts.agents[0]?.content).toContain("intent.plan")
    expect(artifacts.agents[0]?.content).toContain("Plan: Create a plan")
  })
})

describe("buildCopilotArtifacts (capability policy)", () => {
  it("fails when a superpowers phase resolves to an unsupported source entry", () => {
    expect(() =>
      buildCopilotArtifacts({
        workflow: { kind: "superpowers" },
        profiles: { build: { model: "openai/gpt-5" } },
        routes: {},
        defaultRoute: "build",
        effectiveSources: {
          "phase.brainstorm": "gstack",
        },
      } as never),
    ).toThrow(/capability policy.*unsupported_source_route.*phase\.brainstorm/i)
  })

  it("allows gstack routes for copilot when valid", () => {
    const artifacts = buildCopilotArtifacts({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
      effectiveSources: {
        "phase.plan": "gstack",
      },
    } as never)

    expect(artifacts.agents).toHaveLength(7)
    expect(artifacts.skills).toHaveLength(7)

    const planAgent = artifacts.agents.find((a) => a.fileName === "oms-plan.agent.md")
    expect(planAgent?.content).toContain("gstack/plan-eng-review")
  })
})

describe("explainCopilotPhase", () => {
  it("returns phase explain output with expected structure", () => {
    const explained = explainCopilotPhase(
      {
        workflow: { kind: "superpowers" },
        profiles: { build: { model: "openai/gpt-5" } },
        routes: {},
        defaultRoute: "build",
      },
      "brainstorming",
    )

    expect(explained).toHaveProperty("phase", "brainstorming")
    expect(explained).toHaveProperty("canonicalRoute", "phase.brainstorm")
    expect(explained).toHaveProperty("profileId", "build")
    expect(explained).toHaveProperty("model", "openai/gpt-5")
    expect(explained).toHaveProperty("agentName", "oms-brainstorm")
  })

  it("includes variant from profile selection", () => {
    const explained = explainCopilotPhase(
      {
        workflow: { kind: "superpowers" },
        profiles: { strategy: { model: "anthropic/claude-sonnet-4-5", variant: "high" } },
        routes: { brainstorming: "strategy" },
        defaultRoute: "build",
      },
      "brainstorming",
    )

    expect(explained).toHaveProperty("variant", "high")
  })

  it("uses resolved route source information", () => {
    const explained = explainCopilotPhase(
      {
        workflow: { kind: "superpowers" },
        profiles: { build: { model: "openai/gpt-5" } },
        routes: {},
        defaultRoute: "build",
      },
      "writing-plans",
    )

    expect(explained).toHaveProperty("routeSource", "preset-default")
    expect(explained).toHaveProperty("resolvedSource")
  })

  it("commandName is undefined for copilot phases", () => {
    const explained = explainCopilotPhase(
      {
        workflow: { kind: "superpowers" },
        profiles: { build: { model: "openai/gpt-5" } },
        routes: {},
        defaultRoute: "build",
      },
      "brainstorming",
    )

    expect(explained.commandName).toBeUndefined()
  })
})

describe("explainAllCopilot", () => {
  it("returns 7 items (one per phase)", () => {
    const explained = explainAllCopilot({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(explained).toHaveLength(7)
  })

  it("each item has the expected structure", () => {
    const explained = explainAllCopilot({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    for (const item of explained) {
      expect(item).toHaveProperty("phase")
      expect(item).toHaveProperty("canonicalRoute")
      expect(item).toHaveProperty("profileId")
      expect(item).toHaveProperty("model")
      expect(item).toHaveProperty("agentName")
      expect(item).toHaveProperty("commandName")
    }
  })

  it("phases are in the expected order", () => {
    const explained = explainAllCopilot({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(explained.map((e) => e.phase)).toEqual([
      "brainstorming",
      "writing-plans",
      "subagent-driven-development",
      "requesting-code-review",
      "verification-before-completion",
      "frontend-design",
      "webapp-testing",
    ])
  })

  it("agent names match the expected copilot agent mapping", () => {
    const explained = explainAllCopilot({
      workflow: { kind: "superpowers" },
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(explained.map((e) => e.agentName)).toEqual([
      "oms-brainstorm",
      "oms-plan",
      "oms-execute",
      "oms-review",
      "oms-verify",
      "oms-visual",
      "oms-web-test",
    ])
  })
})
