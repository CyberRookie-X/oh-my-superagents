import path from "node:path"
import { describe, expect, it } from "vitest"
import { runCli } from "../src/cli.js"
import { MARKER_TEXT } from "../src/opencode.js"

const baseConfig = {
  profiles: { build: { model: "openai/gpt-5" } },
  routes: {},
  defaultRoute: "build",
  superpowersCompatibility: { mode: "warn" as const },
}

const compatibleOpencode = {
  host: "opencode" as const,
  source: "test-detector",
  detectedVersion: "5.1.0",
  detectedRef: null,
  status: "compatible" as const,
  reason: "Version is within a tested range.",
  policyMode: "warn" as const,
  shouldBlock: false,
}

const incompatibleOpencodeWarn = {
  ...compatibleOpencode,
  detectedVersion: "4.9.9",
  status: "incompatible" as const,
  reason: "Version is below minimum supported version 5.0.0.",
}

const incompatibleOpencodeStrict = {
  ...incompatibleOpencodeWarn,
  policyMode: "strict" as const,
  shouldBlock: true,
}

const notDetectedOpencode = {
  ...compatibleOpencode,
  detectedVersion: null,
  source: "test-detector",
  status: "not_detected" as const,
  reason: "No compatible superpowers installation was detected.",
}

const compatibleCodex = {
  host: "codex" as const,
  source: "test-detector",
  detectedVersion: "5.1.0",
  detectedRef: null,
  status: "compatible" as const,
  reason: "Version is within a tested range.",
  policyMode: "warn" as const,
  shouldBlock: false,
}

const incompatibleCodexWarn = {
  ...compatibleCodex,
  detectedVersion: "4.9.9",
  status: "incompatible" as const,
  reason: "Version is below minimum supported version 5.0.0.",
}

const incompatibleCodexStrict = {
  ...incompatibleCodexWarn,
  policyMode: "strict" as const,
  shouldBlock: true,
}

const controlPlaneConfig = {
  settings: {
    enabled: true,
    activePreset: "default",
    commandPrefix: "oms",
    commands: {
      status: { name: "status", aliases: ["st"] },
      use: { name: "use", aliases: ["u"] },
      disable: { name: "off", aliases: ["o"] },
      sync: { name: "sync", aliases: ["sy"] },
      doctor: { name: "doctor", aliases: ["dr"] },
    },
    superpowersCompatibility: { mode: "warn" as const },
  },
  presets: {
    default: {
      label: "Default",
      short: "def",
      description: "General daily development",
      profiles: {
        strategy: {
          model: "anthropic/claude-sonnet-4-5-20250929",
          variant: "high",
        },
        build: {
          model: "openai/gpt-5",
          effort: "balanced",
        },
      },
      routes: {
        brainstorming: "strategy",
      },
      defaultRoute: "build",
    },
    review: {
      label: "Review",
      short: "rev",
      description: "Focused review work",
      profiles: {
        review: {
          model: "anthropic/claude-sonnet-4-5-20250929",
          variant: "high",
        },
      },
      routes: {},
      defaultRoute: "review",
    },
  },
}

function renderOwnedMarkdownArtifact(name: string) {
  return `---\ndescription: '${name}'\n---\n\n<!-- ${MARKER_TEXT} -->\n`
}

function renderUserMarkdownArtifact(name: string) {
  return `---\ndescription: '${name}'\n---\n\nUser-authored content\n`
}

function renderOwnedCodexAgent(name: string) {
  return `# ${MARKER_TEXT}\nname = ${JSON.stringify(name)}\n`
}

function renderOwnedCodexSkill(renderedName: string, logicalCommand: "status" | "use" | "disable" | "sync" | "doctor") {
  return [
    "---",
    `name: ${renderedName}`,
    "description: 'Codex OMS skill'",
    "---",
    "",
    `<!-- ${MARKER_TEXT} -->`,
    `<!-- oms-control-plane: stage=1; host=codex; artifact=skill; logical-command=${logicalCommand}; rendered-name=${renderedName} -->`,
    "",
  ].join("\n")
}

function renderCodexMarketplace(hasOmsEntry = true) {
  return JSON.stringify({
    name: "local-repo",
    plugins: [
      {
        name: "existing-plugin",
        source: { source: "local", path: "./plugins/existing-plugin" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      },
      ...(hasOmsEntry
        ? [{
            name: "oh-my-superagents-codex",
            source: { source: "local", path: "./plugins/oh-my-superagents-codex" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Developer Tools",
          }]
        : []),
    ],
  }, null, 2)
}

function renderCodexPluginManifest() {
  return JSON.stringify({
    name: "oh-my-superagents-codex",
    version: "0.1.0",
    skills: "./skills/",
  }, null, 2)
}

function createArtifactFs(files: Record<string, string>) {
  const entriesByDirectory = new Map<string, string[]>()

  const addDirectoryEntry = (directory: string, entry: string) => {
    const existing = entriesByDirectory.get(directory) ?? []
    if (!existing.includes(entry)) {
      existing.push(entry)
      existing.sort()
      entriesByDirectory.set(directory, existing)
    }
  }

  for (const filePath of Object.keys(files)) {
    const directory = path.dirname(filePath)
    addDirectoryEntry(directory, path.basename(filePath))

    let currentDirectory = directory
    while (currentDirectory !== path.dirname(currentDirectory)) {
      const parentDirectory = path.dirname(currentDirectory)
      addDirectoryEntry(parentDirectory, path.basename(currentDirectory))
      currentDirectory = parentDirectory
    }
  }

  return {
    artifactExists: async (filePath: string) => filePath in files,
    readdir: async (directory: string) => {
      const entries = entriesByDirectory.get(directory)
      if (!entries) {
        throw new Error(`ENOENT: ${directory}`)
      }

      return entries
    },
    readArtifactFile: async (filePath: string) => {
      const content = files[filePath]
      if (content === undefined) {
        throw new Error(`ENOENT: ${filePath}`)
      }

      return content
    },
    artifactStat: async (filePath: string) => {
      if (!(filePath in files)) {
        throw new Error(`ENOENT: ${filePath}`)
      }

      return { isFile: () => true }
    },
  }
}

const defaultArtifactFs = createArtifactFs({
  "/workspace/project/.opencode/agents/spr-build.md": renderOwnedMarkdownArtifact("spr-build"),
  "/workspace/project/.opencode/agents/spr-strategy.md": renderOwnedMarkdownArtifact("spr-strategy"),
})

function createCliDeps(overrides: Record<string, unknown> = {}) {
  return {
    mkdir: async () => {},
    getCwd: () => "/workspace/project",
    discoverConfigPath: async () => undefined,
    loadConfig: async () => ({
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      config: baseConfig,
    }),
    explainAll: () => [],
    explainPhase: () => ({
      phase: "brainstorming",
      profileId: "build",
      model: "openai/gpt-5",
      variant: undefined,
      commandName: "/sp-brainstorm",
      agentName: "spr-strategy",
    }),
    explainAllForHost: (config: any, host: "opencode" | "codex") => [
      {
        phase: "brainstorming",
        profileId: config.defaultRoute,
        model: host === "codex" ? "gpt-5.4" : "openai/gpt-5",
        variant: undefined,
        commandName: host === "codex" ? undefined : "/sp-brainstorm",
        agentName: host === "codex" ? "oms-brainstorm" : "spr-strategy",
      },
    ],
    explainPhaseForHost: (_config: any, host: "opencode" | "codex") => ({
      phase: "brainstorming",
      profileId: "build",
      model: host === "codex" ? "gpt-5.4" : "openai/gpt-5",
      variant: undefined,
      commandName: host === "codex" ? undefined : "/sp-brainstorm",
      agentName: host === "codex" ? "oms-brainstorm" : "spr-strategy",
    }),
    buildArtifacts: () => ({
      agents: [
        {
          kind: "agent" as const,
          directory: ".opencode/agents",
          fileName: "spr-build.md",
          ownerPrefix: "spr-",
          content: "",
        },
        {
          kind: "agent" as const,
          directory: ".opencode/agents",
          fileName: "spr-strategy.md",
          ownerPrefix: "spr-",
          content: "",
        },
      ],
      commands: [],
    }),
    buildCodexArtifacts: () => ({ agents: [] }),
    buildCodexBootstrap: async () => ({
      configPath: "/workspace/project/oh-my-superagents.config.jsonc",
      createdConfig: true,
      bootstrapFiles: ["/workspace/project/.agents/plugins/marketplace.json"],
      syncResult: { exitCode: 0 as const, warnings: [], written: [], removed: [] },
      nextSteps: ["Restart Codex"],
      compatibility: compatibleCodex,
    }),
    materializeArtifacts: async () => ({ exitCode: 0 as const, warnings: [], written: [], removed: [] }),
    prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      content: JSON.stringify({
        settings: {
          activePreset: nextState.activePreset,
          enabled: nextState.enabled,
        },
        presets: controlPlaneConfig.presets,
      }, null, 2),
      config: {
        ...controlPlaneConfig,
        settings: {
          ...controlPlaneConfig.settings,
          activePreset: nextState.activePreset,
          enabled: nextState.enabled,
        },
      },
    }),
    writeFile: async () => {},
    unlink: async () => {},
    detectOpenCodeSuperpowers: async () => ({
      host: "opencode" as const,
      source: "test-detector",
      detectedVersion: "5.1.0",
      detectedRef: null,
    }),
    detectCodexSuperpowers: async () => ({
      host: "codex" as const,
      source: "test-detector",
      detectedVersion: "5.1.0",
      detectedRef: null,
    }),
    evaluateSuperpowersCompatibility: (detection: any, policyMode: "warn" | "strict") => ({
      host: detection.host,
      source: detection.source,
      detectedVersion: detection.detectedVersion ?? null,
      detectedRef: detection.detectedRef ?? null,
      status: "compatible" as const,
      reason: "Version is within a tested range.",
      policyMode,
      shouldBlock: false,
    }),
    resolveControlPlane: async () => ({
      source: {
        kind: "file" as const,
        hasRealSource: true,
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
      },
      config: controlPlaneConfig,
      activePreset: {
        key: "default",
        preset: controlPlaneConfig.presets.default,
      },
    }),
    ...defaultArtifactFs,
    ...overrides,
  } as any
}

describe("runCli", () => {
  it("preserves explain --all array output and attaches compatibility to each item", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--all"], createCliDeps())

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "brainstorming",
          commandName: "/sp-brainstorm",
          compatibility: compatibleOpencode,
        }),
      ]),
    )
  })

  it("returns exit code 1 for unknown explain phase", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--phase", "unknown"], createCliDeps())

    expect(result.exitCode).toBe(1)
  })

  it("returns single-phase explain output with top-level compatibility", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps())

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed).toEqual(
      expect.objectContaining({
        phase: "brainstorming",
        commandName: "/sp-brainstorm",
        compatibility: compatibleOpencode,
      }),
    )
  })

  it("includes compatibility warning text and continues in warn-mode sync", async () => {
    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      evaluateSuperpowersCompatibility: () => incompatibleOpencodeWarn,
      materializeArtifacts: async () => ({ exitCode: 2 as const, warnings: ["cleanup failed"], written: [], removed: [] }),
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(2)
    expect(parsed.compatibility).toEqual(incompatibleOpencodeWarn)
    expect(result.stderr).toContain(
      "Warning: superpowers compatibility is incompatible for opencode: Version is below minimum supported version 5.0.0.",
    )
    expect(result.stderr).toContain("cleanup failed")
  })

  it("bootstraps a default layered config during first-run opencode sync", async () => {
    let persistedPath = ""
    let persistedContent = ""
    let materializeCalled = false
    const createdDirectories: string[] = []

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async ({ command }: { command: string }) => {
        if (command === "sync") {
          throw new Error("Command sync requires a real config source")
        }

        return {
          source: { kind: "default" as const, hasRealSource: false, sources: [] },
          config: controlPlaneConfig,
          activePreset: { key: "default", preset: controlPlaneConfig.presets.default },
        }
      },
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/home/tester/.config/oh-my-superagents/config.jsonc",
        content: JSON.stringify({
          settings: {
            activePreset: nextState.activePreset,
            enabled: nextState.enabled,
          },
          presets: controlPlaneConfig.presets,
        }, null, 2),
        config: controlPlaneConfig,
      }),
      mkdir: async (directory: string) => {
        createdDirectories.push(directory)
      },
      writeFile: async (filePath: string, content: string) => {
        if (!createdDirectories.includes(path.dirname(filePath))) {
          throw new Error(`ENOENT: missing parent directory for ${filePath}`)
        }
        persistedPath = filePath
        persistedContent = content
      },
      materializeArtifacts: async () => {
        materializeCalled = true
        return {
          exitCode: 0 as const,
          warnings: [],
          written: ["/workspace/project/.opencode/agents/spr-build.md"],
          removed: [],
        }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.compatibility).toEqual(compatibleOpencode)
    expect(createdDirectories).toContain("/home/tester/.config/oh-my-superagents")
    expect(persistedPath).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
    expect(JSON.parse(persistedContent)).toEqual({
      settings: {
        activePreset: "default",
        enabled: true,
      },
      presets: controlPlaneConfig.presets,
    })
    expect(materializeCalled).toBe(true)
    expect(parsed.written).toContain("/home/tester/.config/oh-my-superagents/config.jsonc")
    expect(parsed.written).toContain("/workspace/project/.opencode/agents/spr-build.md")
  })

  it("blocks sync in strict mode before materialization when incompatible", async () => {
    let materializeCalled = false

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      loadConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        config: {
          ...baseConfig,
          superpowersCompatibility: { mode: "strict" as const },
        },
      }),
      evaluateSuperpowersCompatibility: () => incompatibleOpencodeStrict,
      materializeArtifacts: async () => {
        materializeCalled = true
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(1)
    expect(parsed.compatibility).toEqual(incompatibleOpencodeStrict)
    expect(result.stderr).toBe(
      "Blocked by incompatible superpowers installation for opencode: Version is below minimum supported version 5.0.0.",
    )
    expect(materializeCalled).toBe(false)
  })

  it("passes OMS control-plane settings into OpenCode sync artifact generation", async () => {
    let capturedSettings: typeof controlPlaneConfig.settings | undefined
    let materializedFileNames: string[] = []

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      buildArtifacts: (_config: any, settings?: typeof controlPlaneConfig.settings) => {
        capturedSettings = settings

        return {
          agents: [],
          commands: settings
            ? [
                {
                  kind: "command" as const,
                  directory: ".opencode/commands",
                  fileName: `${settings.commandPrefix}-${settings.commands.status.name}.md`,
                  ownerPrefix: `${settings.commandPrefix}-`,
                  content: "",
                },
              ]
            : [],
        }
      },
      materializeArtifacts: async ({ artifacts }: { artifacts: Array<{ fileName: string }> }) => {
        materializedFileNames = artifacts.map((artifact) => artifact.fileName)
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(capturedSettings).toEqual(controlPlaneConfig.settings)
    expect(materializedFileNames).toContain("oms-status.md")
  })

  it("preserves codex explain --all array output and attaches compatibility to each item", async () => {
    const result = await runCli(["explain", "--host", "codex", "--all"], createCliDeps())

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "brainstorming",
          agentName: "oms-brainstorm",
          compatibility: compatibleCodex,
        }),
      ]),
    )
  })

  it("returns exit code 0 for sync --host codex", async () => {
    const result = await runCli(["sync", "--host", "codex"], createCliDeps({
      buildCodexArtifacts: () => ({
        agents: [
          {
            kind: "agent",
            directory: ".codex/agents",
            fileName: "oms-review.toml",
            ownerPrefix: "oms-",
            content: 'name = "oms-review"',
          },
        ],
      }),
      materializeArtifacts: async () => ({
        exitCode: 0 as const,
        warnings: [],
        written: ["/workspace/project/.codex/agents/oms-review.toml"],
        removed: [],
      }),
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.compatibility).toEqual(compatibleCodex)
    expect(result.stdout).toContain("oms-review.toml")
  })

  it("includes compatibility warning text and continues in warn-mode bootstrap", async () => {
    const result = await runCli(["bootstrap", "--host", "codex"], createCliDeps({
      buildCodexBootstrap: async () => ({
        configPath: "/workspace/project/oh-my-superagents.config.jsonc",
        createdConfig: true,
        bootstrapFiles: ["/workspace/project/.agents/plugins/marketplace.json"],
        syncResult: { exitCode: 2 as const, warnings: ["cleanup failed"], written: [], removed: [] },
        nextSteps: ["Restart Codex"],
        compatibility: incompatibleCodexWarn,
      }),
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(2)
    expect(parsed.compatibility).toEqual(incompatibleCodexWarn)
    expect(result.stdout).toContain("Restart Codex")
    expect(result.stderr).toContain(
      "Warning: superpowers compatibility is incompatible for codex: Version is below minimum supported version 5.0.0.",
    )
    expect(result.stderr).toContain("cleanup failed")
  })

  it("returns deterministic stderr when bootstrap is blocked in strict mode", async () => {
    const result = await runCli(["bootstrap", "--host", "codex"], createCliDeps({
      buildCodexBootstrap: async () => ({
        configPath: "/workspace/project/oh-my-superagents.config.jsonc",
        createdConfig: false,
        bootstrapFiles: [],
        syncResult: { exitCode: 1 as const, warnings: [], written: [], removed: [] },
        nextSteps: [],
        compatibility: incompatibleCodexStrict,
      }),
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(1)
    expect(parsed.compatibility).toEqual(incompatibleCodexStrict)
    expect(result.stderr).toBe(
      "Blocked by incompatible superpowers installation for codex: Version is below minimum supported version 5.0.0.",
    )
  })

  it("rejects bootstrap for unsupported hosts", async () => {
    const result = await runCli(["bootstrap", "--host", "opencode"], createCliDeps({
      buildCodexBootstrap: async () => {
        throw new Error("unexpected")
      },
    }))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("bootstrap")
  })

  it("requires --host for standalone status", async () => {
    const result = await runCli(["status"], createCliDeps())

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("--host")
  })

  it("requires --host for standalone doctor", async () => {
    const result = await runCli(["doctor"], createCliDeps())

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("--host")
  })

  it("requires --host for standalone use", async () => {
    const result = await runCli(["use", "default"], createCliDeps())

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required --host")
  })

  it("requires --host for standalone disable", async () => {
    const result = await runCli(["disable"], createCliDeps())

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required --host")
  })

  it("requires --host for standalone sync", async () => {
    const result = await runCli(["sync"], createCliDeps())

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required --host")
  })

  it("prefers a preset key over a matching preset short in use", async () => {
    let persistedContent = ""

    const keyCollisionConfig = {
      ...controlPlaneConfig,
      presets: {
        default: {
          ...controlPlaneConfig.presets.default,
          short: "review",
        },
        review: controlPlaneConfig.presets.review,
      },
    }

    const result = await runCli(["use", "review", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: keyCollisionConfig,
        activePreset: {
          key: "default",
          preset: keyCollisionConfig.presets.default,
        },
      }),
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        content: JSON.stringify({ settings: nextState }, null, 2),
        config: {
          ...keyCollisionConfig,
          settings: {
            ...keyCollisionConfig.settings,
            activePreset: nextState.activePreset,
            enabled: nextState.enabled,
          },
        },
      }),
      writeFile: async (_filePath: string, content: string) => {
        persistedContent = content
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(persistedContent)).toEqual({
      settings: {
        activePreset: "review",
        enabled: true,
      },
    })
  })

  it("matches a unique preset short in use and writes activePreset plus enabled true", async () => {
    let persistedContent = ""
    const createdDirectories: string[] = []

    const result = await runCli(["use", "def", "--host", "opencode"], createCliDeps({
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/home/tester/.config/oh-my-superagents/config.jsonc",
        content: JSON.stringify({ settings: nextState, presets: controlPlaneConfig.presets }, null, 2),
        config: controlPlaneConfig,
      }),
      mkdir: async (directory: string) => {
        createdDirectories.push(directory)
      },
      writeFile: async (filePath: string, content: string) => {
        if (!createdDirectories.includes(path.dirname(filePath))) {
          throw new Error(`ENOENT: missing parent directory for ${filePath}`)
        }
        persistedContent = content
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(createdDirectories).toContain("/home/tester/.config/oh-my-superagents")
    expect(JSON.parse(persistedContent)).toEqual({
      settings: {
        activePreset: "default",
        enabled: true,
      },
      presets: controlPlaneConfig.presets,
    })
  })

  it("rejects an unknown preset in use", async () => {
    const writeCalls: string[] = []

    const result = await runCli(["use", "missing", "--host", "opencode"], createCliDeps({
      writeFile: async (filePath: string) => {
        writeCalls.push(filePath)
      },
    }))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Unknown preset")
    expect(writeCalls).toEqual([])
  })

  it("writes enabled false for disable", async () => {
    let persistedContent = ""

    const result = await runCli(["disable", "--host", "opencode"], createCliDeps({
      artifactExists: async () => false,
      writeFile: async (_filePath: string, content: string) => {
        persistedContent = content
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(persistedContent)).toEqual({
      settings: {
        activePreset: "default",
        enabled: false,
      },
      presets: controlPlaneConfig.presets,
    })
  })

  it("removes OMS-owned artifacts for the invoking host only during disable", async () => {
    const removedPaths: string[] = []

    const result = await runCli(["disable", "--host", "opencode"], createCliDeps({
      artifactExists: async (filePath: string) => (
        filePath === "/workspace/project/.opencode/agents/spr-build.md"
        || filePath === "/workspace/project/.opencode/agents/spr-strategy.md"
        || filePath === "/workspace/project/.codex/agents/oms-review.toml"
      ),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual([
      "/workspace/project/.opencode/agents/spr-build.md",
      "/workspace/project/.opencode/agents/spr-strategy.md",
    ])
    expect(removedPaths).toEqual(parsed.removed)
    expect(removedPaths.some((filePath) => filePath.includes(".codex/"))).toBe(false)
  })

  it("preserves a user-authored file at an OMS-looking path during disable cleanup", async () => {
    const removedPaths: string[] = []

    const result = await runCli(["disable", "--host", "opencode"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderUserMarkdownArtifact("spr-build"),
      }),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual([])
    expect(removedPaths).toEqual([])
  })

  it("removes OMS-owned artifacts for the invoking host only during disabled sync", async () => {
    const removedPaths: string[] = []
    let materializeCalled = false

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...controlPlaneConfig,
          settings: {
            ...controlPlaneConfig.settings,
            enabled: false,
          },
        },
        activePreset: {
          key: "default",
          preset: controlPlaneConfig.presets.default,
        },
      }),
      artifactExists: async (filePath: string) => (
        filePath === "/workspace/project/.opencode/agents/spr-build.md"
        || filePath === "/workspace/project/.opencode/agents/spr-strategy.md"
        || filePath === "/workspace/project/.codex/agents/oms-review.toml"
      ),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
      materializeArtifacts: async () => {
        materializeCalled = true
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual([
      "/workspace/project/.opencode/agents/spr-build.md",
      "/workspace/project/.opencode/agents/spr-strategy.md",
    ])
    expect(removedPaths).toEqual(parsed.removed)
    expect(removedPaths.some((filePath) => filePath.includes(".codex/"))).toBe(false)
    expect(materializeCalled).toBe(false)
  })

  it("preserves a user-authored file at an OMS-looking path during disabled sync cleanup", async () => {
    const removedPaths: string[] = []

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...controlPlaneConfig,
          settings: {
            ...controlPlaneConfig.settings,
            enabled: false,
          },
        },
        activePreset: {
          key: "default",
          preset: controlPlaneConfig.presets.default,
        },
      }),
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderUserMarkdownArtifact("spr-build"),
      }),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual([])
    expect(removedPaths).toEqual([])
  })

  it("removes stale OMS-owned files that are not part of the current generated inventory", async () => {
    const removedPaths: string[] = []

    const result = await runCli(["disable", "--host", "opencode"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderOwnedMarkdownArtifact("spr-build"),
        "/workspace/project/.opencode/agents/spr-strategy.md": renderOwnedMarkdownArtifact("spr-strategy"),
        "/workspace/project/.opencode/commands/oms-legacy.md": renderOwnedMarkdownArtifact("oms-legacy"),
      }),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toContain("/workspace/project/.opencode/commands/oms-legacy.md")
    expect(removedPaths).toContain("/workspace/project/.opencode/commands/oms-legacy.md")
  })

  it("returns non-zero for disable when ownership discovery cannot read an owned file", async () => {
    const removedPaths: string[] = []

    const result = await runCli(["disable", "--host", "opencode"], createCliDeps({
      readArtifactFile: async (filePath: string) => {
        if (filePath === "/workspace/project/.opencode/agents/spr-build.md") {
          throw new Error("EACCES: unreadable artifact")
        }

        return defaultArtifactFs.readArtifactFile(filePath)
      },
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(2)
    expect(parsed.removed).toEqual([])
    expect(parsed.warnings.some((warning: string) => warning.includes("spr-build.md"))).toBe(true)
    expect(removedPaths).toEqual([])
  })

  it("keeps persisted config changes when later artifact reconciliation fails", async () => {
    let persistedContent = ""

    const result = await runCli(["disable", "--host", "opencode"], createCliDeps({
      artifactExists: async (filePath: string) => filePath === "/workspace/project/.opencode/agents/spr-build.md",
      writeFile: async (_filePath: string, content: string) => {
        persistedContent = content
      },
      unlink: async () => {
        throw new Error("cleanup failed")
      },
    }))

    expect(result.exitCode).toBe(2)
    expect(JSON.parse(persistedContent)).toEqual({
      settings: {
        activePreset: "default",
        enabled: false,
      },
      presets: controlPlaneConfig.presets,
    })
    expect(result.stderr).toContain("cleanup failed")
  })

  it("returns non-zero for disabled sync when ownership discovery cannot scan a host surface", async () => {
    let materializeCalled = false

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...controlPlaneConfig,
          settings: {
            ...controlPlaneConfig.settings,
            enabled: false,
          },
        },
        activePreset: {
          key: "default",
          preset: controlPlaneConfig.presets.default,
        },
      }),
      readdir: async (directory: string) => {
        if (directory === "/workspace/project/.opencode/commands") {
          throw new Error("EACCES: cannot scan commands")
        }

        return defaultArtifactFs.readdir(directory)
      },
      materializeArtifacts: async () => {
        materializeCalled = true
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(2)
    expect(parsed.removed).toEqual([])
    expect(parsed.warnings.some((warning: string) => warning.includes(".opencode/commands"))).toBe(true)
    expect(materializeCalled).toBe(false)
  })

  it("fails mixed-shape stateful commands before any mutation", async () => {
    let writeCalled = false
    let materializeCalled = false
    let unlinkCalled = false

    const result = await runCli(["disable", "--host", "opencode"], createCliDeps({
      prepareControlPlaneStateWrite: async () => {
        throw new Error("Invalid mixed-shape config: do not mix layered settings/presets with legacy routing keys")
      },
      writeFile: async () => {
        writeCalled = true
      },
      materializeArtifacts: async () => {
        materializeCalled = true
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
      unlink: async () => {
        unlinkCalled = true
      },
    }))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("mixed-shape")
    expect(writeCalled).toBe(false)
    expect(materializeCalled).toBe(false)
    expect(unlinkCalled).toBe(false)
  })

  it("returns OMS status with enabled state, active preset, presets, host, compatibility, and artifact state", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps())

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed).toEqual({
      enabled: true,
      activePreset: {
        key: "default",
        label: "Default",
        short: "def",
        description: "General daily development",
      },
      presets: [
        {
          key: "default",
          label: "Default",
          short: "def",
          description: "General daily development",
        },
        {
          key: "review",
          label: "Review",
          short: "rev",
          description: "Focused review work",
        },
      ],
      source: {
        kind: "file",
        hasRealSource: true,
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
      },
      host: "opencode",
      compatibility: compatibleOpencode,
      artifacts: {
        present: [
          "/workspace/project/.opencode/agents/spr-build.md",
          "/workspace/project/.opencode/agents/spr-strategy.md",
        ],
        missing: [],
      },
      state: {
        code: "healthy",
        category: "oms",
        reason: "OMS is enabled and expected OpenCode artifacts are present.",
      },
      nextAction: null,
      artifactSummary: {
        expected: 2,
        present: [
          "/workspace/project/.opencode/agents/spr-build.md",
          "/workspace/project/.opencode/agents/spr-strategy.md",
        ],
        missing: [],
        stale: [],
      },
    })
  })

  it("classifies default no-config status as first-run guidance for opencode", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: { kind: "default" as const, hasRealSource: false, sources: [] },
        config: controlPlaneConfig,
        activePreset: { key: "default", preset: controlPlaneConfig.presets.default },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.host).toBe("opencode")
    expect(output.state.code).toBe("missing_config")
    expect(output.state.category).toBe("oms")
    expect(output.nextAction.command).toBe("oh-my-superagents sync --host opencode")
  })

  it("reports missing expected OpenCode artifacts as a sync-needed state", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      artifactExists: async (filePath: string) => filePath.endsWith("spr-build.md"),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("artifacts_out_of_sync")
    expect(output.nextAction.command).toBe("oh-my-superagents sync --host opencode")
    expect(output.artifactSummary.missing.length).toBeGreaterThan(0)
  })

  it("adds doctor guidance when OpenCode superpowers is not detected", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      evaluateSuperpowersCompatibility: () => notDetectedOpencode,
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("upstream_not_detected")
    expect(output.nextAction.command).toBe("oh-my-superagents doctor --host opencode")
  })

  it("adds doctor guidance when OpenCode superpowers is incompatible", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      evaluateSuperpowersCompatibility: () => incompatibleOpencodeWarn,
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("upstream_incompatible")
    expect(output.nextAction.command).toBe("oh-my-superagents doctor --host opencode")
  })

  it("treats an expected OpenCode artifact replaced with user content as out of sync", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderUserMarkdownArtifact("spr-build"),
        "/workspace/project/.opencode/agents/spr-strategy.md": renderOwnedMarkdownArtifact("spr-strategy"),
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("artifacts_out_of_sync")
    expect(output.artifactSummary.present).toEqual([
      "/workspace/project/.opencode/agents/spr-strategy.md",
    ])
    expect(output.artifactSummary.missing).toContain(
      "/workspace/project/.opencode/agents/spr-build.md",
    )
  })

  it("tracks stale OpenCode artifacts separately from expected artifact summary", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderOwnedMarkdownArtifact("spr-build"),
        "/workspace/project/.opencode/agents/spr-strategy.md": renderOwnedMarkdownArtifact("spr-strategy"),
        "/workspace/project/.opencode/commands/oms-legacy.md": renderOwnedMarkdownArtifact("oms-legacy"),
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("artifacts_out_of_sync")
    expect(output.artifactSummary.expected).toBe(2)
    expect(output.artifactSummary.present).toEqual([
      "/workspace/project/.opencode/agents/spr-build.md",
      "/workspace/project/.opencode/agents/spr-strategy.md",
    ])
    expect(output.artifactSummary.stale).toEqual([
      "/workspace/project/.opencode/commands/oms-legacy.md",
    ])
  })

  it("keeps OpenCode-only state guidance out of codex status output", async () => {
    const result = await runCli(["status", "--host", "codex"], createCliDeps({
      buildCodexArtifacts: () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".codex/agents",
            fileName: "oms-review.toml",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      artifactExists: async (filePath: string) => filePath === "/workspace/project/.codex/agents/oms-review.toml",
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.host).toBe("codex")
    expect(output.state).toBeUndefined()
    expect(output.nextAction).toBeUndefined()
    expect(output.artifactSummary).toBeUndefined()
  })

  it("uses the preset short in disabled next-action guidance when the preset key is shell-unfriendly", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...controlPlaneConfig,
          settings: {
            ...controlPlaneConfig.settings,
            enabled: false,
            activePreset: "default preset $(rm -rf /)",
          },
          presets: {
            "default preset $(rm -rf /)": controlPlaneConfig.presets.default,
            review: controlPlaneConfig.presets.review,
          },
        },
        activePreset: {
          key: "default preset $(rm -rf /)",
          preset: controlPlaneConfig.presets.default,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("disabled")
    expect(output.nextAction.command).toBe("oh-my-superagents use def --host opencode")
  })

  it("returns OMS doctor details with rendered command names, aliases, artifact presence, and compatibility", async () => {
    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps())

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed).toEqual({
      activePreset: {
        key: "default",
        label: "Default",
        short: "def",
      },
      source: {
        kind: "file",
        hasRealSource: true,
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
      },
      host: "opencode",
      commands: {
        prefix: "oms",
        status: { name: "status", aliases: ["st"] },
        use: { name: "use", aliases: ["u"] },
        disable: { name: "off", aliases: ["o"] },
        sync: { name: "sync", aliases: ["sy"] },
        doctor: { name: "doctor", aliases: ["dr"] },
      },
      compatibility: compatibleOpencode,
      artifacts: {
        present: [
          "/workspace/project/.opencode/agents/spr-build.md",
          "/workspace/project/.opencode/agents/spr-strategy.md",
        ],
        missing: [],
      },
    })
  })

  it("includes a discovery warning in status output when an owned-path scan fails", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      readdir: async (directory: string) => {
        if (directory === "/workspace/project/.opencode/commands") {
          throw new Error("EACCES: cannot scan commands")
        }

        return defaultArtifactFs.readdir(directory)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.artifacts.discoveryWarnings).toEqual([
      expect.stringContaining(".opencode/commands"),
    ])
  })

  it("reports stale OMS-owned files even when they are outside the current generated inventory", async () => {
    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderOwnedMarkdownArtifact("spr-build"),
        "/workspace/project/.opencode/agents/spr-strategy.md": renderOwnedMarkdownArtifact("spr-strategy"),
        "/workspace/project/.opencode/commands/oms-legacy.md": renderOwnedMarkdownArtifact("oms-legacy"),
      }),
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.artifacts.present).toContain("/workspace/project/.opencode/commands/oms-legacy.md")
  })

  it("includes a discovery warning in doctor output when an owned-path scan fails", async () => {
    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      readdir: async (directory: string) => {
        if (directory === "/workspace/project/.opencode/commands") {
          throw new Error("EACCES: cannot scan commands")
        }

        return defaultArtifactFs.readdir(directory)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.artifacts.discoveryWarnings).toEqual([
      expect.stringContaining(".opencode/commands"),
    ])
  })

  it("reports doctor artifacts for the invoking host only", async () => {
    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      artifactExists: async (filePath: string) => (
        filePath === "/workspace/project/.opencode/agents/spr-build.md"
        || filePath === "/workspace/project/.codex/agents/oms-review.toml"
      ),
    }))

    const parsed = JSON.parse(result.stdout)
    const reportedArtifacts = [...parsed.artifacts.present, ...parsed.artifacts.missing]

    expect(result.exitCode).toBe(0)
    expect(reportedArtifacts).toContain("/workspace/project/.opencode/agents/spr-build.md")
    expect(reportedArtifacts.some((filePath: string) => filePath.includes(".codex/"))).toBe(false)
  })

  it("uses the invoking project cwd for artifact inspection even when config comes from a global file", async () => {
    const inspectedPaths: string[] = []

    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/home/tester/.config/oh-my-superagents/config.jsonc",
          sources: ["/home/tester/.config/oh-my-superagents/config.jsonc"],
        },
        config: controlPlaneConfig,
        activePreset: {
          key: "default",
          preset: controlPlaneConfig.presets.default,
        },
      }),
      artifactExists: async (filePath: string) => {
        inspectedPaths.push(filePath)
        return false
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(inspectedPaths).toEqual([
      "/workspace/project/.opencode/agents/spr-build.md",
      "/workspace/project/.opencode/agents/spr-strategy.md",
    ])
  })

  it("surfaces read-only default fallback in status output", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "default" as const,
          hasRealSource: false,
          sources: [],
        },
        config: controlPlaneConfig,
        activePreset: {
          key: "default",
          preset: controlPlaneConfig.presets.default,
        },
      }),
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.source).toEqual({
      kind: "default",
      hasRealSource: false,
      sources: [],
    })
  })

  it("inspects the full OMS Codex Stage 1 control-plane surface in status and doctor", async () => {
    const inspectedPaths: string[] = []

    const deps = createCliDeps({
      buildCodexArtifacts: () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".codex/agents",
            fileName: "oms-review.toml",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      artifactExists: async (filePath: string) => {
        inspectedPaths.push(filePath)
        return (
          filePath === "/workspace/project/.codex/agents/oms-review.toml"
          || filePath === "/workspace/project/.agents/plugins/marketplace.json"
          || filePath === "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json"
          || filePath === "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md"
        )
      },
    })

    const status = await runCli(["status", "--host", "codex"], deps)
    const doctor = await runCli(["doctor", "--host", "codex"], deps)

    expect(status.exitCode).toBe(0)
    expect(doctor.exitCode).toBe(0)
    expect(inspectedPaths).toEqual(expect.arrayContaining([
      "/workspace/project/.codex/agents/oms-review.toml",
      "/workspace/project/.agents/plugins/marketplace.json",
      "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    ]))
  })

  it("supports status --host qwen and inspects OMS-managed Qwen commands plus agents", async () => {
    const inspectedPaths: string[] = []

    const result = await runCli(["status", "--host", "qwen"], createCliDeps({
      buildQwenArtifacts: async () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".qwen/agents",
            fileName: "oms-review.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
        commands: [
          {
            kind: "command" as const,
            directory: ".qwen/commands",
            fileName: "oms-status.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      artifactExists: async (filePath: string) => {
        inspectedPaths.push(filePath)
        return (
          filePath === "/workspace/project/.qwen/commands/oms-status.md"
          || filePath === "/workspace/project/.qwen/agents/oms-review.md"
        )
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.host).toBe("qwen")
    expect(parsed.artifacts.present).toEqual([
      "/workspace/project/.qwen/agents/oms-review.md",
      "/workspace/project/.qwen/commands/oms-status.md",
    ])
    expect(inspectedPaths).toEqual(expect.arrayContaining([
      "/workspace/project/.qwen/agents/oms-review.md",
      "/workspace/project/.qwen/commands/oms-status.md",
    ]))
  })

  it("supports doctor --host qwen and reports OMS-managed Qwen commands plus agents", async () => {
    const inspectedPaths: string[] = []

    const result = await runCli(["doctor", "--host", "qwen"], createCliDeps({
      buildQwenArtifacts: async () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".qwen/agents",
            fileName: "oms-review.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
        commands: [
          {
            kind: "command" as const,
            directory: ".qwen/commands",
            fileName: "oms-doctor.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      artifactExists: async (filePath: string) => {
        inspectedPaths.push(filePath)
        return (
          filePath === "/workspace/project/.qwen/commands/oms-doctor.md"
          || filePath === "/workspace/project/.qwen/agents/oms-review.md"
        )
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.host).toBe("qwen")
    expect(parsed.artifacts.present).toEqual([
      "/workspace/project/.qwen/agents/oms-review.md",
      "/workspace/project/.qwen/commands/oms-doctor.md",
    ])
    expect(inspectedPaths).toEqual(expect.arrayContaining([
      "/workspace/project/.qwen/agents/oms-review.md",
      "/workspace/project/.qwen/commands/oms-doctor.md",
    ]))
  })

  it("supports sync --host qwen and materializes OMS-managed Qwen commands plus agents", async () => {
    let materializedPaths: string[] = []

    const result = await runCli(["sync", "--host", "qwen"], createCliDeps({
      buildQwenArtifacts: async () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".qwen/agents",
            fileName: "oms-review.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
        commands: [
          {
            kind: "command" as const,
            directory: ".qwen/commands",
            fileName: "oms-sync.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      materializeArtifacts: async ({ artifacts }: { artifacts: Array<{ directory: string; fileName: string }> }) => {
        materializedPaths = artifacts.map((artifact) => `${artifact.directory}/${artifact.fileName}`)
        return {
          exitCode: 0 as const,
          warnings: [],
          written: [
            "/workspace/project/.qwen/agents/oms-review.md",
            "/workspace/project/.qwen/commands/oms-sync.md",
          ],
          removed: [],
        }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.written).toEqual([
      "/workspace/project/.qwen/agents/oms-review.md",
      "/workspace/project/.qwen/commands/oms-sync.md",
    ])
    expect(materializedPaths).toEqual([
      ".qwen/agents/oms-review.md",
      ".qwen/commands/oms-sync.md",
    ])
  })

  it("reconciles the full OMS Codex Stage 1 surface during sync", async () => {
    let materializedPaths: string[] = []
    const persistedFiles = new Map<string, string>()

    const result = await runCli(["sync", "--host", "codex"], createCliDeps({
      buildCodexArtifacts: () => ({
        agents: [
          {
            kind: "agent",
            directory: ".codex/agents",
            fileName: "oms-review.toml",
            ownerPrefix: "oms-",
            content: renderOwnedCodexAgent("oms-review"),
          },
        ],
      }),
      materializeArtifacts: async ({ artifacts }: { artifacts: Array<{ directory: string; fileName: string }> }) => {
        materializedPaths = artifacts.map((artifact) => `${artifact.directory}/${artifact.fileName}`)
        return {
          exitCode: 0 as const,
          warnings: [],
          written: [
            "/workspace/project/.codex/agents/oms-review.toml",
            "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
          ],
          removed: [],
        }
      },
      writeFile: async (filePath: string, content: string) => {
        persistedFiles.set(filePath, content)
      },
      readArtifactFile: async (filePath: string) => {
        if (filePath === "/workspace/project/.agents/plugins/marketplace.json") {
          return renderCodexMarketplace(true)
        }

        return defaultArtifactFs.readArtifactFile(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(materializedPaths).toEqual(expect.arrayContaining([
      ".codex/agents/oms-review.toml",
      "plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    ]))
    expect(parsed.written).toEqual(expect.arrayContaining([
      "/workspace/project/.agents/plugins/marketplace.json",
      "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      "/workspace/project/.codex/agents/oms-review.toml",
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    ]))
    expect(persistedFiles.get("/workspace/project/.agents/plugins/marketplace.json")).toContain("oh-my-superagents-codex")
    expect(persistedFiles.get("/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json")).toContain("oh-my-superagents-codex")
  })

  it("reconciles the full OMS Codex Stage 1 surface during use", async () => {
    let materializedPaths: string[] = []
    const persistedFiles = new Map<string, string>()

    const result = await runCli(["use", "review", "--host", "codex"], createCliDeps({
      buildCodexArtifacts: () => ({
        agents: [
          {
            kind: "agent",
            directory: ".codex/agents",
            fileName: "oms-review.toml",
            ownerPrefix: "oms-",
            content: renderOwnedCodexAgent("oms-review"),
          },
        ],
      }),
      materializeArtifacts: async ({ artifacts }: { artifacts: Array<{ directory: string; fileName: string }> }) => {
        materializedPaths = artifacts.map((artifact) => `${artifact.directory}/${artifact.fileName}`)
        return {
          exitCode: 0 as const,
          warnings: [],
          written: [
            "/workspace/project/.codex/agents/oms-review.toml",
            "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
          ],
          removed: [],
        }
      },
      writeFile: async (filePath: string, content: string) => {
        persistedFiles.set(filePath, content)
      },
      readArtifactFile: async (filePath: string) => {
        if (filePath === "/workspace/project/.agents/plugins/marketplace.json") {
          return renderCodexMarketplace(true)
        }

        return defaultArtifactFs.readArtifactFile(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(materializedPaths).toEqual(expect.arrayContaining([
      ".codex/agents/oms-review.toml",
      "plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    ]))
    expect(parsed.written).toEqual(expect.arrayContaining([
      "/workspace/project/oh-my-superagents.config.jsonc",
      "/workspace/project/.agents/plugins/marketplace.json",
      "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      "/workspace/project/.codex/agents/oms-review.toml",
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    ]))
    expect(persistedFiles.get("/workspace/project/.agents/plugins/marketplace.json")).toContain("oh-my-superagents-codex")
  })

  it("removes OMS-managed Codex Stage 1 host artifacts during disable", async () => {
    const removedPaths: string[] = []
    const persistedFiles = new Map<string, string>()

    const result = await runCli(["disable", "--host", "codex"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.codex/agents/oms-review.toml": renderOwnedCodexAgent("oms-review"),
        "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json": renderCodexPluginManifest(),
        "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md": renderOwnedCodexSkill("oms-sync", "sync"),
        "/workspace/project/.agents/plugins/marketplace.json": renderCodexMarketplace(true),
      }),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
      writeFile: async (filePath: string, content: string) => {
        persistedFiles.set(filePath, content)
      },
    }))

    const parsed = JSON.parse(result.stdout)
    const rewrittenMarketplace = JSON.parse(
      persistedFiles.get("/workspace/project/.agents/plugins/marketplace.json") ?? "{}",
    ) as { plugins?: Array<{ name?: string }> }

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual(expect.arrayContaining([
      "/workspace/project/.codex/agents/oms-review.toml",
      "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    ]))
    expect(parsed.written).toEqual(expect.arrayContaining([
      "/workspace/project/oh-my-superagents.config.jsonc",
      "/workspace/project/.agents/plugins/marketplace.json",
    ]))
    expect(removedPaths).toEqual(expect.arrayContaining(parsed.removed))
    expect(rewrittenMarketplace.plugins?.some((plugin) => plugin.name === "oh-my-superagents-codex")).toBe(false)
    expect(rewrittenMarketplace.plugins?.some((plugin) => plugin.name === "existing-plugin")).toBe(true)
  })

  it("removes OMS-managed Codex Stage 1 host artifacts during disabled sync", async () => {
    const removedPaths: string[] = []
    const persistedFiles = new Map<string, string>()
    let materializeCalled = false

    const result = await runCli(["sync", "--host", "codex"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...controlPlaneConfig,
          settings: {
            ...controlPlaneConfig.settings,
            enabled: false,
          },
        },
        activePreset: {
          key: "default",
          preset: controlPlaneConfig.presets.default,
        },
      }),
      ...createArtifactFs({
        "/workspace/project/.codex/agents/oms-review.toml": renderOwnedCodexAgent("oms-review"),
        "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json": renderCodexPluginManifest(),
        "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md": renderOwnedCodexSkill("oms-sync", "sync"),
        "/workspace/project/.agents/plugins/marketplace.json": renderCodexMarketplace(true),
      }),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
      writeFile: async (filePath: string, content: string) => {
        persistedFiles.set(filePath, content)
      },
      materializeArtifacts: async () => {
        materializeCalled = true
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
    }))

    const parsed = JSON.parse(result.stdout)
    const rewrittenMarketplace = JSON.parse(
      persistedFiles.get("/workspace/project/.agents/plugins/marketplace.json") ?? "{}",
    ) as { plugins?: Array<{ name?: string }> }

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual(expect.arrayContaining([
      "/workspace/project/.codex/agents/oms-review.toml",
      "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json",
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-sync/SKILL.md",
    ]))
    expect(parsed.written).toEqual(expect.arrayContaining([
      "/workspace/project/.agents/plugins/marketplace.json",
    ]))
    expect(removedPaths).toEqual(expect.arrayContaining(parsed.removed))
    expect(rewrittenMarketplace.plugins?.some((plugin) => plugin.name === "oh-my-superagents-codex")).toBe(false)
    expect(materializeCalled).toBe(false)
  })

  it("removes OMS-managed Qwen commands plus agents during disable", async () => {
    const removedPaths: string[] = []

    const result = await runCli(["disable", "--host", "qwen"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.qwen/agents/oms-review.md": renderOwnedMarkdownArtifact("oms-review"),
        "/workspace/project/.qwen/commands/oms-doctor.md": renderOwnedMarkdownArtifact("oms-doctor"),
      }),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual([
      "/workspace/project/.qwen/agents/oms-review.md",
      "/workspace/project/.qwen/commands/oms-doctor.md",
    ])
    expect(removedPaths).toEqual(parsed.removed)
  })

  it("removes OMS-managed Qwen commands plus agents during disabled sync", async () => {
    const removedPaths: string[] = []
    let materializeCalled = false

    const result = await runCli(["sync", "--host", "qwen"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...controlPlaneConfig,
          settings: {
            ...controlPlaneConfig.settings,
            enabled: false,
          },
        },
        activePreset: {
          key: "default",
          preset: controlPlaneConfig.presets.default,
        },
      }),
      ...createArtifactFs({
        "/workspace/project/.qwen/agents/oms-review.md": renderOwnedMarkdownArtifact("oms-review"),
        "/workspace/project/.qwen/commands/oms-doctor.md": renderOwnedMarkdownArtifact("oms-doctor"),
      }),
      unlink: async (filePath: string) => {
        removedPaths.push(filePath)
      },
      materializeArtifacts: async () => {
        materializeCalled = true
        return { exitCode: 0 as const, warnings: [], written: [], removed: [] }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.removed).toEqual([
      "/workspace/project/.qwen/agents/oms-review.md",
      "/workspace/project/.qwen/commands/oms-doctor.md",
    ])
    expect(removedPaths).toEqual(parsed.removed)
    expect(materializeCalled).toBe(false)
  })
})
