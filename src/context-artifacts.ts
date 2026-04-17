import type { ContextLifecycleStage } from "./context-lifecycle.js"

export const CONTEXT_ARTIFACT_AUTHORITIES = ["authoritative", "derived", "advisory"] as const
export type ContextArtifactAuthority = (typeof CONTEXT_ARTIFACT_AUTHORITIES)[number]

export const CONTEXT_ARTIFACT_SOURCES = ["oms", "superpowers", "gstack", "gsd", "external"] as const
export type ContextArtifactSource = (typeof CONTEXT_ARTIFACT_SOURCES)[number]

export type ContextArtifact = {
  kind: "spec" | "plan" | "decision" | "knowledge" | "summary" | "checkpoint" | "review-log" | "verification" | "anchor" | "continue-packet" | "repo-pack" | "memory-snapshot"
  path: string
  authority: ContextArtifactAuthority
  source: ContextArtifactSource
  lifecycleStage?: ContextLifecycleStage
  updatedAt?: string
  headCommit?: string
  reviewedCommit?: string
  commitsSinceArtifact?: number
  staleAfter?: string
}

export type ContextArtifactFreshness = Pick<ContextArtifact, "headCommit" | "reviewedCommit" | "commitsSinceArtifact" | "staleAfter">

export type ResumePacket = {
  lifecycleStage: ContextLifecycleStage
  nextStep: string
  authoritativeArtifacts: string[]
  unresolvedDecisions: string[]
  requiredRechecks: string[]
  freshness?: ContextArtifactFreshness
}

export function createContextArtifact(input: ContextArtifact): ContextArtifact {
  return { ...input }
}

export function isContextArtifactFresh(input: {
  headCommit?: string
  reviewedCommit?: string
  commitsSinceArtifact?: number
  staleAfter?: string
  now?: string
}) {
  if ((input.commitsSinceArtifact ?? 0) > 0) {
    return false
  }

  if (input.reviewedCommit && input.headCommit && input.reviewedCommit !== input.headCommit) {
    return false
  }

  if (input.staleAfter && input.now && input.staleAfter < input.now) {
    return false
  }

  return true
}

export function buildResumePacket(input: ResumePacket): ResumePacket {
  return {
    lifecycleStage: input.lifecycleStage,
    nextStep: input.nextStep,
    authoritativeArtifacts: [...input.authoritativeArtifacts],
    unresolvedDecisions: [...input.unresolvedDecisions],
    requiredRechecks: [...input.requiredRechecks],
    freshness: input.freshness ? { ...input.freshness } : undefined,
  }
}
