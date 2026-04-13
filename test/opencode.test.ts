import { describe, expect, it } from "vitest"
import { createDefaultControlPlaneConfig, type ControlPlaneConfig, type RouterConfig } from "../src/config.js"
import * as opencode from "../src/opencode.js"

const { buildArtifacts, renderAgentFile, renderCommandFile, renderControlPlaneCommandFile } = opencode

function buildArtifactsWithControlPlane(
  routerConfig: RouterConfig,
  settings: ControlPlaneConfig["settings"],
): ReturnType<typeof buildArtifacts> {
  return (
    buildArtifacts as unknown as (
      config: RouterConfig,
      controlPlane: ControlPlaneConfig["settings"],
    ) => ReturnType<typeof buildArtifacts>
  )(routerConfig, settings)
}

function createRouterConfig(): RouterConfig {
  return {
    profiles: { build: { model: "openai/gpt-5" } },
    routes: {},
    defaultRoute: "build",
  }
}

function parseRuntimeMetadata(content: string) {
  return JSON.parse(content) as {
    agents: Record<string, { profile: string; profiles: string[]; codexFast: boolean }>
  }
}

describe("renderAgentFile", () => {
  it("renders hidden subagent frontmatter and marker", () => {
    const output = renderAgentFile({
      agentName: "spr-build",
      description: "Implementation lane",
      model: "openai/gpt-5",
      variant: "medium",
      temperature: 0.1,
      permissionTask: { "*": "deny", "spr-review": "allow", "spr-verify": "allow" },
    })

    expect(output).toContain("mode: subagent")
    expect(output).toContain("hidden: true")
    expect(output).toContain("generated-by: oh-my-superagents")
    expect(output).toContain("spr-review")
  })
})

describe("renderCommandFile", () => {
  it("renders exact skill handoff payload", () => {
    const output = renderCommandFile({
      description: "Route brainstorming",
      agentName: "spr-strategy",
      skillName: "superpowers/brainstorming",
      phase: "brainstorming",
    })

    expect(output).toContain("agent: 'spr-strategy'")
    expect(output).toContain("subtask: true")
    expect(output).toContain("superpowers/brainstorming")
    expect(output).toContain("arguments: $ARGUMENTS")
  })
})

describe("renderControlPlaneCommandFile", () => {
  it("embeds stable Stage 1 ownership metadata", () => {
    const output = renderControlPlaneCommandFile({
      description: "Show OMS status for OpenCode.",
      logicalCommand: "status",
      renderedName: "oms-status",
    })

    expect(output).toContain("generated-by: oh-my-superagents")
    expect(output).toContain(
      "oms-control-plane: stage=1; host=opencode; artifact=command; logical-command=status; rendered-name=oms-status",
    )
  })
})

describe("buildArtifacts", () => {
  it("materializes the full fixed v1 command set", () => {
    const artifacts = buildArtifacts({
      profiles: { build: { model: "openai/gpt-5" } },
      routes: {},
      defaultRoute: "build",
    })

    expect(
      artifacts.commands
        .filter((item) => item.directory === ".opencode/commands")
        .map((item: { fileName: string }) => item.fileName),
    ).toEqual([
      "sp-brainstorm.md",
      "sp-plan.md",
      "sp-execute.md",
      "sp-review.md",
      "sp-verify.md",
      "sp-visual.md",
      "sp-web-test.md",
    ])
  })

  it("generates an OpenCode runtime metadata artifact for codexFast-enabled agents", () => {
    const artifacts = buildArtifacts({
      workflow: { kind: "superpowers" },
      profiles: {
        build: { model: "gpt-5.4", codexFast: true },
      },
      routes: {},
      defaultRoute: "build",
    } as never)

    const runtimeFile = artifacts.commands.find((item) => item.fileName === "runtime-agent-metadata.json")

    expect(runtimeFile).toBeDefined()
    expect(runtimeFile?.directory).toBe(".opencode/oh-my-superagents")
    expect(runtimeFile?.content).not.toContain("generated-by: oh-my-superagents")
    expect(parseRuntimeMetadata(runtimeFile?.content ?? "")).toEqual({
      agents: expect.objectContaining({
        "spr-build": {
          profile: "build",
          profiles: ["build"],
          codexFast: true,
        },
      }),
    })
  })

  it("includes codexFast false or absent agents in the runtime metadata without enabling them", () => {
    const artifacts = buildArtifacts({
      workflow: { kind: "superpowers" },
      profiles: {
        strategy: { model: "openai/gpt-5" },
        build: { model: "gpt-5.4", codexFast: true },
      },
      routes: { brainstorming: "strategy" },
      defaultRoute: "build",
    } as never)

    const runtimeFile = artifacts.commands.find((item) => item.fileName === "runtime-agent-metadata.json")

    expect(runtimeFile).toBeDefined()
    expect(parseRuntimeMetadata(runtimeFile?.content ?? "")).toEqual({
      agents: expect.objectContaining({
        "spr-strategy": {
          profile: "strategy",
          profiles: ["strategy"],
          codexFast: false,
        },
        "spr-build": {
          profile: "build",
          profiles: ["build"],
          codexFast: true,
        },
      }),
    })
  })

  it("allows shared OpenCode agents to retain multiple profile ids when codexFast semantics match", () => {
    const artifacts = buildArtifacts({
      workflow: { kind: "superpowers" },
      profiles: {
        visualA: { model: "google/gemini-2.5-pro", variant: "high" },
        visualB: { model: "google/gemini-2.5-pro", variant: "high" },
      },
      routes: {
        "frontend-design": "visualA",
        "webapp-testing": "visualB",
      },
      defaultRoute: "visualA",
    } as never)

    const runtimeFile = artifacts.commands.find((item) => item.fileName === "runtime-agent-metadata.json")

    expect(runtimeFile).toBeDefined()
    expect(parseRuntimeMetadata(runtimeFile?.content ?? "")).toEqual({
      agents: expect.objectContaining({
        "spr-visual": {
          profile: "visualA",
          profiles: ["visualA", "visualB"],
          codexFast: false,
        },
      }),
    })
  })

  it("keeps shared OpenCode agents conflicting when matching selections disagree on codexFast", () => {
    expect(() =>
      buildArtifacts({
        workflow: { kind: "superpowers" },
        profiles: {
          visualA: { model: "google/gemini-2.5-pro", variant: "high", codexFast: true },
          visualB: { model: "google/gemini-2.5-pro", variant: "high" },
        },
        routes: {
          "frontend-design": "visualA",
          "webapp-testing": "visualB",
        },
        defaultRoute: "visualA",
      } as never),
    ).toThrow(/spr-visual/)
  })

  it("fails when a built-in phase has no route and no defaultRoute", () => {
    expect(() =>
      buildArtifacts({
        profiles: { review: { model: "anthropic/claude-sonnet-4-5" } },
        routes: { "requesting-code-review": "review" },
      }),
    ).toThrow(/brainstorming/)
  })

  it("fails when shared agent phases resolve to different selections", () => {
    expect(() =>
      buildArtifacts({
        profiles: {
          visualA: { model: "google/gemini-2.5-pro", variant: "high" },
          visualB: { model: "google/gemini-2.5-flash", variant: "low" },
        },
        routes: {
          "frontend-design": "visualA",
          "webapp-testing": "visualB",
        },
        defaultRoute: "visualA",
      }),
    ).toThrow(/spr-visual/)
  })

  it("uses the effective lane when generating shared agents", () => {
    const artifacts = buildArtifacts({
      profiles: {
        backend: { model: "openai/gpt-5" },
        frontend: { model: "google/gemini-2.5-pro", variant: "high" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "frontend" },
          defaultRoute: "frontend",
        },
      },
      routes: {},
      defaultRoute: "backend",
      effectiveLane: "frontend",
    } as RouterConfig)

    const strategyAgent = artifacts.agents.find((item) => item.fileName === "spr-strategy.md")

    expect(strategyAgent?.content).toContain("google/gemini-2.5-pro")
  })

  it("renders direct-mode OpenCode commands for workflow intents", () => {
    const artifacts = buildArtifacts({
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
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { plan: "planner" },
          defaultRoute: "builder",
        },
      },
      routes: {},
      defaultRoute: "builder",
      effectiveLane: "frontend",
    } as never)

    expect(artifacts.commands.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["ai-plan.md", "ai-build.md"]),
    )
  })

  it("rejects unsafe direct-mode intent ids before generating OpenCode artifact filenames", () => {
    expect(() =>
      buildArtifacts({
        workflow: {
          kind: "direct",
          intents: {
            "foo/bar": { label: "Plan" },
          },
        },
        profiles: {
          planner: { model: "openai/gpt-5" },
        },
        routes: {
          "foo/bar": "planner",
        },
        defaultRoute: "planner",
      } as never),
    ).toThrow(/invalid direct intent id|foo\/bar/i)
  })

  it("renders direct-mode agents without upstream superpowers skill handoff", () => {
    const artifacts = buildArtifacts({
      workflow: {
        kind: "direct",
        intents: { plan: { label: "Plan" } },
      },
      profiles: { planner: { model: "openai/gpt-5" } },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { plan: "planner" },
          defaultRoute: "planner",
        },
      },
      routes: {},
      defaultRoute: "planner",
      effectiveLane: "frontend",
    } as never)

    const command = artifacts.commands.find((item) => item.fileName === "ai-plan.md")
    const agent = artifacts.agents.find((item) => item.fileName === "rt-plan.md")

    expect(command?.content).toContain("intent: plan")
    expect(command?.content).not.toContain("Load and follow the upstream skill")
    expect(agent?.content).not.toContain("Load the upstream superpowers skill")
  })

  it("renders lane-scoped execute commands and agents for subagent-driven-development", () => {
    const artifacts = buildArtifactsWithControlPlane(
      {
        workflow: { kind: "superpowers" },
        profiles: {
          frontendBuild: { model: "openai/gpt-5" },
          backendBuild: { model: "gpt-5.4" },
        },
        lanes: {
          frontend: { label: "Frontend", routes: {}, defaultRoute: "frontendBuild" },
          backend: { label: "Backend", routes: {}, defaultRoute: "backendBuild" },
        },
        routes: {},
        defaultRoute: "backendBuild",
        effectiveLane: "backend",
      } as never,
      {
        ...createDefaultControlPlaneConfig().settings,
        subagentExecution: { mode: "suggest" },
      },
    )

    expect(artifacts.commands.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["sp-execute.md", "sp-execute-frontend.md", "sp-execute-backend.md"]),
    )
    expect(artifacts.agents.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["spr-build.md", "spr-build--frontend.md", "spr-build--backend.md"]),
    )

    const frontendCommand = artifacts.commands.find((item) => item.fileName === "sp-execute-frontend.md")
    const frontendAgent = artifacts.agents.find((item) => item.fileName === "spr-build--frontend.md")
    const backendAgent = artifacts.agents.find((item) => item.fileName === "spr-build--backend.md")

    expect(frontendCommand?.content).toContain("agent: 'spr-build--frontend'")
    expect(frontendCommand?.content).toContain("superpowers/subagent-driven-development")
    expect(frontendCommand?.content).toContain("lane: frontend")
    expect(frontendCommand?.ownerPrefix).toBe("sp-execute-")

    expect(frontendAgent?.content).toContain("model: 'openai/gpt-5'")
    expect(frontendAgent?.ownerPrefix).toBe("spr-build--")
    expect(backendAgent?.content).toContain("model: 'gpt-5.4'")
  })

  it("allows the main execute agent to dispatch lane-scoped execute agents", () => {
    const artifacts = buildArtifactsWithControlPlane(
      {
        workflow: { kind: "superpowers" },
        profiles: {
          frontendBuild: { model: "openai/gpt-5" },
          backendBuild: { model: "gpt-5.4" },
        },
        lanes: {
          frontend: { label: "Frontend", routes: {}, defaultRoute: "frontendBuild" },
          backend: { label: "Backend", routes: {}, defaultRoute: "backendBuild" },
        },
        routes: {},
        defaultRoute: "backendBuild",
      } as never,
      {
        ...createDefaultControlPlaneConfig().settings,
        subagentExecution: { mode: "suggest" },
      },
    )

    const mainExecuteAgent = artifacts.agents.find((item) => item.fileName === "spr-build.md")

    expect(mainExecuteAgent?.content).toContain('"spr-build--frontend": allow')
    expect(mainExecuteAgent?.content).toContain('"spr-build--backend": allow')
  })

  it("adds suggest-mode split guidance to the main execute command", () => {
    const artifacts = buildArtifactsWithControlPlane(
      {
        workflow: { kind: "superpowers" },
        profiles: {
          frontendBuild: { model: "openai/gpt-5" },
          backendBuild: { model: "gpt-5.4" },
        },
        lanes: {
          frontend: { label: "Frontend", routes: {}, defaultRoute: "frontendBuild" },
          backend: { label: "Backend", routes: {}, defaultRoute: "backendBuild" },
        },
        routes: {},
        defaultRoute: "backendBuild",
      } as never,
      {
        ...createDefaultControlPlaneConfig().settings,
        subagentExecution: { mode: "suggest" },
      },
    )

    const execute = artifacts.commands.find((item) => item.fileName === "sp-execute.md")

    expect(execute?.content).toContain("If the task spans multiple lanes")
    expect(execute?.content).toContain("wait for user confirmation")
    expect(execute?.content).toContain("sp-execute-frontend")
    expect(execute?.content).toContain("sp-execute-backend")
  })

  it("omits lane-scoped execute helpers for globally-defined lanes outside the active preset", () => {
    const artifacts = buildArtifactsWithControlPlane(
      {
        workflow: { kind: "superpowers" },
        profiles: {
          frontendBuild: { model: "openai/gpt-5" },
          backendBuild: { model: "gpt-5.4" },
          reviewBuild: { model: "anthropic/claude-sonnet-4-5" },
        },
        lanes: {
          frontend: { label: "Frontend", routes: {}, defaultRoute: "frontendBuild" },
          backend: { label: "Backend", routes: {}, defaultRoute: "backendBuild" },
          review: { label: "Review", routes: {}, defaultRoute: "reviewBuild" },
        },
        availableLanes: ["frontend", "backend"],
        routes: {},
        defaultRoute: "backendBuild",
      } as never,
      {
        ...createDefaultControlPlaneConfig().settings,
        subagentExecution: { mode: "suggest" },
      },
    )

    expect(artifacts.commands.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["sp-execute-frontend.md", "sp-execute-backend.md"]),
    )
    expect(artifacts.agents.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["spr-build--frontend.md", "spr-build--backend.md"]),
    )
    expect(artifacts.commands.map((item) => item.fileName)).not.toContain("sp-execute-review.md")
    expect(artifacts.agents.map((item) => item.fileName)).not.toContain("spr-build--review.md")
  })

  it("does not materialize unsupported direct-mode control-plane wrappers that would otherwise collide", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    const artifacts = buildArtifactsWithControlPlane(
      {
        workflow: {
          kind: "direct",
          intents: { plan: { label: "Plan" } },
        },
        profiles: { planner: { model: "openai/gpt-5" } },
        lanes: {
          frontend: {
            label: "Frontend",
            routes: { plan: "planner" },
            defaultRoute: "planner",
          },
        },
        routes: {},
        defaultRoute: "planner",
        effectiveLane: "frontend",
      } as never,
      {
        ...defaults,
        commandPrefix: "ai",
        commands: {
          ...defaults.commands,
          use: {
            name: "plan",
            aliases: [],
          },
        },
      },
    )

    expect(artifacts.commands.map((item) => item.fileName)).toContain("ai-plan.md")
    expect(artifacts.commands.map((item) => item.fileName)).not.toContain("ai-plan.md.md")
  })

  it("renders one .opencode/commands file per primary OMS command", () => {
    const settings = createDefaultControlPlaneConfig().settings
    const artifacts = buildArtifactsWithControlPlane(createRouterConfig(), settings)

    expect(
      artifacts.commands
        .filter((item) => item.directory === ".opencode/commands")
        .map((item) => item.fileName),
    ).toEqual(
      expect.arrayContaining([
        "oms-status.md",
        "oms-use.md",
        "oms-off.md",
        "oms-sync.md",
        "oms-doctor.md",
      ]),
    )
  })

  it("renders one extra .opencode/commands file per OMS alias", () => {
    const settings = createDefaultControlPlaneConfig().settings
    const artifacts = buildArtifactsWithControlPlane(createRouterConfig(), settings)

    expect(
      artifacts.commands
        .filter((item) => item.fileName.startsWith("oms-") && item.fileName !== "oms-no-superpowers.md")
        .map((item) => item.fileName)
        .sort(),
    ).toEqual([
      "oms-doctor.md",
      "oms-dr.md",
      "oms-o.md",
      "oms-off.md",
      "oms-st.md",
      "oms-status.md",
      "oms-sy.md",
      "oms-sync.md",
      "oms-u.md",
      "oms-use.md",
    ])
  })

  it("omits direct-mode OpenCode use and disable wrappers", () => {
    const settings = createDefaultControlPlaneConfig().settings
    const artifacts = buildArtifactsWithControlPlane({
      workflow: {
        kind: "direct",
        intents: { plan: { label: "Plan" } },
      },
      profiles: { planner: { model: "openai/gpt-5" } },
      routes: { plan: "planner" },
      defaultRoute: "planner",
    } as never, settings)

    const commandFileNames = artifacts.commands
      .filter((item) => item.directory === ".opencode/commands")
      .map((item) => item.fileName)

    expect(commandFileNames).not.toContain("oms-use.md")
    expect(commandFileNames).not.toContain("oms-u.md")
    expect(commandFileNames).not.toContain("oms-off.md")
    expect(commandFileNames).not.toContain("oms-o.md")
  })

  it("respects the configured OMS command prefix", () => {
    const defaults = createDefaultControlPlaneConfig().settings
    const artifacts = buildArtifactsWithControlPlane(createRouterConfig(), {
      ...defaults,
      commandPrefix: "team",
      commands: {
        ...defaults.commands,
        status: {
          name: "state",
          aliases: ["stat"],
        },
      },
    })

    expect(artifacts.commands.map((item) => item.fileName)).toEqual(
      expect.arrayContaining(["team-state.md", "team-stat.md"]),
    )
    expect(artifacts.commands.map((item) => item.fileName)).not.toEqual(
      expect.arrayContaining(["oms-status.md", "oms-st.md"]),
    )
  })

  it("delegates each OMS command wrapper to the logical CLI command", () => {
    const settings = createDefaultControlPlaneConfig().settings
    const artifacts = buildArtifactsWithControlPlane(createRouterConfig(), settings)
    const primary = artifacts.commands.find((item) => item.fileName === "oms-use.md")
    const alias = artifacts.commands.find((item) => item.fileName === "oms-u.md")

    expect(primary?.content).toContain("Run `oh-my-superagents use --host opencode $ARGUMENTS` from the repository root.")
    expect(alias?.content).toContain("Run `oh-my-superagents use --host opencode $ARGUMENTS` from the repository root.")
  })

  it("rejects OMS wrappers that would collide with reserved sp-* phase commands", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    expect(() =>
      buildArtifactsWithControlPlane(createRouterConfig(), {
        ...defaults,
        commandPrefix: "sp",
        commands: {
          ...defaults.commands,
          status: {
            name: "brainstorm",
            aliases: [],
          },
        },
      }),
    ).toThrow(/reserved|collision|sp-brainstorm/i)
  })

  it("rejects duplicate OMS rendered aliases across logical commands", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    expect(() =>
      buildArtifactsWithControlPlane(createRouterConfig(), {
        ...defaults,
        commands: {
          ...defaults.commands,
          status: {
            ...defaults.commands.status,
            aliases: ["same"],
          },
          doctor: {
            ...defaults.commands.doctor,
            aliases: ["same"],
          },
        },
      }),
    ).toThrow(/duplicate|unique|same/i)
  })

  it("rejects an OMS alias that matches its primary rendered name", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    expect(() =>
      buildArtifactsWithControlPlane(createRouterConfig(), {
        ...defaults,
        commands: {
          ...defaults.commands,
          status: {
            name: "status",
            aliases: ["status"],
          },
        },
      }),
    ).toThrow(/duplicate|unique|status/i)
  })

  it("renders a fixed OpenCode helper command with the required temporary-disable wording", () => {
    const artifacts = buildArtifactsWithControlPlane(
      createRouterConfig(),
      createDefaultControlPlaneConfig().settings,
    )

    const helper = artifacts.commands.find((item) => item.fileName === "oms-no-superpowers.md")

    expect(helper).toBeDefined()
    expect(helper?.content).toContain("do not use superpowers in this conversation")
    expect(helper?.content).toContain(
      "do not proactively load superpowers skills, workflows, or phase agents",
    )
    expect(helper?.content).toContain("only use superpowers again if I explicitly ask")
    expect(helper?.content).toContain("You can add extra freeform arguments via $ARGUMENTS.")
  })

  it("uses helper-specific ownership for the temporary-disable helper", () => {
    const artifacts = buildArtifactsWithControlPlane(
      createRouterConfig(),
      createDefaultControlPlaneConfig().settings,
    )

    const helper = artifacts.commands.find((item) => item.fileName === "oms-no-superpowers.md")

    expect(helper?.ownerPrefix).toBe("oms-no-superpowers.md")
    expect(helper?.ownerPrefix).not.toBe("oms-")
  })

  it("keeps the temporary-disable helper outside the configurable control-plane command set", () => {
    const defaults = createDefaultControlPlaneConfig().settings
    const artifacts = buildArtifactsWithControlPlane(createRouterConfig(), {
      ...defaults,
      commandPrefix: "team",
    })

    const helper = artifacts.commands.find((item) => item.fileName === "oms-no-superpowers.md")

    expect(artifacts.commands.map((item) => item.fileName)).toContain("oms-no-superpowers.md")
    expect(artifacts.commands.map((item) => item.fileName)).not.toContain("team-no-superpowers.md")
    expect(helper?.ownerPrefix).toBe("oms-no-superpowers.md")
  })

  it("rejects configurable OMS commands that collide with the fixed temporary-disable helper path", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    expect(() =>
      buildArtifactsWithControlPlane(createRouterConfig(), {
        ...defaults,
        commands: {
          ...defaults.commands,
          status: {
            name: "no-superpowers",
            aliases: [],
          },
        },
      }),
    ).toThrow(/duplicate|collision|oms-no-superpowers/i)
  })
})

describe("listRenderedOpenCodeControlPlaneCommands", () => {
  it("computes rendered OMS command names from the configured prefix and aliases", () => {
    const helper = (opencode as Record<string, unknown>).listRenderedOpenCodeControlPlaneCommands as
      | ((settings: ControlPlaneConfig["settings"]) => Record<string, string[]>)
      | undefined

    expect(helper).toBeTypeOf("function")

    const rendered = helper?.({
      ...createDefaultControlPlaneConfig().settings,
      commandPrefix: "team",
      commands: {
        status: { name: "state", aliases: ["stat"] },
        use: { name: "switch", aliases: ["sw"] },
        disable: { name: "off", aliases: ["o"] },
        sync: { name: "sync", aliases: ["sy"] },
        doctor: { name: "doctor", aliases: ["dr"] },
      },
    })

    expect(rendered).toEqual({
      status: ["team-state", "team-stat"],
      use: ["team-switch", "team-sw"],
      disable: ["team-off", "team-o"],
      sync: ["team-sync", "team-sy"],
      doctor: ["team-doctor", "team-dr"],
    })
  })
})
