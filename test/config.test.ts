import { readFile } from "node:fs/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
import { discoverConfigPath, loadControlPlaneConfig, loadRouterConfig } from "../src/config.js"
import type { ControlPlaneConfig } from "../src/config.js"
import { resolveContextProviders } from "../src/context-providers.js"

afterEach(() => {
  vi.doUnmock("../src/capabilities.js")
  vi.resetModules()
})

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
  it("allows public ControlPlaneConfig values to omit additive compression fields", () => {
    const config: ControlPlaneConfig = {
      workflow: { kind: "superpowers" },
      settings: {
        enabled: true,
        activePreset: "default",
        laneSelection: { mode: "suggest" },
        subagentExecution: { mode: "suggest" },
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
      sourcePresets: {},
      profiles: {},
      lanes: {},
      presets: {
        default: {
          label: "Default",
          short: "def",
          profiles: {
            build: { model: "openai/gpt-5" },
          },
          routes: {},
          defaultRoute: "build",
        },
      },
    }

    expect(config.settings.contextCompression).toBeUndefined()
    expect(config.compressionPresets).toBeUndefined()
  })

  it("accepts selector-based policy rules", async () => {
    const loaded = await loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        settings: { activePreset: "default" },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        policyRules: [{
          id: "frontend-vision-rule",
          selector: { path: ["frontend/**"], lifecycleStage: ["verify"] },
          policy: { modelPolicy: { preferredProfiles: ["frontend-vision"] } },
        }],
      }),
    })

    expect(loaded.config.policyRules?.[0]?.policy.modelPolicy?.preferredProfiles).toEqual(["frontend-vision"])
  })

  it("rejects selector-based policy rules with unknown lifecycle stages", async () => {
    await expect(loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        settings: { activePreset: "default" },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        policyRules: [{
          id: "verify-typo-rule",
          selector: { lifecycleStage: ["verfiy"] },
          policy: { modelPolicy: { preferredProfiles: ["frontend-vision"] } },
        }],
      }),
    })).rejects.toThrow(/lifecycle/i)
  })

  it("rejects selector-based policy rules with empty selector arrays", async () => {
    await expect(loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        settings: { activePreset: "default" },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        policyRules: [{
          id: "empty-path-rule",
          selector: { path: [] },
          policy: { modelPolicy: { preferredProfiles: ["frontend-vision"] } },
        }],
      }),
    })).rejects.toThrow(/path/i)
  })

  it("accepts empty list overrides for list-valued policy families", async () => {
    const loaded = await loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        settings: { activePreset: "default" },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        policyRules: [{
          id: "empty-list-override",
          selector: { lifecycleStage: ["verify"] },
          policy: { modelPolicy: { preferredProfiles: [] } },
        }],
      }),
    })

    expect(loaded.config.policyRules?.[0]?.policy.modelPolicy?.preferredProfiles).toEqual([])
  })

    it("accepts null scalar overrides for policy families so narrower rules can clear broader values", async () => {
    const loaded = await loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        settings: { activePreset: "default" },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        policyRules: [{
          id: "null-scalar-override",
          selector: { lifecycleStage: ["verify"] },
          policy: {
            modelPolicy: { effort: null, preferWindowClass: null },
            contextPolicy: { compressionPreset: null, maxCharsBeforeCompression: null },
          },
        }],
      }),
    })

    expect(loaded.config.policyRules?.[0]?.policy.modelPolicy?.effort).toBeNull()
    expect(loaded.config.policyRules?.[0]?.policy.contextPolicy?.compressionPreset).toBeNull()
  })

  it("accepts evidence in layered config without merging it into active policy", async () => {
    const loaded = await loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        settings: { activePreset: "default" },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        evidence: {
          detectedPaths: [{ path: "frontend/**", suggestedTags: ["frontend", "visual"] }],
          notes: ["Detected likely frontend workload"],
        },
      }),
    })

    expect(loaded.config.policyRules).toEqual([])
    expect(Object.prototype.hasOwnProperty.call(loaded.config, "evidence")).toBe(false)
  })

  it("loads authority policyRules into active runtime policy", async () => {
    const loaded = await loadControlPlaneConfig({
      cwd: "/repo",
      homeDir: "/home/tester",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async (filePath) => filePath === "/repo/oh-my-superagents.config.jsonc",
      readFile: async (filePath) => {
        if (filePath !== "/repo/oh-my-superagents.config.jsonc") {
          throw new Error(`Unexpected read: ${filePath}`)
        }

        return JSON.stringify({
          settings: { activePreset: "default" },
          profiles: {
            build: { model: "openai/gpt-5" },
          },
          presets: {
            default: {
              label: "Default",
              short: "def",
              routes: {},
              defaultRoute: "build",
            },
          },
          authority: {
            workloadMappings: [{ path: ["frontend/**"], workloadTags: ["frontend", "visual"] }],
            policyRules: [{
              id: "verify-vision",
              selector: { lifecycleStage: ["verify"] },
              policy: { modelPolicy: { requiredCapabilities: ["vision-input"] } },
            }],
          },
        })
      },
    })

    expect(loaded.config.policyRules).toEqual([{
      id: "verify-vision",
      selector: { lifecycleStage: ["verify"] },
      policy: { modelPolicy: { requiredCapabilities: ["vision-input"] } },
    }])
  })

  it("loads a bootstrap authority-write document through the normal control-plane path", async () => {
    const loaded = await loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        settings: { activePreset: "default" },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        authority: {
          workloadMappings: [],
          policyRules: [],
        },
      }),
    })

    expect(loaded.config.settings.activePreset).toBe("default")
    expect(loaded.config.presets.default).toMatchObject({
      label: "Default",
      short: "def",
      defaultRoute: "build",
    })
    expect(loaded.config.profiles.build).toEqual({ model: "openai/gpt-5" })
  })

  it("treats policyRules as a layered-config discriminator before legacy migration", async () => {
    await expect(loadControlPlaneConfig({
      cwd: "/repo",
      explicitPath: "/repo/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => JSON.stringify({
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        routes: {},
        defaultRoute: "build",
        policyRules: [{
          id: "legacy-discriminator",
          selector: { lifecycleStage: ["verify"] },
          policy: { modelPolicy: { preferredProfiles: ["frontend-vision"] } },
        }],
      }),
    })).rejects.toThrow(/mixed-shape|presets/i)
  })

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

  it("loads source presets and route-to-source overrides", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "sourcePresets": {
          "foundation": {
            "routes": {
              "phase.brainstorm": "superpowers",
              "phase.verify": "gstack"
            }
          }
        },
        "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "sourcePreset": "foundation",
              "sourceRoutes": {
                "phase.plan": "gstack"
              },
              "profiles": {
                "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    })

    expect(result.config.sourcePresets).toEqual({
      foundation: {
        routes: {
          "phase.brainstorm": "superpowers",
          "phase.verify": "gstack",
        },
      },
    })
    expect(result.config.presets.default.sourcePreset).toBe("foundation")
    expect(result.config.presets.default.sourceRoutes).toEqual({
      "phase.plan": "gstack",
    })
  })

  it("loads contextCompression settings and reusable compression presets", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "contextCompression": {
            "preset": "balanced",
            "mode": "auto",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true,
              "sessionResume": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "compressionPresets": {
          "balanced": {
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true,
              "planCheckpoint": true,
              "reviewCheckpoint": true,
              "verificationCheckpoint": true,
              "sessionResume": true,
              "sourceSwitch": false,
              "branchIntegration": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
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
    })

    expect(result.config.settings.contextCompression).toMatchObject({
      preset: "balanced",
      mode: "auto",
      engine: "hybrid",
      inlineLevel: "standard",
    })
    expect(result.config.compressionPresets.balanced.moments.branchIntegration).toBe(true)
  })

  it("rejects settings.contextCompression.preset when it references an unknown compression preset", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "default",
            "contextCompression": {
              "preset": "missing"
            }
          },
          "compressionPresets": {
            "balanced": {
              "mode": "suggest",
              "engine": "hybrid",
              "inlineLevel": "standard"
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
    ).rejects.toThrow(/unknown compression preset|missing/i)
  })

  it("rejects selector policy contextPolicy.compressionPreset when it references an unknown compression preset", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "compressionPresets": {
            "balanced": {
              "mode": "suggest",
              "engine": "hybrid",
              "inlineLevel": "standard"
            }
          },
          "policyRules": [{
            "id": "verify-compression",
            "selector": {
              "lifecycleStage": ["verify"]
            },
            "policy": {
              "contextPolicy": {
                "compressionPreset": "missing"
              }
            }
          }],
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
    ).rejects.toThrow(/unknown compression preset|missing/i)
  })

  it("merges compressionPresets field-by-field across layers", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "compressionPresets": {
          "balanced": {
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "planCheckpoint": true,
              "reviewCheckpoint": true
            },
            "safety": {
              "allowConditional": true,
              "requireFreshVerification": true
            }
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
        "compressionPresets": {
          "balanced": {
            "mode": "auto",
            "moments": {
              "branchIntegration": true
            },
            "safety": {
              "allowConditional": false
            }
          }
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

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.config.compressionPresets.balanced).toEqual({
      mode: "auto",
      engine: "hybrid",
      inlineLevel: "standard",
      moments: {
        subagentHandoff: false,
        planCheckpoint: true,
        reviewCheckpoint: true,
        verificationCheckpoint: false,
        sessionResume: false,
        sourceSwitch: false,
        branchIntegration: true,
      },
      safety: {
        allowConditional: false,
        requireFreshVerification: true,
      },
    })
  })

  it("loads contextProviders across layered config sources", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "contextProviders": {
          "memoryBank": {
            "kind": "file",
            "enabled": false,
            "root": ".memorybank",
            "capabilities": ["recall", "status"]
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
        "contextProviders": {
          "memoryBank": {
            "kind": "file",
            "enabled": true,
            "root": ".memorybank/project",
            "capabilities": ["recall", "search", "status"]
          },
          "repomix": {
            "kind": "cli",
            "enabled": true,
            "command": "repomix",
            "args": ["--stdout"],
            "capabilities": ["pack", "status"]
          },
          "graphiti": {
            "kind": "mcp",
            "enabled": true,
            "command": "graphiti-mcp",
            "capabilities": ["recall", "search", "summarize", "status"]
          }
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

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.config.contextProviders).toEqual({
      memoryBank: {
        kind: "file",
        enabled: true,
        root: ".memorybank/project",
        capabilities: ["recall", "search", "status"],
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
    })
  })

  it("keeps global file-provider roots anchored to the layer that defined them", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "contextProviders": {
          "memoryBank": {
            "kind": "file",
            "enabled": true,
            "root": ".memorybank",
            "capabilities": ["recall", "search", "status"]
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

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    const checkedPaths: string[] = []
    const providers = await resolveContextProviders({
      baseDir: "/workspace/project",
      config: result.config.contextProviders,
      pathExists: async (filePath) => {
        checkedPaths.push(filePath)
        return true
      },
    })

    expect(checkedPaths).toEqual(["/home/tester/.config/oh-my-superagents/.memorybank"])
    expect(providers).toMatchObject([
      {
        id: "memoryBank",
        kind: "file",
        root: "/home/tester/.config/oh-my-superagents/.memorybank",
        available: true,
      },
      {
        id: "repomix",
        kind: "cli",
        command: "repomix",
        args: ["--stdout"],
      },
    ])
  })

  it("rejects contextProviders with an unknown provider kind", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "contextProviders": {
            "memoryBank": {
              "kind": "socket",
              "enabled": true,
              "command": "memory-bank",
              "capabilities": ["recall", "status"]
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
    ).rejects.toThrow(/contextProviders|kind|socket|Invalid discriminator value/i)
  })

  it("rejects file contextProviders that omit required roots", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "contextProviders": {
            "memoryBank": {
              "kind": "file",
              "enabled": true,
              "capabilities": ["recall", "status"]
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
    ).rejects.toThrow(/contextProviders|root|required/i)
  })

  it("rejects settings.commandPrefix values that are not safe command names", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "commandPrefix": "OMS invalid"
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
    ).rejects.toThrow(/commandPrefix|Invalid|safe/i)
  })

  it("rejects settings.commands overrides with unsafe command names or aliases", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "commands": {
              "status": {
                "name": "Status",
                "aliases": ["ok", "bad alias"]
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
    ).rejects.toThrow(/commands|status|name|aliases|Invalid/i)
  })

  it("rejects presets with unsafe short names", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "presets": {
            "default": {
              "label": "Default",
              "short": "Bad Short",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/presets|short|Invalid/i)
  })

  it("rejects legacy superpowers canonical route ids in source mappings", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.brainstorming": "superpowers"
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "sourceRoutes": {
                "phase.writing-plans": "gstack"
              },
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/unknown canonical route|phase\.brainstorming|phase\.writing-plans/i)
  })

  it("rejects an unknown preset sourcePreset reference", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.brainstorm": "superpowers"
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "sourcePreset": "missing",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/sourcePreset|missing/i)
  })

  it("rejects source routes that are incompatible with the superpowers workflow", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "intent.plan": "direct"
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
    ).rejects.toThrow(/unknown canonical route|intent\.plan/i)
  })

  it("rejects direct as a source for phase routes", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.plan": "direct"
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "sourcePreset": "foundation",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/phase\.plan.*direct/i)
  })

  it("validates source-route support through the shared capability registry", async () => {
    vi.resetModules()
    vi.doMock("../src/capabilities.js", async () => {
      const actual = await vi.importActual<typeof import("../src/capabilities.js")>("../src/capabilities.js")

      return {
        ...actual,
        isSourceRouteSupported: vi.fn((source: "superpowers" | "gstack" | "direct", canonicalRoute: string) => {
          if (source === "superpowers" && canonicalRoute === "phase.plan") {
            return false
          }

          return actual.isSourceRouteSupported(source, canonicalRoute as never)
        }),
      }
    })

    const { loadControlPlaneConfig: loadControlPlaneConfigWithCapabilities } = await import("../src/config.js")

    await expect(
      loadControlPlaneConfigWithCapabilities({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.plan": "superpowers"
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "sourcePreset": "foundation",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/phase\.plan.*superpowers/i)
  })

  it("rejects direct workflow intent ids that are not OpenCode-safe artifact names", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "workflow": {
            "kind": "direct",
            "intents": {
              "foo/bar": { "label": "Plan" }
            }
          },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "routes": {
                "foo/bar": "build"
              },
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/invalid direct intent id|foo\/bar/i)
  })

  it("rejects unknown source kinds in route-to-source mappings", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.brainstorm": "not-a-source"
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
    ).rejects.toThrow(/invalid enum value|superpowers|gstack|direct/i)
  })

  it("rejects source routes that are incompatible with the direct workflow", async () => {
    await expect(
      loadControlPlaneConfig({
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
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.brainstorm": "superpowers"
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "sourceRoutes": {
                "intent.review": "gstack"
              },
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/unknown canonical route|phase\.brainstorm|intent\.review/i)
  })

  it("rejects non-direct sources for intent routes", async () => {
    await expect(
      loadControlPlaneConfig({
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
          "sourcePresets": {
            "foundation": {
              "routes": {
                "intent.plan": "superpowers"
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "sourcePreset": "foundation",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/intent\.plan.*non-direct source superpowers/i)
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

  it("keeps the global config path when no project authority exists", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global"
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

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.path).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
    expect(result.sources).toEqual(["/home/tester/.config/oh-my-superagents/config.jsonc"])
    expect(result.recovery).toEqual({ activeSource: "authority" })
  })

  it("does not trigger project last-known-good recovery for a broken global layer", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": "{",
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "project"
        },
        "presets": {
          "project": {
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
      "/workspace/project/.oms/last-known-good.json": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Recovered",
            "short": "rec",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    await expect(loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })).rejects.toThrow("Invalid JSONC in /home/tester/.config/oh-my-superagents/config.jsonc")
  })

  it("does not trigger authority recovery for a semantically invalid lower-priority layer", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Broken Global",
            "short": "glo",
            "extends": "missing",
            "routes": {},
            "defaultRoute": "build"
          }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
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
              "review": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "review"
          }
        }
      }`,
      "/workspace/project/.oms/last-known-good.json": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Recovered",
            "short": "rec",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    await expect(loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })).rejects.toThrow("Preset default extends unknown preset: missing")
  })

  it("keeps the global layer when --config targets an existing project config path", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global"
        },
        "compressionPresets": {
          "balanced": {
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard"
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
    }

    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(result.sources).toEqual([
      "/home/tester/.config/oh-my-superagents/config.jsonc",
      "/workspace/project/oh-my-superagents.config.jsonc",
    ])
    expect(result.config.settings.activePreset).toBe("project")
    expect(result.config.presets).toHaveProperty("global")
    expect(result.config.presets).toHaveProperty("project")
    expect(result.config.compressionPresets).toHaveProperty("balanced")
  })

  it("falls back to last-known-good when authority config fails to load", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": "{",
      "/workspace/project/.oms/last-known-good.json": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Recovered",
            "short": "rec",
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

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(result.sources).toEqual(["/workspace/project/.oms/last-known-good.json"])
    expect(result.config.presets.default.label).toBe("Recovered")
    expect(result.recovery).toEqual({
      activeSource: "last-known-good",
      authorityError: "Invalid JSONC in /workspace/project/oh-my-superagents.config.jsonc",
      lastKnownGoodPath: "/workspace/project/.oms/last-known-good.json",
    })
  })

  it("falls back to last-known-good when authority semantic validation fails", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Broken",
            "short": "brk",
            "extends": "missing",
            "routes": {},
            "defaultRoute": "build"
          }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        }
      }`,
      "/workspace/project/.oms/last-known-good.json": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Recovered",
            "short": "rec",
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

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(result.sources).toEqual(["/workspace/project/.oms/last-known-good.json"])
    expect(result.config.presets.default.label).toBe("Recovered")
    expect(result.recovery).toEqual({
      activeSource: "last-known-good",
      authorityError: "Preset default extends unknown preset: missing",
      lastKnownGoodPath: "/workspace/project/.oms/last-known-good.json",
    })
  })

  it("uses the global-scoped last-known-good path when the global authority fails", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": "{",
      "/home/tester/.config/oh-my-superagents/.oms/last-known-good.json": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Recovered Global",
            "short": "rec",
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

    expect(result.path).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
    expect(result.sources).toEqual(["/home/tester/.config/oh-my-superagents/.oms/last-known-good.json"])
    expect(result.config.presets.default.label).toBe("Recovered Global")
    expect(result.recovery).toEqual({
      activeSource: "last-known-good",
      authorityError: "Invalid JSONC in /home/tester/.config/oh-my-superagents/config.jsonc",
      lastKnownGoodPath: "/home/tester/.config/oh-my-superagents/.oms/last-known-good.json",
    })
  })

  it("keeps recovered file-provider roots anchored to the original authority directory", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": "{",
      "/workspace/project/.oms/last-known-good.json": `{
        "contextProviders": {
          "memoryBank": {
            "kind": "file",
            "enabled": true,
            "root": ".memorybank",
            "capabilities": ["recall", "search", "status"]
          }
        },
        "presets": {
          "default": {
            "label": "Recovered",
            "short": "rec",
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

    const checkedPaths: string[] = []
    const providers = await resolveContextProviders({
      baseDir: "/workspace/project",
      config: result.config.contextProviders,
      pathExists: async (filePath) => {
        checkedPaths.push(filePath)
        return true
      },
    })

    expect(result.recovery).toEqual({
      activeSource: "last-known-good",
      authorityError: "Invalid JSONC in /workspace/project/oh-my-superagents.config.jsonc",
      lastKnownGoodPath: "/workspace/project/.oms/last-known-good.json",
    })
    expect(checkedPaths).toEqual(["/workspace/project/.memorybank"])
    expect(providers).toMatchObject([
      {
        id: "memoryBank",
        kind: "file",
        root: "/workspace/project/.memorybank",
        available: true,
      },
    ])
  })

  it("treats settings.contextCompression.preset null as clearing an inherited lower-priority preset", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "contextCompression": {
            "preset": "balanced",
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true,
              "sessionResume": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "compressionPresets": {
          "balanced": {
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
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
          "contextCompression": {
            "preset": null,
            "mode": "auto"
          }
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

    expect(result.config.settings.contextCompression.preset).toBeUndefined()
    expect(result.config.settings.contextCompression.mode).toBe("auto")
    expect(result.config.settings.contextCompression.engine).toBe("hybrid")
    expect(result.config.settings.contextCompression.moments.subagentHandoff).toBe(true)
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

  it("accepts subagent execution mode on layered config settings", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "subagentExecution": { "mode": "suggest" }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": {},
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
    })

    expect(result.config.settings.subagentExecution.mode).toBe("suggest")
  })

  it("defaults subagent execution mode to suggest when omitted", async () => {
    const result = await loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": {},
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
    })

    expect(result.config.settings.subagentExecution.mode).toBe("suggest")
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

  it("rejects a direct-mode lane route key that is not declared in workflow.intents", async () => {
    await expect(
      loadControlPlaneConfig({
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "workflow": {
            "kind": "direct",
            "intents": {
              "plan": { "label": "Plan" },
              "build": { "label": "Build" }
            }
          },
          "settings": { "activePreset": "default" },
          "profiles": {
            "plan-profile": { "model": "openai/gpt-5" },
            "build-profile": { "model": "gpt-5.4" }
          },
          "lanes": {
            "frontend": {
              "label": "Frontend",
              "routes": {
                "pla": "plan-profile"
              },
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
      }),
    ).rejects.toThrow("Unknown intent: pla")
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
              subagentExecution?: {
                properties?: {
                  mode?: { enum?: string[]; default?: string }
                }
              }
              contextCompression?: {
                $ref?: string
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
                propertyNames?: { type?: string; minLength?: number; pattern?: string }
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
        contextCompression?: {
          properties?: {
            preset?: { type?: Array<string> | string; minLength?: number }
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
    expect(layeredShape?.properties?.settings?.properties?.subagentExecution?.properties?.mode?.enum).toEqual([
      "manual",
      "suggest",
      "auto",
    ])
    expect(layeredShape?.properties?.settings?.properties?.subagentExecution?.properties?.mode?.default).toBe(
      "suggest",
    )
    expect(layeredShape?.properties?.settings?.properties?.contextCompression?.$ref).toBe("#/$defs/contextCompression")
    expect(schema.$defs?.contextCompression?.properties?.preset?.type).toEqual(["string", "null"])
    expect(schema.$defs?.contextCompression?.properties?.preset?.minLength).toBe(1)
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
    expect(directWorkflow?.properties?.intents?.propertyNames?.pattern).toBe("^[a-z0-9-]+$")
    expect(directWorkflow?.properties?.intents?.additionalProperties?.$ref).toBe("#/$defs/directIntent")
    expect(schema.$defs?.directIntent?.properties?.label?.type).toBe("string")
    expect(schema.$defs?.directIntent?.properties?.label?.minLength).toBe(1)
    expect(schema.$defs?.directIntent?.properties?.description?.type).toBe("string")
    expect(schema.$defs?.directIntent?.properties?.description?.minLength).toBe(1)
  })

  it("keeps schema parity for selector-based policy rules", async () => {
    const schema = JSON.parse(
      await readFile(
        new URL("../schemas/oh-my-superagents.schema.json", import.meta.url),
        "utf8",
      ),
    ) as {
      properties?: {
        policyRules?: {
          type?: string
          items?: { $ref?: string }
        }
      }
      anyOf?: Array<{
        required?: string[]
        properties?: {
          policyRules?: {
            type?: string
            items?: { $ref?: string }
          }
        }
      }>
      $defs?: {
        policyRule?: {
          properties?: {
            selector?: { $ref?: string }
            policy?: { $ref?: string }
          }
        }
        policySelector?: {
          properties?: {
            lifecycleStage?: {
              items?: { enum?: string[] }
            }
          }
        }
      }
    }

    const layeredShape = schema.anyOf?.find((entry) => entry.required?.includes("presets"))

    expect(schema.properties?.policyRules?.type).toBe("array")
    expect(schema.properties?.policyRules?.items?.$ref).toBe("#/$defs/policyRule")
    expect(layeredShape?.properties?.policyRules?.type).toBe("array")
    expect(layeredShape?.properties?.policyRules?.items?.$ref).toBe("#/$defs/policyRule")
    expect(schema.$defs?.policyRule?.properties?.selector?.$ref).toBe("#/$defs/policySelector")
    expect(schema.$defs?.policyRule?.properties?.policy?.$ref).toBe("#/$defs/policyFamilies")
    expect(schema.$defs?.policySelector?.properties?.lifecycleStage?.items?.enum).toContain("verify")
  })

  it("keeps schema parity for layered evidence documents", async () => {
    const schema = JSON.parse(
      await readFile(
        new URL("../schemas/oh-my-superagents.schema.json", import.meta.url),
        "utf8",
      ),
    ) as {
      properties?: {
        evidence?: { $ref?: string }
      }
      anyOf?: Array<{
        required?: string[]
        properties?: {
          evidence?: { $ref?: string }
        }
      }>
      $defs?: {
        evidence?: {
          properties?: {
            detectedPaths?: { items?: { $ref?: string } }
          }
        }
      }
    }

    const layeredShape = schema.anyOf?.find((entry) => entry.required?.includes("presets"))

    expect(schema.properties?.evidence?.$ref).toBe("#/$defs/evidence")
    expect(layeredShape?.properties?.evidence?.$ref).toBe("#/$defs/evidence")
    expect(schema.$defs?.evidence?.properties?.detectedPaths?.items?.$ref).toBe("#/$defs/evidenceDetectedPath")
  })

  it("keeps schema parity for layered authority documents", async () => {
    const schema = JSON.parse(
      await readFile(
        new URL("../schemas/oh-my-superagents.schema.json", import.meta.url),
        "utf8",
      ),
    ) as {
      properties?: {
        authority?: { $ref?: string }
      }
      anyOf?: Array<{
        required?: string[]
        properties?: {
          authority?: { $ref?: string }
        }
      }>
      $defs?: {
        authority?: {
          properties?: {
            workloadMappings?: { items?: { $ref?: string } }
            policyRules?: { items?: { $ref?: string } }
          }
        }
      }
    }

    const layeredShape = schema.anyOf?.find((entry) => entry.required?.includes("presets"))

    expect(schema.properties?.authority?.$ref).toBe("#/$defs/authority")
    expect(layeredShape?.properties?.authority?.$ref).toBe("#/$defs/authority")
    expect(schema.$defs?.authority?.properties?.workloadMappings?.items?.$ref).toBe("#/$defs/authorityWorkloadMapping")
    expect(schema.$defs?.authority?.properties?.policyRules?.items?.$ref).toBe("#/$defs/policyRule")
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

  it("rejects direct workflow intent ids that are not OpenCode-safe when loading router config", async () => {
    await expect(
      loadRouterConfig({
        cwd: "/workspace/project",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "workflow": {
            "kind": "direct",
            "intents": {
              "foo/bar": { "label": "Plan" }
            }
          },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "routes": {
                "foo/bar": "build"
              },
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/invalid direct intent id|foo\/bar/i)
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

  it("returns effectiveSources for layered configs using sourcePreset and sourceRoutes", async () => {
    const result = await loadRouterConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists({
        "/home/tester/.config/oh-my-superagents/config.jsonc": `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.brainstorm": "superpowers",
                "phase.verify": "gstack"
              }
            }
          },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
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
              "label": "Project Default",
              "short": "prj",
              "sourcePreset": "foundation",
              "sourceRoutes": {
                "phase.plan": "gstack"
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
      readFile: createReadFile({
        "/home/tester/.config/oh-my-superagents/config.jsonc": `{
          "sourcePresets": {
            "foundation": {
              "routes": {
                "phase.brainstorm": "superpowers",
                "phase.verify": "gstack"
              }
            }
          },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
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
              "label": "Project Default",
              "short": "prj",
              "sourcePreset": "foundation",
              "sourceRoutes": {
                "phase.plan": "gstack"
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    })

    expect(result.config.effectiveSources).toEqual({
      "phase.brainstorm": "superpowers",
      "phase.plan": "gstack",
      "phase.verify": "gstack",
    })
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
