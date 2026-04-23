import { describe, it, expect } from "vitest"
import {
  renderCopilotSkill,
  renderCopilotCommand,
  buildCopilotArtifacts,
  explainCopilotPhase,
  explainAllCopilot,
  COPILOT_MARKING,
  COPILOT_ROUTE_MARKER_PREFIX,
  COPILOT_SKILLS_ROOT,
  COPILOT_COMMANDS_ROOT,
} from "../src/copilot-cli.js"
import type { RouterConfig } from "../src/config.js"

describe("copilot-cli", () => {
  describe("renderCopilotSkill", () => {
    it("renders skill with required metadata", () => {
      const content = renderCopilotSkill({
        skillName: "copilot-plan",
        description: "OMS plan helper",
        model: "gpt-4",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "superpowers",
          entryName: "writing-plans",
        },
      })

      expect(content).toContain(COPILOT_MARKING)
      expect(content).toContain("copilot-plan")
      expect(content).toContain("OMS plan helper")
      expect(content).toContain("gpt-4")
    })

    it("includes variant when provided", () => {
      const content = renderCopilotSkill({
        skillName: "copilot-plan",
        description: "Test",
        model: "gpt-4",
        variant: "high",
      })

      expect(content).toContain("**Variant:** high")
    })

    it("includes temperature when provided", () => {
      const content = renderCopilotSkill({
        skillName: "copilot-plan",
        description: "Test",
        model: "gpt-4",
        temperature: 0.7,
      })

      expect(content).toContain("**Temperature:** 0.7")
    })

    it("includes route ownership metadata", () => {
      const content = renderCopilotSkill({
        skillName: "copilot-plan",
        description: "Test",
        model: "gpt-4",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "superpowers",
          entryName: "writing-plans",
        },
      })

      expect(content).toContain(COPILOT_ROUTE_MARKER_PREFIX)
      expect(content).toContain("host=copilot-cli")
      expect(content).toContain("projection=skill")
    })
  })

  describe("renderCopilotCommand", () => {
    it("renders command with required metadata", () => {
      const content = renderCopilotCommand({
        commandName: "oms-status",
        description: "Show status",
        script: "echo status",
      })

      expect(content).toContain(COPILOT_MARKING)
      expect(content).toContain("oms-status")
      expect(content).toContain("Show status")
      expect(content).toContain("```bash")
      expect(content).toContain("echo status")
    })

    it("includes route ownership metadata", () => {
      const content = renderCopilotCommand({
        commandName: "oms-status",
        description: "Show status",
        script: "echo status",
      })

      expect(content).toContain(COPILOT_ROUTE_MARKER_PREFIX)
      expect(content).toContain("host=copilot-cli")
      expect(content).toContain("projection=command")
    })
  })

  describe("buildCopilotArtifacts", () => {
    it("builds skill artifacts for all phases", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      const artifacts = buildCopilotArtifacts(config)

      expect(artifacts.length).toBeGreaterThan(0)
      expect(artifacts.some(a => a.kind === "skill")).toBe(true)
      expect(artifacts.some(a => a.kind === "command")).toBe(true)
    })

    it("includes correct skill file names", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      const artifacts = buildCopilotArtifacts(config)
      const skillNames = artifacts
        .filter(a => a.kind === "skill")
        .map(a => a.fileName)

      expect(skillNames).toContain("oms-brainstorm.md")
      expect(skillNames).toContain("oms-plan.md")
      expect(skillNames).toContain("oms-execute.md")
      expect(skillNames).toContain("oms-review.md")
      expect(skillNames).toContain("oms-verify.md")
      expect(skillNames).toContain("oms-visual.md")
      expect(skillNames).toContain("oms-web-test.md")
    })

    it("includes command artifacts", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      const artifacts = buildCopilotArtifacts(config)
      const commandNames = artifacts
        .filter(a => a.kind === "command")
        .map(a => a.fileName)

      expect(commandNames).toContain("oms-status.md")
      expect(commandNames).toContain("oms-sync.md")
      expect(commandNames).toContain("oms-doctor.md")
    })

    it("uses correct directory paths", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      const artifacts = buildCopilotArtifacts(config)
      const skills = artifacts.filter(a => a.kind === "skill")
      const commands = artifacts.filter(a => a.kind === "command")

      expect(skills.every(s => s.directory === COPILOT_SKILLS_ROOT)).toBe(true)
      expect(commands.every(c => c.directory === COPILOT_COMMANDS_ROOT)).toBe(true)
    })

    it("uses profile configuration from routes", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
          custom: {
            model: "claude-3",
            temperature: 0.5,
          },
        },
        routes: {
          "writing-plans": "custom",
        },
      }

      const artifacts = buildCopilotArtifacts(config)
      const planSkill = artifacts.find(a => a.fileName === "oms-plan.md")

      expect(planSkill).toBeDefined()
      expect(planSkill?.content).toContain("claude-3")
      expect(planSkill?.content).toContain("**Temperature:** 0.5")
    })
  })

  describe("explainCopilotPhase", () => {
    it("explains phase routing", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {
          "writing-plans": "default",
        },
      }

      const explanation = explainCopilotPhase(config, "writing-plans")

      expect(explanation.phase).toBe("writing-plans")
      expect(explanation.profileId).toBe("default")
      expect(explanation.model).toBe("gpt-4")
    })

    it("returns correct skill name for each phase", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      expect(explainCopilotPhase(config, "brainstorming").skillName).toBe("copilot-brainstorm")
      expect(explainCopilotPhase(config, "writing-plans").skillName).toBe("copilot-plan")
      expect(explainCopilotPhase(config, "subagent-driven-development").skillName).toBe("copilot-execute")
      expect(explainCopilotPhase(config, "requesting-code-review").skillName).toBe("copilot-review")
      expect(explainCopilotPhase(config, "verification-before-completion").skillName).toBe("copilot-verify")
      expect(explainCopilotPhase(config, "frontend-design").skillName).toBe("copilot-visual")
      expect(explainCopilotPhase(config, "webapp-testing").skillName).toBe("copilot-web-test")
    })
  })

  describe("explainAllCopilot", () => {
    it("explains all phases", () => {
      const config: RouterConfig = {
        defaultRoute: "default",
        profiles: {
          default: {
            model: "gpt-4",
          },
        },
        routes: {},
      }

      const explanations = explainAllCopilot(config)

      expect(explanations.length).toBe(7)
      expect(explanations.every(e => e.phase && e.skillName && e.model)).toBe(true)
    })
  })
})
