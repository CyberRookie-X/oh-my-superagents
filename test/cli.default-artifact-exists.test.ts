import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runCli } from "../src/cli.js"

describe("runCli default artifactExists", () => {
  const originalCwd = process.cwd()
  let tempDir = ""
  let blockedDir = ""

  afterEach(async () => {
    process.chdir(originalCwd)

    if (blockedDir) {
      await chmod(blockedDir, 0o700)
      blockedDir = ""
    }

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = ""
    }
  })

  it("surfaces non-missing fs.stat failures instead of treating them as absent", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "oms-cli-"))
    process.chdir(tempDir)

    const modelsPath = path.join(tempDir, "models.json")
    await writeFile(modelsPath, JSON.stringify({
      models: {
        builder: {
          model: "openai/gpt-5",
          specialties: ["frontend", "build"],
        },
      },
    }, null, 2))

    blockedDir = path.join(tempDir, "blocked")
    await mkdir(blockedDir)
    const configPath = path.join(blockedDir, "oh-my-superagents.config.jsonc")
    await chmod(blockedDir, 0o000)

    const result = await runCli([
      "author",
      "routing",
      "--mode",
      "direct",
      "--models",
      modelsPath,
      "--config",
      configPath,
    ])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("EACCES")
    expect(result.stderr).toContain(configPath)
  })
})
