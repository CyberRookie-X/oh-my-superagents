import { describe, expect, it } from "vitest"
import { buildCopilotArtifacts, renderCopilotAgentFile, renderCopilotSkillFile, renderCopilotHooksFile, renderCopilotPluginManifest } from "../src/copilot.js"
import { getHostProjectionDecision, getControlPlaneCommandDecision } from "../src/capabilities.js"
import { SUPERPOWERS_COMPATIBILITY, type SupportedSuperpowersHost, evaluateSuperpowersCompatibility } from "../src/superpowers-compatibility.js"
import { detectCopilotSuperpowers } from "../src/superpowers-detectors.js"

describe("renderCopilotAgentFile", () => {
  it("renders YAML frontmatter with name, description, tools", () => {
    const output = renderCopilotAgentFile({
      name: "oms-plan",
      description: "Planning phase agent",
      tools: ["bash", "edit", "view"],
      developerInstructions: "Follow the writing-plans skill.",
    })

    expect(output).toContain("---")
    expect(output).toContain("name: oms-plan")
    expect(output).toContain("description: Planning phase agent")
    expect(output).toContain('tools: ["bash","edit","view"]')
  })

  it("includes MARKER_TEXT HTML comment", () => {
    const output = renderCopilotAgentFile({
      name: "oms-brainstorm",
      description: "Brainstorm agent",
      tools: ["bash"],
      developerInstructions: "Be creative.",
    })

    expect(output).toContain("<!-- generated-by: oh-my-superagents; do-not-edit: true -->")
  })

  it("includes developer instructions", () => {
    const output = renderCopilotAgentFile({
      name: "oms-verify",
      description: "Verify agent",
      tools: ["bash", "edit"],
      developerInstructions: "Run all tests before declaring work complete.",
    })

    expect(output).toContain("Run all tests before declaring work complete.")
  })
})

describe("renderCopilotSkillFile", () => {
  it("renders YAML frontmatter with name and description", () => {
    const output = renderCopilotSkillFile({
      name: "oms-plan",
      description: "Planning phase skill",
      instructions: "Use the oms-plan agent for the writing-plans phase.",
    })

    expect(output).toContain("---")
    expect(output).toContain("name: oms-plan")
    expect(output).toContain("description: Planning phase skill")
  })

  it("includes MARKER_TEXT HTML comment", () => {
    const output = renderCopilotSkillFile({
      name: "oms-brainstorm",
      description: "Brainstorm skill",
      instructions: "Be creative.",
    })

    expect(output).toContain("<!-- generated-by: oh-my-superagents; do-not-edit: true -->")
  })

  it("includes instructions", () => {
    const output = renderCopilotSkillFile({
      name: "oms-review",
      description: "Review skill",
      instructions: "Activate the requesting-code-review skill.",
    })

    expect(output).toContain("Activate the requesting-code-review skill.")
  })
})

describe("renderCopilotHooksFile", () => {
  it("returns valid JSON", () => {
    const output = renderCopilotHooksFile()
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it("has version: 1", () => {
    const parsed = JSON.parse(renderCopilotHooksFile())
    expect(parsed.version).toBe(1)
  })

  it("has sessionStart hook with correct bash command", () => {
    const parsed = JSON.parse(renderCopilotHooksFile())
    const sessionStart = parsed.hooks.sessionStart
    expect(sessionStart).toBeDefined()
    expect(sessionStart[0].type).toBe("command")
    expect(sessionStart[0].bash).toContain("oh-my-superagents status --host copilot --json")
  })

  it("has timeoutSec: 10", () => {
    const parsed = JSON.parse(renderCopilotHooksFile())
    expect(parsed.hooks.sessionStart[0].timeoutSec).toBe(10)
  })
})

describe("renderCopilotPluginManifest", () => {
  it("returns valid JSON", () => {
    const output = renderCopilotPluginManifest({})
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it("has correct name, description, version", () => {
    const parsed = JSON.parse(renderCopilotPluginManifest({ pluginVersion: "2.3.0" }))
    expect(parsed.name).toBe("oh-my-superagents-copilot")
    expect(parsed.description).toBe("OMS routing and control-plane support for GitHub Copilot CLI")
    expect(parsed.version).toBe("2.3.0")
  })

  it("defaults version to 0.1.0 when not provided", () => {
    const parsed = JSON.parse(renderCopilotPluginManifest({}))
    expect(parsed.version).toBe("0.1.0")
  })

  it("has agents, skills, hooks fields", () => {
    const parsed = JSON.parse(renderCopilotPluginManifest({}))
    expect(parsed.agents).toBe("agents/")
    expect(parsed.skills).toEqual(["skills/"])
    expect(parsed.hooks).toBe("hooks.json")
  })
})

describe("buildCopilotArtifacts — superpowers workflow", () => {
  it("generates 7 phase agents", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
      } as never,
    })

    expect(artifacts.agents).toHaveLength(7)
  })

  it("each agent has .agent.md extension", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
      } as never,
    })

    for (const agent of artifacts.agents) {
      expect(agent.fileName).toMatch(/\.agent\.md$/)
    }
  })

  it("each agent has valid YAML frontmatter with name, description, tools", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
      } as never,
    })

    for (const agent of artifacts.agents) {
      expect(agent.content).toContain("name: oms-")
      expect(agent.content).toContain("description:")
      expect(agent.content).toContain("tools:")
    }
  })

  it("agent names match PHASE_TO_COPILOT_AGENT mapping", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
      } as never,
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

  it("generates skills for each phase", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
      } as never,
    })

    expect(artifacts.skills).toHaveLength(7)
    expect(artifacts.skills.map((s) => `${s.directory}/${s.fileName}`)).toEqual([
      "plugins/oh-my-superagents-copilot/skills/oms-brainstorm/SKILL.md",
      "plugins/oh-my-superagents-copilot/skills/oms-plan/SKILL.md",
      "plugins/oh-my-superagents-copilot/skills/oms-execute/SKILL.md",
      "plugins/oh-my-superagents-copilot/skills/oms-review/SKILL.md",
      "plugins/oh-my-superagents-copilot/skills/oms-verify/SKILL.md",
      "plugins/oh-my-superagents-copilot/skills/oms-visual/SKILL.md",
      "plugins/oh-my-superagents-copilot/skills/oms-web-test/SKILL.md",
    ])
  })

  it("generates hooks file", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
      } as never,
    })

    expect(artifacts.hooks).toBeDefined()
    expect(artifacts.hooks?.fileName).toBe("hooks.json")
    expect(artifacts.hooks?.directory).toBe("plugins/oh-my-superagents-copilot")
  })

  it("generates plugin manifest", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "anthropic/claude-sonnet-4-5" } },
        routes: {},
        defaultRoute: "planner",
      } as never,
    })

    expect(artifacts.pluginManifest).toBeDefined()
    expect(artifacts.pluginManifest?.fileName).toBe("plugin.json")
    expect(artifacts.pluginManifest?.directory).toBe("plugins/oh-my-superagents-copilot")
  })
})

describe("buildCopilotArtifacts — direct workflow", () => {
  it("generates rt-<intent>.agent.md agents for each intent", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
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
      } as never,
    })

    expect(artifacts.agents.map((a) => a.fileName)).toEqual(["rt-plan.agent.md", "rt-build.agent.md"])
  })

  it("no skills or hooks in direct mode", () => {
    const artifacts = buildCopilotArtifacts({
      config: {
        workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
        profiles: { planner: { model: "openai/gpt-5" } },
        routes: { plan: "planner" },
        defaultRoute: "planner",
      } as never,
    })

    expect(artifacts.skills).toHaveLength(0)
    expect(artifacts.hooks).toBeUndefined()
    expect(artifacts.pluginManifest).toBeUndefined()
  })
})

describe("capability decisions for Copilot", () => {
  it("Copilot supports superpowers + gstack source projection", () => {
    expect(
      getHostProjectionDecision({
        host: "copilot",
        workflowKind: "superpowers",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "gstack",
          entryName: "plan-eng-review",
        },
      }),
    ).toEqual({ supported: true })
  })

  it("Copilot supports superpowers + superpowers source projection", () => {
    expect(
      getHostProjectionDecision({
        host: "copilot",
        workflowKind: "superpowers",
        sourceEntry: {
          canonicalRoute: "phase.brainstorm",
          source: "superpowers",
        },
      }),
    ).toEqual({ supported: true })
  })

  it("Copilot supports direct mode projection", () => {
    expect(
      getHostProjectionDecision({
        host: "copilot",
        workflowKind: "direct",
        sourceEntry: {
          canonicalRoute: "intent.plan",
          source: "direct",
        },
      }),
    ).toEqual({ supported: true })
  })

  it("Copilot supports all control-plane commands", () => {
    const commands = ["status", "use", "disable", "sync", "doctor", "explain"] as const

    for (const command of commands) {
      expect(
        getControlPlaneCommandDecision({
          host: "copilot",
          command,
          workflowKind: "superpowers",
        }),
      ).toEqual({ supported: true })
    }
  })
})

describe("superpowers compatibility for Copilot", () => {
  it("Copilot is in SupportedSuperpowersHost", () => {
    const hosts: SupportedSuperpowersHost[] = ["opencode", "codex", "copilot"]
    expect(hosts).toContain("copilot")
  })

  it("SUPERPOWERS_COMPATIBILITY has copilot entry", () => {
    expect(SUPERPOWERS_COMPATIBILITY.copilot).toBeDefined()
    expect(SUPERPOWERS_COMPATIBILITY.copilot.minimumSupportedVersion).toBe("5.0.0")
    expect(SUPERPOWERS_COMPATIBILITY.copilot.testedRanges).toContain(">=5.0.0 <6.0.0")
    expect(SUPERPOWERS_COMPATIBILITY.copilot.knownBadRanges).toEqual([])
  })
})

describe("detectCopilotSuperpowers", () => {
  it("returns not_detected when no superpowers install found", async () => {
    const result = await detectCopilotSuperpowers({
      cwd: "/nonexistent-project-path",
      homeDir: "/nonexistent-home-path",
      pathExists: async () => false,
      readFile: async () => "",
    })

    expect(result.host).toBe("copilot")
    expect(result.detectedVersion).toBeNull()
  })

  it("returns not_detected compatibility status when no version is detected", () => {
    const result = evaluateSuperpowersCompatibility({
      host: "copilot",
      source: "copilot-plugin-detection",
      detectedVersion: null,
      detectedRef: null,
    })

    expect(result.status).toBe("not_detected")
    expect(result.host).toBe("copilot")
  })
})
