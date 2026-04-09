import { describe, expect, it } from "vitest"
import {
  buildCodexBootstrapFiles,
  buildStarterCodexConfig,
  runCodexBootstrap,
} from "../src/codex-bootstrap.js"

const incompatibleCodexStrict = {
  host: "codex" as const,
  source: "test-detector",
  detectedVersion: "4.9.9",
  detectedRef: null,
  status: "incompatible" as const,
  reason: "Version is below minimum supported version 5.0.0.",
  policyMode: "strict" as const,
  shouldBlock: true,
}

function createNotFoundError(filePath: string) {
  const error = new Error(`ENOENT: ${filePath}`) as Error & { code?: string }
  error.code = "ENOENT"
  return error
}

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

describe("runCodexBootstrap", () => {
  it("returns before starter config, scaffold writes, or generated agents when strict compatibility blocks", async () => {
    const mkdirCalls: string[] = []
    const writeCalls: string[] = []
    let buildCodexArtifactsCalled = false
    let materializeArtifactsCalled = false

    const result = await runCodexBootstrap({
      cwd: "/workspace/project",
      discoverConfigPath: async () => undefined,
      loadConfig: async () => {
        throw new Error("unexpected")
      },
      resolveCompatibility: async () => incompatibleCodexStrict,
      buildCodexArtifacts: () => {
        buildCodexArtifactsCalled = true
        return { agents: [] }
      },
      materializeArtifacts: async () => {
        materializeArtifactsCalled = true
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
      fs: {
        mkdir: async (filePath: string) => {
          mkdirCalls.push(filePath)
        },
        writeFile: async (filePath: string) => {
          writeCalls.push(filePath)
        },
        readFile: async (filePath: string) => {
          throw createNotFoundError(filePath)
        },
        readdir: async () => [],
        stat: async () => ({ isFile: () => true }),
        rename: async () => {
          throw new Error("unexpected")
        },
        unlink: async () => {
          throw new Error("unexpected")
        },
      },
    })

    expect(result.configPath).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(result.createdConfig).toBe(false)
    expect(result.bootstrapFiles).toEqual([])
    expect(result.compatibility).toEqual(incompatibleCodexStrict)
    expect(result.syncResult).toEqual({ exitCode: 1, warnings: [], written: [], removed: [] })
    expect(result.nextSteps).toEqual([])
    expect(buildCodexArtifactsCalled).toBe(false)
    expect(materializeArtifactsCalled).toBe(false)
    expect(mkdirCalls).toEqual([])
    expect(writeCalls).toEqual([])
  })
})
