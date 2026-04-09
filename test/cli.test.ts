import { describe, expect, it } from "vitest"
import { runCli } from "../src/cli.js"

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

function createCliDeps(overrides: Record<string, unknown> = {}) {
  return {
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
    buildArtifacts: () => ({ agents: [], commands: [] }),
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
})
