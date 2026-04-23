import { describe, expect, it } from "vitest"
import { buildCopilotPluginManifest } from "../src/copilot.js"

describe("buildCopilotPluginManifest", () => {
  it("generates a valid plugin.json with required fields", () => {
    const result = buildCopilotPluginManifest()

    expect(result).toContain('"name": "oh-my-superagents"')
    expect(result).toContain('"version"')
    expect(result).toContain('"description"')
    expect(result).toContain('"license": "MIT"')
    expect(result).toContain('"agents": "agents/"')
    expect(result).toContain('"skills": "skills/"')
    expect(result).toContain('"hooks": "hooks.json"')
  })
})
