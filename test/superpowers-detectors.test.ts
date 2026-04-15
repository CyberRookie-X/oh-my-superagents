import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  detectCodexSuperpowersAvailability,
  detectCodexSuperpowers,
  detectOpenCodeSuperpowersAvailability,
  detectOpenCodeSuperpowers,
} from "../src/superpowers-detectors.js"
import {
  evaluateSuperpowersCompatibility,
  type SuperpowersDetectionDetails,
  type SuperpowersDetectionFailure,
} from "../src/superpowers-compatibility.js"

type ReadFileValue = string | Error
type GitRepoState = {
  headCommit: string
  headTags: string[]
} | null

function getFailures(details?: SuperpowersDetectionDetails): SuperpowersDetectionFailure[] {
  return details?.failures ?? []
}

function createReadFile(files: Record<string, ReadFileValue>) {
  return async (filePath: string) => {
    const value = files[filePath]
    if (value === undefined) {
      const error = new Error(`ENOENT: ${filePath}`) as Error & { code?: string }
      error.code = "ENOENT"
      throw error
    }

    if (value instanceof Error) {
      throw value
    }

    return value
  }
}

function createPathExists(paths: Iterable<string>) {
  const knownPaths = new Set(paths)
  return async (filePath: string) => knownPaths.has(filePath)
}

function createResolveRealPath(paths: Record<string, string | Error>) {
  return async (filePath: string) => {
    const value = paths[filePath]
    if (value === undefined) {
      const error = new Error(`ENOENT: ${filePath}`) as Error & { code?: string }
      error.code = "ENOENT"
      throw error
    }

    if (value instanceof Error) {
      throw value
    }

    return value
  }
}

function createReadGitCheckout(states: Record<string, GitRepoState | Error>) {
  return async (repoPath: string) => {
    const value = states[repoPath]
    if (value === undefined) {
      return null
    }

    if (value instanceof Error) {
      throw value
    }

    return value
  }
}

async function withEnv<T>(
  overrides: Partial<Record<"XDG_CONFIG_HOME" | "CODEX_HOME", string | undefined>>,
  callback: () => Promise<T>,
) {
  const previous = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    CODEX_HOME: process.env.CODEX_HOME,
  }

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[name]
      continue
    }

    process.env[name] = value
  }

  try {
    return await callback()
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name]
        continue
      }

      process.env[name] = value
    }
  }
}

async function withTempOpenCodeDirs<T>(
  callback: (paths: {
    cwd: string
    homeDir: string
    projectConfigPath: string
    userConfigPath: string
    projectPluginPath: string
    userPluginPath: string
    xdgConfigHome: string
    xdgUserConfigPath: string
    xdgUserPluginPath: string
  }) => Promise<T>,
) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "superpowers-opencode-"))
  const cwd = path.join(tempRoot, "project")
  const homeDir = path.join(tempRoot, "home")
  const xdgConfigHome = path.join(tempRoot, "xdg-config")

  await mkdir(cwd, { recursive: true })
  await mkdir(homeDir, { recursive: true })

  try {
    return await callback({
      cwd,
      homeDir,
      projectConfigPath: path.join(cwd, "opencode.json"),
      userConfigPath: path.join(homeDir, ".config", "opencode", "opencode.json"),
      projectPluginPath: path.join(cwd, ".opencode", "plugins", "superpowers.js"),
      userPluginPath: path.join(homeDir, ".config", "opencode", "plugins", "superpowers.js"),
      xdgConfigHome,
      xdgUserConfigPath: path.join(xdgConfigHome, "opencode", "opencode.json"),
      xdgUserPluginPath: path.join(xdgConfigHome, "opencode", "plugins", "superpowers.js"),
    })
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

async function writeTextFile(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

describe("detectOpenCodeSuperpowers", () => {
  const cwd = "/workspace/project"
  const homeDir = "/home/tester"
  const projectConfigPath = "/workspace/project/opencode.json"
  const userConfigPath = "/home/tester/.config/opencode/opencode.json"

  it("degrades to not_detected when project and user configs disagree", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.2.0"],
        }),
        [userConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.1.0"],
        }),
      }),
    })

    expect(result.source).toBe("opencode-multiple-installs")
    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBeNull()
    expect(evaluateSuperpowersCompatibility(result).status).toBe("not_detected")
  })

  it("degrades to not_detected when project and user configs normalize to the same version from different plugin specs", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.2.0"],
        }),
        [userConfigPath]: JSON.stringify({
          plugin: ["https://gitlab.com/example/superpowers.git#v5.2.0"],
        }),
      }),
    })

    expect(result.source).toBe("opencode-multiple-installs")
    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBeNull()
    expect(evaluateSuperpowersCompatibility(result).status).toBe("not_detected")
  })

  it("falls back to the user config when the project config has no upstream plugin entry", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/other-plugin.git#v1.0.0"],
        }),
        [userConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.1.3"],
        }),
      }),
    })

    expect(result.source).toBe("opencode-user-config")
    expect(result.detectedVersion).toBe("5.1.3")
    expect(result.detectedRef).toBeNull()
  })

  it("honors XDG_CONFIG_HOME for the user config path", async () => {
    const xdgConfigHome = "/config-root"
    const xdgUserConfigPath = "/config-root/opencode/opencode.json"

    const result = await withEnv({ XDG_CONFIG_HOME: xdgConfigHome }, () =>
      detectOpenCodeSuperpowers({
        cwd,
        homeDir,
        readFile: createReadFile({
          [xdgUserConfigPath]: JSON.stringify({
            plugin: ["https://github.com/example/superpowers.git#v5.6.0"],
          }),
        }),
      }),
    )

    expect(result.source).toBe("opencode-user-config")
    expect(result.detectedVersion).toBe("5.6.0")
    expect(result.detectedRef).toBeNull()
  })

  it("extracts normalized semver tags from git plugin specs", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.2.0-beta.1"],
        }),
      }),
    })

    expect(result.detectedVersion).toBe("5.2.0-beta.1")
    expect(result.detectedRef).toBeNull()
  })

  it("treats hosted git URLs without a .git suffix as git specs", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers#v5.2.0"],
        }),
      }),
    })

    expect(result.detectedVersion).toBe("5.2.0")
    expect(result.detectedRef).toBeNull()
  })

  it("uses detectedRef for floating git refs", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#main"],
        }),
      }),
    })

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe("main")
  })

  it("uses detectedRef for plain git URLs without a semver tag", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git"],
        }),
      }),
    })

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe("https://github.com/example/superpowers.git")
  })

  it("uses detectedRef for local file plugin specs", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["file:///Users/test/dev/superpowers"],
        }),
      }),
    })

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe("file:///Users/test/dev/superpowers")
  })

  it("detects a repo-local installed plugin file", async () => {
    await withTempOpenCodeDirs(async ({ cwd, homeDir, projectPluginPath }) => {
      await writeTextFile(projectPluginPath, "export default {}\n")

      const result = await detectOpenCodeSuperpowers({ cwd, homeDir })

      expect(result.source).toBe("opencode-project-plugin-dir")
      expect(result.detectedVersion).toBeNull()
      expect(result.detectedRef).toBe(projectPluginPath)
    })
  })

  it("prefers project config detection over repo-local plugin fallback in the same scope", async () => {
    await withTempOpenCodeDirs(async ({ cwd, homeDir, projectConfigPath, projectPluginPath }) => {
      await writeTextFile(
        projectConfigPath,
        JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.2.0"],
        }),
      )
      await writeTextFile(projectPluginPath, "export default {}\n")

      const result = await detectOpenCodeSuperpowers({ cwd, homeDir })

      expect(result.source).toBe("opencode-project-config")
      expect(result.detectedVersion).toBe("5.2.0")
      expect(result.detectedRef).toBeNull()
    })
  })

  it("uses detectedRef for tarball-style file plugin specs", async () => {
    const spec = "file:../dist/superpowers-5.2.0.tgz"

    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: [spec],
        }),
      }),
    })

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe(spec)
  })

  it("detects a user-local installed plugin file from XDG_CONFIG_HOME", async () => {
    await withTempOpenCodeDirs(async ({ cwd, homeDir, xdgConfigHome, xdgUserPluginPath }) => {
      await writeTextFile(xdgUserPluginPath, "export default {}\n")

      const result = await withEnv({ XDG_CONFIG_HOME: xdgConfigHome }, () =>
        detectOpenCodeSuperpowers({ cwd, homeDir }),
      )

      expect(result.source).toBe("opencode-user-plugin-dir")
      expect(result.detectedVersion).toBeNull()
      expect(result.detectedRef).toBe(xdgUserPluginPath)
    })
  })

  it("does not treat arbitrary HTTP plugin URLs as git specs", async () => {
    const spec = "https://plugins.example.com/superpowers#v5.2.0"

    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: [spec],
        }),
      }),
    })

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe(spec)
  })

  it("degrades to not_detected when no upstream plugin entry exists", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/other-plugin.git#v1.0.0"],
        }),
        [userConfigPath]: JSON.stringify({
          plugin: ["file:///Users/test/dev/not-superpowers"],
        }),
      }),
    })

    expect(evaluateSuperpowersCompatibility(result).status).toBe("not_detected")
    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBeNull()
  })

  it("degrades to not_detected when config and plugin-path detections conflict", async () => {
    await withTempOpenCodeDirs(async ({ cwd, homeDir, projectConfigPath, userPluginPath }) => {
      await writeTextFile(
        projectConfigPath,
        JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.2.0"],
        }),
      )
      await writeTextFile(userPluginPath, "export default {}\n")

      const result = await detectOpenCodeSuperpowers({ cwd, homeDir })

      expect(result.source).toBe("opencode-multiple-installs")
      expect(result.detectedVersion).toBeNull()
      expect(result.detectedRef).toBeNull()
      expect(evaluateSuperpowersCompatibility(result).status).toBe("not_detected")
    })
  })

  it("falls back to the user config when the project config cannot be parsed", async () => {
    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: "{",
        [userConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.1.0"],
        }),
      }),
    })

    expect(result.source).toBe("opencode-user-config")
    expect(result.detectedVersion).toBe("5.1.0")
    expect(result.detectedRef).toBeNull()
    expect(getFailures(result.details)).toContainEqual(
      expect.objectContaining({
        source: "opencode-project-config",
        stage: "parse-config",
      }),
    )
  })

  it("falls back to the user config when the project config cannot be read", async () => {
    const projectReadError = new Error("EACCES: permission denied") as Error & { code?: string }
    projectReadError.code = "EACCES"

    const result = await detectOpenCodeSuperpowers({
      cwd,
      homeDir,
      readFile: createReadFile({
        [projectConfigPath]: projectReadError,
        [userConfigPath]: JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.1.4"],
        }),
      }),
    })

    expect(result.source).toBe("opencode-user-config")
    expect(result.detectedVersion).toBe("5.1.4")
    expect(result.detectedRef).toBeNull()
    expect(getFailures(result.details)).toContainEqual(
      expect.objectContaining({
        source: "opencode-project-config",
        stage: "read-config",
      }),
    )
  })
})

describe("detectCodexSuperpowers", () => {
  const homeDir = "/home/tester"
  const symlinkPath = "/home/tester/.agents/skills/superpowers"
  const clonePath = "/home/tester/.codex/superpowers"
  const linkedRepoPath = "/repos/superpowers"

  it("prefers the symlink target repo over the fallback clone", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([symlinkPath, clonePath]),
      resolveRealPath: createResolveRealPath({
        [symlinkPath]: linkedRepoPath,
      }),
      readGitCheckout: createReadGitCheckout({
        [linkedRepoPath]: {
          headCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          headTags: ["v5.3.0"],
        },
        [clonePath]: {
          headCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          headTags: ["v5.1.0"],
        },
      }),
    })

    expect(result.source).toBe("codex-skills-symlink")
    expect(result.detectedVersion).toBe("5.3.0")
    expect(result.detectedRef).toBeNull()
  })

  it("falls back to the clone when symlink resolution fails", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([symlinkPath, clonePath]),
      resolveRealPath: createResolveRealPath({
        [symlinkPath]: new Error("broken symlink"),
      }),
      readGitCheckout: createReadGitCheckout({
        [clonePath]: {
          headCommit: "abababababababababababababababababababab",
          headTags: ["v5.4.0"],
        },
      }),
    })

    expect(result.source).toBe("codex-repo-clone")
    expect(result.detectedVersion).toBe("5.4.0")
    expect(getFailures(result.details)).toContainEqual(
      expect.objectContaining({
        source: "codex-skills-symlink",
        stage: "resolve-symlink",
      }),
    )
  })

  it("falls back to the clone when symlink repo inspection fails", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([symlinkPath, clonePath]),
      resolveRealPath: createResolveRealPath({
        [symlinkPath]: linkedRepoPath,
      }),
      readGitCheckout: createReadGitCheckout({
        [linkedRepoPath]: new Error("git failed"),
        [clonePath]: {
          headCommit: "bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
          headTags: ["v5.4.1"],
        },
      }),
    })

    expect(result.source).toBe("codex-repo-clone")
    expect(result.detectedVersion).toBe("5.4.1")
    expect(getFailures(result.details)).toContainEqual(
      expect.objectContaining({
        source: "codex-skills-symlink",
        stage: "inspect-git-checkout",
      }),
    )
  })

  it("honors CODEX_HOME for the fallback clone path", async () => {
    const codexHome = "/custom/codex"
    const codexClonePath = "/custom/codex/superpowers"

    const result = await withEnv({ CODEX_HOME: codexHome }, () =>
      detectCodexSuperpowers({
        homeDir,
        pathExists: createPathExists([codexClonePath]),
        resolveRealPath: createResolveRealPath({}),
        readGitCheckout: createReadGitCheckout({
          [codexClonePath]: {
            headCommit: "c0dexc0dexc0dexc0dexc0dexc0dexc0dexc0de",
            headTags: ["v5.6.1"],
          },
        }),
      }),
    )

    expect(result.source).toBe("codex-repo-clone")
    expect(result.detectedVersion).toBe("5.6.1")
    expect(result.detectedRef).toBeNull()
  })

  it("records broken symlink resolution failures with default path existence checks", async () => {
    const tempHome = await mkdtemp(path.join(tmpdir(), "superpowers-detector-"))
    const tempSymlinkPath = path.join(tempHome, ".agents", "skills", "superpowers")
    const tempClonePath = path.join(tempHome, ".codex", "superpowers")

    try {
      await mkdir(path.dirname(tempSymlinkPath), { recursive: true })
      await mkdir(tempClonePath, { recursive: true })
      await symlink(path.join(tempHome, "missing-superpowers"), tempSymlinkPath)

      const result = await detectCodexSuperpowers({
        homeDir: tempHome,
        readGitCheckout: createReadGitCheckout({
          [tempClonePath]: {
            headCommit: "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0",
            headTags: ["v5.5.0"],
          },
        }),
      })

      expect(result.source).toBe("codex-repo-clone")
      expect(result.detectedVersion).toBe("5.5.0")
      expect(getFailures(result.details)).toContainEqual(
        expect.objectContaining({
          source: "codex-skills-symlink",
          stage: "resolve-symlink",
        }),
      )
    } finally {
      await rm(tempHome, { recursive: true, force: true })
    }
  })

  it("detects a normalized semver tag on HEAD from the fallback clone", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([clonePath]),
      resolveRealPath: createResolveRealPath({}),
      readGitCheckout: createReadGitCheckout({
        [clonePath]: {
          headCommit: "cccccccccccccccccccccccccccccccccccccccc",
          headTags: ["v5.2.1-beta.2"],
        },
      }),
    })

    expect(result.source).toBe("codex-repo-clone")
    expect(result.detectedVersion).toBe("5.2.1-beta.2")
    expect(result.detectedRef).toBeNull()
  })

  it("chooses the highest semver tag when multiple tags point at HEAD", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([clonePath]),
      resolveRealPath: createResolveRealPath({}),
      readGitCheckout: createReadGitCheckout({
        [clonePath]: {
          headCommit: "dddddddddddddddddddddddddddddddddddddddd",
          headTags: ["v5.2.0", "5.2.1", "not-a-version"],
        },
      }),
    })

    expect(result.detectedVersion).toBe("5.2.1")
    expect(result.detectedRef).toBeNull()
  })

  it("uses the raw HEAD commit as detectedRef when no semver tag points at HEAD", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([clonePath]),
      resolveRealPath: createResolveRealPath({}),
      readGitCheckout: createReadGitCheckout({
        [clonePath]: {
          headCommit: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          headTags: ["main", "release-candidate"],
        },
      }),
    })

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
  })

  it("degrades to not_detected when the symlink and clone are both missing", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([]),
      resolveRealPath: createResolveRealPath({}),
      readGitCheckout: createReadGitCheckout({}),
    })

    expect(evaluateSuperpowersCompatibility(result).status).toBe("not_detected")
    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBeNull()
  })

  it("degrades repo-read failures to not_detected", async () => {
    const result = await detectCodexSuperpowers({
      homeDir,
      pathExists: createPathExists([clonePath]),
      resolveRealPath: createResolveRealPath({}),
      readGitCheckout: createReadGitCheckout({
        [clonePath]: new Error("git failed"),
      }),
    })

    expect(evaluateSuperpowersCompatibility(result).status).toBe("not_detected")
    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBeNull()
    expect(getFailures(result.details)).toContainEqual(
      expect.objectContaining({
        source: "codex-repo-clone",
        stage: "inspect-git-checkout",
      }),
    )
  })
})

describe("superpowers availability wrappers", () => {
  it("returns available for an OpenCode install with a detected version", async () => {
    const result = await detectOpenCodeSuperpowersAvailability({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      readFile: createReadFile({
        "/workspace/project/opencode.json": JSON.stringify({
          plugin: ["https://github.com/example/superpowers.git#v5.2.0"],
        }),
      }),
    })

    expect(result.status).toBe("available")
    expect(result.reason).toMatch(/detected superpowers install/i)
  })

  it("returns not_detected for a missing Codex install", async () => {
    const result = await detectCodexSuperpowersAvailability({
      homeDir: "/home/tester",
      pathExists: createPathExists([]),
      resolveRealPath: createResolveRealPath({}),
      readGitCheckout: createReadGitCheckout({}),
    })

    expect(result).toEqual({
      status: "not_detected",
      reason: "No superpowers install could be detected.",
    })
  })
})
