import { describe, test, expect } from "vitest"
import {
  renderCopilotAgentFile,
  renderCopilotSkillFile,
  renderCopilotPluginManifest,
  renderCopilotHooksConfig,
  buildCopilotArtifacts,
} from "../src/copilot.js"
import type { RouterConfig } from "../src/config.js"

describe("Copilot Adapter", () => {
  test("should export renderCopilotAgentFile function", () => {
    expect(typeof renderCopilotAgentFile).toBe("function")
  })

  test("should export renderCopilotSkillFile function", () => {
    expect(typeof renderCopilotSkillFile).toBe("function")
  })

  test("should export renderCopilotPluginManifest function", () => {
    expect(typeof renderCopilotPluginManifest).toBe("function")
  })

  test("should export renderCopilotHooksConfig function", () => {
    expect(typeof renderCopilotHooksConfig).toBe("function")
  })

  test("should export buildCopilotArtifacts function", () => {
    expect(typeof buildCopilotArtifacts).toBe("function")
  })
})

describe("Copilot Agent Rendering", () => {
  test("should render agent file with OMS marker", () => {
    const result = renderCopilotAgentFile({
      agentName: "oms-brainstorm",
      description: "OMS Brainstorming Agent",
      model: "gpt-4",
      sourceEntry: { source: "superpowers", canonicalRoute: "phase.brainstorm" },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(result).toContain("generated-by: oh-my-superagents")
    expect(result).toContain("Agent: oms-brainstorm")
  })

  test("should include OMS ownership marker", () => {
    const result = renderCopilotAgentFile({
      agentName: "oms-brainstorm",
      description: "Test",
      model: "gpt-4",
      sourceEntry: { source: "superpowers", canonicalRoute: "phase.brainstorm" },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(result).toContain("oms-route: stage=1; host=copilot;")
  })

  test("should include route metadata", () => {
    const result = renderCopilotAgentFile({
      agentName: "oms-brainstorm",
      description: "Test",
      model: "gpt-4",
      sourceEntry: { source: "superpowers", canonicalRoute: "phase.brainstorm" },
      workflowEntryName: "superpowers/brainstorming",
    })

    expect(result).toContain("canonical route: `phase.brainstorm`")
    expect(result).toContain("source: `superpowers`")
    expect(result).toContain("model: `gpt-4`")
  })
})

describe("Copilot Skill Rendering", () => {
  test("should render skill file with phase mapping", () => {
    const result = renderCopilotSkillFile({
      skillName: "oms-brainstorm",
      description: "Brainstorming skill",
      model: "gpt-4",
      phase: "brainstorming",
      profileId: "default",
      sourceEntry: { source: "superpowers", canonicalRoute: "phase.brainstorm" },
    })

    expect(result).toContain("# Skill: oms-brainstorm")
    expect(result).toContain("`brainstorming` phase")
  })

  test("should include skill route metadata", () => {
    const result = renderCopilotSkillFile({
      skillName: "oms-brainstorm",
      description: "Brainstorming skill",
      model: "gpt-4",
      phase: "brainstorming",
      profileId: "default",
      sourceEntry: { source: "superpowers", canonicalRoute: "phase.brainstorm" },
    })

    expect(result).toContain("profile: `default`")
    expect(result).toContain("projection=skill")
  })
})

describe("Copilot Plugin Manifest", () => {
  test("should render valid plugin manifest", () => {
    const result = renderCopilotPluginManifest()
    const manifest = JSON.parse(result)

    expect(manifest.name).toBe("oh-my-superagents")
    expect(manifest.agents).toBe("agents/")
    expect(manifest.skills).toContain("skills/")
    expect(manifest.hooks).toBe("hooks.json")
  })
})

describe("Copilot Hooks Configuration", () => {
  test("should render hooks configuration with session start hook", () => {
    const result = renderCopilotHooksConfig()
    const hooks = JSON.parse(result)

    expect(hooks.version).toBe(1)
    expect(hooks.hooks.sessionStart).toBeDefined()
    expect(hooks.hooks.sessionStart[0].bash).toContain("oh-my-superagents status")
  })
})

describe("Copilot Artifacts Building", () => {
  const mockConfig: RouterConfig = {
    profiles: { default: { model: "gpt-4" } },
    routes: {
      "phase.brainstorm": "default",
      "phase.plan": "default",
      "phase.execute": "default",
      "phase.review": "default",
      "phase.verify": "default",
      "phase.visual": "default",
      "phase.web-test": "default",
    },
    defaultRoute: "default",
    workflow: {
      kind: "superpowers",
      superpowers: {
        phases: {
          brainstorming: { model: "gpt-4" },
          "writing-plans": { model: "gpt-4" },
          "subagent-driven-development": { model: "gpt-4" },
          "requesting-code-review": { model: "gpt-4" },
          "verification-before-completion": { model: "gpt-4" },
          "frontend-design": { model: "gpt-4" },
          "webapp-testing": { model: "gpt-4" },
        },
      },
    },
  }

  test("should generate copilot artifacts", () => {
    const artifacts = buildCopilotArtifacts(mockConfig)

    expect(artifacts.agents).toBeDefined()
    expect(artifacts.skills).toBeDefined()
    expect(artifacts.plugin).toBeDefined()
    expect(artifacts.hooks).toBeDefined()
  })

  test("should generate correct number of agents", () => {
    const artifacts = buildCopilotArtifacts(mockConfig)

    expect(artifacts.agents.length).toBe(7)
  })

  test("should generate correct number of skills", () => {
    const artifacts = buildCopilotArtifacts(mockConfig)

    expect(artifacts.skills.length).toBe(7)
  })

  test("should generate plugin manifest artifact", () => {
    const artifacts = buildCopilotArtifacts(mockConfig)

    expect(artifacts.plugin.fileName).toBe("plugin.json")
    expect(artifacts.plugin.directory).toBe(".github/copilot")
  })

  test("should generate hooks configuration artifact", () => {
    const artifacts = buildCopilotArtifacts(mockConfig)

    expect(artifacts.hooks.fileName).toBe("hooks.json")
    expect(artifacts.hooks.directory).toBe(".github/copilot")
  })
})
