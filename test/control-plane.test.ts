import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"
import { describe, expect, it } from "vitest"
import {
  prepareControlPlaneStateWrite,
  resolveControlPlane,
  summarizeRoutingValidation,
} from "../src/control-plane.js"

function createExists(files: Record<string, string>) {
  return async (filePath: string) => filePath in files
}

function createReadFile(files: Record<string, string>) {
  return async (filePath: string) => {
    const value = files[filePath]
    if (value === undefined) {
      throw new Error(`Unexpected read: ${filePath}`)
    }

    return value
  }
}

function createIsWritable(writablePaths: string[]) {
  const writable = new Set(writablePaths)
  return async (filePath: string) => writable.has(filePath)
}

describe("resolveControlPlane", () => {
  it("allows no-config defaults for status and doctor", async () => {
    const status = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
    })
    const doctor = await resolveControlPlane({
      command: "doctor",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
    })

    expect(status.source.kind).toBe("default")
    expect(doctor.source.kind).toBe("default")
    expect(status.config.settings.activePreset).toBe("default")
    expect(doctor.config.settings.commandPrefix).toBe("oms")
    expect(status.activePreset.preset).toEqual({
      label: "Default",
      short: "def",
      description: "General daily development",
      profiles: {
        strategy: {
          model: "anthropic/claude-sonnet-4-5-20250929",
          variant: "high",
        },
        build: {
          model: "openai/gpt-5",
          effort: "balanced",
        },
      },
      routes: {
        brainstorming: "strategy",
      },
      defaultRoute: "build",
    })
  })

  it("allows read-only fallback when --config points at a missing file", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/missing.jsonc",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
    })

    expect(result.source.kind).toBe("default")
    expect(result.config.settings.activePreset).toBe("default")
  })

  it("rejects sync when there is no real config source", async () => {
    await expect(
      resolveControlPlane({
        command: "sync",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        exists: async () => false,
        readFile: async () => {
          throw new Error("should not read")
        },
      }),
    ).rejects.toThrow(/real config source/i)
  })

  it("validates active preset and route graph", async () => {
    await expect(
      resolveControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "missing"
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {
                "brainstorming": "missing"
              },
              "defaultRoute": "also-missing"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/activePreset|defaultRoute|Unknown profile|missing/i)
  })

  it("rejects duplicate preset shorts", async () => {
    await expect(
      resolveControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "default"
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "dup",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            },
            "review": {
              "label": "Review",
              "short": "dup",
              "profiles": {
                "build": { "model": "anthropic/claude-sonnet-4-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/short/i)
  })

  it("rejects duplicate rendered command names and aliases", async () => {
    await expect(
      resolveControlPlane({
        command: "doctor",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "default",
            "commands": {
              "status": {
                "name": "same",
                "aliases": ["dup"]
              },
              "doctor": {
                "name": "doctor",
                "aliases": ["same"]
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/unique|duplicate|alias|command/i)
  })

  it("uses layered config before validation", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "review": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "review"
          }
        }
      }`,
    }

    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.activePreset.key).toBe("default")
    expect(result.activePreset.preset.defaultRoute).toBe("review")
  })

  it("resolves single-parent preset reuse before validation", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "child"
        },
        "presets": {
          "base": {
            "label": "Base",
            "short": "base",
            "profiles": {
              "build": { "model": "openai/gpt-5" },
              "strategy": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {
              "brainstorming": "strategy",
              "verification-before-completion": "build"
            },
            "defaultRoute": "build"
          },
          "child": {
            "label": "Child",
            "short": "child",
            "extends": "base",
            "profiles": {
              "review": { "model": "google/gemini-2.5-pro" }
            },
            "routes": {
              "brainstorming": "review"
            },
            "defaultRoute": "review"
          }
        }
      }`,
    })

    expect(result.activePreset.key).toBe("child")
    expect(result.activePreset.preset.defaultRoute).toBe("review")
    expect(result.activePreset.preset.profiles).toEqual({
      build: { model: "openai/gpt-5" },
      strategy: { model: "anthropic/claude-sonnet-4-5" },
      review: { model: "google/gemini-2.5-pro" },
    })
    expect(result.activePreset.preset.routes).toEqual({
      brainstorming: "review",
      "verification-before-completion": "build",
    })
  })

  it("resolves a preset that uses top-level profiles", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" },
          "strategy": { "model": "anthropic/claude-sonnet-4-5" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {
              "brainstorming": "strategy"
            },
            "defaultRoute": "build"
          }
        }
      }`,
    })

    expect(result.activePreset.key).toBe("default")
    expect(result.config.profiles.strategy.model).toBe("anthropic/claude-sonnet-4-5")
  })

  it("resolves settings.defaultLane when allowed by the active preset", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "frontend"
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend", "backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })

    expect(result.config.settings.defaultLane).toBe("frontend")
    expect(result.laneState).toEqual({
      allowedLanes: ["frontend", "backend"],
      defaultLane: "frontend",
      effectiveLane: "frontend",
      mode: "suggest",
      nonApplyingReason: "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
      presetDefaultLane: "backend",
      runtimeLane: undefined,
    })
  })

  it("keeps a runtime lane override non-applying in manual mode", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      runtimeLane: "frontend",
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "laneSelection": { "mode": "manual" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend", "backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })

    expect(result.laneState).toMatchObject({
      mode: "manual",
      runtimeLane: "frontend",
      effectiveLane: "backend",
      nonApplyingReason: undefined,
    })
  })

  it("applies a runtime lane override in auto mode", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      runtimeLane: "frontend",
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "laneSelection": { "mode": "auto" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend", "backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })

    expect(result.laneState).toMatchObject({
      mode: "auto",
      runtimeLane: "frontend",
      effectiveLane: "frontend",
      nonApplyingReason: undefined,
    })
  })

  it("rejects settings.defaultLane when the active preset does not allow that lane", async () => {
    await expect(resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "frontend"
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })).rejects.toThrow(/defaultLane|lane/i)
  })

  it("rejects preset.defaultLane when it is not included in usesLanes", async () => {
    await expect(resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["backend"],
            "defaultLane": "frontend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })).rejects.toThrow(/defaultLane|usesLanes|lane/i)
  })

  it("rejects cyclic preset reuse", async () => {
    await expect(
      resolveControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "a"
          },
          "presets": {
            "a": {
              "label": "A",
              "short": "a",
              "extends": "b",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            },
            "b": {
              "label": "B",
              "short": "b",
              "extends": "a",
              "profiles": {
                "review": { "model": "anthropic/claude-sonnet-4-5" }
              },
              "routes": {},
              "defaultRoute": "review"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/cycle|cyclic|extends/i)
  })

  it("selects --config as the write target", async () => {
    const files = {
      "/workspace/project/explicit.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Explicit",
            "short": "exp",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "project"
        },
        "presets": {
          "project": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "build": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global"
        },
        "presets": {
          "global": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "google/gemini-2.5-pro" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/explicit.jsonc",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/explicit.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })

    expect(result.path).toBe("/workspace/project/explicit.jsonc")
  })

  it("selects the project config as the write target when it exists", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "project"
        },
        "presets": {
          "project": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "review": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "review"
          }
        }
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global",
          "commandPrefix": "team"
        },
        "presets": {
          "global": {
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
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "project",
        enabled: false,
      },
    })
    const serialized = parse(result.content) as {
      settings?: { commandPrefix?: string; activePreset?: string; enabled?: boolean }
      presets?: Record<string, unknown>
    }

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(serialized.settings).toEqual({
      activePreset: "project",
      enabled: false,
    })
    expect(serialized.presets).toEqual({
      project: {
        label: "Project",
        short: "prj",
        profiles: {
          review: { model: "anthropic/claude-sonnet-4-5" },
        },
        routes: {},
        defaultRoute: "review",
      },
    })
    expect(serialized.settings?.commandPrefix).toBeUndefined()
  })

  it("selects the global config as the write target when it is the only real source", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
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
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/home/tester/.config/oh-my-superagents/config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })

    expect(result.path).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
  })

  it("fails when the selected write target is not writable", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
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
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global"
        },
        "presets": {
          "global": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    await expect(
      prepareControlPlaneStateWrite({
        command: "disable",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        exists: createExists(files),
        readFile: createReadFile(files),
        isWritable: createIsWritable([]),
        nextState: {
          activePreset: "default",
          enabled: false,
        },
      }),
    ).rejects.toThrow(/writ/i)
  })

  it("creates a valid layered config at the global target on first write when no config exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-"))

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      await mkdir(projectDir, { recursive: true })
      await mkdir(homeDir, { recursive: true })
      await mkdir(path.join(homeDir, ".config", "oh-my-superagents"), { recursive: true })

      const result = await prepareControlPlaneStateWrite({
        command: "use",
        cwd: projectDir,
        homeDir,
        nextState: {
          activePreset: "default",
          enabled: true,
        },
      })
      const serialized = parse(result.content) as {
        settings: {
          activePreset: string
          enabled: boolean
          commandPrefix: string
          commands: Record<string, { name: string; aliases: string[] }>
        }
        presets: Record<string, unknown>
      }

      expect(result.path).toBe(path.join(homeDir, ".config", "oh-my-superagents", "config.jsonc"))
      expect(serialized.settings.activePreset).toBe("default")
      expect(serialized.settings.enabled).toBe(true)
      expect(serialized.settings.commandPrefix).toBe("oms")
      expect(serialized.settings.commands.use).toEqual({
        name: "use",
        aliases: ["u"],
      })
      expect(serialized.presets.default).toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("allows first-write global config preparation when parent directories do not exist yet", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-fresh-home-"))

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      await mkdir(projectDir, { recursive: true })
      await mkdir(homeDir, { recursive: true })

      const result = await prepareControlPlaneStateWrite({
        command: "use",
        cwd: projectDir,
        homeDir,
        nextState: {
          activePreset: "default",
          enabled: true,
        },
      })

      expect(result.path).toBe(path.join(homeDir, ".config", "oh-my-superagents", "config.jsonc"))
      expect(parse(result.content)).toEqual(expect.objectContaining({
        settings: expect.objectContaining({
          activePreset: "default",
          enabled: true,
          commandPrefix: "oms",
        }),
      }))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rejects first-write global config preparation when an existing intermediate directory is not writable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-blocked-home-"))

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      const blockedConfigDir = path.join(homeDir, ".config")
      await mkdir(projectDir, { recursive: true })
      await mkdir(blockedConfigDir, { recursive: true })
      await chmod(blockedConfigDir, 0o555)

      await expect(
        prepareControlPlaneStateWrite({
          command: "use",
          cwd: projectDir,
          homeDir,
          nextState: {
            activePreset: "default",
            enabled: true,
          },
        }),
      ).rejects.toThrow(/writ/i)
    } finally {
      await chmod(path.join(root, "home", ".config"), 0o755).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("selects the global config as the write target when homeDir is omitted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-home-"))
    const previousHome = process.env.HOME

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      const globalPath = path.join(homeDir, ".config", "oh-my-superagents", "config.jsonc")
      await mkdir(projectDir, { recursive: true })
      await mkdir(path.dirname(globalPath), { recursive: true })
      await writeFile(
        globalPath,
        `{
          "settings": {
            "activePreset": "default"
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
      )
      process.env.HOME = homeDir

      const result = await prepareControlPlaneStateWrite({
        command: "disable",
        cwd: projectDir,
        nextState: {
          activePreset: "default",
          enabled: false,
        },
      })

      expect(result.path).toBe(globalPath)
    } finally {
      process.env.HOME = previousHome
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rewrites a legacy target using only migrated local content and required stateful fields", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "profiles": {
          "review": { "model": "anthropic/claude-sonnet-4-5" }
        },
        "routes": {
          "brainstorming": "review"
        },
        "defaultRoute": "review"
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global",
          "commandPrefix": "team",
          "commands": {
            "use": {
              "name": "switch",
              "aliases": ["sw"]
            }
          }
        },
        "presets": {
          "global": {
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
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        commandPrefix?: string
        commands?: Record<string, unknown>
        superpowersCompatibility?: { mode: string }
      }
      presets: Record<string, unknown>
    }

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(serialized.settings).toEqual({
      activePreset: "default",
      enabled: true,
    })
    expect(serialized.presets).toEqual({
      default: {
        label: "Default",
        short: "def",
        description: "Migrated legacy OMS configuration",
        profiles: {
          review: { model: "anthropic/claude-sonnet-4-5" },
        },
        routes: {
          brainstorming: "review",
        },
        defaultRoute: "review",
      },
    })
    expect(serialized.settings?.commandPrefix).toBeUndefined()
    expect(serialized.settings?.commands).toBeUndefined()
    expect(serialized.settings?.superpowersCompatibility).toBeUndefined()
  })

  it("produces the persisted next-config payload before later reconciliation concerns", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "enabled": false,
          "activePreset": "default"
        },
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

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings: { activePreset: string; enabled: boolean }
    }

    expect(serialized.settings).toEqual({
      activePreset: "default",
      enabled: true,
    })
  })

  it("fails clearly when explicit --config first-write targets a preset that only exists in other sources", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "shared"
        },
        "presets": {
          "shared": {
            "label": "Shared",
            "short": "sha",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "shared"
        },
        "presets": {
          "shared": {
            "label": "Shared Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    await expect(
      prepareControlPlaneStateWrite({
        command: "use",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/explicit.jsonc",
        exists: createExists(files),
        readFile: createReadFile(files),
        isWritable: createIsWritable(["/workspace/project/explicit.jsonc"]),
        nextState: {
          activePreset: "shared",
          enabled: true,
        },
      }),
    ).rejects.toThrow(/activePreset.*shared|existing preset/i)
  })

  it("preserves top-level profiles and lanes when preparing a state write", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "backend",
          "laneSelection": { "mode": "suggest" }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" },
          "review": { "model": "anthropic/claude-sonnet-4-5" }
        },
        "lanes": {
          "backend": {
            "label": "Backend",
            "routes": {},
            "defaultRoute": "build"
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        defaultLane?: string
        laneSelection?: { mode?: string }
      }
      profiles?: Record<string, { model: string }>
      lanes?: Record<string, { label: string; routes: Record<string, string>; defaultRoute: string }>
    }

    expect(serialized.settings).toEqual({
      activePreset: "default",
      enabled: false,
      defaultLane: "backend",
      laneSelection: { mode: "suggest" },
    })
    expect(serialized.profiles).toEqual({
      build: { model: "openai/gpt-5" },
      review: { model: "anthropic/claude-sonnet-4-5" },
    })
    expect(serialized.lanes).toEqual({
      backend: {
        label: "Backend",
        routes: {},
        defaultRoute: "build",
      },
    })
  })

  it("clears a persisted settings.defaultLane when switching presets", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "frontend",
          "defaultLane": "frontend",
          "laneSelection": { "mode": "suggest" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        },
        "presets": {
          "frontend": {
            "label": "Frontend",
            "short": "fe",
            "usesLanes": ["frontend"],
            "defaultLane": "frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "short": "be",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "backend",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        defaultLane?: string
        laneSelection?: { mode?: string }
      }
    }

    expect(result.config.settings.activePreset).toBe("backend")
    expect(result.config.settings.defaultLane).toBeUndefined()
    expect(serialized.settings).toEqual({
      activePreset: "backend",
      enabled: true,
      defaultLane: null,
      laneSelection: { mode: "suggest" },
    })
  })

  it("writes a null defaultLane sentinel when a stale lane is inherited from a lower-priority layer", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "frontend",
          "defaultLane": "frontend",
          "laneSelection": { "mode": "suggest" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        },
        "presets": {
          "frontend": {
            "label": "Frontend",
            "short": "fe",
            "usesLanes": ["frontend"],
            "defaultLane": "frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "short": "be",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "frontend"
        },
        "presets": {}
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "backend",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        defaultLane?: string
      }
    }

    expect(result.config.settings.activePreset).toBe("backend")
    expect(result.config.settings.defaultLane).toBeUndefined()
    expect(serialized.settings).toEqual({
      activePreset: "backend",
      enabled: true,
      defaultLane: null,
    })
  })
})

describe("summarizeRoutingValidation", () => {
  it("reports explicit routes, default-routed phases, unused profiles, and invalid missing-parent reuse", () => {
    const summary = summarizeRoutingValidation({
      settings: {
        enabled: true,
        activePreset: "child",
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      presets: {
        child: {
          label: "Child",
          short: "child",
          extends: "base",
          profiles: {
            build: { model: "openai/gpt-5" },
            strategy: { model: "anthropic/claude-sonnet-4-5" },
            unused: { model: "google/gemini-2.5-pro" },
          },
          routes: {
            brainstorming: "strategy",
          },
          defaultRoute: "build",
        },
      },
    }, "child")

    expect(summary.explicitRoutedPhases).toEqual(["brainstorming"])
    expect(summary.defaultRoutedPhases).toContain("requesting-code-review")
    expect(summary.unusedProfiles).toEqual(["unused"])
    expect(summary.reuseRelationship).toEqual({
      kind: "extends",
      parentPresetKey: "base",
      resolvable: false,
    })
  })

  it("reports resolvable reuse when the parent preset exists", () => {
    const summary = summarizeRoutingValidation({
      settings: {
        enabled: true,
        activePreset: "child",
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      presets: {
        base: {
          label: "Base",
          short: "base",
          profiles: {
            build: { model: "openai/gpt-5" },
          },
          routes: {},
          defaultRoute: "build",
        },
        child: {
          label: "Child",
          short: "child",
          extends: "base",
          profiles: {
            review: { model: "anthropic/claude-sonnet-4-5" },
          },
          routes: {
            brainstorming: "review",
          },
          defaultRoute: "build",
        },
      },
    }, "child")

    expect(summary.reuseRelationship).toEqual({
      kind: "extends",
      parentPresetKey: "base",
      resolvable: true,
    })
  })

  it("tracks unused top-level profiles when the preset has no local profiles", () => {
    const summary = summarizeRoutingValidation({
      settings: {
        enabled: true,
        activePreset: "default",
        laneSelection: { mode: "suggest" },
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      profiles: {
        build: { model: "openai/gpt-5" },
        strategy: { model: "anthropic/claude-sonnet-4-5" },
        unused: { model: "google/gemini-2.5-pro" },
      },
      lanes: {},
      presets: {
        default: {
          label: "Default",
          short: "def",
          routes: {
            brainstorming: "strategy",
          },
          defaultRoute: "build",
        },
      },
    }, "default")

    expect(summary.unusedProfiles).toEqual(["unused"])
  })

  it("treats lane-only profiles as used during routing validation", () => {
    const summary = summarizeRoutingValidation({
      settings: {
        enabled: true,
        activePreset: "default",
        laneSelection: { mode: "suggest" },
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      profiles: {
        build: { model: "openai/gpt-5" },
        "lane-strategy": { model: "anthropic/claude-sonnet-4-5" },
        unused: { model: "google/gemini-2.5-pro" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: {
            brainstorming: "lane-strategy",
          },
          defaultRoute: "lane-strategy",
        },
      },
      presets: {
        default: {
          label: "Default",
          short: "def",
          usesLanes: ["frontend"],
          defaultLane: "frontend",
          routes: {},
          defaultRoute: "build",
        },
      },
    }, "default")

    expect(summary.unusedProfiles).toEqual(["unused"])
  })
})
