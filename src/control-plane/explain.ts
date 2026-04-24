import type { ControlPlaneConfig, ControlPlanePreset } from "../config.js"
import { listLaneExecutionUnits } from "../lane-execution.js"
import type { SubagentExecutionDiagnostics, ResolvedControlPlane, LaneExplainability } from "./types.js"
import { STAGE_1_SUGGESTION_MESSAGE } from "./types.js"
import { resolveLaneState } from "./doctor.js"

export function summarizeLaneExplainability(resolved: ResolvedControlPlane): LaneExplainability {
  const laneState = (resolved as ResolvedControlPlane & { laneState?: ResolvedControlPlane["laneState"] }).laneState
    ?? resolveLaneState(resolved.config, resolved.activePreset)
  const laneSelection = { ...(resolved.config.settings.laneSelection ?? { mode: "suggest" as const }) }
  const mode = laneState.mode ?? laneSelection.mode

  return {
    allowedLanes: [...laneState.allowedLanes],
    presetDefaultLane: laneState.presetDefaultLane,
    defaultLane: laneState.defaultLane,
    effectiveLane: laneState.effectiveLane,
    runtimeLane: laneState.runtimeLane,
    mode,
    nonApplyingReason: laneState.nonApplyingReason ?? (mode === "suggest" ? STAGE_1_SUGGESTION_MESSAGE : undefined),
    laneSelection,
  }
}

export function summarizeSubagentExecutionDiagnostics(resolved: ResolvedControlPlane): SubagentExecutionDiagnostics {
  const laneState = (resolved as ResolvedControlPlane & { laneState?: ResolvedControlPlane["laneState"] }).laneState
    ?? resolveLaneState(resolved.config, resolved.activePreset)
  const availableLanes = [...laneState.allowedLanes]
  const units = listLaneExecutionUnits({
    activePresetKey: resolved.activePreset.key,
    activePreset: { usesLanes: availableLanes },
  })

  return {
    mode: resolved.config.settings.subagentExecution?.mode ?? "suggest",
    availableLanes,
    commandsByLane: Object.fromEntries(
      units.map((unit) => [unit.lane, unit.commandFileName.replace(/\.md$/, "")]),
    ),
  }
}
