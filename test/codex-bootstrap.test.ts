import { describe, expect, it } from "vitest"
import {
  buildCodexBootstrapFiles,
  buildStarterCodexConfig,
} from "../src/codex-bootstrap.js"

describe("buildStarterCodexConfig", () => {
  it("creates a Codex-friendly starter config", () => {
    const result = buildStarterCodexConfig()

    expect(result.path).toBe("oh-my-superagents.config.jsonc")
    expect(result.content).toContain('"model": "gpt-5.4"')
    expect(result.content).toContain('"model": "gpt-5.3-codex-spark"')
    expect(result.content).toContain('"defaultRoute": "build"')
  })
})

describe("buildCodexBootstrapFiles", () => {
  it("creates a repo-local marketplace and plugin bundle", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
    })

    expect(result.files.map((file) => file.path)).toEqual([
      ".agents/plugins/marketplace.json",
      "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      "plugins/oh-my-superagents-codex/skills/oh-my-superagents-sync/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oh-my-superagents-doctor/SKILL.md",
    ])

    const marketplace = result.files.find((file) => file.path === ".agents/plugins/marketplace.json")
    expect(marketplace?.content).toContain('"path": "./plugins/oh-my-superagents-codex"')

    const pluginManifest = result.files.find(
      (file) => file.path === "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
    )
    expect(pluginManifest?.content).toContain('"name": "oh-my-superagents-codex"')
    expect(pluginManifest?.content).toContain('"version": "0.1.0"')
  })

  it("includes the starter config only when requested", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: true,
    })

    const configFile = result.files.find((file) => file.path === "oh-my-superagents.config.jsonc")
    expect(configFile?.content).toContain('"profiles"')
  })

  it("points bundled skills at the Codex CLI entrypoints", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
      configArtifactPath: "configs/oh-my-superagents.config.jsonc",
    })

    const syncSkill = result.files.find(
      (file) => file.path === "plugins/oh-my-superagents-codex/skills/oh-my-superagents-sync/SKILL.md",
    )
    expect(syncSkill?.content).toContain("oh-my-superagents sync --host codex")
    expect(syncSkill?.content).toContain("configs/oh-my-superagents.config.jsonc")
    expect(syncSkill?.content).toContain("npx oh-my-superagents")

    const doctorSkill = result.files.find(
      (file) => file.path === "plugins/oh-my-superagents-codex/skills/oh-my-superagents-doctor/SKILL.md",
    )
    expect(doctorSkill?.content).toContain("oh-my-superagents explain --host codex --all")
    expect(doctorSkill?.content).toContain("configs/oh-my-superagents.config.jsonc")
  })

  it("merges with an existing marketplace instead of replacing it", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
      existingMarketplaceContent: JSON.stringify(
        {
          name: "local-repo",
          plugins: [
            {
              name: "existing-plugin",
              source: { source: "local", path: "./plugins/existing-plugin" },
              policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
              category: "Developer Tools",
            },
          ],
        },
        null,
        2,
      ),
    })

    const marketplace = result.files.find((file) => file.path === ".agents/plugins/marketplace.json")
    expect(marketplace?.content).toContain('"name": "existing-plugin"')
    expect(marketplace?.content).toContain('"name": "oh-my-superagents-codex"')
  })
})
