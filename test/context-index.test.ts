import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildContextIndex } from "../src/context-index.js"

describe("buildContextIndex", () => {
  it("indexes OMS specs and plans as authoritative artifacts", async () => {
    const index = await buildContextIndex({
      cwd: "/workspace/project",
      walkFiles: async () => [
        "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
        "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
      ],
    })

    expect(index.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "spec", authority: "authoritative", source: "oms" }),
      expect.objectContaining({ kind: "plan", authority: "authoritative", source: "oms" }),
    ]))
  })

  it("classifies GSD and legacy planning roots without treating them as OMS-owned", async () => {
    const index = await buildContextIndex({
      cwd: "/workspace/project",
      walkFiles: async () => [
        ".gsd/DECISIONS.md",
        ".gsd/KNOWLEDGE.md",
        ".planning/STATE.md",
      ],
    })

    expect(index.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ".gsd/DECISIONS.md", source: "gsd", kind: "decision" }),
      expect.objectContaining({ path: ".gsd/KNOWLEDGE.md", source: "gsd", kind: "knowledge" }),
      expect.objectContaining({ path: ".planning/STATE.md", source: "gsd", kind: "checkpoint" }),
    ]))
  })

  it("sorts discovered files before classification for stable ordering", async () => {
    const index = await buildContextIndex({
      cwd: "/workspace/project",
      walkFiles: async () => [
        "docs/superpowers/plans/z-last.md",
        ".planning/STATE.md",
        "docs/superpowers/plans/a-first.md",
      ],
    })

    expect(index.artifacts.map((artifact) => artifact.path)).toEqual([
      ".planning/STATE.md",
      "docs/superpowers/plans/a-first.md",
      "docs/superpowers/plans/z-last.md",
    ])
  })

  it("classifies only exact SUMMARY.md basenames as external summaries", async () => {
    const index = await buildContextIndex({
      cwd: "/workspace/project",
      walkFiles: async () => [
        ".memorybank/SUMMARY.md",
        ".memorybank/TEAM_SUMMARY.md",
        ".memorybank/summary.txt",
      ],
    })

    expect(index.artifacts).toEqual([
      expect.objectContaining({
        kind: "summary",
        path: ".memorybank/SUMMARY.md",
        authority: "derived",
        source: "external",
      }),
    ])
  })

  it("does not classify lowercase summary.md as an external summary", async () => {
    const index = await buildContextIndex({
      cwd: "/workspace/project",
      walkFiles: async () => [
        ".memorybank/summary.md",
      ],
    })

    expect(index.artifacts).toEqual([])
  })

  it("walks optional roots from disk in stable order while ignoring missing roots", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "context-index-"))

    try {
      await createFile(cwd, ".memorybank/SUMMARY.md")
      await createFile(cwd, "docs/superpowers/plans/z-last.md")
      await createFile(cwd, "docs/superpowers/plans/a-first.md")
      await createFile(cwd, ".planning/STATE.md")

      const index = await buildContextIndex({ cwd })

      expect(index.artifacts.map((artifact) => artifact.path)).toEqual([
        ".memorybank/SUMMARY.md",
        ".planning/STATE.md",
        "docs/superpowers/plans/a-first.md",
        "docs/superpowers/plans/z-last.md",
      ])
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it("surfaces unexpected root read errors instead of swallowing them", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "context-index-"))

    try {
      await createFile(cwd, "docs/superpowers/specs/2026-04-15-design.md")
      await writeFile(path.join(cwd, ".gsd"), "not a directory")

      await expect(buildContextIndex({ cwd })).rejects.toMatchObject({ code: "ENOTDIR" })
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

async function createFile(cwd: string, relativePath: string) {
  const filePath = path.join(cwd, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, "")
}
