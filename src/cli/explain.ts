import path from "node:path"
import { BUILT_IN_PHASES } from "../config.js"
import { buildClaudeArtifacts } from "../claude.js"
import { resolvePhase, resolveRoute, type BuiltInPhase } from "../router.js"
import { loadRouterConfig } from "../config.js"
import type { CliDeps, ExplainCliHost } from "./types.js"

export function explainDirectIntent(config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], intent: string) {
  const resolved = resolveRoute(config, intent)

  return {
    intent,
    canonicalRoute: resolved.canonicalRoute,
    profileId: resolved.profileId,
    effectiveLane: resolved.effectiveLane,
    routeSource: resolved.routeSource,
    resolvedSource: resolved.resolvedSource,
    model: resolved.selection.model,
    variant: resolved.selection.variant,
    commandName: `ai-${intent}`,
    agentName: `rt-${intent}`,
  }
}

export function explainAllDirect(config: Awaited<ReturnType<typeof loadRouterConfig>>["config"]) {
  if (config.workflow.kind !== "direct") {
    return []
  }

  return Object.keys(config.workflow.intents).map((intent) => explainDirectIntent(config, intent))
}

export function explainClaudePhase(config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], phase: BuiltInPhase) {
  const resolved = resolvePhase(config, phase)
  const skill = buildClaudeArtifacts(config).skills[BUILT_IN_PHASES.indexOf(phase)]

  return {
    phase,
    canonicalRoute: resolved.canonicalRoute,
    profileId: resolved.profileId,
    effectiveLane: resolved.effectiveLane,
    routeSource: resolved.routeSource,
    resolvedSource: resolved.resolvedSource,
    model: resolved.selection.model,
    variant: resolved.selection.variant,
    skillName: skill ? path.basename(skill.directory) : undefined,
  }
}

export function explainAllClaude(config: Awaited<ReturnType<typeof loadRouterConfig>>["config"]) {
  const skills = buildClaudeArtifacts(config).skills

  return BUILT_IN_PHASES.map((phase, index) => {
    const resolved = resolvePhase(config, phase)
    const skill = skills[index]

    return {
      phase,
      canonicalRoute: resolved.canonicalRoute,
      profileId: resolved.profileId,
      effectiveLane: resolved.effectiveLane,
      routeSource: resolved.routeSource,
      resolvedSource: resolved.resolvedSource,
      model: resolved.selection.model,
      variant: resolved.selection.variant,
      skillName: skill ? path.basename(skill.directory) : undefined,
    }
  })
}

export function explainAllForCliHost(
  config: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  host: ExplainCliHost,
  deps: CliDeps,
) {
  return host === "claude" ? explainAllClaude(config) : deps.explainAllForHost(config, host)
}

export function explainPhaseForCliHost(
  config: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  host: ExplainCliHost,
  phase: BuiltInPhase,
  deps: CliDeps,
) {
  return host === "claude" ? explainClaudePhase(config, phase) : deps.explainPhaseForHost(config, host, phase)
}
