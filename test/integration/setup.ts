import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

export interface IntegrationTestContext {
  cwd: string
  cleanup: () => void
}

export function createTestProject(): IntegrationTestContext {
  const cwd = mkdtempSync(join(tmpdir(), "oms-integration-"))
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) }
}
