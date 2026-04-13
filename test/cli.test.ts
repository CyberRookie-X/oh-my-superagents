import path from "node:path"
import { describe, expect, it } from "vitest"
import { runCli } from "../src/cli.js"
import { resolveControlPlane as resolveOmsControlPlane } from "../src/control-plane.js"
import { explainCodexPhase } from "../src/codex.js"
import { buildArtifacts as buildOpenCodeArtifacts, MARKER_TEXT } from "../src/opencode.js"
import { buildQwenArtifacts } from "../src/qwen.js"
import { explainPhase } from "../src/router.js"

const baseConfig = {
  workflow: { kind: "superpowers" as const },
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
  workflow: { kind: "superpowers" as const },
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

const directWorkflow = {
  kind: "direct" as const,
  intents: {
    plan: { label: "Plan" },
    build: { label: "Build" },
  },
}

const directControlPlaneConfig = {
  ...controlPlaneConfig,
  workflow: directWorkflow,
  settings: {
    ...controlPlaneConfig.settings,
    defaultLane: "frontend",
    superpowersCompatibility: { mode: "strict" as const },
  },
  profiles: {
    planner: { model: "openai/gpt-5" },
    builder: { model: "gpt-5.4" },
  },
  lanes: {
    frontend: {
      label: "Frontend",
      routes: { plan: "planner" },
      defaultRoute: "builder",
    },
  },
  presets: {
    default: {
      ...controlPlaneConfig.presets.default,
      profiles: undefined,
      usesLanes: ["frontend"],
      defaultLane: "frontend",
      routes: {},
      defaultRoute: "builder",
    },
  },
}

function createDirectCliDeps(overrides: Record<string, unknown> = {}) {
  return createCliDeps({
    loadConfig: async () => ({
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      config: {
        workflow: directWorkflow,
        profiles: directControlPlaneConfig.profiles,
        lanes: directControlPlaneConfig.lanes,
        routes: {},
        defaultRoute: "builder",
        superpowersCompatibility: directControlPlaneConfig.settings.superpowersCompatibility,
      },
    }),
    resolveControlPlane: async () => ({
      source: {
        kind: "file" as const,
        hasRealSource: true,
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
      },
      config: directControlPlaneConfig,
      activePreset: {
        key: "default",
        preset: directControlPlaneConfig.presets.default,
      },
      laneState: {
        allowedLanes: ["frontend"],
        defaultLane: "frontend",
        effectiveLane: "frontend",
        presetDefaultLane: "frontend",
      },
    }),
    buildArtifacts: buildOpenCodeArtifacts,
    ...overrides,
  })
}

const defaultLaneState = {
  allowedLanes: [] as string[],
  defaultLane: undefined,
  effectiveLane: undefined,
  presetDefaultLane: undefined,
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

function createExists(files: Record<string, string>) {
  return async (filePath: string) => filePath in files
}

function createReadFile(files: Record<string, string>) {
  return async (filePath: string) => {
    const value = files[filePath]
    if (value === undefined) {
      throw new Error(`Unexpected read: ${filePath}`)
    }

    return value
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
      laneState: defaultLaneState,
    }),
    ...defaultArtifactFs,
    ...overrides,
  } as any
}

function getAuthorRoutingSection(stdout: string, startHeading: string, endHeading: string) {
  const startToken = `${startHeading}\n`
  const endToken = `\n\n${endHeading}\n`
  const startIndex = stdout.indexOf(startToken)
  const endIndex = stdout.indexOf(endToken)

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Could not extract ${startHeading} section from author routing output`)
  }

  return stdout.slice(startIndex + startToken.length, endIndex)
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

  it("explains a direct workflow intent on OpenCode", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--intent", "plan"], createDirectCliDeps())

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.intent).toBe("plan")
    expect(output.profileId).toBe("planner")
    expect(output.model).toBe("openai/gpt-5")
  })

  it("shows all direct workflow intents on OpenCode", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--all"], createDirectCliDeps())

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ intent: "plan", model: "openai/gpt-5" }),
        expect.objectContaining({ intent: "build", model: "gpt-5.4" }),
      ]),
    )
  })

  it("keeps direct workflow explain unsupported on Qwen", async () => {
    let explainCalled = false

    const result = await runCli(["explain", "--host", "qwen", "--intent", "plan"], createDirectCliDeps({
      explainPhaseForHost: () => {
        explainCalled = true
        throw new Error("unexpected explain")
      },
    }))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("opencode or --host codex")
    expect(explainCalled).toBe(false)
  })

  it("explains a direct workflow intent on Codex", async () => {
    const result = await runCli(["explain", "--host", "codex", "--intent", "plan"], createDirectCliDeps())

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.intent).toBe("plan")
    expect(output.profileId).toBe("planner")
    expect(output.model).toBe("openai/gpt-5")
    expect(output.commandName).toBe("ai-plan")
    expect(output.agentName).toBe("rt-plan")
  })

  it("adds source tracing to explain output for opencode", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps())

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.routeSource).toBe("explicit_route")
    expect(output.configSource).toBe("project")
    expect(output.reuseRelationship).toBe("none")
  })

  it("routes explain through the control-plane effective lane", async () => {
    const laneAwareControlPlaneConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        defaultLane: "frontend",
      },
      profiles: {
        "frontend-strategy": {
          model: "google/gemini-2.5-pro",
          variant: "high",
        },
        build: { model: "openai/gpt-5" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "frontend-strategy" },
          defaultRoute: "build",
        },
      },
      presets: {
        ...controlPlaneConfig.presets,
        default: {
          ...controlPlaneConfig.presets.default,
          profiles: undefined,
          usesLanes: ["frontend"],
          defaultLane: "frontend",
          routes: {},
          defaultRoute: "build",
        },
      },
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps({
      explainPhaseForHost: (config: any, host: "opencode" | "codex", phase: any) => (
        host === "opencode" ? explainPhase(config, phase) : { phase, profileId: "unused" }
      ),
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: laneAwareControlPlaneConfig,
        activePreset: {
          key: "default",
          preset: laneAwareControlPlaneConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: "frontend",
          presetDefaultLane: "frontend",
          effectiveLane: "frontend",
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.profileId).toBe("frontend-strategy")
    expect(output.model).toBe("google/gemini-2.5-pro")
    expect(output.effectiveLane).toBe("frontend")
    expect(output.routeSource).toBe("lane-route")
  })

  it("applies --lane in explain when laneSelection.mode is auto", async () => {
    const laneAwareControlPlaneConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        laneSelection: { mode: "auto" as const },
      },
      profiles: {
        "frontend-strategy": {
          model: "google/gemini-2.5-pro",
          variant: "high",
        },
        build: { model: "openai/gpt-5" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "frontend-strategy" },
          defaultRoute: "build",
        },
      },
      presets: {
        ...controlPlaneConfig.presets,
        default: {
          ...controlPlaneConfig.presets.default,
          profiles: undefined,
          usesLanes: ["frontend"],
          routes: {},
          defaultRoute: "build",
        },
      },
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming", "--lane", "frontend"], createCliDeps({
      explainPhaseForHost: (config: any, host: "opencode" | "codex", phase: any) => (
        host === "opencode" ? explainPhase(config, phase) : { phase, profileId: "unused" }
      ),
      resolveControlPlane: async (input: { runtimeLane?: string }) => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: laneAwareControlPlaneConfig,
        activePreset: {
          key: "default",
          preset: laneAwareControlPlaneConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: undefined,
          presetDefaultLane: undefined,
          effectiveLane: input.runtimeLane,
          runtimeLane: input.runtimeLane,
          mode: "auto" as const,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.profileId).toBe("frontend-strategy")
    expect(output.effectiveLane).toBe("frontend")
    expect(output.runtimeLane).toBe("frontend")
  })

  it("applies --lane in codex explain when laneSelection.mode is auto", async () => {
    const laneAwareControlPlaneConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        laneSelection: { mode: "auto" as const },
      },
      profiles: {
        "frontend-strategy": {
          model: "gpt-5.4",
          effort: "deep" as const,
        },
        build: { model: "gpt-5.4-mini" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "frontend-strategy" },
          defaultRoute: "build",
        },
      },
      presets: {
        ...controlPlaneConfig.presets,
        default: {
          ...controlPlaneConfig.presets.default,
          profiles: undefined,
          usesLanes: ["frontend"],
          routes: {},
          defaultRoute: "build",
        },
      },
    }

    const result = await runCli(["explain", "--host", "codex", "--phase", "brainstorming", "--lane", "frontend"], createCliDeps({
      explainPhaseForHost: (config: any, host: "opencode" | "codex", phase: any) => (
        host === "codex" ? explainCodexPhase(config, phase) : explainPhase(config, phase)
      ),
      resolveControlPlane: async (input: { runtimeLane?: string }) => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: laneAwareControlPlaneConfig,
        activePreset: {
          key: "default",
          preset: laneAwareControlPlaneConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: undefined,
          presetDefaultLane: undefined,
          effectiveLane: input.runtimeLane,
          runtimeLane: input.runtimeLane,
          mode: "auto" as const,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.profileId).toBe("frontend-strategy")
    expect(output.model).toBe("gpt-5.4")
    expect(output.effectiveLane).toBe("frontend")
    expect(output.routeSource).toBe("lane-route")
  })

  it("includes lane diagnostics in explain output", async () => {
    const laneAwareControlPlaneConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        defaultLane: "frontend",
        laneSelection: { mode: "suggest" as const },
      },
      profiles: {
        "frontend-strategy": {
          model: "google/gemini-2.5-pro",
          variant: "high",
        },
        build: { model: "openai/gpt-5" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "frontend-strategy" },
          defaultRoute: "build",
        },
      },
      presets: {
        ...controlPlaneConfig.presets,
        default: {
          ...controlPlaneConfig.presets.default,
          profiles: undefined,
          usesLanes: ["frontend"],
          defaultLane: "frontend",
          routes: {},
          defaultRoute: "build",
        },
      },
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps({
      explainPhaseForHost: (config: any, host: "opencode" | "codex", phase: any) => (
        host === "opencode" ? explainPhase(config, phase) : { phase, profileId: "unused" }
      ),
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: laneAwareControlPlaneConfig,
        activePreset: {
          key: "default",
          preset: laneAwareControlPlaneConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: "frontend",
          presetDefaultLane: "frontend",
          effectiveLane: "frontend",
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.allowedLanes).toEqual(["frontend"])
    expect(output.defaultLane).toBe("frontend")
    expect(output.presetDefaultLane).toBe("frontend")
    expect(output.effectiveLane).toBe("frontend")
    expect(output.laneSelection).toEqual({ mode: "suggest" })
    expect(output.nonApplyingReason).toContain("Stage 1")
  })

  it("surfaces Stage 1 suggestion guidance in status output", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
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
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: undefined,
          effectiveLane: undefined,
          mode: "suggest" as const,
          nonApplyingReason: "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
          presetDefaultLane: undefined,
          runtimeLane: "frontend",
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.laneSelection).toEqual({ mode: "suggest" })
    expect(output.nonApplyingReason).toContain("Stage 1")
  })

  it("keeps --lane non-applying in status when laneSelection.mode is manual", async () => {
    const result = await runCli(["status", "--host", "opencode", "--lane", "frontend"], createCliDeps({
      resolveControlPlane: async (input: { runtimeLane?: string }) => ({
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
        laneState: {
          allowedLanes: ["frontend", "backend"],
          defaultLane: "backend",
          presetDefaultLane: "backend",
          effectiveLane: "backend",
          runtimeLane: input.runtimeLane,
          mode: "manual" as const,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.mode).toBe("manual")
    expect(output.runtimeLane).toBe("frontend")
    expect(output.effectiveLane).toBe("backend")
  })

  it("explains correctly when the active preset uses top-level profiles", async () => {
    const routedConfig = {
      ...controlPlaneConfig,
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
      lanes: {},
      presets: {
        default: {
          label: "Default",
          short: "def",
          description: "General daily development",
          routes: {
            brainstorming: "strategy",
          },
          defaultRoute: "build",
        },
      },
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: routedConfig,
        activePreset: {
          key: "default",
          preset: routedConfig.presets.default,
        },
        trace: {
          activePresetDefinition: {
            path: "/workspace/project/oh-my-superagents.config.jsonc",
            preset: routedConfig.presets.default,
          },
        },
      }),
      explainPhaseForHost: (config: any, host: "opencode" | "codex") => ({
        phase: "brainstorming",
        profileId: "strategy",
        model: config.profiles.strategy.model,
        variant: config.profiles.strategy.variant,
        commandName: host === "codex" ? undefined : "/sp-brainstorm",
        agentName: host === "codex" ? "oms-brainstorm" : "spr-strategy",
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.model).toBe("anthropic/claude-sonnet-4-5-20250929")
    expect(output.configSource).toBe("project")
  })

  it("keeps configSource rooted in the real file source when inheritance is not proven per phase", async () => {
    const childConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        activePreset: "child",
      },
      presets: {
        ...controlPlaneConfig.presets,
        child: {
          ...controlPlaneConfig.presets.default,
          label: "Child",
          short: "child",
          extends: "default",
        },
      },
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: childConfig,
        activePreset: {
          key: "child",
          preset: childConfig.presets.child,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.configSource).toBe("project")
    expect(output.reuseRelationship).toBe("extends")
  })

  it("reports the global layer when a project config only selects a preset but the decisive route comes from global", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "strategy": { "model": "anthropic/claude-sonnet-4-5-20250929", "variant": "high" },
              "build": { "model": "openai/gpt-5", "effort": "balanced" }
            },
            "routes": {
              "brainstorming": "strategy"
            },
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {}
      }`,
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps({
      resolveControlPlane: async () => resolveOmsControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        exists: createExists(files),
        readFile: createReadFile(files),
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.configSource).toBe("global")
    expect(output.reuseRelationship).toBe("none")
  })

  it("prefers the project layer when a reused parent route selects a profile overridden locally", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "strategy": { "model": "anthropic/claude-sonnet-4-5-20250929", "variant": "high" },
              "build": { "model": "openai/gpt-5", "effort": "balanced" }
            },
            "routes": {
              "brainstorming": "strategy"
            },
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "child"
        },
        "presets": {
          "child": {
            "label": "Child",
            "short": "child",
            "extends": "default",
            "profiles": {
              "strategy": { "model": "openai/gpt-5", "variant": "medium" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming"], createCliDeps({
      resolveControlPlane: async () => resolveOmsControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        exists: createExists(files),
        readFile: createReadFile(files),
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.configSource).toBe("project")
    expect(output.reuseRelationship).toBe("extends")
  })

  it("attributes configSource to the lane route and selected profile winner", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "profiles": {
          "frontend-strategy": { "model": "anthropic/claude-sonnet-4-5-20250929", "variant": "high" },
          "build": { "model": "openai/gpt-5", "effort": "balanced" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": {
              "brainstorming": "frontend-strategy"
            },
            "defaultRoute": "build"
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "laneSelection": { "mode": "auto" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend"],
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await runCli(["explain", "--host", "opencode", "--phase", "brainstorming", "--lane", "frontend"], createCliDeps({
      explainPhaseForHost: (config: any, host: "opencode" | "codex", phase: any) => (
        host === "opencode" ? explainPhase(config, phase) : explainCodexPhase(config, phase)
      ),
      resolveControlPlane: async () => resolveOmsControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        exists: createExists(files),
        readFile: createReadFile(files),
        runtimeLane: "frontend",
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.profileId).toBe("frontend-strategy")
    expect(output.configSource).toBe("global")
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

  it("threads workflow through sync artifact generation", async () => {
    let capturedWorkflow: { kind: "superpowers" } | undefined

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
      buildArtifacts: (config: { workflow?: { kind: "superpowers" } }) => {
        capturedWorkflow = config.workflow

        return {
          agents: [],
          commands: [],
        }
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(capturedWorkflow).toEqual({ kind: "superpowers" })
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
          laneState: defaultLaneState,
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

  it("syncs OpenCode artifacts for a direct workflow config", async () => {
    let materializeCalled = false

    const result = await runCli(["sync", "--host", "opencode"], createDirectCliDeps({
      evaluateSuperpowersCompatibility: () => incompatibleOpencodeStrict,
      materializeArtifacts: async ({ artifacts }: { artifacts: Array<{ directory: string; fileName: string }> }) => {
        materializeCalled = true

        return {
          exitCode: 0 as const,
          warnings: [],
          written: artifacts.map((artifact) => path.join("/workspace/project", artifact.directory, artifact.fileName)),
          removed: [],
        }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(materializeCalled).toBe(true)
    expect(parsed.compatibility).toBeNull()
    expect(parsed.written.some((filePath: string) => filePath.endsWith("ai-plan.md"))).toBe(true)
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

  it("prints a routing proposal summary without writing by default", async () => {
    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
      ].includes(filePath),
      readArtifactFile: async (filePath: string) => filePath.endsWith("models.json")
        ? JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        : JSON.stringify({ dependencies: { react: "18.0.0" } }),
      writeFile: async () => {
        throw new Error("writeFile should not be called in preview mode")
      },
    }))

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)

    expect(output.mode).toBe("direct")
    expect(output.summary.lanes).toContain("frontend")
    expect(output.summary.profiles).toContain("builder")
    expect(output.summary.presets).toContain("default")
    expect(output.preview.path).toContain("oh-my-superagents.config.jsonc")
    expect(output.written).toBe(false)
    expect(result.stderr).toContain("Summary")
    expect(result.stderr).toContain("Routing authoring preview")
    expect(result.stderr).toContain("Detected lanes: frontend")
    expect(result.stderr).toContain("Profiles: builder")
    expect(result.stderr).toContain("Diff")
    expect(result.stderr).toContain("+   \"workflow\": {")
    expect(result.stderr).toContain("+   \"profiles\": {")
    expect(result.stderr).toContain("Result")
    expect(result.stderr).toContain("Written: no")
    expect(result.stderr).toContain("Target: /workspace/project/oh-my-superagents.config.jsonc")
  })

  it("accepts a JSONC model inventory for routing preview", async () => {
    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.jsonc",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.jsonc",
      ].includes(filePath),
      readArtifactFile: async (filePath: string) => filePath.endsWith("models.jsonc")
        ? `{
            // preview inventory
            "models": {
              "builder": {
                "model": "openai/gpt-5",
                "specialties": ["frontend", "build"]
              }
            }
          }`
        : JSON.stringify({ dependencies: { react: "18.0.0" } }),
    }))

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.summary.profiles).toContain("builder")
  })

  it("targets the project config path when only a global config exists", async () => {
    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
        "/home/tester/.config/oh-my-superagents/config.jsonc",
      ].includes(filePath),
      discoverConfigPath: async () => "/home/tester/.config/oh-my-superagents/config.jsonc",
      readArtifactFile: async (filePath: string) => filePath.endsWith("models.json")
        ? JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        : JSON.stringify({ dependencies: { react: "18.0.0" } }),
    }))

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.preview.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(output.preview.operation).toBe("create")
  })

  it("writes the proposed routing config only when --write is provided", async () => {
    let writtenPath = ""
    let writtenContent = ""

    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
      "--write",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
      ].includes(filePath),
      readArtifactFile: async (filePath: string) => filePath.endsWith("models.json")
        ? JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        : JSON.stringify({ dependencies: { react: "18.0.0" } }),
      writeFile: async (filePath, content) => {
        writtenPath = filePath
        writtenContent = content
      },
    }))

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(writtenPath).toContain("oh-my-superagents.config.jsonc")
    expect(writtenContent).toContain('"profiles"')
    expect(writtenContent).toContain('"settings"')
    expect(output.written).toBe(true)
    expect(result.stderr).toContain("Summary")
    expect(result.stderr).toContain("Routing authoring write")
    expect(result.stderr).toContain("Profiles: builder")
    expect(result.stderr).toContain("Diff")
    expect(result.stderr).toContain("+   \"workflow\": {")
    expect(result.stderr).toContain("+     \"builder\": {")
    expect(result.stderr).toContain("Result")
    expect(result.stderr).toContain("Written: yes")
  })

  it("derives update diffs from the existing rendered config and keeps retained routes visible", async () => {
    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
        "/workspace/project/oh-my-superagents.config.jsonc",
      ].includes(filePath),
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...directControlPlaneConfig,
          settings: {
            ...directControlPlaneConfig.settings,
            activePreset: "default",
          },
          profiles: {
            existing: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
            builder: { model: "openai/gpt-5" },
          },
          lanes: {
            ops: {
              label: "Ops",
              routes: { review: "existing" },
              defaultRoute: "existing",
            },
            frontend: {
              label: "Frontend",
              routes: {},
              defaultRoute: "builder",
            },
          },
          presets: {
            default: {
              label: "Default",
              short: "def",
              usesLanes: ["ops", "frontend"],
              routes: { review: "existing" },
              defaultLane: "frontend",
              defaultRoute: "builder",
            },
          },
        },
        activePreset: {
          key: "default",
          preset: {
            label: "Default",
            short: "def",
            usesLanes: ["ops", "frontend"],
            routes: { review: "existing" },
            defaultLane: "frontend",
            defaultRoute: "builder",
          },
        },
        laneState: defaultLaneState,
      }),
      readArtifactFile: async (filePath: string) => {
        if (filePath.endsWith("models.json")) {
          return JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        }

        return JSON.stringify({
          workflow: { kind: "direct", intents: { build: { label: "Build" }, review: { label: "Review" } } },
          settings: { activePreset: "default", enabled: true },
          profiles: {
            existing: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
          },
          lanes: {
            ops: {
              label: "Ops",
              routes: { review: "existing" },
              defaultRoute: "existing",
            },
          },
          presets: {
            default: {
              label: "Default",
              short: "def",
              usesLanes: ["ops"],
              routes: { review: "existing" },
              defaultRoute: "existing",
            },
          },
        }, null, 2)
      },
    }))

    expect(result.exitCode).toBe(0)

    const diffText = getAuthorRoutingSection(result.stderr, "Diff", "Result")

    expect(diffText).toContain('-         "ops"')
    expect(diffText).toContain('+         "frontend"')
    expect(diffText).toContain('      "review": "existing"')
    expect(diffText).not.toContain('-         "review": "existing"')
  })

  it("evolves an existing global config when --write is used without a project config", async () => {
    let writtenPath = ""
    let writtenContent = ""

    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
      "--write",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
        "/home/tester/.config/oh-my-superagents/config.jsonc",
      ].includes(filePath),
      discoverConfigPath: async () => "/home/tester/.config/oh-my-superagents/config.jsonc",
      readArtifactFile: async (filePath: string) => {
        if (filePath.endsWith("models.json")) {
          return JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        }

        if (filePath === "/home/tester/.config/oh-my-superagents/config.jsonc") {
          return JSON.stringify({
            workflow: { kind: "superpowers" },
            settings: {
              activePreset: "default",
              enabled: true,
            },
            presets: {
              default: {
                label: "Default",
                short: "def",
                routes: { brainstorming: "existing" },
                defaultRoute: "existing",
              },
            },
            profiles: {
              existing: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
            },
            lanes: {},
          })
        }

        return JSON.stringify({ dependencies: { react: "18.0.0" } })
      },
      writeFile: async (filePath, content) => {
        writtenPath = filePath
        writtenContent = content
      },
    }))

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(writtenPath).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
    expect(writtenContent).toContain('"kind": "direct"')
    expect(output.preview.path).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
    expect(output.preview.operation).toBe("update")
    expect(output.written).toBe(true)
    expect(result.stderr).toContain("Target: /home/tester/.config/oh-my-superagents/config.jsonc")
    expect(result.stderr).toContain("Operation: update")
    expect(result.stderr).toContain("Written: yes")
  })

  it("fails closed on invalid existing config during --write", async () => {
    let wrote = false

    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
      "--write",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
        "/workspace/project/oh-my-superagents.config.jsonc",
      ].includes(filePath),
      readArtifactFile: async (filePath: string) => filePath.endsWith("models.json")
        ? JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        : "{ invalid",
      resolveControlPlane: async () => {
        throw new Error("Invalid JSONC in /workspace/project/oh-my-superagents.config.jsonc")
      },
      writeFile: async () => {
        wrote = true
      },
    }))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Invalid JSONC")
    expect(wrote).toBe(false)
  })

  it("bases same-mode direct writes on the effective layered workflow, not only the target file", async () => {
    let writtenContent = ""

    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
      "--write",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
        "/workspace/project/oh-my-superagents.config.jsonc",
        "/home/tester/.config/oh-my-superagents/config.jsonc",
      ].includes(filePath),
      discoverConfigPath: async () => "/workspace/project/oh-my-superagents.config.jsonc",
      loadConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        config: {
          workflow: { kind: "direct", intents: { build: { label: "Build" }, review: { label: "Review" } } },
          profiles: {
            builder: { model: "openai/gpt-5" },
            reviewer: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
          },
          lanes: {
            ops: {
              label: "Ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
          routes: {},
          defaultRoute: "builder",
          effectiveLane: "ops",
          superpowersCompatibility: { mode: "warn" },
        },
      }),
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: [
            "/home/tester/.config/oh-my-superagents/config.jsonc",
            "/workspace/project/oh-my-superagents.config.jsonc",
          ],
        },
        config: {
          ...directControlPlaneConfig,
          settings: {
            ...directControlPlaneConfig.settings,
            activePreset: "review",
            defaultLane: "ops",
          },
          lanes: {
            ops: {
              label: "Ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
          presets: {
            default: {
              ...directControlPlaneConfig.presets.default,
              usesLanes: ["ops"],
              defaultLane: "ops",
              defaultRoute: "reviewer",
            },
            review: {
              label: "Review",
              short: "rev",
              usesLanes: ["ops"],
              defaultLane: "ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
        },
        activePreset: {
          key: "review",
          preset: {
            label: "Review",
            short: "rev",
            usesLanes: ["ops"],
            defaultLane: "ops",
            routes: { review: "reviewer" },
            defaultRoute: "reviewer",
          },
        },
        laneState: {
          ...defaultLaneState,
          allowedLanes: ["ops"],
          defaultLane: "ops",
          effectiveLane: "ops",
          presetDefaultLane: "ops",
          mode: "suggest",
        },
      }),
      readArtifactFile: async (filePath: string) => {
        if (filePath.endsWith("models.json")) {
          return JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        }

        if (filePath === "/workspace/project/oh-my-superagents.config.jsonc") {
          return JSON.stringify({
            settings: {
              activePreset: "review",
              enabled: true,
              defaultLane: "ops",
            },
            lanes: {
              ops: {
                label: "Ops",
                routes: { review: "reviewer" },
                defaultRoute: "reviewer",
              },
            },
            presets: {
              default: {
                label: "Default",
                short: "def",
                usesLanes: ["ops"],
                defaultLane: "ops",
                routes: {},
                defaultRoute: "reviewer",
              },
            },
            profiles: {
              builder: { model: "openai/gpt-5" },
            },
          })
        }

        return JSON.stringify({
          workflow: { kind: "direct", intents: { build: { label: "Build" }, review: { label: "Review" } } },
          settings: { activePreset: "review", enabled: true, defaultLane: "ops" },
          presets: {
            review: {
              label: "Review",
              short: "rev",
              usesLanes: ["ops"],
              defaultLane: "ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
          profiles: {
            reviewer: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
          },
          lanes: {
            ops: {
              label: "Ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
        })
      },
      writeFile: async (_filePath, content) => {
        writtenContent = content
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(writtenContent).toContain('"activePreset": "review"')
    expect(writtenContent).toContain('"defaultLane": "ops"')
    expect(writtenContent).toContain('"ops"')
  })

  it("keeps preview and write aligned for layered inherited direct config", async () => {
    let writtenContent = ""

    const overrides = {
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
        "/workspace/project/oh-my-superagents.config.jsonc",
        "/home/tester/.config/oh-my-superagents/config.jsonc",
      ].includes(filePath),
      discoverConfigPath: async () => "/workspace/project/oh-my-superagents.config.jsonc",
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: [
            "/home/tester/.config/oh-my-superagents/config.jsonc",
            "/workspace/project/oh-my-superagents.config.jsonc",
          ],
        },
        config: {
          ...directControlPlaneConfig,
          settings: {
            ...directControlPlaneConfig.settings,
            activePreset: "review",
            defaultLane: "ops",
          },
          lanes: {
            ops: {
              label: "Ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
          presets: {
            default: {
              ...directControlPlaneConfig.presets.default,
              usesLanes: ["ops"],
              defaultLane: "ops",
              defaultRoute: "reviewer",
            },
            review: {
              label: "Review",
              short: "rev",
              usesLanes: ["ops"],
              defaultLane: "ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
        },
        activePreset: {
          key: "review",
          preset: {
            label: "Review",
            short: "rev",
            usesLanes: ["ops"],
            defaultLane: "ops",
            routes: { review: "reviewer" },
            defaultRoute: "reviewer",
          },
        },
        laneState: {
          ...defaultLaneState,
          allowedLanes: ["ops"],
          defaultLane: "ops",
          effectiveLane: "ops",
          presetDefaultLane: "ops",
          mode: "suggest",
        },
      }),
      readArtifactFile: async (filePath: string) => {
        if (filePath.endsWith("models.json")) {
          return JSON.stringify({
            models: {
              builder: {
                model: "openai/gpt-5",
                specialties: ["frontend", "build"],
              },
            },
          })
        }

        if (filePath === "/workspace/project/oh-my-superagents.config.jsonc") {
          return JSON.stringify({
            settings: {
              enabled: true,
              defaultLane: "ops",
            },
            lanes: {
              ops: {
                label: "Ops",
                routes: { review: "reviewer" },
                defaultRoute: "reviewer",
              },
            },
            presets: {
              default: {
                label: "Default",
                short: "def",
                usesLanes: ["ops"],
                defaultLane: "ops",
                routes: {},
                defaultRoute: "reviewer",
              },
            },
            profiles: {
              builder: { model: "openai/gpt-5" },
            },
          })
        }

        return JSON.stringify({
          workflow: { kind: "direct", intents: { build: { label: "Build" }, review: { label: "Review" } } },
          settings: { activePreset: "review", enabled: true, defaultLane: "ops" },
          presets: {
            review: {
              label: "Review",
              short: "rev",
              usesLanes: ["ops"],
              defaultLane: "ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
          profiles: {
            reviewer: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
          },
          lanes: {
            ops: {
              label: "Ops",
              routes: { review: "reviewer" },
              defaultRoute: "reviewer",
            },
          },
        })
      },
    }

    const previewResult = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
    ], createCliDeps(overrides))

    const writeResult = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
      "--write",
    ], createCliDeps({
      ...overrides,
      writeFile: async (_filePath: string, content: string) => {
        writtenContent = content
      },
    }))

    expect(previewResult.exitCode).toBe(0)
    expect(writeResult.exitCode).toBe(0)

    const preview = JSON.parse(previewResult.stdout)

    expect(preview.preview.rendered).toBe(writtenContent)
    expect(getAuthorRoutingSection(previewResult.stderr, "Diff", "Result")).toBe(
      getAuthorRoutingSection(writeResult.stderr, "Diff", "Result"),
    )
  })

  it("fails clearly for malformed model inventory entries", async () => {
    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      "/workspace/project/models.json",
    ], createCliDeps({
      artifactExists: async (filePath: string) => [
        "/workspace/project/package.json",
        "/workspace/project/src/components/App.tsx",
        "/workspace/project/models.json",
      ].includes(filePath),
      readArtifactFile: async (filePath: string) => filePath.endsWith("models.json")
        ? JSON.stringify({
            models: {
              builder: {
                specialties: ["frontend", "build"],
              },
            },
          })
        : JSON.stringify({ dependencies: { react: "18.0.0" } }),
    }))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Invalid model inventory")
    expect(result.stderr).toContain("models.builder.model")
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

  it("reports the post-write real config source after first-write use bootstraps a config file", async () => {
    let persistedPath = ""
    const createdDirectories: string[] = []

    const result = await runCli(["use", "review", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: { kind: "default" as const, hasRealSource: false, sources: [] },
        config: controlPlaneConfig,
        activePreset: { key: "default", preset: controlPlaneConfig.presets.default },
      }),
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/home/tester/.config/oh-my-superagents/config.jsonc",
        content: JSON.stringify({ settings: nextState, presets: controlPlaneConfig.presets }, null, 2),
        config: {
          ...controlPlaneConfig,
          settings: {
            ...controlPlaneConfig.settings,
            activePreset: nextState.activePreset,
            enabled: nextState.enabled,
          },
        },
      }),
      mkdir: async (directory: string) => {
        createdDirectories.push(directory)
      },
      writeFile: async (filePath: string) => {
        if (!createdDirectories.includes(path.dirname(filePath))) {
          throw new Error(`ENOENT: missing parent directory for ${filePath}`)
        }

        persistedPath = filePath
      },
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(persistedPath).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
    expect(output.source).toEqual({
      kind: "file",
      hasRealSource: true,
      path: "/home/tester/.config/oh-my-superagents/config.jsonc",
      sources: ["/home/tester/.config/oh-my-superagents/config.jsonc"],
    })
  })

  it("reports that use changed the active preset without a redundant sync recommendation after success", async () => {
    const result = await runCli(["use", "review", "--host", "opencode"], createCliDeps({
      buildArtifacts: (config: any) => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".opencode/agents",
            fileName: `spr-${config.defaultRoute}.md`,
            ownerPrefix: "spr-",
            content: config.defaultRoute,
          },
        ],
        commands: [],
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.changed).toBe(true)
    expect(output.source).toEqual({
      kind: "file",
      hasRealSource: true,
      path: "/workspace/project/oh-my-superagents.config.jsonc",
      sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
    })
    expect(output.artifactsDiffer).toBe(false)
    expect(output.routeImpact.changedPhases).toContain("writing-plans")
    expect(output.activePreset.key).toBe("review")
    expect(output.nextAction).toBeUndefined()
  })

  it("scopes OpenCode use artifact generation to the target preset lanes", async () => {
    let capturedAvailableLanes: string[] | undefined

    const laneScopedConfig = {
      ...controlPlaneConfig,
      lanes: {
        frontend: {
          label: "Frontend",
          routes: {},
          defaultRoute: "build",
        },
        backend: {
          label: "Backend",
          routes: {},
          defaultRoute: "build",
        },
      },
      presets: {
        ...controlPlaneConfig.presets,
        default: {
          ...controlPlaneConfig.presets.default,
          usesLanes: ["frontend", "backend"],
          defaultLane: "backend",
        },
        review: {
          ...controlPlaneConfig.presets.review,
          usesLanes: undefined,
          defaultLane: undefined,
        },
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
        config: laneScopedConfig,
        activePreset: {
          key: "default",
          preset: laneScopedConfig.presets.default,
        },
      }),
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        content: JSON.stringify({ settings: nextState }, null, 2),
        config: {
          ...laneScopedConfig,
          settings: {
            ...laneScopedConfig.settings,
            activePreset: nextState.activePreset,
            enabled: nextState.enabled,
          },
        },
      }),
      buildArtifacts: (config: { availableLanes?: string[] }) => {
        capturedAvailableLanes = config.availableLanes
        return { agents: [], commands: [] }
      },
    }))

    expect(result.exitCode).toBe(0)
    expect(capturedAvailableLanes).toEqual([])
  })

  it("marks a phase as changed when only the resolved temperature changes", async () => {
    const temperatureConfig = {
      ...controlPlaneConfig,
      presets: {
        ...controlPlaneConfig.presets,
        review: {
          ...controlPlaneConfig.presets.review,
          profiles: {
            build: {
              model: "openai/gpt-5",
              effort: "balanced" as const,
              temperature: 0.4,
            },
          },
          routes: {},
          defaultRoute: "build",
        },
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
        config: temperatureConfig,
        activePreset: {
          key: "default",
          preset: temperatureConfig.presets.default,
        },
      }),
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        content: JSON.stringify({ settings: nextState }, null, 2),
        config: {
          ...temperatureConfig,
          settings: {
            ...temperatureConfig.settings,
            activePreset: nextState.activePreset,
            enabled: nextState.enabled,
          },
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.routeImpact.changedPhases).toContain("writing-plans")
  })

  it("does not mark a phase as changed when only effort vs explicit variant differ but OpenCode rendering stays the same", async () => {
    const equivalentVariantConfig = {
      ...controlPlaneConfig,
      presets: {
        ...controlPlaneConfig.presets,
        review: {
          ...controlPlaneConfig.presets.review,
          profiles: {
            build: {
              model: "openai/gpt-5",
              variant: "medium",
            },
          },
          routes: {},
          defaultRoute: "build",
        },
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
        config: equivalentVariantConfig,
        activePreset: {
          key: "default",
          preset: equivalentVariantConfig.presets.default,
        },
      }),
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        content: JSON.stringify({ settings: nextState }, null, 2),
        config: {
          ...equivalentVariantConfig,
          settings: {
            ...equivalentVariantConfig.settings,
            activePreset: nextState.activePreset,
            enabled: nextState.enabled,
          },
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.routeImpact.changedPhases).not.toContain("writing-plans")
  })

  it("omits activePreset.description in use output when the selected preset has no description", async () => {
    const configWithoutReviewDescription = {
      ...controlPlaneConfig,
      presets: {
        ...controlPlaneConfig.presets,
        review: {
          ...controlPlaneConfig.presets.review,
          description: undefined,
        },
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
        config: configWithoutReviewDescription,
        activePreset: {
          key: "default",
          preset: configWithoutReviewDescription.presets.default,
        },
      }),
      prepareControlPlaneStateWrite: async ({ nextState }: { nextState: { activePreset: string; enabled: boolean } }) => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        content: JSON.stringify({ settings: nextState }, null, 2),
        config: {
          ...configWithoutReviewDescription,
          settings: {
            ...configWithoutReviewDescription.settings,
            activePreset: nextState.activePreset,
            enabled: nextState.enabled,
          },
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.activePreset).toEqual({
      key: "review",
      label: "Review",
      short: "rev",
    })
  })

  it("recommends sync after use when OpenCode artifact refresh needs another pass", async () => {
    const result = await runCli(["use", "review", "--host", "opencode"], createCliDeps({
      buildArtifacts: (config: any) => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".opencode/agents",
            fileName: `spr-${config.defaultRoute}.md`,
            ownerPrefix: "spr-",
            content: config.defaultRoute,
          },
        ],
        commands: [],
      }),
      materializeArtifacts: async () => ({
        exitCode: 2 as const,
        warnings: ["cleanup failed"],
        written: [],
        removed: [],
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(2)
    expect(output.artifactsDiffer).toBe(true)
    expect(output.routeImpact.changedPhases).toContain("writing-plans")
    expect(output.nextAction.command).toBe("oh-my-superagents sync --host opencode")
  })

  it("does not recommend a blind sync retry after use when OpenCode refresh fails hard", async () => {
    const result = await runCli(["use", "review", "--host", "opencode"], createCliDeps({
      materializeArtifacts: async () => ({
        exitCode: 1 as const,
        warnings: ["materialization failed"],
        written: [],
        removed: [],
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(1)
    expect(output.artifactsDiffer).toBe(true)
    expect(output.nextAction).toBeUndefined()
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

  it("rejects disable for direct-mode OpenCode without writing config or cleaning artifacts", async () => {
    const writes: string[] = []
    const removed: string[] = []

    const result = await runCli(["disable", "--host", "opencode"], createDirectCliDeps({
      writeFile: async (filePath: string) => {
        writes.push(filePath)
      },
      unlink: async (filePath: string) => {
        removed.push(filePath)
      },
    }))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Direct workflow is not yet supported for disable --host opencode")
    expect(writes).toEqual([])
    expect(removed).toEqual([])
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
      allowedLanes: [],
      laneSelection: {
        mode: "suggest",
      },
      subagentExecution: {
        mode: "suggest",
        availableLanes: [],
        commandsByLane: {},
      },
      mode: "suggest",
      nonApplyingReason:
        "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
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

  it("does not treat synced OpenCode runtime metadata as missing in status output", async () => {
    const built = buildOpenCodeArtifacts({
      workflow: { kind: "superpowers" },
      profiles: {
        strategy: controlPlaneConfig.presets.default.profiles.strategy,
        build: controlPlaneConfig.presets.default.profiles.build,
      },
      routes: controlPlaneConfig.presets.default.routes,
      defaultRoute: controlPlaneConfig.presets.default.defaultRoute,
      superpowersCompatibility: controlPlaneConfig.settings.superpowersCompatibility,
    } as never, controlPlaneConfig.settings)
    const artifactFiles = Object.fromEntries([
      ...built.agents.map((artifact) => [
        path.join("/workspace/project", artifact.directory, artifact.fileName),
        artifact.content,
      ]),
      ...built.commands.map((artifact) => [
        path.join("/workspace/project", artifact.directory, artifact.fileName),
        artifact.fileName === "runtime-agent-metadata.json"
          ? JSON.stringify({
              agents: {
                "spr-strategy": {
                  profile: "strategy",
                  profiles: ["strategy"],
                  codexFast: false,
                },
                "spr-build": {
                  profile: "build",
                  profiles: ["build"],
                  codexFast: false,
                },
              },
            }, null, 2)
          : artifact.content,
      ]),
    ])

    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      buildArtifacts: buildOpenCodeArtifacts,
      ...createArtifactFs(artifactFiles),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("healthy")
    expect(output.artifactSummary.missing).toEqual([])
    expect(output.artifactSummary.present).toContain(
      "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json",
    )
  })

  it("does not treat invalid OpenCode runtime metadata JSON as owned in status output", async () => {
    const built = buildOpenCodeArtifacts({
      workflow: { kind: "superpowers" },
      profiles: {
        strategy: controlPlaneConfig.presets.default.profiles.strategy,
        build: controlPlaneConfig.presets.default.profiles.build,
      },
      routes: controlPlaneConfig.presets.default.routes,
      defaultRoute: controlPlaneConfig.presets.default.defaultRoute,
      superpowersCompatibility: controlPlaneConfig.settings.superpowersCompatibility,
    } as never, controlPlaneConfig.settings)
    const artifactFiles = Object.fromEntries([
      ...built.agents.map((artifact) => [
        path.join("/workspace/project", artifact.directory, artifact.fileName),
        artifact.content,
      ]),
      ...built.commands.map((artifact) => [
        path.join("/workspace/project", artifact.directory, artifact.fileName),
        artifact.fileName === "runtime-agent-metadata.json"
          ? JSON.stringify({ hello: "user" }, null, 2)
          : artifact.content,
      ]),
    ])

    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      buildArtifacts: buildOpenCodeArtifacts,
      ...createArtifactFs(artifactFiles),
    }))

    const output = JSON.parse(result.stdout)
    const runtimeMetadataPath = "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json"

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("artifacts_out_of_sync")
    expect(output.artifactSummary.missing).toContain(runtimeMetadataPath)
    expect(output.artifactSummary.present).not.toContain(runtimeMetadataPath)
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

  it("omits unsupported use guidance for disabled direct-mode OpenCode status", async () => {
    const result = await runCli(["status", "--host", "opencode"], createDirectCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          ...directControlPlaneConfig,
          settings: {
            ...directControlPlaneConfig.settings,
            enabled: false,
          },
        },
        activePreset: {
          key: "default",
          preset: directControlPlaneConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: "frontend",
          effectiveLane: "frontend",
          presetDefaultLane: "frontend",
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.state.code).toBe("disabled")
    expect(output.nextAction).toBeUndefined()
    expect(output.subagentExecution).toBeUndefined()
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
        rendered: {
          status: ["oms-status", "oms-st"],
          use: ["oms-use", "oms-u"],
          disable: ["oms-off", "oms-o"],
          sync: ["oms-sync", "oms-sy"],
          doctor: ["oms-doctor", "oms-dr"],
        },
      },
      compatibility: compatibleOpencode,
      allowedLanes: [],
      laneSelection: {
        mode: "suggest",
      },
      subagentExecution: {
        mode: "suggest",
        availableLanes: [],
        commandsByLane: {},
      },
      mode: "suggest",
      nonApplyingReason:
        "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
      artifacts: {
        present: [
          "/workspace/project/.opencode/agents/spr-build.md",
          "/workspace/project/.opencode/agents/spr-strategy.md",
        ],
        missing: [],
      },
      artifactSummary: {
        expected: 2,
        present: [
          "/workspace/project/.opencode/agents/spr-build.md",
          "/workspace/project/.opencode/agents/spr-strategy.md",
        ],
        missing: [],
        stale: [],
      },
      routing: {
        defaultRoutedPhases: [
          "writing-plans",
          "subagent-driven-development",
          "requesting-code-review",
          "verification-before-completion",
          "frontend-design",
          "webapp-testing",
        ],
        explicitRoutedPhases: ["brainstorming"],
        unusedProfiles: [],
        reuseRelationship: {
          kind: "none",
          parentPresetKey: null,
          resolvable: true,
        },
      },
      codexFastRuntime: {
        manifestPath: "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json",
        hasEnabledAgents: false,
      },
    })
  })

  it("reports OpenCode codexFast runtime metadata diagnostics in doctor output", async () => {
    const codexFastConfig = {
      ...controlPlaneConfig,
      presets: {
        ...controlPlaneConfig.presets,
        default: {
          ...controlPlaneConfig.presets.default,
          profiles: {
            ...controlPlaneConfig.presets.default.profiles,
            build: {
              ...controlPlaneConfig.presets.default.profiles.build,
              model: "gpt-5.4",
              codexFast: true,
            },
          },
        },
      },
    }

    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: codexFastConfig,
        activePreset: {
          key: "default",
          preset: codexFastConfig.presets.default,
        },
        laneState: defaultLaneState,
      }),
      buildArtifacts: (config: Parameters<typeof buildOpenCodeArtifacts>[0], settings: Parameters<typeof buildOpenCodeArtifacts>[1]) =>
        buildOpenCodeArtifacts(config, settings),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.codexFastRuntime).toEqual({
      manifestPath: "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json",
      hasEnabledAgents: true,
    })
  })

  it("includes lane selection diagnostics in doctor output", async () => {
    const laneAwareControlPlaneConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        defaultLane: "frontend",
        laneSelection: { mode: "suggest" as const },
        subagentExecution: { mode: "suggest" as const },
      },
      profiles: {
        "frontend-strategy": {
          model: "google/gemini-2.5-pro",
          variant: "high",
        },
        build: { model: "openai/gpt-5" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "frontend-strategy" },
          defaultRoute: "build",
        },
        backend: {
          label: "Backend",
          routes: {},
          defaultRoute: "build",
        },
      },
      presets: {
        ...controlPlaneConfig.presets,
        default: {
          ...controlPlaneConfig.presets.default,
          profiles: undefined,
          usesLanes: ["frontend", "backend"],
          defaultLane: "backend",
          routes: {},
          defaultRoute: "build",
        },
      },
    }

    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: laneAwareControlPlaneConfig,
        activePreset: {
          key: "default",
          preset: laneAwareControlPlaneConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend", "backend"],
          defaultLane: "frontend",
          presetDefaultLane: "backend",
          effectiveLane: "frontend",
          mode: "suggest" as const,
          nonApplyingReason: "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
          runtimeLane: undefined,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.allowedLanes).toEqual(["frontend", "backend"])
    expect(output.defaultLane).toBe("frontend")
    expect(output.presetDefaultLane).toBe("backend")
    expect(output.effectiveLane).toBe("frontend")
    expect(output.laneSelection).toEqual({ mode: "suggest" })
    expect(output.subagentExecution).toEqual({
      mode: "suggest",
      availableLanes: ["frontend", "backend"],
      commandsByLane: {
        frontend: "sp-execute-frontend",
        backend: "sp-execute-backend",
      },
    })
    expect(output.nonApplyingReason).toContain("Stage 1")
  })

  it("keeps --lane non-applying in doctor when laneSelection.mode is suggest", async () => {
    const result = await runCli(["doctor", "--host", "opencode", "--lane", "frontend"], createCliDeps({
      resolveControlPlane: async (input: { runtimeLane?: string }) => ({
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
        laneState: {
          allowedLanes: ["frontend", "backend"],
          defaultLane: "backend",
          presetDefaultLane: "backend",
          effectiveLane: "backend",
          runtimeLane: input.runtimeLane,
          mode: "suggest" as const,
          nonApplyingReason: "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.mode).toBe("suggest")
    expect(output.runtimeLane).toBe("frontend")
    expect(output.effectiveLane).toBe("backend")
    expect(output.nonApplyingReason).toContain("Stage 1")
  })

  it("uses --lane as the effective lane for sync when laneSelection.mode is auto", async () => {
    let syncedEffectiveLane: string | undefined

    const result = await runCli(["sync", "--host", "opencode", "--lane", "frontend"], createCliDeps({
      resolveControlPlane: async (input: { runtimeLane?: string }) => ({
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
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: undefined,
          presetDefaultLane: undefined,
          effectiveLane: input.runtimeLane,
          runtimeLane: input.runtimeLane,
          mode: "auto" as const,
        },
      }),
      buildArtifacts: (config: { effectiveLane?: string }) => {
        syncedEffectiveLane = config.effectiveLane
        return { agents: [], commands: [] }
      },
      materializeArtifacts: async () => ({ exitCode: 0 as const, warnings: [], written: [], removed: [] }),
    }))

    expect(result.exitCode).toBe(0)
    expect(syncedEffectiveLane).toBe("frontend")
  })

  it("passes allowed lanes into OpenCode sync artifact generation", async () => {
    let syncedAvailableLanes: string[] | undefined

    const result = await runCli(["sync", "--host", "opencode"], createCliDeps({
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
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: "frontend",
          presetDefaultLane: "backend",
          effectiveLane: "frontend",
          runtimeLane: undefined,
          mode: "suggest" as const,
          nonApplyingReason: "Lane suggestions do not change routing in Stage 1.",
        },
      }),
      buildArtifacts: (config: { availableLanes?: string[] }) => {
        syncedAvailableLanes = config.availableLanes
        return { agents: [], commands: [] }
      },
      materializeArtifacts: async () => ({ exitCode: 0 as const, warnings: [], written: [], removed: [] }),
    }))

    expect(result.exitCode).toBe(0)
    expect(syncedAvailableLanes).toEqual(["frontend"])
  })

  it("summarizes expected, present, missing, and stale OpenCode artifacts in doctor output", async () => {
    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderOwnedMarkdownArtifact("spr-build"),
        "/workspace/project/.opencode/commands/oms-legacy.md": renderOwnedMarkdownArtifact("oms-legacy"),
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
        ],
        commands: [
          {
            kind: "command" as const,
            directory: ".opencode/commands",
            fileName: "oms-sync.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      artifactExists: async (filePath: string) => !filePath.endsWith("oms-sync.md"),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.artifactSummary.expected).toBeGreaterThan(0)
    expect(output.artifactSummary.present).toContain(
      "/workspace/project/.opencode/agents/spr-build.md",
    )
    expect(output.artifactSummary.missing).toContain(
      "/workspace/project/.opencode/commands/oms-sync.md",
    )
    expect(output.artifactSummary.stale).toContain(
      "/workspace/project/.opencode/commands/oms-legacy.md",
    )
  })

  it("reports lightweight routing validation details in OpenCode doctor output", async () => {
    const routedConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        activePreset: "child",
      },
      presets: {
        ...controlPlaneConfig.presets,
        child: {
          ...controlPlaneConfig.presets.default,
          label: "Child",
          short: "child",
          extends: "default",
          profiles: {
            ...controlPlaneConfig.presets.default.profiles,
            unused: {
              model: "google/gemini-2.5-pro",
            },
          },
        },
      },
    }

    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: routedConfig,
        activePreset: {
          key: "child",
          preset: routedConfig.presets.child,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.routing.defaultRoutedPhases).toContain("requesting-code-review")
    expect(output.routing.explicitRoutedPhases).toEqual(["brainstorming"])
    expect(output.routing.unusedProfiles).toEqual(["unused"])
    expect(output.routing.reuseRelationship).toEqual({
      kind: "extends",
      parentPresetKey: "default",
      resolvable: true,
    })
  })

  it("reports intent-based routing details in direct-mode OpenCode doctor output", async () => {
    const routedConfig = {
      ...directControlPlaneConfig,
      profiles: {
        ...directControlPlaneConfig.profiles,
        unused: { model: "google/gemini-2.5-pro" },
      },
      workflow: {
        kind: "direct" as const,
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      presets: {
        default: {
          ...directControlPlaneConfig.presets.default,
          routes: { plan: "planner" },
          defaultRoute: "builder",
        },
      },
    }

    const result = await runCli(["doctor", "--host", "opencode"], createDirectCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: routedConfig,
        activePreset: {
          key: "default",
          preset: routedConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: "frontend",
          effectiveLane: "frontend",
          presetDefaultLane: "frontend",
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.routing.explicitRoutedPhases).toEqual(["plan"])
    expect(output.routing.defaultRoutedPhases).toEqual(["build"])
    expect(output.routing.defaultRoutedPhases).not.toContain("brainstorming")
    expect(output.routing.unusedProfiles).toEqual(["unused"])
    expect(output.subagentExecution).toBeUndefined()
  })

  it("counts lane-only profiles as used in OpenCode doctor output", async () => {
    const routedConfig = {
      ...controlPlaneConfig,
      profiles: {
        build: { model: "openai/gpt-5" },
        "lane-strategy": { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
        unused: { model: "google/gemini-2.5-pro" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "lane-strategy" },
          defaultRoute: "lane-strategy",
        },
      },
      presets: {
        default: {
          ...controlPlaneConfig.presets.default,
          profiles: undefined,
          usesLanes: ["frontend"],
          defaultLane: "frontend",
          routes: {},
          defaultRoute: "build",
        },
      },
    }

    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: routedConfig,
        activePreset: {
          key: "default",
          preset: routedConfig.presets.default,
        },
        laneState: {
          allowedLanes: ["frontend"],
          defaultLane: undefined,
          presetDefaultLane: "frontend",
          effectiveLane: "frontend",
          mode: "suggest" as const,
          nonApplyingReason: "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
          runtimeLane: undefined,
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.routing.unusedProfiles).toEqual(["unused"])
  })

  it("treats inherited routes as default-routed in the child doctor view when the child has no local override", async () => {
    const localChildPreset = {
      ...controlPlaneConfig.presets.default,
      label: "Child",
      short: "child",
      extends: "default",
      routes: {},
    }
    const resolvedChildPreset = {
      ...localChildPreset,
      routes: {
        brainstorming: "strategy",
      },
    }
    const routedConfig = {
      ...controlPlaneConfig,
      settings: {
        ...controlPlaneConfig.settings,
        activePreset: "child",
      },
      presets: {
        ...controlPlaneConfig.presets,
        child: resolvedChildPreset,
      },
    }

    const result = await runCli(["doctor", "--host", "opencode"], createCliDeps({
      resolveControlPlane: async () => ({
        source: {
          kind: "file" as const,
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: routedConfig,
        activePreset: {
          key: "child",
          preset: resolvedChildPreset,
        },
        trace: {
          activePresetDefinition: {
            path: "/workspace/project/oh-my-superagents.config.jsonc",
            preset: localChildPreset,
          },
          parentPresetDefinition: {
            path: "/workspace/project/oh-my-superagents.config.jsonc",
            preset: controlPlaneConfig.presets.default,
          },
        },
      }),
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.routing.explicitRoutedPhases).toEqual([])
    expect(output.routing.defaultRoutedPhases).toContain("brainstorming")
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

  it("does not report artifact drift from a discovery warning alone when expected OpenCode files still exist", async () => {
    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      ...createArtifactFs({
        "/workspace/project/.opencode/agents/spr-build.md": renderOwnedMarkdownArtifact("spr-build"),
        "/workspace/project/.opencode/commands/oms-sync.md": renderOwnedMarkdownArtifact("oms-sync"),
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
        ],
        commands: [
          {
            kind: "command" as const,
            directory: ".opencode/commands",
            fileName: "oms-sync.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      readdir: async (directory: string) => {
        if (directory === "/workspace/project/.opencode/commands") {
          throw new Error("EACCES: cannot scan commands")
        }

        return defaultArtifactFs.readdir(directory)
      },
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.artifacts.discoveryWarnings).toEqual([
      expect.stringContaining(".opencode/commands"),
    ])
    expect(output.artifactSummary.missing).toEqual([])
    expect(output.state.code).toBe("healthy")
  })

  it("does not report artifact drift from a per-file inspection warning when an expected OpenCode file still exists", async () => {
    const artifactFs = createArtifactFs({
      "/workspace/project/.opencode/agents/spr-build.md": renderOwnedMarkdownArtifact("spr-build"),
      "/workspace/project/.opencode/commands/oms-sync.md": renderOwnedMarkdownArtifact("oms-sync"),
    })

    const result = await runCli(["status", "--host", "opencode"], createCliDeps({
      ...artifactFs,
      buildArtifacts: () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".opencode/agents",
            fileName: "spr-build.md",
            ownerPrefix: "spr-",
            content: "",
          },
        ],
        commands: [
          {
            kind: "command" as const,
            directory: ".opencode/commands",
            fileName: "oms-sync.md",
            ownerPrefix: "oms-",
            content: "",
          },
        ],
      }),
      artifactStat: async (filePath: string) => {
        if (filePath === "/workspace/project/.opencode/commands/oms-sync.md") {
          throw new Error("EACCES: cannot inspect command file")
        }

        return artifactFs.artifactStat(filePath)
      },
    }))

    const output = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.artifacts.discoveryWarnings).toEqual([
      expect.stringContaining("oms-sync.md"),
    ])
    expect(output.artifactSummary.missing).toEqual([])
    expect(output.state.code).toBe("healthy")
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

  it("uses direct-mode expected artifacts in qwen status", async () => {
    const inspectedPaths: string[] = []

    const result = await runCli(["status", "--host", "qwen"], createDirectCliDeps({
      buildQwenArtifacts,
      artifactExists: async (filePath: string) => {
        inspectedPaths.push(filePath)
        return (
          filePath === "/workspace/project/.qwen/agents/rt-plan.md"
          || filePath === "/workspace/project/.qwen/commands/ai-plan.md"
          || filePath === "/workspace/project/.qwen/commands/oms-status.md"
        )
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.host).toBe("qwen")
    expect(inspectedPaths).toEqual(expect.arrayContaining([
      "/workspace/project/.qwen/agents/rt-plan.md",
      "/workspace/project/.qwen/commands/ai-plan.md",
    ]))
    expect(inspectedPaths).not.toContain("/workspace/project/.qwen/agents/oms-review.md")
  })

  it("uses direct-mode expected artifacts in qwen doctor", async () => {
    const inspectedPaths: string[] = []

    const result = await runCli(["doctor", "--host", "qwen"], createDirectCliDeps({
      buildQwenArtifacts,
      artifactExists: async (filePath: string) => {
        inspectedPaths.push(filePath)
        return (
          filePath === "/workspace/project/.qwen/agents/rt-plan.md"
          || filePath === "/workspace/project/.qwen/commands/ai-plan.md"
          || filePath === "/workspace/project/.qwen/commands/oms-doctor.md"
        )
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(parsed.host).toBe("qwen")
    expect(inspectedPaths).toEqual(expect.arrayContaining([
      "/workspace/project/.qwen/agents/rt-plan.md",
      "/workspace/project/.qwen/commands/ai-plan.md",
    ]))
    expect(inspectedPaths).not.toContain("/workspace/project/.qwen/agents/oms-review.md")
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

  it("syncs direct workflow artifacts for Qwen without requiring upstream skills", async () => {
    let materializeCalled = false

    const result = await runCli(["sync", "--host", "qwen"], createDirectCliDeps({
      evaluateSuperpowersCompatibility: () => incompatibleOpencodeStrict,
      buildQwenArtifacts: async () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".qwen/agents",
            fileName: "rt-plan.md",
            ownerPrefix: "rt-",
            content: "",
          },
        ],
        commands: [
          {
            kind: "command" as const,
            directory: ".qwen/commands",
            fileName: "ai-plan.md",
            ownerPrefix: "ai-",
            content: "",
          },
        ],
      }),
      materializeArtifacts: async ({ artifacts }: { artifacts: Array<{ directory: string; fileName: string }> }) => {
        materializeCalled = true

        return {
          exitCode: 0 as const,
          warnings: [],
          written: artifacts.map((artifact) => path.join("/workspace/project", artifact.directory, artifact.fileName)),
          removed: [],
        }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(materializeCalled).toBe(true)
    expect(parsed.compatibility).toBeNull()
    expect(parsed.written).toEqual([
      "/workspace/project/.qwen/agents/rt-plan.md",
      "/workspace/project/.qwen/commands/ai-plan.md",
    ])
  })

  it("inspects direct-mode Codex bootstrap skills in status and doctor", async () => {
    const inspectedPaths: string[] = []

    const deps = createDirectCliDeps({
      buildCodexArtifacts: () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".codex/agents",
            fileName: "rt-plan.toml",
            ownerPrefix: "rt-",
            content: 'name = "rt-plan"',
          },
        ],
      }),
      artifactExists: async (filePath: string) => {
        inspectedPaths.push(filePath)
        return (
          filePath === "/workspace/project/.codex/agents/rt-plan.toml"
          || filePath === "/workspace/project/.agents/plugins/marketplace.json"
          || filePath === "/workspace/project/plugins/oh-my-superagents-codex/.codex-plugin/plugin.json"
          || filePath === "/workspace/project/plugins/oh-my-superagents-codex/skills/ai-plan/SKILL.md"
        )
      },
    })

    const status = await runCli(["status", "--host", "codex"], deps)
    const doctor = await runCli(["doctor", "--host", "codex"], deps)

    expect(status.exitCode).toBe(0)
    expect(doctor.exitCode).toBe(0)
    expect(inspectedPaths).toEqual(expect.arrayContaining([
      "/workspace/project/.codex/agents/rt-plan.toml",
      "/workspace/project/plugins/oh-my-superagents-codex/skills/ai-plan/SKILL.md",
    ]))
  })

  it("materializes direct-mode Codex bootstrap skills during sync", async () => {
    let materializedPaths: string[] = []

    const result = await runCli(["sync", "--host", "codex"], createDirectCliDeps({
      buildCodexArtifacts: () => ({
        agents: [
          {
            kind: "agent" as const,
            directory: ".codex/agents",
            fileName: "rt-plan.toml",
            ownerPrefix: "rt-",
            content: 'name = "rt-plan"',
          },
        ],
      }),
      materializeArtifacts: async ({ artifacts }: { artifacts: Array<{ directory: string; fileName: string }> }) => {
        materializedPaths = artifacts.map((artifact) => `${artifact.directory}/${artifact.fileName}`)
        return {
          exitCode: 0 as const,
          warnings: [],
          written: artifacts.map((artifact) => path.join("/workspace/project", artifact.directory, artifact.fileName)),
          removed: [],
        }
      },
    }))

    const parsed = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(materializedPaths).toEqual(expect.arrayContaining([
      ".codex/agents/rt-plan.toml",
      "plugins/oh-my-superagents-codex/skills/ai-plan/SKILL.md",
    ]))
    expect(parsed.written).toEqual(expect.arrayContaining([
      "/workspace/project/.codex/agents/rt-plan.toml",
      "/workspace/project/plugins/oh-my-superagents-codex/skills/ai-plan/SKILL.md",
    ]))
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
    expect(parsed.routeImpact).toBeUndefined()
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
