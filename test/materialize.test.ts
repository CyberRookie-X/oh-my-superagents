import { describe, expect, it } from "vitest"
import { materializeArtifacts } from "../src/materialize.js"

describe("materializeArtifacts", () => {
  it("writes agents and commands into fixed .opencode directories", async () => {
    const writes: string[] = []

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          fileName: "spr-build.md",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
        {
          kind: "command",
          fileName: "sp-review.md",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async (filePath: string) => {
          writes.push(filePath)
        },
        rename: async () => undefined,
        readdir: async () => [],
        readFile: async () => "",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(writes).toContain("/workspace/project/.opencode/agents/spr-build.md.tmp")
    expect(writes).toContain("/workspace/project/.opencode/commands/sp-review.md.tmp")
  })

  it("fails on collisions with non-router-owned files", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          fileName: "spr-build.md",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => [],
        readFile: async () => "---\nuser file\n---",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.exitCode).toBe(1)
  })

  it("returns exit code 2 when cleanup warnings occur", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          fileName: "spr-build.md",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => ["spr-stale.md"],
        readFile: async () => "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => {
          throw new Error("cleanup failed")
        },
      },
    })

    expect(result.exitCode).toBe(2)
  })

  it("does not treat marker text later in the file as router ownership", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          fileName: "spr-build.md",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => ["spr-user.md"],
        readFile: async (filePath: string) =>
          filePath.endsWith("spr-user.md")
            ? "---\ncustom: true\n---\n\nHello\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->"
            : "",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.removed).toEqual([])
  })

  it("rejects path traversal in artifact filenames", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          fileName: "../escape.md",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => [],
        readFile: async () => "",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.exitCode).toBe(1)
  })
})
