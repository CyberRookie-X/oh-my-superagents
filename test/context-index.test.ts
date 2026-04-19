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

  it("indexes openspec artifacts as external authoritative or advisory inputs", async () => {
    const index = await buildContextIndex({
      cwd: "/repo",
      walkFiles: async () => [
        "openspec/specs/auth/spec.md",
        "openspec/changes/add-auth/tasks.md",
      ],
    })

    expect(index.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "openspec/specs/auth/spec.md",
        kind: "spec",
        authority: "authoritative",
        source: "external",
      }),
      expect.objectContaining({
        path: "openspec/changes/add-auth/tasks.md",
        kind: "plan",
        authority: "advisory",
        source: "external",
      }),
    ]))
  })

  it("does not classify nested openspec lookalikes outside the openspec root as openspec artifacts", async () => {
    const nestedLookalikePath = "docs/superpowers/specs/examples/openspec/specs/auth/spec.md"
    const index = await buildContextIndex({
      cwd: "/repo",
      walkFiles: async () => [nestedLookalikePath],
    })

    expect(index.artifacts).toEqual([
      expect.objectContaining({
        path: nestedLookalikePath,
        kind: "spec",
        authority: "authoritative",
        source: "oms",
      }),
    ])
  })

  it("walks openspec root content from disk without treating nested lookalikes as openspec artifacts", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "context-index-"))

    try {
      await createFile(cwd, "openspec/specs/auth/spec.md")
      await createFile(cwd, "docs/superpowers/specs/examples/openspec/specs/auth/spec.md")

      const index = await buildContextIndex({ cwd })

      expect(index.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: "openspec/specs/auth/spec.md",
          kind: "spec",
          authority: "authoritative",
          source: "external",
        }),
        expect.objectContaining({
          path: "docs/superpowers/specs/examples/openspec/specs/auth/spec.md",
          kind: "spec",
          authority: "authoritative",
          source: "oms",
        }),
      ]))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
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
