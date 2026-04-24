import { existsSync } from "node:fs"
import { writeFile, mkdir, readFile } from "node:fs/promises"
import { afterEach, describe, expect, it } from "vitest"
import { createTestProject, type IntegrationTestContext } from "./setup.js"
import { defaultDeps } from "../../src/cli/types.js"
import { handleBootstrap } from "../../src/cli/bootstrap.js"
import { handleSync } from "../../src/cli/sync.js"
import { buildControlPlaneStatus } from "../../src/cli/status.js"
import { buildControlPlaneDoctor } from "../../src/cli/doctor.js"

const compatibleCodexWarn = {
  host: "codex" as const,
  source: "test-detector",
  detectedVersion: "5.1.0",
  detectedRef: null,
  status: "compatible" as const,
  reason: "Version is within a tested range.",
  policyMode: "warn" as const,
  shouldBlock: false,
}

describe("bootstrap integration flow", () => {
  let ctx: IntegrationTestContext

  afterEach(() => {
    ctx?.cleanup()
  })

  it("bootstraps a fresh project and syncs artifacts", async () => {
    ctx = createTestProject()
    const { cwd } = ctx

    await mkdir(cwd, { recursive: true })

    const deps = {
      ...defaultDeps,
      getCwd: () => cwd,
      detectCodexSuperpowers: async () => compatibleCodexWarn,
      evaluateSuperpowersCompatibility: async () => compatibleCodexWarn,
    }

    const bootstrapResult = await handleBootstrap(cwd, undefined, deps)

    expect(bootstrapResult.exitCode).toBe(0)

    const bootstrapPayload = JSON.parse(bootstrapResult.stdout) as Record<string, unknown>
    expect(bootstrapPayload.configPath).toBeTruthy()
    expect(Array.isArray(bootstrapPayload.bootstrapFiles)).toBe(true)
    expect(bootstrapPayload.createdConfig).toBe(true)
    expect(bootstrapPayload.syncResult).toBeTruthy()

    const configPath = bootstrapPayload.configPath as string
    expect(existsSync(configPath)).toBe(true)

    for (const bootstrapFile of (bootstrapPayload.bootstrapFiles as string[])) {
      expect(existsSync(bootstrapFile)).toBe(true)
    }

    const syncResult = await handleSync(cwd, undefined, "codex", undefined, deps)

    if (syncResult.exitCode !== 0) {
      console.error("SYNC STDERR:", syncResult.stderr)
      console.error("SYNC STDOUT:", syncResult.stdout)
    }
    expect(syncResult.exitCode).toBe(0)
    const syncPayload = JSON.parse(syncResult.stdout) as Record<string, unknown>
    expect(Array.isArray(syncPayload.written)).toBe(true)
    expect(syncPayload.exitCode).toBe(0)

    const statusPayload = await buildControlPlaneStatus(
      cwd,
      undefined,
      "codex",
      undefined,
      {},
      deps,
    )

    expect(statusPayload.enabled).toBe(true)
    expect(statusPayload.activePreset.key).toBeTruthy()
    expect(statusPayload.host).toBe("codex")
    expect(statusPayload.source).toBeTruthy()

    const doctorPayload = await buildControlPlaneDoctor(
      cwd,
      undefined,
      "codex",
      undefined,
      {},
      deps,
    )

    expect(doctorPayload.activePreset.key).toBeTruthy()
    expect(doctorPayload.host).toBe("codex")
    expect(doctorPayload.source).toBeTruthy()
  })

  it("bootstraps with explicit config path", async () => {
    ctx = createTestProject()
    const { cwd } = ctx

    await mkdir(cwd, { recursive: true })

    const explicitConfigContent = JSON.stringify(
      {
        workflow: { kind: "superpowers" },
        presets: {
          default: {
            label: "Default",
            short: "def",
            profiles: { build: { model: "openai/gpt-5", effort: "balanced" } },
            routes: {},
            defaultRoute: "build",
          },
        },
      },
      null,
      2,
    )

    await writeFile(`${cwd}/custom.config.jsonc`, explicitConfigContent)

    const deps = {
      ...defaultDeps,
      getCwd: () => cwd,
      detectCodexSuperpowers: async () => compatibleCodexWarn,
      evaluateSuperpowersCompatibility: async () => compatibleCodexWarn,
    }

    const bootstrapResult = await handleBootstrap(cwd, "custom.config.jsonc", deps)

    expect(bootstrapResult.exitCode).toBe(0)
    const bootstrapPayload = JSON.parse(bootstrapResult.stdout) as Record<string, unknown>
    expect(bootstrapPayload.configPath).toBe(`${cwd}/custom.config.jsonc`)
    expect(bootstrapPayload.createdConfig).toBe(false)

    const statusPayload = await buildControlPlaneStatus(
      cwd,
      "custom.config.jsonc",
      "codex",
      undefined,
      {},
      deps,
    )

    expect(statusPayload.enabled).toBe(true)
    expect(statusPayload.host).toBe("codex")
  })

  it("doctor exits cleanly after bootstrap", async () => {
    ctx = createTestProject()
    const { cwd } = ctx

    await mkdir(cwd, { recursive: true })

    const deps = {
      ...defaultDeps,
      getCwd: () => cwd,
      detectCodexSuperpowers: async () => compatibleCodexWarn,
      evaluateSuperpowersCompatibility: async () => compatibleCodexWarn,
    }

    await handleBootstrap(cwd, undefined, deps)

    const doctorPayload = await buildControlPlaneDoctor(
      cwd,
      undefined,
      "codex",
      undefined,
      {},
      deps,
    )

    expect(doctorPayload.activePreset.key).toBe("default")
    expect(doctorPayload.host).toBe("codex")
    expect(doctorPayload.commands).toBeTruthy()

    const doctorJson = JSON.stringify(doctorPayload)
    expect(() => JSON.parse(doctorJson)).not.toThrow()
  })
})
