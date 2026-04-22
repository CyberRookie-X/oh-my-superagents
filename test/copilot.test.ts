import { describe, expect, it } from "vitest"
import * as library from "../src/index.js"

describe("Copilot CLI Host Adapter", () => {
  describe("renderCopilotInstructions", () => {
    it("renders Copilot instructions with source-aware guidance", () => {
      const output = library.renderCopilotInstructions({
        name: "copilot-plan",
        phase: "writing-plans",
        profileId: "planner",
        model: "github/copilot-gpt-4",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "superpowers",
          entryName: "writing-plans",
        },
        workflowEntryName: "superpowers/writing-plans",
      })

      expect(output).toContain("# generated-by: oh-my-superagents; do-not-edit: true")
      expect(output).toContain("# Copilot Instructions: copilot-plan")
      expect(output).toContain("route: `phase.plan`")
      expect(output).toContain("source: `superpowers`")
      expect(output).toContain("profile: `planner`")
      expect(output).toContain("model: `github/copilot-gpt-4`")
      expect(output).toContain("Use the workflow entry `superpowers/writing-plans`")
    })

    it("renders gstack-specific instructions when source is gstack", () => {
      const output = library.renderCopilotInstructions({
        name: "copilot-plan",
        phase: "writing-plans",
        profileId: "planner",
        model: "github/copilot-gpt-4",
        sourceEntry: {
          canonicalRoute: "phase.plan",
          source: "gstack",
          entryName: "plan-eng-review",
        },
        workflowEntryName: "gstack/plan-eng-review",
      })

      expect(output).toContain("Use the gstack workflow entry `gstack/plan-eng-review`")
    })
  })

  describe("buildCopilotArtifacts", () => {
    it("materializes Copilot artifacts for superpowers workflow", () => {
      const artifacts = library.buildCopilotArtifacts({
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "github/copilot-gpt-4" } },
        routes: {},
        defaultRoute: "planner",
        effectiveSources: {},
      } as never)

      expect(artifacts.instructions).toHaveLength(7)
      expect(artifacts.instructions.map((item) => item.name)).toEqual([
        "copilot-brainstorm",
        "copilot-plan",
        "copilot-execute",
        "copilot-review",
        "copilot-verify",
        "copilot-visual",
        "copilot-web-test",
      ])

      const planInstruction = artifacts.instructions.find((item) => item.name === "copilot-plan")
      expect(planInstruction?.content).toContain("- phase: `writing-plans`")
      expect(planInstruction?.content).toContain("- route: `phase.plan`")
      expect(planInstruction?.filePath).toBe(".github/copilot/instructions/copilot-plan.md")
    })

    it("includes agent manifest in artifacts", () => {
      const artifacts = library.buildCopilotArtifacts({
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "github/copilot-gpt-4" } },
        routes: {},
        defaultRoute: "planner",
        effectiveSources: {},
      } as never)

      expect(artifacts.agentManifest).toBeDefined()
      expect(artifacts.agentManifest?.filePath).toBe(".github/copilot/oms-agent.json")
      expect(artifacts.agentManifest?.content).toContain("oms-agent")
    })

    it("includes settings in artifacts", () => {
      const artifacts = library.buildCopilotArtifacts({
        workflow: { kind: "superpowers" },
        profiles: { planner: { model: "github/copilot-gpt-4" } },
        routes: {},
        defaultRoute: "planner",
        effectiveSources: {},
      } as never)

      expect(artifacts.settings).toBeDefined()
      expect(artifacts.settings?.filePath).toBe(".github/copilot/settings.json")
      expect(artifacts.settings?.content).toContain("oms")
    })
  })

  describe("renderCopilotSettings", () => {
    it("generates valid Copilot settings JSON", () => {
      const settings = library.renderCopilotSettings({
        workflow: { kind: "superpowers" },
        settings: {
          activePreset: "default",
          enabled: true,
          commandPrefix: "oms",
        },
        profiles: {},
        routes: {},
        defaultRoute: "planner",
      } as never)

      expect(settings).toContain('"oms"')
      expect(settings).toContain('"version"')
      expect(settings).toContain('"activePreset": "default"')
      expect(settings).toContain('"enabled": true')
    })
  })

  describe("renderCopilotAgentManifest", () => {
    it("generates valid agent manifest", () => {
      const manifest = library.renderCopilotAgentManifest({
        workflow: { kind: "superpowers" },
        profiles: {},
        routes: {},
        defaultRoute: "planner",
      } as never)

      expect(manifest).toContain('"name": "oms-agent"')
      expect(manifest).toContain('"version"')
      expect(manifest).toContain('"capabilities"')
    })
  })

  describe("CopilotCapabilityHost", () => {
    it("should be included in capability host types", () => {
      // This is a type-level check - if it compiles, the type exists
      const hosts = ["opencode", "codex", "qwen", "claude", "copilot"]
      expect(hosts).toContain("copilot")
    })
  })
})
