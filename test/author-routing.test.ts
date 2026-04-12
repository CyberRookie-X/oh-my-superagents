import { describe, expect, it } from "vitest"
import { buildRoutingProposal, inspectRoutingAuthoringInputs } from "../src/author-routing.js"

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
})
