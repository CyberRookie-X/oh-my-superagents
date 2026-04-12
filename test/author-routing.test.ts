import { describe, expect, it } from "vitest"
import {
  applyRoutingProposalToConfig,
  buildRoutingProposal,
  inspectRoutingAuthoringInputs,
} from "../src/author-routing.js"
import { resolveRoute } from "../src/router.js"

describe("inspectRoutingAuthoringInputs", () => {
  it("detects likely frontend/backend lanes from repo signals", async () => {
    const files = new Set([
      "/workspace/project/package.json",
      "/workspace/project/src/components/App.tsx",
      "/workspace/project/server/main.py",
    ])

    const result = await inspectRoutingAuthoringInputs({
      cwd: "/workspace/project",
      exists: async (filePath) => files.has(filePath),
      readFile: async (filePath) =>
        filePath.endsWith("package.json")
          ? JSON.stringify({ dependencies: { react: "18.0.0" } })
          : "",
      readdir: async () => [],
    })

    expect(result.suggestedLanes).toEqual(["frontend", "backend"])
  })
})

describe("buildRoutingProposal", () => {
  it("builds a deterministic routing proposal from repo signals and model inventory", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: ["frontend", "backend"],
      inventory: {
        models: {
          "frontend-build": { model: "openai/gpt-5", specialties: ["frontend", "build"] },
          "backend-build": { model: "gpt-5.4", specialties: ["backend", "build"] },
          "review-heavy": {
            model: "anthropic/claude-sonnet-4-5-20250929",
            specialties: ["review"],
          },
        },
      },
    })

    expect(proposal.profiles["frontend-build"].model).toBe("openai/gpt-5")
    expect(proposal.lanes.frontend.defaultRoute).toBe("frontend-build")
    expect(proposal.lanes.backend.routes.review).toBe("review-heavy")
    expect(proposal.presets.default.usesLanes).toEqual(["frontend", "backend"])
    expect(proposal.workflow).toEqual({
      kind: "direct",
      intents: {
        build: { label: "Build" },
        review: { label: "Review" },
      },
    })
  })

  it("keeps the default route valid when no known lanes are suggested", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: [],
      inventory: {
        models: {
          builder: { model: "openai/gpt-5", specialties: ["build"] },
        },
      },
    })

    expect(proposal.profiles).toEqual({
      builder: { model: "openai/gpt-5" },
    })
    expect(proposal.lanes).toEqual({})
    expect(proposal.presets.default.defaultRoute).toBe("builder")
    expect(proposal.presets.default.usesLanes).toEqual([])
    expect(proposal.workflow).toEqual({
      kind: "direct",
      intents: {
        build: { label: "Build" },
      },
    })
  })

  it("uses build and review inventory support for mixed zero-lane direct proposals", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: [],
      inventory: {
        models: {
          "review-heavy": {
            model: "anthropic/claude-sonnet-4-5-20250929",
            specialties: ["review"],
          },
          "worker-build": {
            model: "openai/gpt-5",
            specialties: ["build"],
          },
        },
      },
    })

    expect(proposal.profiles).toEqual({
      "review-heavy": { model: "anthropic/claude-sonnet-4-5-20250929" },
      "worker-build": { model: "openai/gpt-5" },
    })
    expect(proposal.lanes).toEqual({})
    expect(proposal.presets.default.defaultRoute).toBe("worker-build")
    expect(proposal.presets.default.usesLanes).toEqual([])
    expect(proposal.workflow).toEqual({
      kind: "direct",
      intents: {
        build: { label: "Build" },
        review: { label: "Review" },
      },
    })
  })

  it("emits only supported intents for a review-only zero-lane direct proposal", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: [],
      inventory: {
        models: {
          "review-heavy": {
            model: "anthropic/claude-sonnet-4-5-20250929",
            specialties: ["review"],
          },
        },
      },
    })

    expect(proposal.workflow).toEqual({
      kind: "direct",
      intents: {
        review: { label: "Review" },
      },
    })
    expect(proposal.presets.default.routes).toEqual({
      review: "review-heavy",
    })
  })

  it("routes zero-lane direct review intents to the review profile", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: [],
      inventory: {
        models: {
          "review-heavy": {
            model: "anthropic/claude-sonnet-4-5-20250929",
            specialties: ["review"],
          },
          "worker-build": {
            model: "openai/gpt-5",
            specialties: ["build"],
          },
        },
      },
    })

    expect(resolveRoute(asRouterConfig(proposal), "review").profileId).toBe("review-heavy")
  })

  it("omits build for lane-backed review-only direct proposals", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: ["frontend"],
      inventory: {
        models: {
          "frontend-review": {
            model: "anthropic/claude-sonnet-4-5-20250929",
            specialties: ["frontend", "review"],
          },
        },
      },
    })

    expect(proposal.lanes.frontend.defaultRoute).toBe("frontend-review")
    expect(proposal.workflow).toEqual({
      kind: "direct",
      intents: {
        review: { label: "Review" },
      },
    })
  })

  it("keeps superpowers review-only proposals loadable without illegal review route keys", () => {
    const proposal = buildRoutingProposal({
      mode: "superpowers",
      suggestedLanes: [],
      inventory: {
        models: {
          "review-heavy": {
            model: "anthropic/claude-sonnet-4-5-20250929",
            specialties: ["review"],
          },
        },
      },
    })

    expect(proposal.workflow).toEqual({ kind: "superpowers" })
    expect(proposal.presets.default.routes).toEqual({})
    expect(resolveRoute(asRouterConfig(proposal), "brainstorming").profileId).toBe("review-heavy")
  })

  it("creates a new layered config document from a routing proposal", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: ["frontend"],
      inventory: {
        models: {
          builder: { model: "openai/gpt-5", specialties: ["frontend", "build"] },
        },
      },
    })

    const document = applyRoutingProposalToConfig(proposal)

    expect(document.workflow).toEqual(proposal.workflow)
    expect(document.settings?.activePreset).toBe("default")
    expect(document.profiles).toEqual(proposal.profiles)
    expect(document.lanes).toEqual(proposal.lanes)
    expect(document.presets).toEqual(proposal.presets)
  })

  it("merges proposed routing sections conservatively into an existing config", () => {
    const proposal = buildRoutingProposal({
      mode: "direct",
      suggestedLanes: ["frontend"],
      inventory: {
        models: {
          builder: { model: "openai/gpt-5", specialties: ["frontend", "build"] },
        },
      },
    })

    const document = applyRoutingProposalToConfig(proposal, {
      workflow: { kind: "superpowers" },
      settings: {
        activePreset: "default",
        enabled: true,
        commandPrefix: "oms",
        laneSelection: { mode: "suggest" },
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
        existing: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
      },
      lanes: {
        ops: {
          label: "Ops",
          routes: {},
          defaultRoute: "existing",
        },
      },
      presets: {
        default: {
          label: "Default",
          short: "def",
          description: "Keep this description",
          usesLanes: ["ops"],
          routes: { brainstorming: "existing" },
          defaultRoute: "existing",
        },
      },
    })

    expect(document.workflow).toEqual(proposal.workflow)
    expect(document.settings?.commandPrefix).toBe("oms")
    expect(document.profiles).toEqual({
      existing: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
      builder: { model: "openai/gpt-5" },
    })
    expect(document.lanes).toEqual({
      ops: {
        label: "Ops",
        routes: {},
        defaultRoute: "existing",
      },
      frontend: proposal.lanes.frontend,
    })
    expect(document.presets.default).toEqual({
      label: "Default",
      short: "def",
      description: "Keep this description",
      usesLanes: ["ops", "frontend"],
      routes: { brainstorming: "existing" },
      defaultLane: "frontend",
      defaultRoute: "builder",
    })
  })
})

function asRouterConfig(proposal: ReturnType<typeof buildRoutingProposal>) {
  return {
    workflow: proposal.workflow,
    profiles: proposal.profiles,
    lanes: proposal.lanes,
    routes: proposal.presets.default.routes,
    defaultRoute: proposal.presets.default.defaultRoute,
  }
}
