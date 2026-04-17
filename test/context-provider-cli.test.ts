import { describe, expect, it } from "vitest"
import { loadControlPlaneConfig } from "../src/config.js"
import { resolveContextProviders } from "../src/context-providers.js"
import { runCliContextProvider } from "../src/context-provider-cli.js"

describe("runCliContextProvider", () => {
  it("returns stdout payloads from external packer commands", async () => {
    const result = await runCliContextProvider({
      providerId: "repomix",
      command: "repomix",
      args: ["--stdout"],
      cwd: "/workspace/project",
      spawn: async () => ({ exitCode: 0, stdout: "{\"kind\":\"pack\"}", stderr: "" }),
    })

    expect(result).toEqual({ exitCode: 0, stdout: "{\"kind\":\"pack\"}", stderr: "" })
  })

  it("forwards providerId, command, args, and cwd to the injected spawn function", async () => {
    let received:
      | {
          providerId: string
          command: string
          args?: readonly string[]
          cwd: string
        }
      | undefined

    await runCliContextProvider({
      providerId: "repomix",
      command: "repomix",
      args: ["--stdout", "--json"],
      cwd: "/workspace/project",
      spawn: async (input) => {
        received = input
        return { exitCode: 0, stdout: "ok", stderr: "" }
      },
    })

    expect(received).toEqual({
      providerId: "repomix",
      command: "repomix",
      args: ["--stdout", "--json"],
      cwd: "/workspace/project",
    })
  })

  it("surfaces spawn rejections from external commands", async () => {
    await expect(
      runCliContextProvider({
        providerId: "repomix",
        command: "repomix",
        args: ["--stdout"],
        cwd: "/workspace/project",
        spawn: async () => {
          throw new Error("spawn failed")
        },
      }),
    ).rejects.toThrow("spawn failed")
  })

  it("accepts resolved cli providers without type friction", async () => {
    const providers = await resolveContextProviders({
      config: {
        repomix: {
          kind: "cli",
          enabled: true,
          command: "repomix",
          args: ["--stdout", "--json"],
          capabilities: ["pack", "status"],
        },
      },
    })

    const provider = providers[0]
    if (!provider || provider.kind !== "cli") {
      throw new Error("Expected resolved CLI provider")
    }

    let receivedArgs: readonly string[] | undefined
    const result = await runCliContextProvider({
      providerId: provider.id,
      command: provider.command,
      args: provider.args,
      cwd: "/workspace/project",
      spawn: async (input) => {
        receivedArgs = input.args
        return { exitCode: 0, stdout: "ok", stderr: "" }
      },
    })

    expect(receivedArgs).toEqual(["--stdout", "--json"])
    expect(result).toEqual({ exitCode: 0, stdout: "ok", stderr: "" })
  })

  it("uses resolved cli provider provenance when cwd is omitted", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "contextProviders": {
          "repomix": {
            "kind": "cli",
            "enabled": true,
            "command": "repomix",
            "args": ["--stdout"],
            "capabilities": ["pack", "status"]
          }
        },
        "presets": {
          "default": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "presets": {
          "default": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const loaded = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async (filePath) => filePath in files,
      readFile: async (filePath) => {
        const value = files[filePath as keyof typeof files]
        if (!value) {
          throw new Error(`Unexpected read: ${filePath}`)
        }

        return value
      },
    })

    const providers = await resolveContextProviders({
      config: loaded.config.contextProviders,
    })
    const provider = providers[0]
    if (!provider || provider.kind !== "cli") {
      throw new Error("Expected resolved CLI provider")
    }

    expect(provider.baseDir).toBe("/home/tester/.config/oh-my-superagents")

    let receivedCwd: string | undefined
    await runCliContextProvider({
      providerId: provider.id,
      command: provider.command,
      args: provider.args,
      baseDir: provider.baseDir,
      spawn: async (input) => {
        receivedCwd = input.cwd
        return { exitCode: 0, stdout: "ok", stderr: "" }
      },
    })

    expect(receivedCwd).toBe("/home/tester/.config/oh-my-superagents")
  })
})
