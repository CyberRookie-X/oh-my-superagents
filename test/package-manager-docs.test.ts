import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

type DocExpectation = {
  path: string
  heading: string
  boundaryPhrases: readonly string[]
  forbiddenPhrases?: readonly string[]
}

const docs: DocExpectation[] = [
  {
    path: "README.md",
    heading: "Repository Maintainer Workflow",
    boundaryPhrases: [
      "This repository is maintained with `pnpm`.",
      "Consumer-facing package usage examples in the install section can still use `npx`.",
      "Host-local validation is disabled for this plugin repository.",
      "Run repository verification from a Debian Docker container only.",
    ],
    forbiddenPhrases: [
      "pnpm test",
      "pnpm check",
      "pnpm build",
    ],
  },
  {
    path: "README.zh-CN.md",
    heading: "仓库维护工作流",
    boundaryPhrases: [
      "这个仓库自身的维护流程统一使用 `pnpm`。",
      "安装章节里给包使用者的示例仍然可以继续使用 `npx`。",
      "这个插件仓库禁止在宿主机直接做验证。",
      "仓库验证只能在 Debian Docker 容器中运行。",
    ],
    forbiddenPhrases: [
      "pnpm test",
      "pnpm check",
      "pnpm build",
    ],
  },
  {
    path: "docs/README-architecture.md",
    heading: "Repository Workflow",
    boundaryPhrases: [
      "This repository is maintained with `pnpm`.",
      "Consumer-facing package usage elsewhere can remain `npx`-based because published CLI usage is not tied to pnpm.",
      "Host-local validation is disabled for this plugin repository.",
      "Run repository verification from a Debian Docker container only.",
    ],
    forbiddenPhrases: [
      "pnpm test",
      "pnpm check",
      "pnpm build",
    ],
  },
  {
    path: "docs/README-architecture.zh-CN.md",
    heading: "仓库工作流",
    boundaryPhrases: [
      "这个仓库的维护工作流使用 `pnpm`。",
      "面向包使用者的示例仍然可以保留 `npx` 形式，因为发布后的 CLI 用法并不依赖 pnpm。",
      "这个插件仓库禁止在宿主机直接做验证。",
      "仓库验证只能在 Debian Docker 容器中运行。",
    ],
    forbiddenPhrases: [
      "pnpm test",
      "pnpm check",
      "pnpm build",
    ],
  },
]

const requiredCommands = [
  "corepack enable",
  "pnpm install",
  "bash scripts/run-opencode-debian-canary.sh",
  "bash scripts/run-codex-debian-canary.sh",
] as const

const forbiddenCommands = [
  "npm install",
  "npm test",
  "npm run check",
  "npm run build",
] as const

const repoMaintainerDocDirs = [
  "docs/superpowers/plans",
  "docs/superpowers/specs",
  ".agents/superpowers/specs",
] as const

const repoMaintainerForbiddenCommands = [
  { command: "npm test", pattern: /\bnpm test\b/g },
  { command: "npm run check", pattern: /\bnpm run check\b/g },
  { command: "npm run build", pattern: /\bnpm run build\b/g },
] as const

const repoRoot = fileURLToPath(new URL("../", import.meta.url))

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractSection(markdown: string, heading: string): string {
  const pattern = new RegExp(
    String.raw`(?:^|\r?\n)## ${escapeForRegex(heading)}\r?\n([\s\S]*?)(?=\r?\n## |\s*$)`,
  )
  const match = markdown.match(pattern)

  expect(match, `Expected to find section \"## ${heading}\"`).not.toBeNull()

  return match![1]
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(join(repoRoot, directory), { withFileTypes: true })
  const nestedPaths = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = join(directory, entry.name)

      if (entry.isDirectory()) {
        return listMarkdownFiles(relativePath)
      }

      return entry.name.endsWith(".md") ? [relativePath] : []
    }),
  )

  return nestedPaths.flat().sort()
}

describe("package manager maintainer docs", () => {
  it("keep repository maintainer workflow on pnpm", async () => {
    for (const doc of docs) {
      const content = await readFile(join(repoRoot, doc.path), "utf8")
      const section = extractSection(content, doc.heading)
      const sectionLines = section
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      for (const command of requiredCommands) {
        expect(sectionLines).toContain(command)
      }

      for (const phrase of doc.boundaryPhrases) {
        expect(section).toContain(phrase)
      }

      for (const command of forbiddenCommands) {
        expect(sectionLines).not.toContain(command)
      }

      for (const phrase of doc.forbiddenPhrases ?? []) {
        expect(section).not.toContain(phrase)
      }
    }
  })

  it("keeps maintainer verification commands on pnpm in internal docs", async () => {
    for (const directory of repoMaintainerDocDirs) {
      for (const path of await listMarkdownFiles(directory)) {
        const content = await readFile(join(repoRoot, path), "utf8")

        for (const { command, pattern } of repoMaintainerForbiddenCommands) {
          expect(content, `${path} should not contain ${command}`).not.toMatch(pattern)
        }
      }
    }
  })
})
