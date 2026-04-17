import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveContextProviders } from "../src/context-providers.js"

describe("resolveContextProviders", () => {
  it("returns enabled file, cli, and mcp providers with stable capability data", async () => {
    const capabilities = ["recall", "search", "status"] as const
    const providers = await resolveContextProviders({
      baseDir: "/workspace/project",
      config: {
        memoryBank: {
          kind: "file",
          enabled: true,
          root: ".memorybank",
          capabilities,
        },
        repomix: {
          kind: "cli",
          enabled: true,
          command: "repomix",
          args: ["--stdout"],
          capabilities: ["pack", "status"],
        },
        graphiti: {
          kind: "mcp",
          enabled: true,
          command: "graphiti-mcp",
          capabilities: ["recall", "search", "summarize", "status"],
        },
      },
      pathExists: async () => true,
    })

    expect(providers.map((provider) => provider.id)).toEqual(["memoryBank", "repomix", "graphiti"])
    expect(providers[0]).toMatchObject({
      id: "memoryBank",
      kind: "file",
      root: "/workspace/project/.memorybank",
      available: true,
      capabilities: ["recall", "search", "status"],
    })
    expect(providers[0]?.capabilities).not.toBe(capabilities)
  })

  it("filters disabled providers out of the registry", async () => {
    const providers = await resolveContextProviders({
      baseDir: "/workspace/project",
      config: {
        disabledMemoryBank: {
          kind: "file",
          enabled: false,
          root: ".memorybank",
          capabilities: ["recall", "status"],
        },
        repomix: {
          kind: "cli",
          enabled: true,
          command: "repomix",
          capabilities: ["pack", "status"],
        },
      },
      pathExists: async () => true,
    })

    expect(providers.map((provider) => provider.id)).toEqual(["repomix"])
  })

  it("marks file providers unavailable when their resolved root does not exist", async () => {
    const providers = await resolveContextProviders({
      baseDir: "/workspace/project",
      config: {
        memoryBank: {
          kind: "file",
          enabled: true,
          root: ".memorybank",
          capabilities: ["recall", "status"],
        },
      },
      pathExists: async () => false,
    })

    expect(providers).toMatchObject([
      {
        id: "memoryBank",
        kind: "file",
        root: "/workspace/project/.memorybank",
        available: false,
      },
    ])
  })

  it("resolves relative file roots against the provided baseDir", async () => {
    const checkedPaths: string[] = []
    const providers = await resolveContextProviders({
      baseDir: "/workspace/project",
      config: {
        memoryBank: {
          kind: "file",
          enabled: true,
          root: "context/memory-bank",
          capabilities: ["recall", "search"],
        },
      },
      pathExists: async (filePath) => {
        checkedPaths.push(filePath)
        return true
      },
    })

    expect(checkedPaths).toEqual([path.join("/workspace/project", "context/memory-bank")])
    expect(providers).toMatchObject([
      {
        id: "memoryBank",
        kind: "file",
        root: "/workspace/project/context/memory-bank",
        available: true,
      },
    ])
  })

  it("preserves absolute file roots unchanged", async () => {
    const checkedPaths: string[] = []
    const providers = await resolveContextProviders({
      baseDir: "/workspace/project",
      config: {
        memoryBank: {
          kind: "file",
          enabled: true,
          root: "/shared/memory-bank",
          capabilities: ["recall", "status"],
        },
      },
      pathExists: async (filePath) => {
        checkedPaths.push(filePath)
        return true
      },
    })

    expect(checkedPaths).toEqual(["/shared/memory-bank"])
    expect(providers).toMatchObject([
      {
        id: "memoryBank",
        kind: "file",
        root: "/shared/memory-bank",
        available: true,
      },
    ])
  })
})
