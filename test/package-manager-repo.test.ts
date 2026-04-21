import { readFile, readdir } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const repoOwnedCanaryScripts = [
  "scripts/run-opencode-local-canary.sh",
  "scripts/run-codex-local-canary.sh",
  "scripts/run-opencode-debian-canary.sh",
  "scripts/run-codex-debian-canary.sh",
] as const

const debianCanaryScripts = [
  "scripts/run-opencode-debian-canary.sh",
  "scripts/run-codex-debian-canary.sh",
] as const

const hostLocalCanaryScripts = [
  "scripts/run-opencode-local-canary.sh",
  "scripts/run-codex-local-canary.sh",
] as const

const consumerInstallScripts = [
  "scripts/docker/run-opencode-debian-canary-in-container.sh",
  "scripts/docker/run-codex-debian-canary-in-container.sh",
] as const

describe("package manager repository truth", () => {
  it("pins pnpm and keeps pnpm as the only root lockfile", async () => {
    const packageJsonUrl = new URL("../package.json", import.meta.url)
    const repositoryRootUrl = new URL("../", import.meta.url)
    const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8")) as {
      packageManager?: string
    }
    const rootLockfiles = [
      "pnpm-lock.yaml",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "yarn.lock",
      "bun.lockb",
      "bun.lock",
    ] as const
    const rootEntries = await readdir(repositoryRootUrl)
    const presentRootLockfiles = rootLockfiles.filter((entry) => rootEntries.includes(entry))

    expect(packageJson.packageManager).toBe(
      "pnpm@10.32.1+sha512.a706938f0e89ac1456b6563eab4edf1d1faf3368d1191fc5c59790e96dc918e4456ab2e67d613de1043d2e8c81f87303e6b40d4ffeca9df15ef1ad567348f2be",
    )
    expect(presentRootLockfiles).toEqual(["pnpm-lock.yaml"])
  })

  it("keeps Debian canary host wrappers free of host-local build and pack steps", async () => {
    const scripts = await Promise.all(
      debianCanaryScripts.map(async (path) => [
        path,
        await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
      ] as const),
    )

    for (const [path, script] of scripts) {
      expect(script, `${path} should not build on the host`).not.toMatch(/\bpnpm run build\b/)
      expect(script, `${path} should not pack on the host`).not.toMatch(/\bpnpm pack --pack-destination\b/)
      expect(script, `${path} should mount the repository into Docker`).toContain('-v "$ROOT_DIR:/workspace:ro"')
    }
  })

  it("keeps host-local canaries disabled and documents the Docker-only policy in the script", async () => {
    const scripts = await Promise.all(
      hostLocalCanaryScripts.map(async (path) => [
        path,
        await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
      ] as const),
    )

    for (const [path, script] of scripts) {
      expect(script, `${path} should refuse host-local execution`).toContain("Docker-only validation policy")
      expect(script, `${path} should exit immediately`).toContain("exit 1")
      expect(script, `${path} should not build on the host`).not.toMatch(/\bpnpm run build\b/)
      expect(script, `${path} should not pack on the host`).not.toMatch(/\bpnpm pack --pack-destination\b/)
    }
  })

  it("preserves consumer-style global installs inside validation containers", async () => {
    const repoScripts = await Promise.all(
      repoOwnedCanaryScripts.map(async (path) => [
        path,
        await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
      ] as const),
    )

    for (const [path, script] of repoScripts) {
      expect(script, `${path} should not build with npm`).not.toMatch(/\bnpm run build\b/)
      expect(script, `${path} should not pack with npm`).not.toMatch(/\bnpm pack --pack-destination\b/)
    }

    const installScripts = await Promise.all(
      consumerInstallScripts.map(async (path) => [
        path,
        await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
      ] as const),
    )

    for (const [path, script] of installScripts) {
      expect(script, `${path} should keep consumer-style global install coverage`).toContain("npm install -g")
    }
  })
})
