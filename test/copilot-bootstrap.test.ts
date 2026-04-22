import { describe, it, expect } from "vitest"

describe("Copilot bootstrap", () => {
  describe("renderCopilotPluginManifest", () => {
    it("renders valid plugin.json", async () => {
      const { renderCopilotPluginManifest } = await import("../src/copilot-bootstrap.js")
      const manifest = renderCopilotPluginManifest()
      const parsed = JSON.parse(manifest)

      expect(parsed.name).toBe("oh-my-superagents-copilot")
      expect(parsed.version).toBe("0.1.0")
      expect(parsed.agents).toBe("agents")
      expect(parsed.skills).toBe("skills")
      expect(parsed.hooks).toBe("hooks.json")
    })

    it("includes description field", async () => {
      const { renderCopilotPluginManifest } = await import("../src/copilot-bootstrap.js")
      const manifest = renderCopilotPluginManifest()
      const parsed = JSON.parse(manifest)

      expect(parsed.description).toContain("OMS")
      expect(parsed.description).toContain("Copilot CLI")
    })

    it("returns JSON with trailing newline", async () => {
      const { renderCopilotPluginManifest } = await import("../src/copilot-bootstrap.js")
      const manifest = renderCopilotPluginManifest()
      expect(manifest.endsWith("\n")).toBe(true)
    })
  })

  describe("buildCopilotBootstrapFiles", () => {
    it("generates plugin directory structure", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      expect(files.some(f => f.path === "plugins/oh-my-superagents-copilot/plugin.json")).toBe(true)
      expect(files.some(f => f.path === "plugins/oh-my-superagents-copilot/hooks.json")).toBe(true)
    })

    it("generates hook scripts", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      expect(files.some(f => f.path.endsWith("oms-session-init.sh"))).toBe(true)
      expect(files.some(f => f.path.endsWith("oms-session-end.sh"))).toBe(true)
    })

    it("generates scripts in correct directory", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      const scripts = files.filter(f => f.path.includes("/scripts/"))
      expect(scripts.length).toBeGreaterThan(0)
      expect(scripts.every(s => s.path.startsWith("plugins/oh-my-superagents-copilot/scripts/"))).toBe(true)
    })

    it("generates tool guard script", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      expect(files.some(f => f.path.endsWith("oms-tool-guard.sh"))).toBe(true)
    })

    it("generates compression check script", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      expect(files.some(f => f.path.endsWith("oms-compression-check.sh"))).toBe(true)
    })

    it("scripts contain shebang", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      const scripts = files.filter(f => f.path.endsWith(".sh"))
      expect(scripts.every(s => s.content.startsWith("#!/bin/bash"))).toBe(true)
    })

    it("hooks.json contains version field", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      const hooksFile = files.find(f => f.path === "plugins/oh-my-superagents-copilot/hooks.json")
      expect(hooksFile).toBeDefined()
      const parsed = JSON.parse(hooksFile!.content)
      expect(parsed.version).toBe(1)
    })
  })

  describe("BootstrapFile type", () => {
    it("has path and content properties", async () => {
      const { buildCopilotBootstrapFiles } = await import("../src/copilot-bootstrap.js")
      const files = buildCopilotBootstrapFiles()
      expect(files.every(f => typeof f.path === "string")).toBe(true)
      expect(files.every(f => typeof f.content === "string")).toBe(true)
    })
  })
})