import { describe, expect, it } from "vitest"
import { buildQwenArtifacts, discoverQwenUpstreamSkills, renderQwenAgentFile } from "../src/qwen.js"

describe("discoverQwenUpstreamSkills", () => {
  it("discovers upstream skills by exact basename in the allowed locations", async () => {
    const directoryEntries: Record<string, string[]> = {
      "/workspace/project/.qwen/skills": ["brainstorming", "frontend-design.md"],
      "/home/test/.qwen/skills": ["writing-plans"],
      "/workspace/project/.agents/skills": ["subagent-driven-development"],
      "/home/test/.agents/skills": ["requesting-code-review", "verification-before-completion", "webapp-testing"],
    }

    const discovered = await discoverQwenUpstreamSkills({
      cwd: "/workspace/project",
      homeDir: "/home/test",
      readDirectoryBasenames: async (directoryPath) => directoryEntries[directoryPath] ?? [],
    })

    expect(discovered).toEqual({
      brainstorming: "/workspace/project/.qwen/skills/brainstorming",
      "writing-plans": "/home/test/.qwen/skills/writing-plans",
      "subagent-driven-development": "/workspace/project/.agents/skills/subagent-driven-development",
      "requesting-code-review": "/home/test/.agents/skills/requesting-code-review",
      "verification-before-completion": "/home/test/.agents/skills/verification-before-completion",
      "frontend-design": undefined,
      "webapp-testing": "/home/test/.agents/skills/webapp-testing",
    })
  })

  it("prefers any project-local skill location over home-level locations", async () => {
    const directoryEntries: Record<string, string[]> = {
      "/workspace/project/.qwen/skills": [],
      "/home/test/.qwen/skills": ["writing-plans"],
      "/workspace/project/.agents/skills": ["writing-plans"],
      "/home/test/.agents/skills": [],
    }

    const discovered = await discoverQwenUpstreamSkills({
      cwd: "/workspace/project",
      homeDir: "/home/test",
      readDirectoryBasenames: async (directoryPath) => directoryEntries[directoryPath] ?? [],
    })

    expect(discovered["writing-plans"]).toBe("/workspace/project/.agents/skills/writing-plans")
  })
})

describe("renderQwenAgentFile", () => {
  it("renders the supported Stage 2 wrapper-agent fields using the provided canonical source entry", () => {
    const output = renderQwenAgentFile({
      name: "oms-review",
      description: "Qwen wrapper agent for the requesting-code-review phase",
      model: "qwen/qwen3-coder-480b",
      skillName: "superpowers/requesting-code-review",
      skillPath: "/home/test/.agents/skills/requesting-code-review",
      sourceEntry: {
        canonicalRoute: "phase.review",
        source: "superpowers",
      },
    })

    expect(output).toContain("name: oms-review")
    expect(output).toContain("model: qwen/qwen3-coder-480b")
    expect(output).toContain("route=phase.review")
  })

  it("resolves namespaced superpowers workflow entry names when sourceEntry is omitted", () => {
    const output = renderQwenAgentFile({
      name: "oms-review",
      description: "Qwen wrapper agent for the requesting-code-review phase",
      model: "qwen/qwen3-coder-480b",
      skillName: "superpowers/requesting-code-review",
      skillPath: "/home/test/.agents/skills/requesting-code-review",
    })

    expect(output).toContain("route=phase.review")
    expect(output).toContain("Use the upstream workflow entry `superpowers/requesting-code-review`")
  })
})

describe("buildQwenArtifacts", () => {
  const controlPlaneSettings = {
    commandPrefix: "oms",
    commands: {
      status: { name: "status", aliases: ["st"] },
      use: { name: "use", aliases: ["u"] },
      disable: { name: "off", aliases: ["o"] },
      sync: { name: "sync", aliases: ["sy"] },
      doctor: { name: "doctor", aliases: ["dr"] },
    },
  }

  it("renders direct-mode Qwen agents and commands for intents", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        workflow: {
          kind: "direct",
          intents: {
            plan: { label: "Plan" },
            build: { label: "Build" },
          },
        },
        profiles: {
          planner: { model: "openai/gpt-5" },
          builder: { model: "gpt-5.4" },
        },
        routes: { plan: "planner" },
        defaultRoute: "builder",
      } as never,
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
      },
    )

    expect(artifacts.commands.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["ai-plan.md", "ai-build.md"]),
    )
    expect(artifacts.agents.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["rt-plan.md", "rt-build.md"]),
    )

    const planCommand = artifacts.commands.find((item) => item.fileName === "ai-plan.md")
    expect(planCommand?.content).not.toContain("agent: rt-plan")
    expect(planCommand?.content).toContain("Use the `rt-plan` direct-mode agent for this intent.")
    expect(planCommand?.content).toContain("- intent: plan")
    expect(planCommand?.content).toContain("- arguments: {{args}}")
  })

  it("rejects invalid direct intent ids before generating Qwen artifacts", async () => {
    await expect(
      buildQwenArtifacts(
        {
          workflow: {
            kind: "direct",
            intents: {
              "foo/bar": { label: "Foo" },
            },
          },
          profiles: {
            planner: { model: "openai/gpt-5" },
          },
          routes: {
            "foo/bar": "planner",
          },
          defaultRoute: "planner",
        } as never,
        {
          cwd: "/workspace/project",
          homeDir: "/home/test",
          controlPlaneSettings,
        },
      ),
    ).rejects.toThrow(/invalid direct intent id|foo\/bar/i)
  })

  it("skips upstream skill discovery and fail-closed behavior in direct mode", async () => {
    await expect(
      buildQwenArtifacts(
        {
          workflow: { kind: "direct", intents: { plan: { label: "Plan" } } },
          profiles: { planner: { model: "openai/gpt-5" } },
          routes: { plan: "planner" },
          defaultRoute: "planner",
        } as never,
        {
          cwd: "/workspace/project",
          homeDir: "/home/test",
          controlPlaneSettings,
          readDirectoryBasenames: async () => [],
        },
      ),
    ).resolves.toBeDefined()
  })

  it("keeps direct-mode commands when includeAgents is false", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        workflow: {
          kind: "direct",
          intents: {
            plan: { label: "Plan" },
          },
        },
        profiles: {
          planner: { model: "openai/gpt-5" },
        },
        routes: { plan: "planner" },
        defaultRoute: "planner",
      } as never,
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
        includeAgents: false,
      },
    )

    expect(artifacts.agents).toEqual([])
    expect(artifacts.commands.map((item) => item.fileName)).toContain("ai-plan.md")
  })

  it("keeps direct-mode commands lightweight when includeAgents is false", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        workflow: {
          kind: "direct",
          intents: {
            plan: { label: "Plan" },
          },
        },
        profiles: {},
        routes: { plan: "missing-profile" },
        defaultRoute: "missing-profile",
      } as never,
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
        includeAgents: false,
      },
    )

    expect(artifacts.agents).toEqual([])
    expect(artifacts.commands.map((item) => item.fileName)).toContain("ai-plan.md")
  })

  it("fails through the shared capability policy when direct-mode qwen resolves an unsupported source entry", async () => {
    await expect(
      buildQwenArtifacts(
        {
          workflow: {
            kind: "direct",
            intents: {
              plan: { label: "Plan" },
            },
          },
          profiles: {
            planner: { model: "openai/gpt-5" },
          },
          effectiveSources: {
            "intent.plan": "gstack",
          },
          routes: { plan: "planner" },
          defaultRoute: "planner",
        } as never,
        {
          cwd: "/workspace/project",
          homeDir: "/home/test",
          controlPlaneSettings,
        },
      ),
    ).rejects.toThrow(/capability policy.*unsupported_source_route.*intent\.plan/i)
  })

  it("omits direct-mode qwen use and disable entrypoints", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        workflow: {
          kind: "direct",
          intents: {
            plan: { label: "Plan" },
          },
        },
        profiles: {
          planner: { model: "openai/gpt-5" },
        },
        routes: { plan: "planner" },
        defaultRoute: "planner",
      } as never,
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
      },
    )

    const fileNames = artifacts.commands.map((item) => item.fileName)

    expect(fileNames).not.toContain("oms-use.md")
    expect(fileNames).not.toContain("oms-u.md")
    expect(fileNames).not.toContain("oms-off.md")
    expect(fileNames).not.toContain("oms-o.md")
  })

  it("fails fast when a direct-mode command collides with a control-plane command", async () => {
    await expect(
      buildQwenArtifacts(
        {
          workflow: {
            kind: "direct",
            intents: {
              sync: { label: "Sync" },
            },
          },
          profiles: {
            planner: { model: "openai/gpt-5" },
          },
          routes: { sync: "planner" },
          defaultRoute: "planner",
        } as never,
        {
          cwd: "/workspace/project",
          homeDir: "/home/test",
          controlPlaneSettings: {
            ...controlPlaneSettings,
            commandPrefix: "ai",
          },
        },
      ),
    ).rejects.toThrow(/ai-sync\.md|Duplicate Qwen command file rendering/i)
  })

  it("materializes the required fixed Qwen wrapper agent names", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        profiles: { build: { model: "qwen/qwen3-coder-480b" } },
        routes: {},
        defaultRoute: "build",
      },
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
        readDirectoryBasenames: async () => [
          "brainstorming",
          "writing-plans",
          "subagent-driven-development",
          "requesting-code-review",
          "verification-before-completion",
          "frontend-design",
          "webapp-testing",
        ],
      },
    )

    expect(artifacts.agents.map((item) => item.fileName)).toEqual([
      "oms-brainstorm.md",
      "oms-plan.md",
      "oms-execute.md",
      "oms-review.md",
      "oms-verify.md",
      "oms-visual.md",
      "oms-web-test.md",
    ])
  })

  it("generates Qwen OMS command files from the configured prefix and rendered names", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        profiles: { build: { model: "qwen/qwen3-coder-480b" } },
        routes: {},
        defaultRoute: "build",
      },
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
        readDirectoryBasenames: async () => [
          "brainstorming",
          "writing-plans",
          "subagent-driven-development",
          "requesting-code-review",
          "verification-before-completion",
          "frontend-design",
          "webapp-testing",
        ],
      },
    )

    expect(artifacts.commands.map((item) => item.fileName)).toEqual([
      "oms-status.md",
      "oms-st.md",
      "oms-use.md",
      "oms-u.md",
      "oms-off.md",
      "oms-o.md",
      "oms-sync.md",
      "oms-sy.md",
      "oms-doctor.md",
      "oms-dr.md",
    ])
    expect(artifacts.commands[0]?.content).toContain(
      "oms-control-plane: stage=2; host=qwen; artifact=command; logical-command=status; rendered-name=oms-status",
    )
  })

  it("generates extra Qwen command files for configured aliases", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        profiles: { build: { model: "qwen/qwen3-coder-480b" } },
        routes: {},
        defaultRoute: "build",
      },
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings: {
          commandPrefix: "oms",
          commands: {
            ...controlPlaneSettings.commands,
            sync: { name: "sync", aliases: ["sy", "sync-now"] },
          },
        },
        readDirectoryBasenames: async () => [
          "brainstorming",
          "writing-plans",
          "subagent-driven-development",
          "requesting-code-review",
          "verification-before-completion",
          "frontend-design",
          "webapp-testing",
        ],
      },
    )

    expect(artifacts.commands.filter((item) => item.fileName.startsWith("oms-sync")).map((item) => item.fileName)).toEqual([
      "oms-sync.md",
      "oms-sync-now.md",
    ])
    expect(artifacts.commands.map((item) => item.fileName)).toContain("oms-sy.md")
  })

  it("does not generate any .qwen/skills output", async () => {
    const artifacts = await buildQwenArtifacts(
      {
        profiles: { build: { model: "qwen/qwen3-coder-480b" } },
        routes: {},
        defaultRoute: "build",
      },
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
        readDirectoryBasenames: async () => [
          "brainstorming",
          "writing-plans",
          "subagent-driven-development",
          "requesting-code-review",
          "verification-before-completion",
          "frontend-design",
          "webapp-testing",
        ],
      },
    )

    expect([...artifacts.agents, ...artifacts.commands].some((artifact) => artifact.directory === ".qwen/skills")).toBe(false)
  })

  it("fails closed when any required upstream Qwen skill is missing", async () => {
    await expect(
      buildQwenArtifacts(
        {
          profiles: { build: { model: "qwen/qwen3-coder-480b" } },
          routes: {},
          defaultRoute: "build",
        },
        {
          cwd: "/workspace/project",
          homeDir: "/home/test",
          controlPlaneSettings,
          readDirectoryBasenames: async () => [
            "brainstorming",
            "writing-plans",
            "subagent-driven-development",
            "requesting-code-review",
            "verification-before-completion",
            "frontend-design",
          ],
        },
      ),
    ).rejects.toThrow(/webapp-testing|Qwen-usable superpowers skills are not installed/i)
  })

  it("fails through the shared capability policy when qwen projects a gstack-backed route", async () => {
    await expect(
      buildQwenArtifacts(
        {
          workflow: { kind: "superpowers" },
          profiles: { build: { model: "qwen/qwen3-coder-480b" } },
          routes: {},
          defaultRoute: "build",
          effectiveSources: {
            "phase.plan": "gstack",
          },
        } as never,
        {
          cwd: "/workspace/project",
          homeDir: "/home/test",
          controlPlaneSettings,
          readDirectoryBasenames: async () => [
            "brainstorming",
            "writing-plans",
            "subagent-driven-development",
            "requesting-code-review",
            "verification-before-completion",
            "frontend-design",
            "webapp-testing",
          ],
        },
      ),
    ).rejects.toThrow(/capability policy.*unsupported_host_source_projection.*phase\.plan/i)
  })

  it("resolves each wrapper agent using the mapped upstream skill key and defaultRoute", async () => {
    const resolutionCalls: string[] = []
    const renderCalls: unknown[] = []

    await buildQwenArtifacts(
      {
        profiles: {
          build: { model: "qwen/qwen3-coder-30b" },
          strategy: { model: "qwen/qwen3-coder-480b" },
        },
        routes: {
          brainstorming: "strategy",
        },
        defaultRoute: "build",
      },
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
        readDirectoryBasenames: async () => [
          "brainstorming",
          "writing-plans",
          "subagent-driven-development",
          "requesting-code-review",
          "verification-before-completion",
          "frontend-design",
          "webapp-testing",
        ],
        resolveRoute: (_config, routeKey) => {
          resolutionCalls.push(routeKey)

          return {
            phaseId: "brainstorming",
            profileId: routeKey === "brainstorming" ? "strategy" : "build",
            selection: {
              model: routeKey === "brainstorming" ? "qwen/qwen3-coder-480b" : "qwen/qwen3-coder-30b",
              variant: "high",
              effort: "deep",
              temperature: 0.2,
            },
            description: `${routeKey} routed`,
          }
        },
        renderAgentFile: (input) => {
          renderCalls.push(input)
          return "rendered"
        },
      },
    )

    expect(resolutionCalls).toEqual([
      "brainstorming",
      "writing-plans",
      "subagent-driven-development",
      "requesting-code-review",
      "verification-before-completion",
      "frontend-design",
      "webapp-testing",
    ])
    expect(renderCalls).toContainEqual({
      name: "oms-brainstorm",
      description: "Qwen wrapper agent for the brainstorming phase",
      model: "qwen/qwen3-coder-480b",
      skillName: "superpowers/brainstorming",
      skillPath: "/workspace/project/.qwen/skills/brainstorming",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        entryName: "brainstorming",
        source: "superpowers",
      },
    })
  })

  it("passes only Stage 2 supported fields into Qwen rendering", async () => {
    const renderCalls: unknown[] = []

    await buildQwenArtifacts(
      {
        profiles: {
          build: {
            model: "qwen/qwen3-coder-480b",
            variant: "high",
            effort: "deep",
            temperature: 0.2,
          },
        },
        routes: {},
        defaultRoute: "build",
      },
      {
        cwd: "/workspace/project",
        homeDir: "/home/test",
        controlPlaneSettings,
        readDirectoryBasenames: async () => [
          "brainstorming",
          "writing-plans",
          "subagent-driven-development",
          "requesting-code-review",
          "verification-before-completion",
          "frontend-design",
          "webapp-testing",
        ],
        renderAgentFile: (input) => {
          renderCalls.push(input)
          return "rendered"
        },
      },
    )

    expect(renderCalls).toContainEqual({
      name: "oms-brainstorm",
      description: "Qwen wrapper agent for the brainstorming phase",
      model: "qwen/qwen3-coder-480b",
      skillName: "superpowers/brainstorming",
      skillPath: "/workspace/project/.qwen/skills/brainstorming",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        entryName: "brainstorming",
        source: "superpowers",
      },
    })
  })
})
