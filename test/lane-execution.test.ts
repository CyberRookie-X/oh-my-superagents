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

  it("normalizes Unicode-equivalent lane ids before slugging", () => {
    expect(() =>
      listLaneExecutionUnits({
        activePresetKey: "default",
        activePreset: {
          label: "Default",
          short: "def",
          usesLanes: ["caf\u00e9", "cafe\u0301"],
          routes: {},
          defaultRoute: "build",
        },
      }),
    ).toThrow(/caf.|slug collision|lane/i)
  })

  it("uses a deterministic fallback slug for pure non-ascii lanes", () => {
    const [firstUnit] = listLaneExecutionUnits({
      activePresetKey: "default",
      activePreset: {
        label: "Default",
        short: "def",
        usesLanes: ["前端"],
        routes: {},
        defaultRoute: "build",
      },
    })

    const [secondUnit] = listLaneExecutionUnits({
      activePresetKey: "default",
      activePreset: {
        label: "Default",
        short: "def",
        usesLanes: ["前端"],
        routes: {},
        defaultRoute: "build",
      },
    })

    expect(firstUnit?.lane).toBe("前端")
    expect(firstUnit?.laneSlug).toMatch(/^lane-[a-z0-9]+$/)
    expect(secondUnit?.laneSlug).toBe(firstUnit?.laneSlug)
    expect(firstUnit?.commandFileName).toBe(`sp-execute-${firstUnit?.laneSlug}.md`)
    expect(firstUnit?.agentFileName).toBe(`spr-build--${firstUnit?.laneSlug}.md`)
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
    const manual = renderLaneSplitGuidance({ mode: "manual", units })
    const suggest = renderLaneSplitGuidance({ mode: "suggest", units })
    const auto = renderLaneSplitGuidance({ mode: "auto", units })

    expect(manual).toContain("Only use lane-specific split execution when the user explicitly requests it")
    expect(manual).not.toContain("Suggest")
    expect(manual).not.toContain("confirm")
    expect(manual).not.toContain("automatically")

    expect(suggest).toContain("Propose a split plan")
    expect(suggest).toContain("wait for user confirmation")
    expect(suggest).toContain("`sp-execute-frontend`")
    expect(suggest).toContain("`sp-execute-backend`")

    expect(auto).toContain("Apply the split plan automatically")
    expect(auto).not.toContain("wait for user confirmation")
  })
})
