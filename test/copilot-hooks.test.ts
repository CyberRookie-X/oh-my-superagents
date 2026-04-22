import { describe, it, expect } from "vitest"

describe("Copilot hooks", () => {
  describe("buildCopilotHooksConfig", () => {
    it("generates hooks.json with sessionStart hook", async () => {
      const { buildCopilotHooksConfig } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig()
      expect(config.version).toBe(1)
      expect(config.hooks.sessionStart).toBeDefined()
      expect(config.hooks.sessionStart!.length).toBeGreaterThan(0)
    })

    it("generates preToolUse hook when tool policy is configured", async () => {
      const { buildCopilotHooksConfig } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig({ hasToolPolicy: true })
      expect(config.hooks.preToolUse).toBeDefined()
      expect(config.hooks.preToolUse!.length).toBeGreaterThan(0)
    })

    it("generates sessionEnd hook for state snapshot", async () => {
      const { buildCopilotHooksConfig } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig()
      expect(config.hooks.sessionEnd).toBeDefined()
      expect(config.hooks.sessionEnd!.length).toBeGreaterThan(0)
    })

    it("generates postToolUse hook when compression is configured", async () => {
      const { buildCopilotHooksConfig } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig({ hasCompression: true })
      expect(config.hooks.postToolUse).toBeDefined()
    })

    it("uses custom script directory when provided", async () => {
      const { buildCopilotHooksConfig } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig({ scriptDirectory: "custom/scripts" })
      const sessionStart = config.hooks.sessionStart![0]
      expect(sessionStart.bash).toContain("custom/scripts")
    })
  })

  describe("renderCopilotHookScript", () => {
    it("renders sessionStart script", async () => {
      const { renderCopilotHookScript } = await import("../src/copilot-hooks.js")
      const script = renderCopilotHookScript("sessionStart")
      expect(script).toContain("#!/bin/bash")
      expect(script).toContain("oh-my-superagents")
      expect(script).toContain("--host copilot")
      expect(script).toContain("session")
    })

    it("renders sessionEnd script", async () => {
      const { renderCopilotHookScript } = await import("../src/copilot-hooks.js")
      const script = renderCopilotHookScript("sessionEnd")
      expect(script).toContain("#!/bin/bash")
      expect(script).toContain("session")
      expect(script).toContain("status")
    })

    it("renders preToolUse script", async () => {
      const { renderCopilotHookScript } = await import("../src/copilot-hooks.js")
      const script = renderCopilotHookScript("preToolUse")
      expect(script).toContain("#!/bin/bash")
      expect(script).toContain("tool")
    })

    it("renders postToolUse script", async () => {
      const { renderCopilotHookScript } = await import("../src/copilot-hooks.js")
      const script = renderCopilotHookScript("postToolUse")
      expect(script).toContain("#!/bin/bash")
      expect(script).toContain("compression")
    })
  })

  describe("renderCopilotHooksJson", () => {
    it("renders valid JSON output", async () => {
      const { buildCopilotHooksConfig, renderCopilotHooksJson } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig()
      const json = renderCopilotHooksJson(config)
      const parsed = JSON.parse(json)
      expect(parsed.version).toBe(1)
      expect(parsed.hooks.sessionStart).toBeDefined()
    })

    it("includes version field", async () => {
      const { buildCopilotHooksConfig, renderCopilotHooksJson } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig()
      const json = renderCopilotHooksJson(config)
      expect(json).toContain('"version": 1')
    })
  })

  describe("CopilotHookCommand type", () => {
    it("has correct structure for command hook", async () => {
      const { buildCopilotHooksConfig } = await import("../src/copilot-hooks.js")
      const config = buildCopilotHooksConfig()
      const hook = config.hooks.sessionStart![0]
      expect(hook.type).toBe("command")
      expect(hook.bash).toBeDefined()
      expect(hook.env).toBeDefined()
      expect(hook.env!.OMS_HOST).toBe("copilot")
    })
  })
})