import { describe, expect, it } from "vitest"
import { listLaneExecutionUnits, renderLaneSplitGuidance } from "../src/lane-execution.js"

describe("listLaneExecutionUnits", () => {
  it("derives lane-scoped execution units from the active preset", () => {
    const units = listLaneExecutionUnits({
      activePresetKey: "default",
      activePreset: {
        label: "Default",
        short: "def",
        usesLanes: ["frontend", "backend"],
        defaultLane: "backend",
        routes: {},
        defaultRoute: "build",
      },
    })

    expect(units).toEqual([
      {
        lane: "frontend",
        laneSlug: "frontend",
        commandFileName: "sp-execute-frontend.md",
        agentFileName: "spr-build--frontend.md",
      },
      {
        lane: "backend",
        laneSlug: "backend",
        commandFileName: "sp-execute-backend.md",
        agentFileName: "spr-build--backend.md",
      },
    ])
  })

  it("uses stable lane slugs and rejects collisions", () => {
    expect(() =>
      listLaneExecutionUnits({
        activePresetKey: "default",
        activePreset: {
          label: "Default",
          short: "def",
          usesLanes: ["front-end", "front end"],
          routes: {},
          defaultRoute: "build",
        },
      }),
    ).toThrow(/slug collision|lane/i)
  })
})

describe("renderLaneSplitGuidance", () => {
  const units = [
    {
      lane: "frontend",
      laneSlug: "frontend",
      commandFileName: "sp-execute-frontend.md",
      agentFileName: "spr-build--frontend.md",
    },
    {
      lane: "backend",
      laneSlug: "backend",
      commandFileName: "sp-execute-backend.md",
      agentFileName: "spr-build--backend.md",
    },
  ]

  it("renders mode-aware split guidance for adapters", () => {
    expect(renderLaneSplitGuidance({ mode: "manual", units })).toContain("Ask the user to split")
    expect(renderLaneSplitGuidance({ mode: "suggest", units })).toContain("Suggest splitting")
    expect(renderLaneSplitGuidance({ mode: "auto", units })).toContain("Split the work across")
    expect(renderLaneSplitGuidance({ mode: "suggest", units })).toContain("`sp-execute-frontend`")
    expect(renderLaneSplitGuidance({ mode: "suggest", units })).toContain("`sp-execute-backend`")
  })
})
