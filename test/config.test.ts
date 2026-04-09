import { describe, expect, it } from "vitest"
import { discoverConfigPath, loadRouterConfig } from "../src/config.js"

describe("discoverConfigPath", () => {
  it("prefers the default config file in cwd", async () => {
    const result = await discoverConfigPath({
      cwd: "/workspace/project",
      explicitPath: undefined,
      exists: async (filePath: string) =>
        filePath === "/workspace/project/oh-my-superagents.config.jsonc",
    })

    expect(result).toBe("/workspace/project/oh-my-superagents.config.jsonc")
  })
})

describe("loadRouterConfig", () => {
  it("loads valid config from explicit path", async () => {
    const result = await loadRouterConfig({
      cwd: "/workspace/project",
      explicitPath: "/workspace/project/router.jsonc",
      readFile: async () => `{
        "profiles": { "build": { "model": "openai/gpt-5" } },
        "routes": { "brainstorming": "build" },
        "defaultRoute": "build"
      }`,
      exists: async () => true,
    })

    expect(result.config.defaultRoute).toBe("build")
    expect(result.path).toBe("/workspace/project/router.jsonc")
  })

  it("rejects unknown phase keys", async () => {
    await expect(
      loadRouterConfig({
        cwd: "/workspace/project",
        explicitPath: "/workspace/project/router.jsonc",
        readFile: async () => `{
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": { "unknown-phase": "build" }
        }`,
        exists: async () => true,
      }),
    ).rejects.toThrow(/unknown-phase/)
  })

  it("rejects unknown top-level keys", async () => {
    await expect(
      loadRouterConfig({
        cwd: "/workspace/project",
        explicitPath: "/workspace/project/router.jsonc",
        readFile: async () => `{
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": { "brainstorming": "build" },
          "unexpected": true
        }`,
        exists: async () => true,
      }),
    ).rejects.toThrow(/unexpected/)
  })

  it("rejects malformed JSONC", async () => {
    await expect(
      loadRouterConfig({
        cwd: "/workspace/project",
        explicitPath: "/workspace/project/router.jsonc",
        readFile: async () => `{
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "routes": { "brainstorming": "build" }
        `,
        exists: async () => true,
      }),
    ).rejects.toThrow(/JSONC/i)
  })
})
