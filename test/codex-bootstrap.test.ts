import { describe, expect, it } from "vitest"
import { createDefaultControlPlaneConfig } from "../src/config.js"
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

const compatibleCodexWarn = {
  host: "codex" as const,
  source: "test-detector",
  detectedVersion: "5.1.0",
  detectedRef: null,
  status: "compatible" as const,
  reason: "Version is supported.",
  policyMode: "warn" as const,
  shouldBlock: false,
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
  it("creates one Codex skill per OMS rendered primary name and alias", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
      controlPlaneSettings: createDefaultControlPlaneConfig().settings,
    })

    expect(result.files.map((file) => file.path)).toEqual([
      ".agents/plugins/marketplace.json",
      "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      "plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-st/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-use/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-u/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-off/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-o/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-sy/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-doctor/SKILL.md",
      "plugins/oh-my-superagents-codex/skills/oms-dr/SKILL.md",
    ])

    const marketplace = result.files.find((file) => file.path === ".agents/plugins/marketplace.json")
    expect(marketplace?.content).toContain('"path": "./plugins/oh-my-superagents-codex"')

    const pluginManifest = result.files.find(
      (file) => file.path === "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
    )
    expect(pluginManifest?.content).toContain('"name": "oh-my-superagents-codex"')
    expect(pluginManifest?.content).toContain('"version": "0.1.0"')
    expect(pluginManifest?.content).toContain("$oms-sync")
    expect(pluginManifest?.content).toContain("$oms-doctor")
  })

  it("includes the starter config only when requested", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: true,
    })

    const configFile = result.files.find((file) => file.path === "oh-my-superagents.config.jsonc")
    expect(configFile?.content).toContain('"profiles"')
  })

  it("maps each generated skill to exactly one logical OMS CLI command", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
      configArtifactPath: "configs/oh-my-superagents.config.jsonc",
      controlPlaneSettings: createDefaultControlPlaneConfig().settings,
    })

    const disablePrimary = result.files.find(
      (file) => file.path === "plugins/oh-my-superagents-codex/skills/oms-off/SKILL.md",
    )
    expect(disablePrimary?.content).toContain("generated-by: oh-my-superagents; do-not-edit: true")
    expect(disablePrimary?.content).toContain("name: oms-off")
    expect(disablePrimary?.content).toContain(
      "oms-control-plane: stage=1; host=codex; artifact=skill; logical-command=disable; rendered-name=oms-off",
    )
    expect(disablePrimary?.content).toContain("oh-my-superagents disable --host codex --config 'configs/oh-my-superagents.config.jsonc' $ARGUMENTS")
    expect(disablePrimary?.content).toContain("logical `disable` command key")

    const disableAlias = result.files.find(
      (file) => file.path === "plugins/oh-my-superagents-codex/skills/oms-o/SKILL.md",
    )
    expect(disableAlias?.content).toContain("name: oms-o")
    expect(disableAlias?.content).toContain(
      "oms-control-plane: stage=1; host=codex; artifact=skill; logical-command=disable; rendered-name=oms-o",
    )
    expect(disableAlias?.content).toContain("oh-my-superagents disable --host codex --config 'configs/oh-my-superagents.config.jsonc' $ARGUMENTS")
    expect(disableAlias?.content).toContain("logical `disable` command key")
  })

  it("quotes config paths in generated Codex skill commands", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
      configArtifactPath: "configs/with spaces/oh-my-superagents.config.jsonc",
      controlPlaneSettings: createDefaultControlPlaneConfig().settings,
    })

    const syncSkill = result.files.find(
      (file) => file.path === "plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    )

    expect(syncSkill?.content).toContain(
      "oh-my-superagents sync --host codex --config 'configs/with spaces/oh-my-superagents.config.jsonc' $ARGUMENTS",
    )
    expect(syncSkill?.content).toContain(
      "npx oh-my-superagents sync --host codex --config 'configs/with spaces/oh-my-superagents.config.jsonc' $ARGUMENTS",
    )
  })

  it("rejects duplicate rendered Codex skill names across primary names and aliases", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    expect(() =>
      buildCodexBootstrapFiles({
        packageVersion: "0.1.0",
        includeConfig: false,
        controlPlaneSettings: {
          ...defaults,
          commands: {
            ...defaults.commands,
            status: {
              ...defaults.commands.status,
              aliases: ["same"],
            },
            doctor: {
              ...defaults.commands.doctor,
              aliases: ["same"],
            },
          },
        },
      }),
    ).toThrow(/duplicate|unique|same/i)
  })

  it("rejects rendered Codex skill names with unsafe path segments", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    expect(() =>
      buildCodexBootstrapFiles({
        packageVersion: "0.1.0",
        includeConfig: false,
        controlPlaneSettings: {
          ...defaults,
          commands: {
            ...defaults.commands,
            status: {
              name: "../escape",
              aliases: [],
            },
          },
        },
      }),
    ).toThrow(/unsafe|invalid|path|segment/i)
  })

  it("preserves unrelated marketplace entries and top-level fields", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
      existingMarketplaceContent: JSON.stringify(
        {
          name: "local-repo",
          schemaVersion: 2,
          extra: { keep: true },
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
    const parsed = JSON.parse(marketplace?.content ?? "{}") as {
      name?: string
      schemaVersion?: number
      extra?: { keep?: boolean }
      plugins?: Array<{ name?: string }>
    }

    expect(parsed.name).toBe("local-repo")
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.extra).toEqual({ keep: true })
    expect(parsed.plugins?.map((plugin) => plugin.name)).toEqual(
      expect.arrayContaining(["existing-plugin", "oh-my-superagents-codex"]),
    )
  })

  it("normalizes duplicate OMS marketplace entries into one canonical plugin entry", () => {
    const result = buildCodexBootstrapFiles({
      packageVersion: "0.1.0",
      includeConfig: false,
      existingMarketplaceContent: JSON.stringify(
        {
          plugins: [
            {
              name: "oh-my-superagents-codex",
              source: { source: "local", path: "./plugins/old-codex" },
              policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
              category: "Developer Tools",
            },
            {
              name: "existing-plugin",
              source: { source: "local", path: "./plugins/existing-plugin" },
              policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
              category: "Developer Tools",
            },
            {
              name: "oh-my-superagents-codex",
              source: { source: "local", path: "./plugins/stale-codex" },
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
    const parsed = JSON.parse(marketplace?.content ?? "{}") as {
      plugins?: Array<Record<string, unknown>>
    }
    const omsEntries = parsed.plugins?.filter((plugin) => plugin.name === "oh-my-superagents-codex")

    expect(omsEntries).toEqual([
      {
        name: "oh-my-superagents-codex",
        source: {
          source: "local",
          path: "./plugins/oh-my-superagents-codex",
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Developer Tools",
      },
    ])
    expect(parsed.plugins?.some((plugin) => plugin.name === "existing-plugin")).toBe(true)
  })

  it("throws when the existing marketplace JSON is malformed", () => {
    expect(() =>
      buildCodexBootstrapFiles({
        packageVersion: "0.1.0",
        includeConfig: false,
        existingMarketplaceContent: "{",
      }),
    ).toThrow()
  })

  it("rejects malformed marketplace plugin shapes explicitly", () => {
    expect(() =>
      buildCodexBootstrapFiles({
        packageVersion: "0.1.0",
        includeConfig: false,
        existingMarketplaceContent: JSON.stringify({ plugins: { bad: true } }),
      }),
    ).toThrow(/plugins|array|object/i)

    expect(() =>
      buildCodexBootstrapFiles({
        packageVersion: "0.1.0",
        includeConfig: false,
        existingMarketplaceContent: JSON.stringify({ plugins: ["bad-entry"] }),
      }),
    ).toThrow(/plugins|array|object/i)
  })
})

describe("runCodexBootstrap", () => {
  it("uses the resolved OMS control-plane settings when rendering Codex skills", async () => {
    const controlPlaneConfig = createDefaultControlPlaneConfig()
    const customControlPlaneConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        commandPrefix: "team",
        commands: {
          ...controlPlaneConfig.settings.commands,
          status: { name: "state", aliases: ["stat"] },
          sync: { name: "refresh", aliases: ["rf"] },
        },
      },
    }
    const activePreset = customControlPlaneConfig.presets[customControlPlaneConfig.settings.activePreset]
    const writeCalls: string[] = []

    const result = await runCodexBootstrap({
      cwd: "/workspace/project",
      discoverConfigPath: async () => "/workspace/project/oh-my-superagents.config.jsonc",
      loadConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        config: {
          profiles: activePreset.profiles,
          routes: activePreset.routes,
          defaultRoute: activePreset.defaultRoute,
          superpowersCompatibility: customControlPlaneConfig.settings.superpowersCompatibility,
        },
      }),
      resolveCompatibility: async () => compatibleCodexWarn,
      buildCodexArtifacts: () => ({ agents: [] }),
      materializeArtifacts: async () => ({ exitCode: 0 as const, warnings: [], written: [], removed: [] }),
      fs: {
        mkdir: async () => {},
        writeFile: async (filePath: string) => {
          writeCalls.push(filePath)
        },
        readFile: async (filePath: string) => {
          if (filePath === "/workspace/project/oh-my-superagents.config.jsonc") {
            return JSON.stringify(customControlPlaneConfig)
          }

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

    expect(result.bootstrapFiles).toEqual(
      expect.arrayContaining([
        "/workspace/project/plugins/oh-my-superagents-codex/skills/team-state/SKILL.md",
        "/workspace/project/plugins/oh-my-superagents-codex/skills/team-stat/SKILL.md",
        "/workspace/project/plugins/oh-my-superagents-codex/skills/team-refresh/SKILL.md",
        "/workspace/project/plugins/oh-my-superagents-codex/skills/team-rf/SKILL.md",
      ]),
    )
    expect(writeCalls).not.toEqual(
      expect.arrayContaining([
        "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md",
        "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
      ]),
    )
  })

  it("reruns Codex bootstrap through materializeArtifacts so stale OMS-owned skills are removed", async () => {
    const controlPlaneConfig = createDefaultControlPlaneConfig()
    const customControlPlaneConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        commandPrefix: "team",
        commands: {
          ...controlPlaneConfig.settings.commands,
          status: { name: "state", aliases: ["stat"] },
        },
      },
    }
    const activePreset = customControlPlaneConfig.presets[customControlPlaneConfig.settings.activePreset]
    let materializeInput:
      | {
          artifacts: Array<{ directory: string; fileName: string }>
        }
      | undefined

    const result = await runCodexBootstrap({
      cwd: "/workspace/project",
      discoverConfigPath: async () => "/workspace/project/oh-my-superagents.config.jsonc",
      loadConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        config: {
          profiles: activePreset.profiles,
          routes: activePreset.routes,
          defaultRoute: activePreset.defaultRoute,
          superpowersCompatibility: customControlPlaneConfig.settings.superpowersCompatibility,
        },
      }),
      resolveCompatibility: async () => compatibleCodexWarn,
      buildCodexArtifacts: () => ({ agents: [] }),
      materializeArtifacts: async (input) => {
        materializeInput = {
          artifacts: input.artifacts.map((artifact) => ({
            directory: artifact.directory,
            fileName: artifact.fileName,
          })),
        }

        return {
          exitCode: 0 as const,
          warnings: [],
          written: [],
          removed: ["/workspace/project/plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md"],
        }
      },
      fs: {
        mkdir: async () => {},
        writeFile: async () => {},
        readFile: async (filePath: string) => {
          if (filePath === "/workspace/project/oh-my-superagents.config.jsonc") {
            return JSON.stringify(customControlPlaneConfig)
          }

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

    expect(materializeInput?.artifacts).toEqual(
      expect.arrayContaining([
        {
          directory: "plugins/oh-my-superagents-codex/skills/team-state",
          fileName: "SKILL.md",
        },
        {
          directory: "plugins/oh-my-superagents-codex/skills/team-stat",
          fileName: "SKILL.md",
        },
      ]),
    )
    expect(result.syncResult.removed).toContain(
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md",
    )
  })

  it("fails before mutation when the existing marketplace JSON is malformed", async () => {
    const mkdirCalls: string[] = []
    const writeCalls: string[] = []
    let materializeArtifactsCalled = false

    await expect(
      runCodexBootstrap({
        cwd: "/workspace/project",
        discoverConfigPath: async () => "/workspace/project/oh-my-superagents.config.jsonc",
        loadConfig: async () => ({
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          config: buildStarterCodexConfig().config,
        }),
        resolveCompatibility: async () => compatibleCodexWarn,
        buildCodexArtifacts: () => ({ agents: [] }),
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
            if (filePath === "/workspace/project/oh-my-superagents.config.jsonc") {
              return JSON.stringify(buildStarterCodexConfig().config)
            }

            if (filePath === "/workspace/project/.agents/plugins/marketplace.json") {
              return "{"
            }

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
      }),
    ).rejects.toThrow()

    expect(materializeArtifactsCalled).toBe(false)
    expect(mkdirCalls).toEqual([])
    expect(writeCalls).toEqual([])
  })

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
