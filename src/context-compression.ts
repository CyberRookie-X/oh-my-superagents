import {
  buildResumePacket,
  isContextArtifactFresh,
  type ContextArtifact,
  type ContextArtifactFreshness,
  type ResumePacket,
} from "./context-artifacts.js"
import {
  summarizeContextProviders,
  type ContextProviderAvailabilitySummary,
} from "./context-index.js"
import type { ContextLifecycleStage } from "./context-lifecycle.js"
import type { ResolvedContextProvider } from "./context-providers.js"
import { type ContextPackId, type EffectiveContextCompressionPolicy } from "./context-packs.js"

const BUILTIN_COMPRESSION_TRUNCATION_NOTICE = "\n\n[...truncated by OMS built-in compression]"

type BuiltinCompressionArtifact = ContextArtifact & {
  content: string
}

type BuiltinCompressionSelection = {
  lifecycleStage: ContextLifecycleStage
  packIds: ContextPackId[]
  artifacts: BuiltinCompressionArtifact[]
  policy: EffectiveContextCompressionPolicy
}

export type BuiltinCompressionBundle = {
  packIds: ContextPackId[]
  entries: Array<{
    path: string
    kind: ContextArtifact["kind"]
    content: string
  }>
}

export type EnhancedCompressionBundle = BuiltinCompressionBundle & {
  summary: string | null
  warnings: string[]
}

export function buildBuiltinCompressionBundle(input: {
  selection: BuiltinCompressionSelection
  maxCharsPerArtifact: number
}): BuiltinCompressionBundle {
  return {
    packIds: [...input.selection.packIds],
    entries: input.selection.artifacts.map((artifact) => ({
      path: artifact.path,
      kind: artifact.kind,
      content: truncateMarkdownStructurally(artifact.content, input.maxCharsPerArtifact),
    })),
  }
}

export function enhanceCompressionBundleWithSummary(input: {
  bundle: BuiltinCompressionBundle
  summarizer?: (bundle: BuiltinCompressionBundle) => string
  warnings?: string[]
}): EnhancedCompressionBundle {
  return {
    ...input.bundle,
    summary: input.summarizer ? input.summarizer(input.bundle) : null,
    warnings: input.warnings ? [...input.warnings] : [],
  }
}

export function truncateMarkdownStructurally(content: string, maxChars: number) {
  const normalizedMaxChars = Math.max(0, maxChars)

  if (content.length <= normalizedMaxChars) {
    return content
  }

  if (normalizedMaxChars <= BUILTIN_COMPRESSION_TRUNCATION_NOTICE.length) {
    return BUILTIN_COMPRESSION_TRUNCATION_NOTICE.slice(0, normalizedMaxChars)
  }

  const maxContentChars = normalizedMaxChars - BUILTIN_COMPRESSION_TRUNCATION_NOTICE.length
  const boundaryIndex = findLastMarkdownBoundaryStart(content, maxContentChars)
  const truncatedContent = boundaryIndex > 0
    ? content.slice(0, boundaryIndex)
    : content.slice(0, maxContentChars)

  return `${truncatedContent}${BUILTIN_COMPRESSION_TRUNCATION_NOTICE}`
}

function findLastMarkdownBoundaryStart(content: string, maxBoundaryStart: number) {
  let lastBoundaryStart = -1

  for (const match of content.matchAll(/(^|\r?\n)[ ]{0,3}#{1,6}(?:[ \t]|(?=\r?\n|$))/g)) {
    const boundaryStart = match.index ?? -1

    if (boundaryStart > maxBoundaryStart) {
      break
    }

    lastBoundaryStart = boundaryStart
  }

  return lastBoundaryStart
}

export type CompressionReadinessInput = {
  lifecycleStage: ContextLifecycleStage
  policy: EffectiveContextCompressionPolicy
  artifacts: ContextArtifact[]
  unresolvedDecisions: string[]
  freshness?: ContextArtifactFreshness
  now?: string
  contextProviders?: readonly ResolvedContextProvider[]
}

export type CompressionReadiness = {
  state: "safe" | "conditional" | "unsafe"
  reason: string
  resumePacket?: ResumePacket
  providers?: ContextProviderAvailabilitySummary
}

export function evaluateCompressionReadiness(input: CompressionReadinessInput): CompressionReadiness {
  const policy = input.policy
  const providers = summarizeContextProviders(input.contextProviders)
  const authoritativeArtifacts = input.artifacts
    .filter((artifact) => isBoundaryRelevantAuthoritativeArtifact(artifact, input.lifecycleStage))
    .map((artifact) => artifact.path)

  if (authoritativeArtifacts.length === 0) {
    return {
      state: "unsafe",
      reason: "No authoritative artifacts are available for this compression boundary.",
      ...(providers ? { providers } : {}),
    }
  }

  if (!passesFreshnessCheck(input, policy)) {
    const resumePacket = createResumePacket({
      lifecycleStage: input.lifecycleStage,
      authoritativeArtifacts,
      unresolvedDecisions: input.unresolvedDecisions,
      freshness: input.freshness,
      requiredRechecks: ["Refresh authoritative artifacts against the current HEAD before resuming compression."],
      nextStep: "Refresh authoritative artifacts, then resume the compression boundary.",
    })

    if (policy.safety.allowConditional) {
      return {
        state: "conditional",
        reason: "Freshness verification failed, so authoritative artifacts must be refreshed before compression can resume.",
        resumePacket,
        ...(providers ? { providers } : {}),
      }
    }

    return {
      state: "unsafe",
      reason: "Freshness verification failed and conditional compression is disabled by policy.",
      ...(providers ? { providers } : {}),
    }
  }

  return {
    state: "safe",
    reason: "Authoritative artifacts are available and freshness verification passed for this compression boundary.",
    resumePacket: createResumePacket({
      lifecycleStage: input.lifecycleStage,
      authoritativeArtifacts,
      unresolvedDecisions: input.unresolvedDecisions,
      freshness: input.freshness,
      requiredRechecks: [],
      nextStep: `Resume ${formatLifecycleStage(input.lifecycleStage)} work from the latest authoritative artifacts.`,
    }),
    ...(providers ? { providers } : {}),
  }
}

function passesFreshnessCheck(
  input: CompressionReadinessInput,
  policy: EffectiveContextCompressionPolicy,
) {
  if (!policy.safety.requireFreshVerification) {
    return true
  }

  if (!input.freshness) {
    return false
  }

  return isContextArtifactFresh({
    ...input.freshness,
    now: input.now ?? new Date().toISOString(),
  })
}

function createResumePacket(input: {
  lifecycleStage: ContextLifecycleStage
  authoritativeArtifacts: string[]
  unresolvedDecisions: string[]
  freshness?: ContextArtifactFreshness
  requiredRechecks: string[]
  nextStep: string
}) {
  return buildResumePacket({
    lifecycleStage: input.lifecycleStage,
    nextStep: input.nextStep,
    authoritativeArtifacts: input.authoritativeArtifacts,
    unresolvedDecisions: input.unresolvedDecisions,
    requiredRechecks: input.requiredRechecks,
    freshness: input.freshness,
  })
}

function formatLifecycleStage(stage: ContextLifecycleStage) {
  return stage.replace(/_/g, " ")
}

function isBoundaryRelevantAuthoritativeArtifact(
  artifact: ContextArtifact,
  lifecycleStage: ContextLifecycleStage,
) {
  return artifact.authority === "authoritative"
    && artifact.lifecycleStage === lifecycleStage
}
