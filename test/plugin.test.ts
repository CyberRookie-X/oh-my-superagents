import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  SuperpowersCompatibilityResult,
  SuperpowersDetectionResult,
} from "../src/superpowers-compatibility.js"

const mocks = vi.hoisted(() => ({
  loadRouterConfig: vi.fn(),
  detectOpenCodeSuperpowers: vi.fn(),
  evaluateSuperpowersCompatibility: vi.fn(),
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

function createPluginInput(logs: unknown[]) {
  return {
    directory: "/workspace/project",
    client: {
      app: {
        log: async (entry: unknown) => {
          logs.push(entry)
        },
      },
    },
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

describe("OhMySuperpowersPlugin", () => {
  beforeEach(() => {
    mocks.loadRouterConfig.mockReset()
    mocks.detectOpenCodeSuperpowers.mockReset()
    mocks.evaluateSuperpowersCompatibility.mockReset()

    mocks.loadRouterConfig.mockResolvedValue(createDefaultConfig())
    mocks.detectOpenCodeSuperpowers.mockResolvedValue(createDetectionResult())
    mocks.evaluateSuperpowersCompatibility.mockReturnValue(createCompatibilityResult())
  })

  it("logs the recommended sync command when config is missing", async () => {
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

    expect(JSON.stringify(logs)).toContain("oh-my-superagents sync --host opencode")
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

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual({})
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

  it("logs an error when the upstream superpowers version is incompatible and continues", async () => {
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

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual({})
    await waitForLogMessage(logs, "Incompatible")

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            level: "error",
            message: expect.stringContaining("4.9.0"),
          }),
        }),
      ]),
    )
  })

  it("degrades detector exceptions to not_detected, logs the detector issue, and continues", async () => {
    const logs: unknown[] = []

    mocks.detectOpenCodeSuperpowers.mockRejectedValueOnce(new Error("detector exploded"))

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual({})
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

    await expect(pluginPromise).resolves.toEqual({})
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

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual({})
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

    await expect(OhMySuperpowersPlugin(createPluginInput(logs))).resolves.toEqual({})

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
