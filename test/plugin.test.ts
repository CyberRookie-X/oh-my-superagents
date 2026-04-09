import { describe, expect, it } from "vitest"
import { OhMySuperpowersPlugin } from "../src/plugin.js"

describe("OhMySuperpowersPlugin", () => {
  it("logs the recommended sync command when config is missing", async () => {
    const logs: unknown[] = []

    await OhMySuperpowersPlugin({
      directory: "/workspace/project",
      client: {
        app: {
          log: async (entry: unknown) => {
            logs.push(entry)
          },
        },
      },
    } as never)

    expect(JSON.stringify(logs)).toContain("oh-my-superagents sync --host opencode")
  })
})
