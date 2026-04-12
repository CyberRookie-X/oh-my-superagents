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

    expect(artifacts.commands.map((item: { fileName: string }) => item.fileName)).toEqual([
      "sp-brainstorm.md",
      "sp-plan.md",
      "sp-execute.md",
      "sp-review.md",
      "sp-verify.md",
      "sp-visual.md",
      "sp-web-test.md",
    ])
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

  it("fails when a direct-mode command collides with an OMS control-plane command path", () => {
    const defaults = createDefaultControlPlaneConfig().settings

    expect(() =>
      buildArtifactsWithControlPlane(
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
      ),
    ).toThrow(/collision|ai-plan/i)
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
