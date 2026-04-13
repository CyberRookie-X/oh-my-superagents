import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  SuperpowersCompatibilityResult,
  SuperpowersDetectionResult,
} from "../src/superpowers-compatibility.js"

const mocks = vi.hoisted(() => ({
  loadRouterConfig: vi.fn(),
  detectOpenCodeSuperpowers: vi.fn(),
  evaluateSuperpowersCompatibility: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock("../src/config.js", () => ({
  loadRouterConfig: mocks.loadRouterConfig,
}))

vi.mock("../src/superpowers-detectors.js", () => ({
  detectOpenCodeSuperpowers: mocks.detectOpenCodeSuperpowers,
}))

vi.mock("../src/superpowers-compatibility.js", async () => {
  const actual = await vi.importActual<typeof import("../src/superpowers-compatibility.js")>(
    "../src/superpowers-compatibility.js",
  )

  return {
    ...actual,
    evaluateSuperpowersCompatibility: mocks.evaluateSuperpowersCompatibility,
  }
})

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}))

import { OhMySuperpowersPlugin } from "../src/plugin.js"

function createDefaultConfig() {
  return {
    path: "/workspace/project/oh-my-superagents.config.jsonc",
    config: {
      profiles: {
        default: {
          model: "gpt-5.4",
        },
      },
      routes: {
        brainstorming: "default",
      },
      superpowersCompatibility: {
        mode: "warn" as const,
      },
    },
  }
}

function createDetectionResult(
  overrides: Partial<SuperpowersDetectionResult> = {},
): SuperpowersDetectionResult {
  return {
    host: "opencode",
    source: "opencode-project-config",
    detectedVersion: null,
    detectedRef: null,
    ...overrides,
  }
}

function createCompatibilityResult(
  overrides: Partial<SuperpowersCompatibilityResult> = {},
): SuperpowersCompatibilityResult {
  return {
    host: "opencode",
    source: "opencode-project-config",
    detectedVersion: null,
    detectedRef: null,
    status: "compatible",
    reason: "Version is within a tested range.",
    policyMode: "warn",
    shouldBlock: false,
    ...overrides,
  }
}

function createPluginInput(
  logs: unknown[],
  overrides: Partial<{ directory: string; worktree: string }> = {},
) {
  return {
    directory: "/workspace/project",
    worktree: "/workspace/project",
    client: {
      app: {
        log: async (entry: unknown) => {
          logs.push(entry)
        },
      },
    },
    ...overrides,
  } as never
}

function createPendingPromise() {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve: resolve ?? (() => {}) }
}

async function getResolutionState(promise: Promise<unknown>, timeoutMs = 50) {
  return Promise.race([
    promise.then(() => "resolved" as const),
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), timeoutMs)
    }),
  ])
}

async function waitForLogMessage(logs: unknown[], text: string) {
  await vi.waitFor(() => {
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            message: expect.stringContaining(text),
          }),
        }),
      ]),
    )
  })
}

async function waitForBackgroundWork() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function expectPluginHooks() {
  return expect.objectContaining({
    "chat.params": expect.any(Function),
  })
}

describe("OhMySuperpowersPlugin", () => {
  beforeEach(() => {
    mocks.loadRouterConfig.mockReset()
    mocks.detectOpenCodeSuperpowers.mockReset()
    mocks.evaluateSuperpowersCompatibility.mockReset()
    mocks.readFile.mockReset()

    mocks.loadRouterConfig.mockResolvedValue(createDefaultConfig())
    mocks.detectOpenCodeSuperpowers.mockResolvedValue(createDetectionResult())
    mocks.evaluateSuperpowersCompatibility.mockReturnValue(createCompatibilityResult())
    mocks.readFile.mockResolvedValue('{"agents":{}}')
  })

  it("patches chat params when the current OpenCode agent has codexFast enabled", async () => {
    mocks.readFile.mockResolvedValueOnce(
      JSON.stringify({
        agents: {
          "spr-build": {
            profile: "build",
            profiles: ["build"],
            codexFast: true,
          },
        },
      }),
    )

    const hooks = await OhMySuperpowersPlugin(createPluginInput([]))
    const output = {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    }

    await hooks["chat.params"]?.(
      {
        sessionID: "s1",
        agent: "spr-build",
        model: {} as never,
        provider: { source: "config", info: {} as never, options: {} },
        message: {} as never,
      },
      output,
    )

    expect(output.options.serviceTier).toBe("fast")
  })

  it("patches chat params from worktree-root runtime metadata when the session directory is a subdirectory", async () => {
    mocks.readFile.mockImplementation(async (filePath: string) => {
      expect(filePath).toBe("/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json")

      return JSON.stringify({
        agents: {
          "spr-build": {
            profile: "build",
            profiles: ["build"],
            codexFast: true,
          },
        },
      })
    })

    const hooks = await OhMySuperpowersPlugin(createPluginInput([], {
      directory: "/workspace/project/packages/app",
      worktree: "/workspace/project",
    }))
    const output = {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    }

    await hooks["chat.params"]?.(
      {
        sessionID: "s1",
        agent: "spr-build",
        model: {} as never,
        provider: { source: "config", info: {} as never, options: {} },
        message: {} as never,
      },
      output,
    )

    expect(output.options.serviceTier).toBe("fast")
  })

  it("prefers package-local config and runtime metadata in a nested session", async () => {
    const logs: unknown[] = []

    mocks.loadRouterConfig.mockImplementation(async ({ cwd }: { cwd: string }) => {
      expect(cwd).toBe("/workspace/project/packages/app")
      return {
        path: "/workspace/project/packages/app/oh-my-superagents.config.jsonc",
        config: createDefaultConfig().config,
      }
    })
    mocks.detectOpenCodeSuperpowers.mockImplementation(async ({ cwd }: { cwd: string }) => {
      expect(cwd).toBe("/workspace/project/packages/app")
      return createDetectionResult()
    })
    mocks.readFile.mockImplementation(async (filePath: string) => {
      if (filePath === "/workspace/project/packages/app/oh-my-superagents.config.jsonc") {
        return JSON.stringify({ local: true })
      }

      if (filePath === "/workspace/project/packages/app/.opencode/oh-my-superagents/runtime-agent-metadata.json") {
        return JSON.stringify({
          agents: {
            "spr-build": {
              profile: "build",
              profiles: ["build"],
              codexFast: true,
            },
          },
        })
      }

      throw new Error(`unexpected read: ${filePath}`)
    })

    const hooks = await OhMySuperpowersPlugin(createPluginInput(logs, {
      directory: "/workspace/project/packages/app",
      worktree: "/workspace/project",
    }))
    await waitForBackgroundWork()

    const output = {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    }

    await hooks["chat.params"]?.(
      {
        sessionID: "s1",
        agent: "spr-build",
        model: {} as never,
        provider: { source: "config", info: {} as never, options: {} },
        message: {} as never,
      },
      output,
    )

    expect(output.options.serviceTier).toBe("fast")
  })

  it("falls back to worktree-root config and runtime metadata when the subdirectory has neither", async () => {
    mocks.loadRouterConfig.mockImplementation(async ({ cwd }: { cwd: string }) => {
      expect(cwd).toBe("/workspace/project")
      return createDefaultConfig()
    })
    mocks.detectOpenCodeSuperpowers.mockImplementation(async ({ cwd }: { cwd: string }) => {
      expect(cwd).toBe("/workspace/project")
      return createDetectionResult()
    })
    mocks.readFile.mockImplementation(async (filePath: string) => {
      if (filePath === "/workspace/project/packages/app/oh-my-superagents.config.jsonc") {
        throw new Error("missing local config")
      }

      if (filePath === "/workspace/project/packages/app/.opencode/oh-my-superagents/runtime-agent-metadata.json") {
        throw new Error("missing local metadata")
      }

      if (filePath === "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json") {
        return JSON.stringify({
          agents: {
            "spr-build": {
              profile: "build",
              profiles: ["build"],
              codexFast: true,
            },
          },
        })
      }

      throw new Error(`unexpected read: ${filePath}`)
    })

    const hooks = await OhMySuperpowersPlugin(createPluginInput([], {
      directory: "/workspace/project/packages/app",
      worktree: "/workspace/project",
    }))
    await waitForBackgroundWork()

    const output = {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    }

    await hooks["chat.params"]?.(
      {
        sessionID: "s1",
        agent: "spr-build",
        model: {} as never,
        provider: { source: "config", info: {} as never, options: {} },
        message: {} as never,
      },
      output,
    )

    expect(output.options.serviceTier).toBe("fast")
  })

  it("does not let metadata-only local files shadow a valid worktree-root config", async () => {
    mocks.loadRouterConfig.mockImplementation(async ({ cwd }: { cwd: string }) => {
      expect(cwd).toBe("/workspace/project")
      return createDefaultConfig()
    })
    mocks.detectOpenCodeSuperpowers.mockImplementation(async ({ cwd }: { cwd: string }) => {
      expect(cwd).toBe("/workspace/project")
      return createDetectionResult()
    })
    mocks.readFile.mockImplementation(async (filePath: string) => {
      if (filePath === "/workspace/project/packages/app/oh-my-superagents.config.jsonc") {
        throw new Error("missing local config")
      }

      if (filePath === "/workspace/project/packages/app/.opencode/oh-my-superagents/runtime-agent-metadata.json") {
        return JSON.stringify({
          agents: {
            "spr-build": {
              profile: "build",
              profiles: ["build"],
              codexFast: false,
            },
          },
        })
      }

      if (filePath === "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json") {
        return JSON.stringify({
          agents: {
            "spr-build": {
              profile: "build",
              profiles: ["build"],
              codexFast: true,
            },
          },
        })
      }

      throw new Error(`unexpected read: ${filePath}`)
    })

    const hooks = await OhMySuperpowersPlugin(createPluginInput([], {
      directory: "/workspace/project/packages/app",
      worktree: "/workspace/project",
    }))
    await waitForBackgroundWork()

    const output = {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    }

    await hooks["chat.params"]?.(
      {
        sessionID: "s1",
        agent: "spr-build",
        model: {} as never,
        provider: { source: "config", info: {} as never, options: {} },
        message: {} as never,
      },
      output,
    )

    expect(output.options.serviceTier).toBe("fast")
  })

  it("does not patch chat params when the current agent is not codexFast-enabled", async () => {
    mocks.readFile.mockResolvedValueOnce(
      JSON.stringify({
        agents: {
          "spr-build": {
            profile: "build",
            profiles: ["build"],
            codexFast: false,
          },
        },
      }),
    )

    const hooks = await OhMySuperpowersPlugin(createPluginInput([]))
    const output = {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxOutputTokens: undefined,
      options: {},
    }

    await hooks["chat.params"]?.(
      {
        sessionID: "s1",
        agent: "spr-build",
        model: {} as never,
        provider: { source: "config", info: {} as never, options: {} },
        message: {} as never,
      },
      output,
    )

    expect(output.options.serviceTier).toBeUndefined()
  })

  it("logs explicit first-run guidance when config is missing", async () => {
    const logs: unknown[] = []

    mocks.loadRouterConfig.mockRejectedValueOnce(
      new Error("Could not find oh-my-superagents.config.jsonc"),
    )
    mocks.evaluateSuperpowersCompatibility.mockReturnValueOnce(
      createCompatibilityResult({
        status: "not_detected",
        reason: "Could not detect a parseable superpowers version.",
      }),
    )

    await OhMySuperpowersPlugin(createPluginInput(logs))
    await waitForBackgroundWork()

    expect(JSON.stringify(logs)).toContain("Current state: missing_config")
    expect(JSON.stringify(logs)).toContain("Next step: oh-my-superagents sync --host opencode")
    expect(JSON.stringify(logs)).not.toContain("Current state: upstream_not_detected")
    expect(JSON.stringify(logs)).not.toContain("Next step: oh-my-superagents doctor --host opencode")
    expect(logs).toHaveLength(1)
  })

  it.each([
    {
      name: "info",
      setup: () => {
        mocks.loadRouterConfig.mockResolvedValueOnce(createDefaultConfig())
      },
    },
    {
      name: "warn",
      setup: () => {
        mocks.loadRouterConfig.mockRejectedValueOnce(
          new Error("Could not find oh-my-superagents.config.jsonc"),
        )
      },
    },
    {
      name: "error",
      setup: () => {
        mocks.loadRouterConfig.mockRejectedValueOnce(new Error("config exploded"))
      },
    },
  ])("does not block startup on initial router-config $name logging", async ({ setup }) => {
    const logs: unknown[] = []
    const pendingLog = createPendingPromise()

    setup()

    const pluginPromise = OhMySuperpowersPlugin({
      directory: "/workspace/project",
      client: {
        app: {
          log: async (entry: unknown) => {
            logs.push(entry)
            return pendingLog.promise
          },
        },
      },
    } as never)

    expect(await getResolutionState(pluginPromise)).toBe("resolved")
    expect(logs).not.toHaveLength(0)

    pendingLog.resolve()
    await pluginPromise
  })

  it("logs a warning when the upstream superpowers version is not detected and continues", async () => {
    const logs: unknown[] = []

    mocks.evaluateSuperpowersCompatibility.mockReturnValueOnce(
      createCompatibilityResult({
        status: "not_detected",
        reason: "Could not detect a parseable superpowers version.",
      }),
    )

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual(expectPluginHooks())
    await waitForLogMessage(logs, "Could not detect")

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            level: "warn",
            message: expect.stringContaining("Could not detect"),
          }),
        }),
      ]),
    )
  })

  it("logs targeted guidance when upstream is incompatible", async () => {
    const logs: unknown[] = []

    mocks.detectOpenCodeSuperpowers.mockResolvedValueOnce(
      createDetectionResult({
        detectedVersion: "4.9.0",
      }),
    )
    mocks.evaluateSuperpowersCompatibility.mockReturnValueOnce(
      createCompatibilityResult({
        detectedVersion: "4.9.0",
        status: "incompatible",
        reason: "Version is below minimum supported version 5.0.0.",
      }),
    )

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual(expectPluginHooks())
    await waitForLogMessage(logs, "Current state: upstream_incompatible")

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            level: "error",
            message: expect.stringContaining("Current state: upstream_incompatible"),
          }),
        }),
      ]),
    )
    expect(JSON.stringify(logs)).toContain("Next step: oh-my-superagents doctor --host opencode")
  })

  it("degrades detector exceptions to not_detected, logs the detector issue, and continues", async () => {
    const logs: unknown[] = []

    mocks.detectOpenCodeSuperpowers.mockRejectedValueOnce(new Error("detector exploded"))

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual(expectPluginHooks())
    await waitForLogMessage(logs, "detector")
    await waitForLogMessage(logs, "detector exploded")
    await waitForLogMessage(logs, "not_detected")

    expect(mocks.evaluateSuperpowersCompatibility).not.toHaveBeenCalled()
  })

  it("awaits compatibility log writes inside the background task without blocking startup", async () => {
    const logs: Array<{ body?: { message?: string } }> = []
    const pendingDetectorLog = createPendingPromise()

    mocks.detectOpenCodeSuperpowers.mockRejectedValueOnce(new Error("detector exploded"))

    const pluginPromise = OhMySuperpowersPlugin({
      directory: "/workspace/project",
      client: {
        app: {
          log: async (entry: { body?: { message?: string } }) => {
            logs.push(entry)
            if (entry.body?.message?.includes("detector failed")) {
              return pendingDetectorLog.promise
            }
          },
        },
      },
    } as never)

    await expect(pluginPromise).resolves.toEqual(expectPluginHooks())
    await waitForLogMessage(logs, "detector failed")

    expect(
      logs.some((entry) =>
        entry.body?.message?.startsWith("Superpowers compatibility is not_detected."),
      ),
    ).toBe(false)

    pendingDetectorLog.resolve()
    await waitForLogMessage(logs, "not_detected")
  })

  it("degrades evaluator exceptions to not_detected, logs the evaluator issue, and continues", async () => {
    const logs: unknown[] = []

    mocks.evaluateSuperpowersCompatibility.mockImplementationOnce(() => {
      throw new Error("evaluator exploded")
    })

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual(expectPluginHooks())
    await waitForLogMessage(logs, "evaluator")
    await waitForLogMessage(logs, "evaluator exploded")
    await waitForLogMessage(logs, "not_detected")
  })

  it("does not block startup on compatibility detection", async () => {
    const logs: unknown[] = []

    let resolveDetection: ((value: SuperpowersDetectionResult) => void) | undefined
    mocks.detectOpenCodeSuperpowers.mockReturnValueOnce(
      new Promise<SuperpowersDetectionResult>((resolve) => {
        resolveDetection = resolve
      }),
    )

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual(expectPluginHooks())

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            message: "router config loaded",
          }),
        }),
      ]),
    )
    expect(mocks.evaluateSuperpowersCompatibility).not.toHaveBeenCalled()

    resolveDetection?.(createDetectionResult())
  })
})
