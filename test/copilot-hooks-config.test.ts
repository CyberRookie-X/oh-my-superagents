import { describe, expect, it } from "vitest"
import { buildCopilotHooksConfig } from "../src/copilot.js"

describe("buildCopilotHooksConfig", () => {
  it("generates hooks.json with sessionStart hook", () => {
    const result = buildCopilotHooksConfig({ enableSessionStart: true })

    expect(result).toContain('"version": 1')
    expect(result).toContain('"sessionStart"')
    expect(result).toContain('"type": "command"')
    expect(result).toContain("oh-my-superagents sync --host copilot")
  })

  it("generates empty hooks when all disabled", () => {
    const result = buildCopilotHooksConfig({
      enableSessionStart: false,
      enablePostToolUse: false,
    })

    const parsed = JSON.parse(result)
    expect(parsed.version).toBe(1)
    expect(parsed.hooks.sessionStart).toEqual([])
    expect(parsed.hooks.postToolUse).toEqual([])
  })

  it("includes postToolUse hook when enabled", () => {
    const result = buildCopilotHooksConfig({ enablePostToolUse: true })

    expect(result).toContain('"postToolUse"')
    expect(result).toContain("oh-my-superagents status --host copilot")
  })
})
