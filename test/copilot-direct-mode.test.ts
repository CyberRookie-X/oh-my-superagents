import { describe, expect, it } from "vitest"
import { buildCopilotArtifacts } from "../src/copilot.js"
import type { RouterConfig } from "../src/config.js"

describe("buildCopilotArtifacts direct mode", () => {
  const directConfig: RouterConfig = {
    workflow: {
      kind: "direct",
      intents: {
        review: { label: "Code Review" },
        deploy: { label: "Deploy", description: "Deploy to production" },
      },
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

  it("generates direct mode agents with rt- prefix", () => {
    const result = buildCopilotArtifacts(directConfig)

    const agentNames = result.agents.map((a) => a.fileName)
    expect(agentNames).toContain("rt-review.agent.md")
    expect(agentNames).toContain("rt-deploy.agent.md")
  })

  it("generates direct mode agents with correct route metadata", () => {
    const result = buildCopilotArtifacts(directConfig)

    const reviewAgent = result.agents.find((a) => a.fileName === "rt-review.agent.md")
    expect(reviewAgent).toBeDefined()
    expect(reviewAgent!.content).toContain("route=intent.review")
    expect(reviewAgent!.content).toContain("source=direct")
  })

  it("generates skills for direct mode intents", () => {
    const result = buildCopilotArtifacts(directConfig)

    const skillDirs = result.skills.map((s) => s.directory)
    expect(skillDirs).toContain(".copilot-plugin/skills/rt-review")
    expect(skillDirs).toContain(".copilot-plugin/skills/rt-deploy")
  })
})
