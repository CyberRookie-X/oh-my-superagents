import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { discoverConfigPath, loadControlPlaneConfig, loadRouterConfig } from "../src/config.js"

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

describe("discoverConfigPath", () => {
  it("falls back to the global config path when project config is missing", async () => {
    const result = await discoverConfigPath({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async (filePath: string) => filePath === "/home/tester/.config/oh-my-superagents/config.jsonc",
    })

    expect(result).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
  })
})

describe("loadControlPlaneConfig", () => {
  it("migrates legacy config into presets.default", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "routes": {
          "brainstorming": "build"
        },
        "defaultRoute": "build",
        "superpowersCompatibility": { "mode": "strict" }
      }`,
    })

    expect(result.config.settings.activePreset).toBe("default")
    expect(result.config.settings.superpowersCompatibility.mode).toBe("strict")
    expect(result.config.presets.default).toMatchObject({
      label: "Default",
      short: "def",
      description: "Migrated legacy OMS configuration",
      profiles: {
        build: { model: "openai/gpt-5" },
      },
      routes: {
        brainstorming: "build",
      },
      defaultRoute: "build",
    })
  })

  it("preserves explicit workflow when migrating legacy flat config", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "workflow": {
          "kind": "direct",
          "intents": {
            "plan": { "label": "Plan" }
          }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "routes": {
          "plan": "build"
        },
        "defaultRoute": "build"
      }`,
    })

    expect(result.config.workflow.kind).toBe("direct")
    if (result.config.workflow.kind !== "direct") {
      throw new Error("Expected direct workflow")
    }

    expect(result.config.workflow.intents.plan.label).toBe("Plan")
    expect(result.config.presets.default.routes).toEqual({
      plan: "build",
    })
  })

  it("defaults to the superpowers workflow when workflow is omitted", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "routes": {
          "brainstorming": "build"
        },
        "defaultRoute": "build"
      }`,
    })

    expect((result.config as { workflow?: { kind?: string } }).workflow).toEqual({
      kind: "superpowers",
    })
  })

  it("accepts a direct workflow with named intents", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "workflow": {
          "kind": "direct",
          "intents": {
            "plan": { "label": "Plan" },
            "build": { "label": "Build" },
            "review": { "label": "Review" }
          }
        },
        "profiles": {
          "plan-profile": { "model": "openai/gpt-5" },
          "build-profile": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": { "plan": "plan-profile" },
            "defaultRoute": "build-profile"
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend"],
            "defaultLane": "frontend",
            "routes": {},
            "defaultRoute": "build-profile"
          }
        }
      }`,
    })

    expect(result.config.workflow.kind).toBe("direct")
    if (result.config.workflow.kind !== "direct") {
      throw new Error("Expected direct workflow")
    }

    expect(result.config.workflow.intents.plan.label).toBe("Plan")
    expect(result.config.workflow.intents.build.label).toBe("Build")
    expect(result.config.lanes.frontend.routes.plan).toBe("plan-profile")
  })

  it("rejects mixed-shape config", async () => {
    await expect(
      loadControlPlaneConfig({
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
              "short": "def",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "defaultRoute": "build"
        }`,
      }),
    ).rejects.toThrow(/mixed-shape/i)
  })

  it("treats --config as exclusive", async () => {
    const files = {
      "/workspace/project/explicit.jsonc": `{
        "settings": {
          "activePreset": "explicit"
        },
        "presets": {
          "explicit": {
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
              "build": { "model": "google/gemini-2.5-pro" }
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

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/explicit.jsonc",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.path).toBe("/workspace/project/explicit.jsonc")
    expect(result.sources).toEqual(["/workspace/project/explicit.jsonc"])
    expect(result.config.settings.activePreset).toBe("explicit")
    expect(result.config.presets).toHaveProperty("explicit")
    expect(result.config.presets).not.toHaveProperty("project")
    expect(result.config.presets).not.toHaveProperty("global")
  })

  it("merges global and project layered config", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "enabled": false,
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
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "enabled": true,
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
    }

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.sources).toEqual([
      "/home/tester/.config/oh-my-superagents/config.jsonc",
      "/workspace/project/oh-my-superagents.config.jsonc",
    ])
    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(result.config.settings.enabled).toBe(true)
    expect(result.config.settings.activePreset).toBe("project")
    expect(result.config.settings.commandPrefix).toBe("team")
    expect(result.config.presets).toHaveProperty("global")
    expect(result.config.presets).toHaveProperty("project")
  })

  it("loads a layered config with global profiles, global lanes, preset lane constraints, settings.defaultLane, and laneSelection.mode", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "backend",
          "laneSelection": { "mode": "suggest" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4", "codexFast": true }
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

    expect(result.config.settings.defaultLane).toBe("backend")
    expect(result.config.settings.laneSelection.mode).toBe("suggest")
    expect(result.config.profiles["backend-build"].codexFast).toBe(true)
    expect(result.config.lanes.backend.defaultRoute).toBe("backend-build")
    expect(result.config.presets.default.usesLanes).toEqual(["frontend", "backend"])
  })

  it("rejects a preset that references a missing lane", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": { "activePreset": "default" },
          "profiles": { "build": { "model": "openai/gpt-5" } },
          "lanes": {},
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "usesLanes": ["frontend"],
              "defaultLane": "frontend",
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/lane/i)
  })

  it("rejects a lane route target that does not exist in the effective profile set", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": { "activePreset": "default" },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "lanes": {
            "frontend": {
              "label": "Frontend",
              "routes": {
                "brainstorming": "missing-profile"
              },
              "defaultRoute": "build"
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "usesLanes": ["frontend"],
              "defaultLane": "frontend",
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/lane|profile|missing-profile/i)
  })

  it("rejects a lane defaultRoute target that does not exist in the effective profile set", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": { "activePreset": "default" },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "lanes": {
            "frontend": {
              "label": "Frontend",
              "routes": {},
              "defaultRoute": "missing-profile"
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "usesLanes": ["frontend"],
              "defaultLane": "frontend",
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/lane|defaultRoute|profile|missing-profile/i)
  })

  it("inherits usesLanes and defaultLane from an extended parent preset", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "child"
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
          "base": {
            "label": "Base",
            "short": "base",
            "usesLanes": ["frontend", "backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          },
          "child": {
            "label": "Child",
            "short": "child",
            "extends": "base",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })

    expect(result.config.presets.child.usesLanes).toEqual(["frontend", "backend"])
    expect(result.config.presets.child.defaultLane).toBe("backend")
  })

  it("replaces a same-named project preset instead of deep-merging it", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Global Default",
            "short": "glo",
            "description": "Global description",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {
              "brainstorming": "build"
            },
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
            "label": "Project Default",
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

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.config.presets.default).toEqual({
      label: "Project Default",
      short: "prj",
      profiles: {
        review: { model: "anthropic/claude-sonnet-4-5" },
      },
      routes: {},
      defaultRoute: "review",
    })
  })

  it("replaces a same-named project command entry and synthesizes missing defaults", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "commands": {
            "status": {
              "name": "health",
              "aliases": ["hs"]
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
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "commands": {
            "status": {
              "name": "state"
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
    }

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.config.settings.commands.status).toEqual({
      name: "state",
      aliases: ["st"],
    })
    expect(result.config.settings.commands.doctor).toEqual({
      name: "doctor",
      aliases: ["dr"],
    })
  })

  it("treats settings.defaultLane null as clearing an inherited lower-priority lane", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "frontend"
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
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "defaultLane": null
        },
        "presets": {}
      }`,
    }

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.config.settings.defaultLane).toBeUndefined()
    expect(result.config.presets.default.defaultLane).toBe("backend")
  })

  it("keeps schema parity for non-empty layered preset keys", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "default"
          },
          "presets": {
            "": {
              "label": "Broken",
              "short": "bad",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow()

    const schema = JSON.parse(
      await readFile(
        new URL("../schemas/oh-my-superagents.schema.json", import.meta.url),
        "utf8",
      ),
    ) as {
      properties?: {
        presets?: {
          propertyNames?: {
            type?: string
            minLength?: number
          }
        }
      }
    }

    expect(schema.properties?.presets?.propertyNames?.type).toBe("string")
    expect(schema.properties?.presets?.propertyNames?.minLength).toBe(1)
  })

  it("keeps schema parity for naming patterns and legacy config support", async () => {
    const schema = JSON.parse(
      await readFile(
        new URL("../schemas/oh-my-superagents.schema.json", import.meta.url),
        "utf8",
      ),
    ) as {
      properties?: {
        workflow?: { $ref?: string }
      }
      anyOf?: Array<{
        required?: string[]
        properties?: {
          workflow?: { $ref?: string }
          settings?: {
            properties?: {
              commandPrefix?: { pattern?: string }
              defaultLane?: { type?: string; minLength?: number }
              laneSelection?: {
                properties?: {
                  mode?: { enum?: string[] }
                }
              }
              commands?: {
                properties?: {
                  status?: {
                    properties?: {
                      name?: { pattern?: string }
                      aliases?: { items?: { pattern?: string } }
                    }
                  }
                }
              }
            }
          }
          presets?: {
            additionalProperties?: {
              properties?: {
                extends?: { type?: string; minLength?: number }
                short?: { pattern?: string }
                usesLanes?: {
                  items?: { type?: string; minLength?: number }
                }
                defaultLane?: { type?: string; minLength?: number }
              }
            }
          }
          profiles?: {
            additionalProperties?: {
              properties?: {
                codexFast?: { type?: string }
              }
            }
          }
          lanes?: {
            additionalProperties?: {
              properties?: {
                label?: { type?: string; minLength?: number }
                routes?: { type?: string }
                defaultRoute?: { type?: string; minLength?: number }
              }
            }
          }
        }
      }>
      $defs?: {
        workflow?: {
          anyOf?: Array<{
            properties?: {
              kind?: { const?: string }
              intents?: {
                propertyNames?: { type?: string; minLength?: number }
                additionalProperties?: { $ref?: string }
              }
            }
          }>
        }
        directIntent?: {
          properties?: {
            label?: { type?: string; minLength?: number }
            description?: { type?: string; minLength?: number }
          }
        }
      }
    }

    const layeredShape = schema.anyOf?.find((entry) => entry.required?.includes("presets"))
    const legacyShape = schema.anyOf?.find((entry) => entry.required?.includes("profiles"))
    const directWorkflow = schema.$defs?.workflow?.anyOf?.find(
      (entry) => entry.properties?.kind?.const === "direct",
    )

    expect(schema.properties?.workflow?.$ref).toBe("#/$defs/workflow")
    expect(layeredShape?.properties?.workflow?.$ref).toBe("#/$defs/workflow")
    expect(legacyShape?.properties?.workflow?.$ref).toBe("#/$defs/workflow")
    expect(layeredShape?.properties?.settings?.properties?.commandPrefix?.pattern).toBe("^[a-z0-9-]+$")
    expect(
      layeredShape?.properties?.settings?.properties?.commands?.properties?.status?.properties?.name?.pattern,
    ).toBe("^[a-z0-9-]+$")
    expect(
      layeredShape?.properties?.settings?.properties?.commands?.properties?.status?.properties?.aliases?.items?.pattern,
    ).toBe("^[a-z0-9-]+$")
    expect(layeredShape?.properties?.settings?.properties?.defaultLane?.type).toEqual(["string", "null"])
    expect(layeredShape?.properties?.settings?.properties?.defaultLane?.minLength).toBe(1)
    expect(layeredShape?.properties?.settings?.properties?.laneSelection?.properties?.mode?.enum).toEqual([
      "manual",
      "suggest",
      "auto",
    ])
    expect(layeredShape?.properties?.presets?.additionalProperties?.properties?.extends?.type).toBe("string")
    expect(layeredShape?.properties?.presets?.additionalProperties?.properties?.extends?.minLength).toBe(1)
    expect(layeredShape?.properties?.presets?.additionalProperties?.properties?.short?.pattern).toBe(
      "^[a-z0-9-]+$",
    )
    expect(layeredShape?.properties?.presets?.additionalProperties?.properties?.usesLanes?.items?.type).toBe(
      "string",
    )
    expect(
      layeredShape?.properties?.presets?.additionalProperties?.properties?.usesLanes?.items?.minLength,
    ).toBe(1)
    expect(layeredShape?.properties?.presets?.additionalProperties?.properties?.defaultLane?.type).toBe(
      "string",
    )
    expect(layeredShape?.properties?.presets?.additionalProperties?.properties?.defaultLane?.minLength).toBe(1)
    expect(layeredShape?.properties?.profiles?.additionalProperties?.properties?.codexFast?.type).toBe("boolean")
    expect(layeredShape?.properties?.lanes?.additionalProperties?.properties?.label?.type).toBe("string")
    expect(layeredShape?.properties?.lanes?.additionalProperties?.properties?.label?.minLength).toBe(1)
    expect(layeredShape?.properties?.lanes?.additionalProperties?.properties?.routes?.type).toBe("object")
    expect(layeredShape?.properties?.lanes?.additionalProperties?.properties?.defaultRoute?.type).toBe(
      "string",
    )
    expect(layeredShape?.properties?.lanes?.additionalProperties?.properties?.defaultRoute?.minLength).toBe(1)
    expect(legacyShape?.required).toContain("profiles")
    expect(legacyShape?.required).toContain("defaultRoute")
    expect(directWorkflow?.properties?.intents?.propertyNames?.type).toBe("string")
    expect(directWorkflow?.properties?.intents?.propertyNames?.minLength).toBe(1)
    expect(directWorkflow?.properties?.intents?.additionalProperties?.$ref).toBe("#/$defs/directIntent")
    expect(schema.$defs?.directIntent?.properties?.label?.type).toBe("string")
    expect(schema.$defs?.directIntent?.properties?.label?.minLength).toBe(1)
    expect(schema.$defs?.directIntent?.properties?.description?.type).toBe("string")
    expect(schema.$defs?.directIntent?.properties?.description?.minLength).toBe(1)
  })
})

describe("loadRouterConfig", () => {
  it("accepts codexFast in a profile loaded from config", async () => {
    const result = await loadRouterConfig({
      cwd: "/workspace/project",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "profiles": {
          "build": { "model": "gpt-5.4", "effort": "deep", "codexFast": true }
        },
        "routes": {},
        "defaultRoute": "build"
      }`,
    })

    expect(result.config.profiles.build.codexFast).toBe(true)
  })

  it("accepts a direct workflow with named intents", async () => {
    const result = await loadRouterConfig({
      cwd: "/workspace/project",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "workflow": {
          "kind": "direct",
          "intents": {
            "plan": { "label": "Plan" },
            "build": {
              "label": "Build",
              "description": "Implement the change"
            }
          }
        },
        "profiles": {
          "plan-profile": { "model": "openai/gpt-5" },
          "build-profile": { "model": "gpt-5.4" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {
              "plan": "plan-profile"
            },
            "defaultRoute": "build-profile"
          }
        }
      }`,
    })

    const workflow = (result.config as {
      workflow?: {
        kind?: string
        intents?: Record<string, { label?: string; description?: string }>
      }
    }).workflow

    expect(workflow?.kind).toBe("direct")
    expect(workflow?.intents?.plan?.label).toBe("Plan")
    expect(workflow?.intents?.build?.description).toBe("Implement the change")
    expect(result.config.routes.plan).toBe("plan-profile")
  })

  it("resolves inherited preset profiles and routes before building router config", async () => {
    const result = await loadRouterConfig({
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
              "brainstorming": "strategy"
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
            "defaultRoute": "build"
          }
        }
      }`,
    })

    expect(result.config.profiles).toEqual({
      build: { model: "openai/gpt-5" },
      strategy: { model: "anthropic/claude-sonnet-4-5" },
      review: { model: "google/gemini-2.5-pro" },
    })
    expect(result.config.routes).toEqual({
      brainstorming: "review",
    })
    expect(result.config.defaultRoute).toBe("build")
  })

  it("merges top-level profiles into router config when a preset only overrides some of them", async () => {
    const result = await loadRouterConfig({
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
          "strategy": { "model": "anthropic/claude-sonnet-4-5", "variant": "high" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "strategy": { "model": "openai/gpt-5", "variant": "medium" }
            },
            "routes": {
              "brainstorming": "strategy"
            },
            "defaultRoute": "build"
          }
        }
      }`,
    })

    expect(result.config.profiles).toEqual({
      build: { model: "openai/gpt-5" },
      strategy: { model: "openai/gpt-5", variant: "medium" },
    })
    expect(result.config.defaultRoute).toBe("build")
  })

  it("rejects multi-level preset reuse chains", async () => {
    await expect(
      loadRouterConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "grandchild"
          },
          "presets": {
            "base": {
              "label": "Base",
              "short": "base",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            },
            "child": {
              "label": "Child",
              "short": "child",
              "extends": "base",
              "profiles": {
                "review": { "model": "anthropic/claude-sonnet-4-5" }
              },
              "routes": {},
              "defaultRoute": "review"
            },
            "grandchild": {
              "label": "Grandchild",
              "short": "grandchild",
              "extends": "child",
              "profiles": {
                "verify": { "model": "google/gemini-2.5-pro" }
              },
              "routes": {},
              "defaultRoute": "verify"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/single-level|single level|extends/i)
  })
})
