import { describe, expect, it } from "vitest"
import { createDefaultControlPlaneConfig, type ControlPlaneConfig, type RouterConfig } from "../src/config.js"
import { buildArtifacts, renderAgentFile, renderCommandFile, renderControlPlaneCommandFile } from "../src/opencode.js"

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
        .filter((item) => item.fileName.startsWith("oms-"))
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
})
