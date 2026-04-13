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
    return `Only use lane-specific split execution when the user explicitly requests it. Available lane helpers: ${renderedCommands}.`
  }

  if (input.mode === "auto") {
    return `Apply the split plan automatically across the matching lane helpers when the task clearly spans multiple lanes. Available lane helpers: ${renderedCommands}.`
  }

  return `Propose a split plan across the matching lane helpers and wait for user confirmation before execution. Available lane helpers: ${renderedCommands}.`
}

function toLaneSlug(lane: string) {
  const normalizedLane = lane.normalize("NFC")
  const laneSlug = normalizedLane
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (laneSlug.length === 0) {
    return `lane-${hashLane(normalizedLane)}`
  }

  return laneSlug
}

function hashLane(lane: string) {
  let hash = 2166136261

  for (const character of lane) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}
