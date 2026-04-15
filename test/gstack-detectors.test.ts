import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { detectClaudeGstackAvailability } from "../src/gstack-detectors.js"

function createPathExists(paths: Iterable<string>) {
  const knownPaths = new Set(paths)
  return async (filePath: string) => knownPaths.has(filePath)
}

describe("detectClaudeGstackAvailability", () => {
  const cwd = "/workspace/project"
  const homeDir = "/home/tester"
  const projectRoot = path.join(cwd, ".claude", "skills", "gstack")
  const userRoot = path.join(homeDir, ".claude", "skills", "gstack")

  it("prefers the project-local Claude gstack skill root when both roots are present", async () => {
    const result = await detectClaudeGstackAvailability({
      cwd,
      homeDir,
      pathExists: createPathExists([projectRoot, userRoot]),
    })

    expect(result.status).toBe("available")
    expect(result.source).toBe("claude-project-gstack-skill-root")
    expect(result.detectedRoot).toBe(projectRoot)
    expect(result.reason).toContain(projectRoot)
  })

  it("falls back to the user-local Claude gstack skill root when the project root is missing", async () => {
    const result = await detectClaudeGstackAvailability({
      cwd,
      homeDir,
      pathExists: createPathExists([userRoot]),
    })

    expect(result.status).toBe("available")
    expect(result.source).toBe("claude-user-gstack-skill-root")
    expect(result.detectedRoot).toBe(userRoot)
    expect(result.reason).toContain(userRoot)
  })

  it("returns not_detected when no Claude gstack skill root is present", async () => {
    const result = await detectClaudeGstackAvailability({
      cwd,
      homeDir,
      pathExists: createPathExists([]),
    })

    expect(result.status).toBe("not_detected")
    expect(result.source).toBe("claude-gstack-skill-root-detection")
    expect(result.detectedRoot).toBeNull()
    expect(result.reason).toMatch(/no gstack install could be detected/i)
  })

  it("treats a symlinked project-local Claude gstack skill root as available", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "gstack-detector-"))
    const tempCwd = path.join(tempRoot, "project")
    const tempHomeDir = path.join(tempRoot, "home")
    const targetRoot = path.join(tempRoot, "shared-gstack-root")
    const symlinkRoot = path.join(tempCwd, ".claude", "skills", "gstack")

    await mkdir(tempCwd, { recursive: true })
    await mkdir(tempHomeDir, { recursive: true })
    await mkdir(targetRoot, { recursive: true })
    await mkdir(path.dirname(symlinkRoot), { recursive: true })

    try {
      await symlink(targetRoot, symlinkRoot)

      const result = await detectClaudeGstackAvailability({
        cwd: tempCwd,
        homeDir: tempHomeDir,
      })

      expect(result.status).toBe("available")
      expect(result.source).toBe("claude-project-gstack-skill-root")
      expect(result.detectedRoot).toBe(symlinkRoot)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
