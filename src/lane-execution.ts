import type { ControlPlanePreset } from "./config.js"

export type LaneExecutionMode = "manual" | "suggest" | "auto"

export type LaneExecutionUnit = {
  lane: string
  laneSlug: string
  commandFileName: string
  agentFileName: string
}

export function listLaneExecutionUnits(input: {
  activePresetKey: string
  activePreset: Pick<ControlPlanePreset, "usesLanes">
}): LaneExecutionUnit[] {
  const seenSlugs = new Map<string, string>()

  return (input.activePreset.usesLanes ?? []).map((lane) => {
    const laneSlug = toLaneSlug(lane)
    const existingLane = seenSlugs.get(laneSlug)

    if (existingLane) {
      throw new Error(
        `Lane slug collision in preset ${input.activePresetKey}: ${existingLane} and ${lane} both map to ${laneSlug}`,
      )
    }

    seenSlugs.set(laneSlug, lane)

    return {
      lane,
      laneSlug,
      commandFileName: `sp-execute-${laneSlug}.md`,
      agentFileName: `spr-build--${laneSlug}.md`,
    }
  })
}

export function renderLaneSplitGuidance(input: {
  mode: LaneExecutionMode
  units: LaneExecutionUnit[]
}) {
  if (input.units.length === 0) {
    return ""
  }

  const renderedCommands = input.units.map((unit) => `\`sp-execute-${unit.laneSlug}\``).join(", ")

  if (input.mode === "manual") {
    return `Ask the user to split multi-lane work explicitly before dispatching lane helpers. Available lane helpers: ${renderedCommands}.`
  }

  if (input.mode === "auto") {
    return `Split the work across the matching lane helpers automatically when the task clearly spans multiple lanes. Available lane helpers: ${renderedCommands}.`
  }

  return `Suggest splitting multi-lane work before execution and point the user to the matching lane helpers. Available lane helpers: ${renderedCommands}.`
}

function toLaneSlug(lane: string) {
  const laneSlug = lane
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (laneSlug.length === 0) {
    throw new Error(`Lane ${lane} does not produce a host-safe slug`)
  }

  return laneSlug
}
