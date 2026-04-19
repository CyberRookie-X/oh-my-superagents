import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { writeAuthorityAtomically } from "../src/config-write.js"

describe("writeAuthorityAtomically", () => {
  it("writes to a temp path and renames into place", async () => {
    const fs = {
      mkdir: vi.fn(async () => {}),
      unlink: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    }

    await writeAuthorityAtomically("/repo/oh-my-superagents.config.jsonc", "{}\n", fs)

    expect(fs.writeFile).toHaveBeenCalledTimes(1)
    expect(fs.rename).toHaveBeenCalledTimes(1)
    const tempPath = vi.mocked(fs.writeFile).mock.calls[0]?.[0]
    expect(tempPath).toMatch(/^\/repo\/oh-my-superagents\.config\.jsonc\./)
    expect(tempPath).toMatch(/\.tmp$/)
    expect(vi.mocked(fs.writeFile).mock.calls[0]).toEqual([tempPath, "{}\n", { mode: 0o600 }])
    expect(fs.rename).toHaveBeenCalledWith(tempPath, "/repo/oh-my-superagents.config.jsonc")
  })

  it("preserves the mode of an existing config file when replacing it", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "oms-config-write-"))
    const filePath = path.join(root, "oh-my-superagents.config.jsonc")

    try {
      await fs.writeFile(filePath, "old\n")
      await fs.chmod(filePath, 0o600)

      await writeAuthorityAtomically(filePath, "new\n", {
        mkdir: async (directory, options) => {
          await fs.mkdir(directory, { recursive: options?.recursive })
        },
        unlink: async (targetPath) => {
          await fs.unlink(targetPath)
        },
        chmod: async (targetPath, mode) => {
          await fs.chmod(targetPath, mode)
        },
        stat: async (targetPath) => fs.stat(targetPath),
        writeFile: async (targetPath, content) => {
          await fs.writeFile(targetPath, content)
        },
        rename: async (from, to) => {
          await fs.rename(from, to)
        },
      })

      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("never creates the temp file with broader permissions than the existing config", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "oms-config-write-"))
    const filePath = path.join(root, "oh-my-superagents.config.jsonc")
    let observedTempMode: number | undefined
    const previousUmask = process.umask(0o022)

    try {
      await fs.writeFile(filePath, "old\n")
      await fs.chmod(filePath, 0o600)

      await writeAuthorityAtomically(filePath, "new\n", {
        mkdir: async (directory, options) => {
          await fs.mkdir(directory, { recursive: options?.recursive })
        },
        unlink: async (targetPath) => {
          await fs.unlink(targetPath)
        },
        chmod: async (targetPath, mode) => {
          await fs.chmod(targetPath, mode)
        },
        stat: async (targetPath) => fs.stat(targetPath),
        writeFile: async (targetPath, content, options) => {
          await fs.writeFile(targetPath, content, options)
          observedTempMode = (await fs.stat(targetPath)).mode & 0o777
        },
        rename: async (from, to) => {
          await fs.rename(from, to)
        },
      })

      expect(observedTempMode).toBe(0o600)
    } finally {
      process.umask(previousUmask)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("never rewrites a stale temp file with broader permissions than the existing config", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "oms-config-write-"))
    const filePath = path.join(root, "oh-my-superagents.config.jsonc")
    const tempPath = `${filePath}.tmp`
    let observedTempMode: number | undefined
    const previousUmask = process.umask(0o022)

    try {
      await fs.writeFile(filePath, "old\n")
      await fs.chmod(filePath, 0o600)
      await fs.writeFile(tempPath, "stale\n")
      await fs.chmod(tempPath, 0o666)

      await writeAuthorityAtomically(filePath, "new\n", {
        mkdir: async (directory, options) => {
          await fs.mkdir(directory, { recursive: options?.recursive })
        },
        unlink: async (targetPath) => {
          await fs.unlink(targetPath)
        },
        chmod: async (targetPath, mode) => {
          await fs.chmod(targetPath, mode)
        },
        stat: async (targetPath) => fs.stat(targetPath),
        writeFile: async (targetPath, content, options) => {
          await fs.writeFile(targetPath, content, options)
          observedTempMode = (await fs.stat(targetPath)).mode & 0o777
        },
        rename: async (from, to) => {
          await fs.rename(from, to)
        },
      })

      expect(observedTempMode).toBe(0o600)
    } finally {
      process.umask(previousUmask)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("creates a first-write temp and final config with a restrictive default mode", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "oms-config-write-"))
    const filePath = path.join(root, "oh-my-superagents.config.jsonc")
    let observedTempMode: number | undefined
    const previousUmask = process.umask(0o022)

    try {
      await writeAuthorityAtomically(filePath, "new\n", {
        mkdir: async (directory, options) => {
          await fs.mkdir(directory, { recursive: options?.recursive })
        },
        unlink: async (targetPath) => {
          await fs.unlink(targetPath)
        },
        chmod: async (targetPath, mode) => {
          await fs.chmod(targetPath, mode)
        },
        stat: async (targetPath) => fs.stat(targetPath),
        writeFile: async (targetPath, content, options) => {
          await fs.writeFile(targetPath, content, options)
          observedTempMode = (await fs.stat(targetPath)).mode & 0o777
        },
        rename: async (from, to) => {
          await fs.rename(from, to)
        },
      })

      expect(observedTempMode).toBe(0o600)
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600)
    } finally {
      process.umask(previousUmask)
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("preserves a symlink-backed config path and updates the symlink target content", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "oms-config-write-"))
    const realPath = path.join(root, "real-config.jsonc")
    const linkPath = path.join(root, "oh-my-superagents.config.jsonc")

    try {
      await fs.writeFile(realPath, "old\n")
      await fs.chmod(realPath, 0o600)
      await fs.symlink(realPath, linkPath)

      await writeAuthorityAtomically(linkPath, "new\n", {
        mkdir: async (directory, options) => {
          await fs.mkdir(directory, { recursive: options?.recursive })
        },
        unlink: async (targetPath) => {
          await fs.unlink(targetPath)
        },
        chmod: async (targetPath, mode) => {
          await fs.chmod(targetPath, mode)
        },
        lstat: async (targetPath) => fs.lstat(targetPath),
        readlink: async (targetPath) => fs.readlink(targetPath),
        stat: async (targetPath) => fs.stat(targetPath),
        writeFile: async (targetPath, content, options) => {
          await fs.writeFile(targetPath, content, options)
        },
        rename: async (from, to) => {
          await fs.rename(from, to)
        },
      })

      expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true)
      expect(await fs.readFile(realPath, "utf8")).toBe("new\n")
      expect(await fs.readFile(linkPath, "utf8")).toBe("new\n")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("uses a unique temp path for each overlapping write", async () => {
    const writes: Array<{ filePath: string; content: string; options?: { mode?: number } }> = []
    let releaseWrites: (() => void) | undefined
    const writesStarted = new Promise<void>((resolve) => {
      releaseWrites = resolve
    })

    const fs = {
      mkdir: vi.fn(async () => {}),
      unlink: vi.fn(async () => {}),
      stat: vi.fn(async () => ({ mode: 0o600 })),
      chmod: vi.fn(async () => {}),
      writeFile: vi.fn(async (filePath: string, content: string, options?: { mode?: number }) => {
        writes.push({ filePath, content, options })
        if (writes.length === 2) {
          releaseWrites?.()
        }
        await writesStarted
      }),
      rename: vi.fn(async () => {}),
    }

    await Promise.all([
      writeAuthorityAtomically("/repo/oh-my-superagents.config.jsonc", "first\n", fs),
      writeAuthorityAtomically("/repo/oh-my-superagents.config.jsonc", "second\n", fs),
    ])

    expect(writes).toHaveLength(2)
    expect(writes[0]?.filePath).not.toBe(writes[1]?.filePath)
  })

  it("does not call stale-temp cleanup before writing", async () => {
    const fs = {
      mkdir: vi.fn(async () => {}),
      unlink: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    }

    await writeAuthorityAtomically("/repo/oh-my-superagents.config.jsonc", "{}\n", fs)

    expect(fs.unlink).not.toHaveBeenCalled()
  })
})
