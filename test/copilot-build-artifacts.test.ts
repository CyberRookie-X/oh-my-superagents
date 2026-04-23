import { describe, expect, it } from "vitest"
import { buildCopilotArtifacts } from "../src/copilot.js"
import type { RouterConfig } from "../src/config.js"

describe("buildCopilotArtifacts", () => {
  const superpowersConfig: RouterConfig = {
    workflow: {
      kind: "superpowers",
    },
    profiles: {
      default: { model: "gpt-4.1" },
    },
    defaultRoute: "default",
    routes: {},
    lanes: {},
    settings: {
      activePreset: "default",
      commandPrefix: "oms",
      commands: {
        status: { name: "status", aliases: [] },
        use: { name: "use", aliases: [] },
        disable: { name: "disable", aliases: [] },
        sync: { name: "sync", aliases: [] },
        doctor: { name: "doctor", aliases: [] },
      },
      subagentExecution: { mode: "suggest" },
    },
  }

  it("generates 7 phase agents", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.agents).toHaveLength(7)
  })

  it("generates 7 phase skills", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.skills).toHaveLength(7)
  })

  it("generates plugin manifest", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.pluginManifest).toBeDefined()
    expect(result.pluginManifest).toContain('"name": "oh-my-superagents"')
  })

  it("generates hooks config", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    expect(result.hooksConfig).toBeDefined()
    expect(result.hooksConfig).toContain('"version": 1')
  })

  it("generates control plane command artifacts", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    const commandNames = result.commands.map((c) => c.fileName)
    expect(commandNames.length).toBeGreaterThanOrEqual(5)
  })

  it("all agents have ownership markers", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const agent of result.agents) {
      expect(agent.content).toContain("generated-by: oh-my-superagents")
      expect(agent.content).toContain("host=copilot")
    }
  })

  it("all skills have ownership markers", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const skill of result.skills) {
      expect(skill.content).toContain("generated-by: oh-my-superagents")
      expect(skill.content).toContain("host=copilot")
    }
  })

  it("uses stage=3 for copilot markers", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const agent of result.agents) {
      expect(agent.content).toContain("stage=3")
    }
  })

  it("agents are placed in .copilot-plugin/agents/", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const agent of result.agents) {
      expect(agent.directory).toBe(".copilot-plugin/agents")
    }
  })

  it("skills are placed in .copilot-plugin/skills/<name>/", () => {
    const result = buildCopilotArtifacts(superpowersConfig)
    for (const skill of result.skills) {
      expect(skill.directory).toMatch(/^\.copilot-plugin\/skills\//)
    }
  })
})
