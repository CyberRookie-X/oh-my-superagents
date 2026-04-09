import { describe, expect, it } from "vitest"
import { runCli } from "../src/cli.js"

const baseConfig = {
  profiles: { build: { model: "openai/gpt-5" } },
  routes: {},
  defaultRoute: "build",
}

describe("runCli", () => {
  it("returns exit code 0 for explain --all", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--all"], {
      loadConfig: async () => ({ path: "/workspace/project/oh-my-superagents.config.jsonc", config: baseConfig }),
      explainAll: (config: any) => [
        {
          phase: "brainstorming",
          profileId: config.defaultRoute,
          model: "openai/gpt-5",
          variant: undefined,
          commandName: "/sp-brainstorm",
          agentName: "spr-strategy",
        },
      ],
      explainPhase: () => {
        throw new Error("unexpected")
      },
      buildArtifacts: () => {
        throw new Error("unexpected")
      },
      materializeArtifacts: async () => ({ exitCode: 0, warnings: [], written: [], removed: [] }),
    })

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "brainstorming",
          commandName: "/sp-brainstorm",
        }),
      ]),
    )
  })

  it("returns exit code 1 for unknown explain phase", async () => {
    const result = await runCli(["explain", "--host", "opencode", "--phase", "unknown"], {
      loadConfig: async () => ({ path: "/workspace/project/oh-my-superagents.config.jsonc", config: baseConfig }),
      explainAll: () => [],
      explainPhase: () => ({
        phase: "brainstorming",
        profileId: "build",
        model: "openai/gpt-5",
        variant: undefined,
        commandName: "/sp-brainstorm",
        agentName: "spr-strategy",
      }),
      buildArtifacts: () => ({ agents: [], commands: [] }),
      materializeArtifacts: async () => ({ exitCode: 0, warnings: [], written: [], removed: [] }),
    })

    expect(result.exitCode).toBe(1)
  })

  it("returns exit code 2 when sync finishes with cleanup warnings", async () => {
    const result = await runCli(["sync", "--host", "opencode"], {
      loadConfig: async () => ({ path: "/workspace/project/oh-my-superagents.config.jsonc", config: baseConfig }),
      explainAll: () => [],
      explainPhase: () => {
        throw new Error("unexpected")
      },
      buildArtifacts: () => ({ agents: [], commands: [] }),
      materializeArtifacts: async () => ({ exitCode: 2, warnings: ["cleanup failed"], written: [], removed: [] }),
    })

    expect(result.exitCode).toBe(2)
  })
})
