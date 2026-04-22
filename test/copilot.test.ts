import { describe, it, expect } from "vitest"
import { createDefaultControlPlaneConfig } from "../src/config.js"
import type { RouterConfig } from "../src/config.js"

describe("Copilot adapter", () => {
  describe("PHASE_TO_COPILOT_AGENT", () => {
    it("maps brainstorming to oms-brainstorm", async () => {
      const { PHASE_TO_COPILOT_AGENT } = await import("../src/copilot.js")
      expect(PHASE_TO_COPILOT_AGENT["brainstorming"]).toBe("oms-brainstorm")
    })

    it("maps writing-plans to oms-plan", async () => {
      const { PHASE_TO_COPILOT_AGENT } = await import("../src/copilot.js")
      expect(PHASE_TO_COPILOT_AGENT["writing-plans"]).toBe("oms-plan")
    })

    it("maps subagent-driven-development to oms-execute", async () => {
      const { PHASE_TO_COPILOT_AGENT } = await import("../src/copilot.js")
      expect(PHASE_TO_COPILOT_AGENT["subagent-driven-development"]).toBe("oms-execute")
    })

    it("maps requesting-code-review to oms-review", async () => {
      const { PHASE_TO_COPILOT_AGENT } = await import("../src/copilot.js")
      expect(PHASE_TO_COPILOT_AGENT["requesting-code-review"]).toBe("oms-review")
    })

    it("maps verification-before-completion to oms-verify", async () => {
      const { PHASE_TO_COPILOT_AGENT } = await import("../src/copilot.js")
      expect(PHASE_TO_COPILOT_AGENT["verification-before-completion"]).toBe("oms-verify")
    })

    it("maps frontend-design to oms-visual", async () => {
      const { PHASE_TO_COPILOT_AGENT } = await import("../src/copilot.js")
      expect(PHASE_TO_COPILOT_AGENT["frontend-design"]).toBe("oms-visual")
    })

    it("maps webapp-testing to oms-web-test", async () => {
      const { PHASE_TO_COPILOT_AGENT } = await import("../src/copilot.js")
      expect(PHASE_TO_COPILOT_AGENT["webapp-testing"]).toBe("oms-web-test")
    })
  })

  describe("renderCopilotAgentFile", () => {
    it("renders agent with YAML frontmatter and instructions", async () => {
      const { renderCopilotAgentFile } = await import("../src/copilot.js")
      const content = renderCopilotAgentFile({
        name: "oms-brainstorm",
        description: "Brainstorm phase agent for superpowers workflow",
        model: "gpt-4",
        instructions: "Load and follow the upstream workflow entry `superpowers/brainstorming` exactly.",
        sourceEntry: { canonicalRoute: "phase.brainstorm", source: "superpowers" },
      })

      expect(content).toContain("---")
      expect(content).toContain("name: 'oms-brainstorm'")
      expect(content).toContain("description:")
      expect(content).toContain("model: 'gpt-4'")
      expect(content).toContain("generated-by: oh-my-superagents")
      expect(content).toContain("oms-route:")
      expect(content).toContain("host=copilot")
      expect(content).toContain("route=phase.brainstorm")
      expect(content).toContain("projection=agent")
    })

    it("renders agent with workflow entry instruction", async () => {
      const { renderCopilotAgentFile } = await import("../src/copilot.js")
      const content = renderCopilotAgentFile({
        name: "oms-plan",
        description: "Plan phase agent",
        model: "gpt-4",
        instructions: "Load and follow the upstream workflow entry.",
        sourceEntry: { canonicalRoute: "phase.plan", source: "superpowers" },
      })

      expect(content).toContain("Load and follow the upstream workflow entry")
      expect(content).toContain("Stay focused on the current phase")
    })
  })

  describe("renderCopilotSkillFile", () => {
    it("renders skill with YAML frontmatter and command", async () => {
      const { renderCopilotSkillFile } = await import("../src/copilot.js")
      const content = renderCopilotSkillFile({
        name: "oms-status",
        description: "Show OMS status for Copilot CLI",
        model: "gpt-4o",
        command: "status",
        host: "copilot",
      })

      expect(content).toContain("---")
      expect(content).toContain("name: 'oms-status'")
      expect(content).toContain("model: 'gpt-4o'")
      expect(content).toContain("generated-by: oh-my-superagents")
      expect(content).toContain("oh-my-superagents status --host copilot")
    })
  })

  describe("buildCopilotArtifacts", () => {
    it("generates agents for all built-in phases", async () => {
      const { buildCopilotArtifacts } = await import("../src/copilot.js")
      const defaultConfig = createDefaultControlPlaneConfig()
      const routerConfig: RouterConfig = {
        workflow: { kind: "superpowers" },
        profiles: defaultConfig.profiles,
        lanes: {},
        routes: {},
        defaultRoute: "build",
        superpowersCompatibility: { mode: "warn" },
      }

      const { agents } = buildCopilotArtifacts(routerConfig)
      expect(agents.length).toBe(7)
      expect(agents.some(a => a.fileName === "oms-brainstorm.agent.md")).toBe(true)
      expect(agents.some(a => a.fileName === "oms-plan.agent.md")).toBe(true)
      expect(agents.some(a => a.fileName === "oms-execute.agent.md")).toBe(true)
      expect(agents.some(a => a.fileName === "oms-review.agent.md")).toBe(true)
      expect(agents.some(a => a.fileName === "oms-verify.agent.md")).toBe(true)
      expect(agents.some(a => a.fileName === "oms-visual.agent.md")).toBe(true)
      expect(agents.some(a => a.fileName === "oms-web-test.agent.md")).toBe(true)
    })

    it("generates skills for control plane commands", async () => {
      const { buildCopilotArtifacts } = await import("../src/copilot.js")
      const defaultConfig = createDefaultControlPlaneConfig()
      const routerConfig: RouterConfig = {
        workflow: { kind: "superpowers" },
        profiles: defaultConfig.profiles,
        lanes: {},
        routes: {},
        defaultRoute: "build",
        superpowersCompatibility: { mode: "warn" },
      }

      const { skills } = buildCopilotArtifacts(routerConfig, defaultConfig.settings)
      expect(skills.length).toBe(6)
      expect(skills.some(s => s.directory === "plugins/oh-my-superagents-copilot/skills/oms-status")).toBe(true)
      expect(skills.some(s => s.directory === "plugins/oh-my-superagents-copilot/skills/oms-use")).toBe(true)
      expect(skills.some(s => s.directory === "plugins/oh-my-superagents-copilot/skills/oms-disable")).toBe(true)
      expect(skills.some(s => s.directory === "plugins/oh-my-superagents-copilot/skills/oms-sync")).toBe(true)
      expect(skills.some(s => s.directory === "plugins/oh-my-superagents-copilot/skills/oms-doctor")).toBe(true)
      expect(skills.some(s => s.directory === "plugins/oh-my-superagents-copilot/skills/oms-no-superpowers")).toBe(true)
    })

    it("generates plugin.json manifest", async () => {
      const { buildCopilotArtifacts } = await import("../src/copilot.js")
      const defaultConfig = createDefaultControlPlaneConfig()
      const routerConfig: RouterConfig = {
        workflow: { kind: "superpowers" },
        profiles: defaultConfig.profiles,
        lanes: {},
        routes: {},
        defaultRoute: "build",
        superpowersCompatibility: { mode: "warn" },
      }

      const { pluginManifest } = buildCopilotArtifacts(routerConfig, defaultConfig.settings)
      expect(pluginManifest.name).toBe("oh-my-superagents-copilot")
      expect(pluginManifest.version).toBe("0.1.0")
      expect(pluginManifest.agents).toBe("agents")
      expect(pluginManifest.skills).toBe("skills")
      expect(pluginManifest.hooks).toBe("hooks.json")
    })

    it("places artifacts in correct plugin directory", async () => {
      const { buildCopilotArtifacts } = await import("../src/copilot.js")
      const defaultConfig = createDefaultControlPlaneConfig()
      const routerConfig: RouterConfig = {
        workflow: { kind: "superpowers" },
        profiles: defaultConfig.profiles,
        lanes: {},
        routes: {},
        defaultRoute: "build",
        superpowersCompatibility: { mode: "warn" },
      }

      const { agents } = buildCopilotArtifacts(routerConfig)
      expect(agents.every(a => a.directory === "plugins/oh-my-superagents-copilot/agents")).toBe(true)
    })
  })

  describe("CONTROL_PLANE_TO_COPILOT_SKILL", () => {
    it("maps status to oms-status", async () => {
      const { CONTROL_PLANE_TO_COPILOT_SKILL } = await import("../src/copilot.js")
      expect(CONTROL_PLANE_TO_COPILOT_SKILL["status"]).toBe("oms-status")
    })

    it("maps use to oms-use", async () => {
      const { CONTROL_PLANE_TO_COPILOT_SKILL } = await import("../src/copilot.js")
      expect(CONTROL_PLANE_TO_COPILOT_SKILL["use"]).toBe("oms-use")
    })

    it("maps disable to oms-disable", async () => {
      const { CONTROL_PLANE_TO_COPILOT_SKILL } = await import("../src/copilot.js")
      expect(CONTROL_PLANE_TO_COPILOT_SKILL["disable"]).toBe("oms-disable")
    })

    it("maps sync to oms-sync", async () => {
      const { CONTROL_PLANE_TO_COPILOT_SKILL } = await import("../src/copilot.js")
      expect(CONTROL_PLANE_TO_COPILOT_SKILL["sync"]).toBe("oms-sync")
    })

    it("maps doctor to oms-doctor", async () => {
      const { CONTROL_PLANE_TO_COPILOT_SKILL } = await import("../src/copilot.js")
      expect(CONTROL_PLANE_TO_COPILOT_SKILL["doctor"]).toBe("oms-doctor")
    })
  })
})