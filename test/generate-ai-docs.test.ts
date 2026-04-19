import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const generatedAiDocFiles = [
  "llms-full.txt",
  "llms.txt",
  "oms-capability-catalog.md",
  "oms-onboarding-playbooks.md",
]

describe("generate-ai-docs", () => {
  it("recreates the committed AI digest outputs in a temp directory", async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "oms-ai-docs-"))

    try {
      execFileSync("node", ["--experimental-strip-types", "scripts/generate-ai-docs.ts"], {
        cwd: new URL("../", import.meta.url),
        encoding: "utf8",
        env: {
          ...process.env,
          OMS_AI_DOCS_OUTPUT_DIR: outputDir,
        },
      })

      expect((await readdir(outputDir)).sort()).toEqual(generatedAiDocFiles)

      for (const fileName of generatedAiDocFiles) {
        expect(await readFile(path.join(outputDir, fileName), "utf8")).toBe(
          await readFile(new URL(`../docs/ai/${fileName}`, import.meta.url), "utf8"),
        )
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  })
})
