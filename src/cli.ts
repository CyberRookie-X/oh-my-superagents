import * as fs from "node:fs/promises"
import path from "node:path"
import { cwd as getCwd } from "node:process"
import { parse, type ParseError } from "jsonc-parser"
import { z } from "zod"
import {
  applyRoutingProposalToConfig,
  buildRoutingProposal,
  inspectRoutingAuthoringInputs,
  renderRoutingConfigDocument,
  type ModelInventory,
} from "./author-routing.js"
import {
  BUILT_IN_PHASES,
  discoverConfigPath,
  getProjectConfigPath,
  loadRouterConfig,
  readControlPlaneSourceDocument,
} from "./config.js"
import {
  buildControlPlaneExplainTrace,
  buildControlPlaneRouteExplainTrace,
  buildOpenCodeNextAction,
  buildOpenCodeStatusState,
  prepareControlPlaneStateWrite,
  resolveControlPlane,
  summarizeLaneExplainability,
  summarizeRoutingValidation,
  summarizeControlPlaneArtifacts,
  type ExplainTrace,
  type LaneExplainability,
  type ResolvedControlPlane,
} from "./control-plane.js"
import { buildCodexBootstrapFiles, readOwnPackageVersion, runCodexBootstrap } from "./codex-bootstrap.js"
import { buildCodexArtifacts, explainAllCodex, explainCodexPhase } from "./codex.js"
import { hasArtifactOwnershipMarker, materializeArtifacts } from "./materialize.js"
import { buildArtifacts, listRenderedOpenCodeControlPlaneCommands } from "./opencode.js"
import { buildQwenArtifacts } from "./qwen.js"
import { explainAll, explainPhase, resolvePhase, resolveRoute, type BuiltInPhase } from "./router.js"
import {
  evaluateSuperpowersCompatibility,
  type SuperpowersCompatibilityMode,
  type SuperpowersCompatibilityResult,
  type SuperpowersDetectionResult,
  type SupportedSuperpowersHost,
} from "./superpowers-compatibility.js"
import { detectCodexSuperpowers, detectOpenCodeSuperpowers } from "./superpowers-detectors.js"

export type CliResult = {
  exitCode: 0 | 1 | 2
  stdout: string
  stderr: string
}

type CliHost = SupportedSuperpowersHost | "qwen"

const CODEX_MARKETPLACE_PATH = ".agents/plugins/marketplace.json"
const CODEX_PLUGIN_MANIFEST_PATH = "plugins/oh-my-superagents-codex/.codex-plugin/plugin.json"
const CODEX_SKILLS_ROOT = "plugins/oh-my-superagents-codex/skills"
const QWEN_MANAGED_AGENT_FILE_NAMES = [
  "oms-brainstorm.md",
  "oms-plan.md",
  "oms-execute.md",
  "oms-review.md",
  "oms-verify.md",
  "oms-visual.md",
  "oms-web-test.md",
]

const nodeFs = {
  mkdir: async (filePath: string, options?: { recursive?: boolean }) => {
    await fs.mkdir(filePath, { recursive: options?.recursive })
  },
  writeFile: async (filePath: string, content: string) => {
    await fs.writeFile(filePath, content)
  },
  rename: async (from: string, to: string) => {
    await fs.rename(from, to)
  },
  readdir: async (directory: string) => fs.readdir(directory),
  readFile: async (filePath: string) => fs.readFile(filePath, "utf8"),
  stat: async (filePath: string) => fs.stat(filePath),
  unlink: async (filePath: string) => {
    await fs.unlink(filePath)
  },
}

type CliDeps = {
  mkdir: (filePath: string, options?: { recursive?: boolean }) => Promise<void>
  getCwd: () => string
  discoverConfigPath: typeof discoverConfigPath
  loadConfig: typeof loadRouterConfig
  resolveControlPlane: typeof resolveControlPlane
  prepareControlPlaneStateWrite: typeof prepareControlPlaneStateWrite
  explainAll: typeof explainAll
  explainPhase: typeof explainPhase
  explainAllForHost: (config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], host: "opencode" | "codex") => unknown[]
  explainPhaseForHost: (config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], host: "opencode" | "codex", phase: BuiltInPhase) => unknown
  buildArtifacts: typeof buildArtifacts
  buildCodexArtifacts: typeof buildCodexArtifacts
  buildQwenArtifacts: typeof buildQwenArtifacts
  buildCodexBootstrap: typeof runCodexBootstrap
  materializeArtifacts: typeof materializeArtifacts
  artifactExists: (filePath: string) => Promise<boolean>
  readdir: (directory: string) => Promise<string[]>
  readArtifactFile: (filePath: string) => Promise<string>
  artifactStat: (filePath: string) => Promise<{ isFile: () => boolean }>
  writeFile: (filePath: string, content: string) => Promise<void>
  unlink: (filePath: string) => Promise<void>
  detectOpenCodeSuperpowers: typeof detectOpenCodeSuperpowers
  detectCodexSuperpowers: typeof detectCodexSuperpowers
  evaluateSuperpowersCompatibility: typeof evaluateSuperpowersCompatibility
}

const defaultDeps: CliDeps = {
  mkdir: nodeFs.mkdir,
  getCwd: getCwd,
  discoverConfigPath,
  loadConfig: loadRouterConfig,
  resolveControlPlane,
  prepareControlPlaneStateWrite,
  explainAll,
  explainPhase,
  explainAllForHost: (config, host) => (host === "opencode" ? explainAll(config) : explainAllCodex(config)),
  explainPhaseForHost: (config, host, phase) => (host === "opencode" ? explainPhase(config, phase) : explainCodexPhase(config, phase)),
  buildArtifacts,
  buildCodexArtifacts,
  buildQwenArtifacts,
  buildCodexBootstrap: runCodexBootstrap,
  materializeArtifacts,
  artifactExists: async (filePath) => {
    try {
      await fs.stat(filePath)
      return true
    } catch {
      return false
    }
  },
  readdir: async (directory) => fs.readdir(directory),
  readArtifactFile: async (filePath) => fs.readFile(filePath, "utf8"),
  artifactStat: async (filePath) => fs.stat(filePath),
  writeFile: async (filePath, content) => {
    await fs.writeFile(filePath, content)
  },
  unlink: async (filePath) => {
    await fs.unlink(filePath)
  },
  detectOpenCodeSuperpowers,
  detectCodexSuperpowers,
  evaluateSuperpowersCompatibility,
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv
  const flags = new Map<string, string | true>()
  const positionals: string[] = []

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index]
    if (!value?.startsWith("--")) {
      positionals.push(value)
      continue
    }

    const next = rest[index + 1]
    if (!next || next.startsWith("--")) {
      flags.set(value, true)
      continue
    }

    flags.set(value, next)
    index += 1
  }

  return { command, flags, positionals }
}

function getStringFlag(flags: Map<string, string | true>, name: string) {
  const value = flags.get(name)
  return typeof value === "string" ? value : undefined
}

function isAuthorRoutingMode(value: string | undefined): value is "superpowers" | "direct" {
  return value === "superpowers" || value === "direct"
}

const ModelInventoryEntrySchema = z.object({
  model: z.string().min(1),
  specialties: z.array(z.string().min(1)).optional(),
  effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
  codexFast: z.boolean().optional(),
}).strict()

const ModelInventorySchema = z.object({
  models: z.record(z.string().min(1), ModelInventoryEntrySchema),
}).strict()

function parseJsoncDocument(filePath: string, content: string) {
  const parseErrors: ParseError[] = []
  const parsed = parse(content, parseErrors)

  if (parseErrors.length > 0) {
    throw new Error(`Invalid JSONC in ${filePath}`)
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid model inventory: ${filePath}`)
  }

  return parsed
}

async function loadModelInventory(modelsPath: string, deps: CliDeps): Promise<ModelInventory> {
  const parsed = parseJsoncDocument(modelsPath, await deps.readArtifactFile(modelsPath))
  const validated = ModelInventorySchema.safeParse(parsed)

  if (!validated.success) {
    const issue = validated.error.issues[0]
    const issuePath = issue?.path.join(".")
    const issueDetail = issuePath ? ` (${issuePath}: ${issue.message})` : ""
    throw new Error(`Invalid model inventory: ${modelsPath}${issueDetail}`)
  }

  return validated.data
}

async function buildAuthorRoutingPreview(
  cwd: string,
  explicitPath: string | undefined,
  mode: "superpowers" | "direct",
  modelsPath: string,
  write: boolean,
  deps: CliDeps,
) {
  const inventory = await loadModelInventory(modelsPath, deps)
  const targetPath = explicitPath
    ?? (write ? await deps.discoverConfigPath({ cwd, exists: deps.artifactExists }) : undefined)
    ?? getProjectConfigPath(cwd)
  const authoringInputs = await inspectRoutingAuthoringInputs({
    cwd,
    exists: deps.artifactExists,
    readFile: deps.readArtifactFile,
  })
  const proposal = buildRoutingProposal({
    mode,
    suggestedLanes: authoringInputs.suggestedLanes,
    inventory,
  })
  const hasExistingConfig = await deps.artifactExists(targetPath)
  const effectiveConfig = (write || hasExistingConfig)
    ? (await deps.resolveControlPlane({ command: "status", cwd, explicitPath })).config
    : undefined

  const nextDocument = applyRoutingProposalToConfig(
    proposal,
    hasExistingConfig ? (await readControlPlaneSourceDocument(targetPath, deps.readArtifactFile)).config : undefined,
    { effectiveConfig },
  )
  const previousRenderedDocument = hasExistingConfig ? await deps.readArtifactFile(targetPath) : ""
  const renderedDocument = renderRoutingConfigDocument(nextDocument)
  const operation = hasExistingConfig ? "update" : "create"
  const summaryText = formatAuthorRoutingSummary({
    mode,
    write,
    operation,
    targetPath,
    suggestedLanes: authoringInputs.suggestedLanes,
    proposal,
  })
  const diffText = formatAuthorRoutingDiff({
    previousRenderedDocument,
    renderedDocument,
    operation,
    targetPath,
  })

  if (write) {
    await deps.mkdir(path.dirname(targetPath), { recursive: true })
    await deps.writeFile(targetPath, renderedDocument)
  }

  return {
    mode,
    summary: {
      lanes: authoringInputs.suggestedLanes,
      profiles: Object.keys(proposal.profiles),
      presets: Object.keys(proposal.presets),
    },
    detectedLanes: authoringInputs.suggestedLanes,
    proposedProfiles: proposal.profiles,
    proposedPresets: proposal.presets,
    preview: {
      path: targetPath,
      operation,
      patch: {
        workflow: proposal.workflow,
        profiles: proposal.profiles,
        lanes: proposal.lanes,
        presets: proposal.presets,
      },
      rendered: renderedDocument,
    },
    summaryText,
    diffText,
    written: write,
  }
}

function formatAuthorRoutingSummary(input: {
  mode: "superpowers" | "direct"
  write: boolean
  operation: "create" | "update"
  targetPath: string
  suggestedLanes: string[]
  proposal: ReturnType<typeof buildRoutingProposal>
}) {
  const lanes = input.suggestedLanes.length > 0 ? input.suggestedLanes.join(", ") : "none"
  const profiles = Object.keys(input.proposal.profiles).join(", ")
  const presets = Object.keys(input.proposal.presets).join(", ")

  return [
    `Routing authoring ${input.write ? "write" : "preview"}`,
    `Mode: ${input.mode}`,
    `Operation: ${input.operation}`,
    `Target: ${input.targetPath}`,
    `Detected lanes: ${lanes}`,
    `Profiles: ${profiles}`,
    `Presets: ${presets}`,
  ].join("\n")
}

function formatAuthorRoutingDiff(input: {
  previousRenderedDocument: string
  renderedDocument: string
  operation: "create" | "update"
  targetPath: string
}) {
  return [
    `Target: ${input.targetPath}`,
    `Operation: ${input.operation}`,
    ...formatRenderedDocumentDiff(input.previousRenderedDocument, input.renderedDocument),
  ].join("\n")
}

function formatRenderedDocumentDiff(previousRenderedDocument: string, renderedDocument: string) {
  const previousLines = previousRenderedDocument.length > 0 ? previousRenderedDocument.trimEnd().split("\n") : []
  const nextLines = renderedDocument.trimEnd().split("\n")

  if (previousLines.length === 0) {
    return nextLines.map((line) => `+ ${line}`)
  }

  const diffLines: string[] = []
  const linePairs = buildLineDiff(previousLines, nextLines)

  for (const pair of linePairs) {
    if (pair.type === "unchanged") {
      diffLines.push(`  ${pair.line}`)
      continue
    }

    if (pair.type === "removed") {
      diffLines.push(`- ${pair.line}`)
      continue
    }

    diffLines.push(`+ ${pair.line}`)
  }

  return diffLines
}

function buildLineDiff(previousLines: string[], nextLines: string[]) {
  const lcs = Array.from({ length: previousLines.length + 1 }, () => Array<number>(nextLines.length + 1).fill(0))

  for (let previousIndex = previousLines.length - 1; previousIndex >= 0; previousIndex--) {
    for (let nextIndex = nextLines.length - 1; nextIndex >= 0; nextIndex--) {
      lcs[previousIndex][nextIndex] = previousLines[previousIndex] === nextLines[nextIndex]
        ? lcs[previousIndex + 1][nextIndex + 1] + 1
        : Math.max(lcs[previousIndex + 1][nextIndex], lcs[previousIndex][nextIndex + 1])
    }
  }

  const diffLines: Array<
    | { type: "unchanged"; line: string }
    | { type: "removed"; line: string }
    | { type: "added"; line: string }
  > = []

  let previousIndex = 0
  let nextIndex = 0

  while (previousIndex < previousLines.length && nextIndex < nextLines.length) {
    if (previousLines[previousIndex] === nextLines[nextIndex]) {
      diffLines.push({ type: "unchanged", line: previousLines[previousIndex] })
      previousIndex++
      nextIndex++
      continue
    }

    if (lcs[previousIndex + 1][nextIndex] >= lcs[previousIndex][nextIndex + 1]) {
      diffLines.push({ type: "removed", line: previousLines[previousIndex] })
      previousIndex++
      continue
    }

    diffLines.push({ type: "added", line: nextLines[nextIndex] })
    nextIndex++
  }

  while (previousIndex < previousLines.length) {
    diffLines.push({ type: "removed", line: previousLines[previousIndex] })
    previousIndex++
  }

  while (nextIndex < nextLines.length) {
    diffLines.push({ type: "added", line: nextLines[nextIndex] })
    nextIndex++
  }

  return diffLines
}

function formatCompatibilityWarning(result: SuperpowersCompatibilityResult | null) {
  if (!result || result.status === "compatible" || result.shouldBlock) {
    return ""
  }

  return `Warning: superpowers compatibility is ${result.status} for ${result.host}: ${result.reason}`
}

function formatCompatibilityBlock(result: SuperpowersCompatibilityResult | null) {
  if (!result) {
    return ""
  }

  return `Blocked by incompatible superpowers installation for ${result.host}: ${result.reason}`
}

function withCompatibility<T extends Record<string, unknown>>(
  payload: T,
  compatibility: SuperpowersCompatibilityResult | null,
) {
  return {
    ...payload,
    compatibility,
  }
}

function formatExplainOutput(payload: unknown, compatibility: SuperpowersCompatibilityResult | null) {
  if (Array.isArray(payload)) {
    return payload.map((item) => (
      item && typeof item === "object" && !Array.isArray(item)
        ? withCompatibility(item as Record<string, unknown>, compatibility)
        : item
    ))
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return withCompatibility(payload as Record<string, unknown>, compatibility)
  }

  return {
    result: payload,
    compatibility,
  }
}

function withExplainTrace(payload: Record<string, unknown>, trace: ExplainTrace) {
  return {
    ...payload,
    routeSource: typeof payload.routeSource === "string" ? payload.routeSource : trace.routeSource,
    configSource: typeof payload.configSource === "string" ? payload.configSource : trace.configSource,
    reuseRelationship: typeof payload.reuseRelationship === "string" ? payload.reuseRelationship : trace.reuseRelationship,
  }
}

function formatPostWriteControlPlaneSource(
  resolved: ResolvedControlPlane,
  prepared: Awaited<ReturnType<typeof prepareControlPlaneStateWrite>>,
) {
  if (resolved.source.kind === "default") {
    return {
      kind: "file" as const,
      hasRealSource: true,
      path: prepared.path,
      sources: [prepared.path],
    }
  }

  return formatControlPlaneSource(resolved)
}

function buildUseRouteImpact(previous: ResolvedControlPlane["config"], next: ResolvedControlPlane["config"]) {
  const previousRouter = toRouterConfig(previous)
  const nextRouter = toRouterConfig(next)

  return {
    changedPhases: BUILT_IN_PHASES.filter((phase) => {
      const previousResolved = resolvePhase(previousRouter, phase)
      const nextResolved = resolvePhase(nextRouter, phase)
      const previousVisibleSelection = {
        model: previousResolved.selection.model,
        variant: previousResolved.selection.variant,
        temperature: previousResolved.selection.temperature,
      }
      const nextVisibleSelection = {
        model: nextResolved.selection.model,
        variant: nextResolved.selection.variant,
        temperature: nextResolved.selection.temperature,
      }

      return JSON.stringify(previousVisibleSelection) !== JSON.stringify(nextVisibleSelection)
    }),
  }
}

function attachExplainTrace(
  payload: unknown,
  input: { cwd: string; resolved: ResolvedControlPlane },
) {
  const buildTrace = (item: Record<string, unknown>) => {
    if (typeof item.phase === "string" && BUILT_IN_PHASES.includes(item.phase as BuiltInPhase)) {
      return buildControlPlaneExplainTrace({
        cwd: input.cwd,
        resolved: input.resolved,
        phase: item.phase as BuiltInPhase,
      })
    }

    if (typeof item.intent === "string") {
      return buildControlPlaneRouteExplainTrace({
        cwd: input.cwd,
        resolved: input.resolved,
        routeId: item.intent,
      })
    }

    return null
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => {
      if (!isRecord(item)) {
        return item
      }

      const trace = buildTrace(item)
      if (!trace) {
        return item
      }

      return withExplainTrace(item, trace)
    })
  }

  if (!isRecord(payload)) {
    return payload
  }

  const trace = buildTrace(payload)
  return trace ? withExplainTrace(payload, trace) : payload
}

function withLaneExplainability(payload: Record<string, unknown>, laneExplainability: LaneExplainability) {
  return {
    ...payload,
    ...laneExplainability,
  }
}

function attachLaneExplainability(payload: unknown, resolved: ResolvedControlPlane) {
  const laneExplainability = summarizeLaneExplainability(resolved)

  if (Array.isArray(payload)) {
    return payload.map((item) => (
      isRecord(item)
        ? withLaneExplainability(item, laneExplainability)
        : item
    ))
  }

  if (!isRecord(payload)) {
    return payload
  }

  return withLaneExplainability(payload, laneExplainability)
}

function createFallbackCompatibility(
  host: SupportedSuperpowersHost,
  policyMode: SuperpowersCompatibilityMode,
  source: string,
  error: unknown,
): SuperpowersCompatibilityResult {
  return {
    host,
    source,
    detectedVersion: null,
    detectedRef: null,
    status: "not_detected",
    reason: error instanceof Error ? `Compatibility check failed: ${error.message}` : `Compatibility check failed: ${String(error)}`,
    policyMode,
    shouldBlock: false,
  }
}

async function resolveCompatibilityForHost(
  host: SupportedSuperpowersHost,
  policyMode: SuperpowersCompatibilityMode,
  deps: CliDeps,
): Promise<SuperpowersCompatibilityResult> {
  let detection: SuperpowersDetectionResult

  try {
    detection = host === "opencode"
      ? await deps.detectOpenCodeSuperpowers()
      : await deps.detectCodexSuperpowers()
  } catch (error) {
    return createFallbackCompatibility(host, policyMode, "compatibility-monitor", error)
  }

  try {
    return deps.evaluateSuperpowersCompatibility(detection, policyMode)
  } catch (error) {
    return createFallbackCompatibility(host, policyMode, detection.source, error)
  }
}

function isCompatibilityHost(host: CliHost): host is SupportedSuperpowersHost {
  return host === "opencode" || host === "codex"
}

async function resolveCompatibilityForCliHost(
  host: CliHost,
  policyMode: SuperpowersCompatibilityMode,
  deps: CliDeps,
) {
  if (!isCompatibilityHost(host)) {
    return null
  }

  return resolveCompatibilityForHost(host, policyMode, deps)
}

function joinStderr(parts: Array<string | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.length > 0)).join("\n")
}

function isDirectOpenCodeWorkflow(
  config: { workflow: ResolvedControlPlane["config"]["workflow"] },
  host: CliHost | SupportedSuperpowersHost,
) {
  return config.workflow.kind === "direct" && host === "opencode"
}

function assertWorkflowSupport(
  config: { workflow: ResolvedControlPlane["config"]["workflow"] },
  command: string,
  host: CliHost | SupportedSuperpowersHost,
) {
  if (config.workflow.kind !== "direct") {
    return
  }

  if (host !== "opencode") {
    throw new Error("Direct workflow is currently only supported for --host opencode")
  }

  if (command === "status" || command === "doctor" || command === "explain" || command === "sync") {
    return
  }

  throw new Error(`Direct workflow is not yet supported for ${command} --host ${host}`)
}

function explainDirectIntent(config: Awaited<ReturnType<typeof loadRouterConfig>>["config"], intent: string) {
  const resolved = resolveRoute(config, intent)

  return {
    intent,
    profileId: resolved.profileId,
    effectiveLane: resolved.effectiveLane,
    routeSource: resolved.routeSource,
    model: resolved.selection.model,
    variant: resolved.selection.variant,
    commandName: `ai-${intent}`,
    agentName: `rt-${intent}`,
  }
}

function explainAllDirect(config: Awaited<ReturnType<typeof loadRouterConfig>>["config"]) {
  if (config.workflow.kind !== "direct") {
    return []
  }

  return Object.keys(config.workflow.intents).map((intent) => explainDirectIntent(config, intent))
}

function maybeResolveCompatibility(
  config: { workflow: ResolvedControlPlane["config"]["workflow"] },
  host: CliHost,
  resolve: () => Promise<SuperpowersCompatibilityResult | null>,
) {
  return isDirectOpenCodeWorkflow(config, host) ? Promise.resolve(null) : resolve()
}

function toRouterConfig(
  config: ResolvedControlPlane["config"],
  laneState?: ResolvedControlPlane["laneState"],
): Awaited<ReturnType<typeof loadRouterConfig>>["config"] {
  const activePreset = config.presets[config.settings.activePreset]
  if (!activePreset) {
    throw new Error(`Unknown preset: ${config.settings.activePreset}`)
  }

  return {
    workflow: config.workflow,
    profiles: {
      ...(config.profiles ?? {}),
      ...(activePreset.profiles ?? {}),
    },
    lanes: config.lanes,
    routes: activePreset.routes,
    defaultRoute: activePreset.defaultRoute,
    effectiveLane: laneState?.effectiveLane ?? config.settings.defaultLane ?? activePreset.defaultLane,
    superpowersCompatibility: config.settings.superpowersCompatibility,
  }
}

function formatControlPlaneSource(resolved: ResolvedControlPlane) {
  if (resolved.source.kind === "default") {
    return {
      kind: "default" as const,
      hasRealSource: false,
      sources: [],
    }
  }

  return {
    kind: "file" as const,
    hasRealSource: true,
    path: resolved.source.path,
    sources: resolved.source.sources,
  }
}

async function getArtifactsForHost(
  cwd: string,
  config: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  host: CliHost,
  deps: CliDeps,
  controlPlaneSettings?: ResolvedControlPlane["config"]["settings"],
) {
  if (host === "opencode") {
    const built = deps.buildArtifacts(config, controlPlaneSettings)
    return [...built.agents, ...built.commands]
  }

  if (host === "codex") {
    return deps.buildCodexArtifacts(config).agents
  }

  const built = await deps.buildQwenArtifacts(config, {
    cwd,
    controlPlaneSettings,
  })
  return [...built.agents, ...built.commands]
}

async function getExpectedArtifacts(
  cwd: string,
  config: ResolvedControlPlane["config"],
  laneState: ResolvedControlPlane["laneState"] | undefined,
  host: CliHost,
  deps: CliDeps,
) {
  const routerConfig = toRouterConfig(config, laneState)

  if (host === "codex") {
    const built = deps.buildCodexArtifacts(routerConfig).agents
    const bootstrapFiles = buildCodexBootstrapFiles({
      packageVersion: "0.0.0",
      includeConfig: false,
      configArtifactPath: toProjectRelativePath(cwd, path.join(cwd, "oh-my-superagents.config.jsonc")),
      controlPlaneSettings: config.settings,
    }).files

    return [
      ...built.map((artifact) => path.join(cwd, artifact.directory, artifact.fileName)),
      ...bootstrapFiles.map((file) => path.join(cwd, file.path)),
    ].sort()
  }

  if (host === "qwen") {
    const built = await deps.buildQwenArtifacts(routerConfig, {
      cwd,
      controlPlaneSettings: config.settings,
      includeAgents: false,
    })

    return [
      ...QWEN_MANAGED_AGENT_FILE_NAMES.map((fileName) => path.join(cwd, ".qwen/agents", fileName)),
      ...built.commands.map((artifact) => path.join(cwd, artifact.directory, artifact.fileName)),
    ].sort()
  }

  return (await getArtifactsForHost(cwd, routerConfig, host, deps, config.settings))
    .map((artifact) => path.join(cwd, artifact.directory, artifact.fileName))
    .sort()
}

const OWNED_ARTIFACT_RULES: Record<CliHost, Array<{ directory: string; extension: string }>> = {
  opencode: [
    { directory: ".opencode/agents", extension: ".md" },
    { directory: ".opencode/commands", extension: ".md" },
  ],
  codex: [
    { directory: ".codex/agents", extension: ".toml" },
  ],
  qwen: [
    { directory: ".qwen/agents", extension: ".md" },
    { directory: ".qwen/commands", extension: ".md" },
  ],
}

function isMissingFsError(error: unknown) {
  return (
    (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
    || (error instanceof Error && error.message.includes("ENOENT"))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toProjectRelativePath(cwd: string, filePath: string) {
  const relative = path.relative(cwd, filePath)
  return relative.startsWith("..") || path.isAbsolute(relative) ? filePath : relative || path.basename(filePath)
}

function hasCodexMarketplaceEntry(content: string) {
  const parsed = JSON.parse(content) as unknown
  if (!isRecord(parsed)) {
    return false
  }

  const plugins = parsed.plugins
  return Array.isArray(plugins)
    && plugins.some((plugin) => isRecord(plugin) && plugin.name === "oh-my-superagents-codex")
}

function removeCodexMarketplaceEntry(content: string) {
  const parsed = JSON.parse(content) as unknown
  if (!isRecord(parsed) || !Array.isArray(parsed.plugins)) {
    throw new Error("Codex marketplace.json plugins must be an array")
  }

  return JSON.stringify(
    {
      ...parsed,
      plugins: parsed.plugins.filter((plugin) => !isRecord(plugin) || plugin.name !== "oh-my-superagents-codex"),
    },
    null,
    2,
  )
}

async function buildCodexLifecycleFiles(
  cwd: string,
  configPath: string,
  controlPlaneSettings: ResolvedControlPlane["config"]["settings"],
  deps: CliDeps,
) {
  const packageVersion = await readOwnPackageVersion()
  const marketplacePath = path.join(cwd, CODEX_MARKETPLACE_PATH)
  const existingMarketplaceContent = await deps.readArtifactFile(marketplacePath).catch(() => undefined)

  return buildCodexBootstrapFiles({
    packageVersion,
    includeConfig: false,
    configArtifactPath: toProjectRelativePath(cwd, configPath),
    existingMarketplaceContent,
    controlPlaneSettings,
  }).files
}

async function writeLifecycleFiles(cwd: string, files: Array<{ path: string; content: string }>, deps: CliDeps) {
  const written: string[] = []

  for (const file of files) {
    const absolutePath = path.join(cwd, file.path)
    await deps.mkdir(path.dirname(absolutePath), { recursive: true })
    await deps.writeFile(absolutePath, file.content)
    written.push(absolutePath)
  }

  return written
}

async function inspectCodexMarketplaceEntry(cwd: string, deps: CliDeps) {
  const filePath = path.join(cwd, CODEX_MARKETPLACE_PATH)

  try {
    return hasCodexMarketplaceEntry(await deps.readArtifactFile(filePath))
  } catch (error) {
    if (isMissingFsError(error)) {
      return false
    }

    throw error
  }
}

async function removeCodexMarketplaceEntryFile(cwd: string, deps: CliDeps) {
  const filePath = path.join(cwd, CODEX_MARKETPLACE_PATH)

  try {
    const nextContent = removeCodexMarketplaceEntry(await deps.readArtifactFile(filePath))
    await deps.mkdir(path.dirname(filePath), { recursive: true })
    await deps.writeFile(filePath, nextContent)
    return filePath
  } catch (error) {
    if (isMissingFsError(error)) {
      return undefined
    }

    throw error
  }
}

async function discoverCodexControlPlaneSkills(cwd: string, deps: CliDeps) {
  const discovered = new Set<string>()
  const warnings: string[] = []
  const root = path.join(cwd, CODEX_SKILLS_ROOT)

  let entries: string[] = []
  try {
    entries = await deps.readdir(root)
  } catch (error) {
    if (!isMissingFsError(error)) {
      warnings.push(`Failed to scan OMS-owned artifact directory ${root}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return { paths: [], warnings }
  }

  for (const entry of entries) {
    const filePath = path.join(root, entry, "SKILL.md")

    try {
      const stats = await deps.artifactStat(filePath)
      if (!stats.isFile()) {
        continue
      }

      const content = await deps.readArtifactFile(filePath)
      if (!hasArtifactOwnershipMarker(content)) {
        continue
      }

      discovered.add(filePath)
    } catch (error) {
      if (!isMissingFsError(error)) {
        warnings.push(`Failed to inspect OMS-owned artifact ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return { paths: [...discovered].sort(), warnings }
}

async function discoverOwnedArtifacts(
  cwd: string,
  host: CliHost,
  deps: CliDeps,
): Promise<{
  paths: string[]
  warnings: string[]
  specialPresent: string[]
  unverifiedDirectories: string[]
  unverifiedFiles: string[]
}> {
  const discovered = new Set<string>()
  const warnings: string[] = []
  const specialPresent = new Set<string>()
  const unverifiedDirectories = new Set<string>()
  const unverifiedFiles = new Set<string>()

  for (const rule of OWNED_ARTIFACT_RULES[host]) {
    const directory = path.join(cwd, rule.directory)
    let entries: string[] = []

    try {
      entries = await deps.readdir(directory)
    } catch (error) {
      if (!isMissingFsError(error)) {
        warnings.push(`Failed to scan OMS-owned artifact directory ${directory}: ${error instanceof Error ? error.message : String(error)}`)
        unverifiedDirectories.add(directory)
      }
      continue
    }

    for (const entry of entries) {
      if (!entry.endsWith(rule.extension)) {
        continue
      }

      const filePath = path.join(directory, entry)

      try {
        const stats = await deps.artifactStat(filePath)
        if (!stats.isFile()) {
          continue
        }

        const content = await deps.readArtifactFile(filePath)
        if (!hasArtifactOwnershipMarker(content)) {
          continue
        }

        discovered.add(filePath)
      } catch (error) {
        if (!isMissingFsError(error)) {
          warnings.push(`Failed to inspect OMS-owned artifact ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
          unverifiedFiles.add(filePath)
        }
        continue
      }
    }
  }

  if (host === "codex") {
    try {
      if (await inspectCodexMarketplaceEntry(cwd, deps)) {
        specialPresent.add(path.join(cwd, CODEX_MARKETPLACE_PATH))
      }
    } catch (error) {
      warnings.push(`Failed to inspect OMS-owned artifact ${path.join(cwd, CODEX_MARKETPLACE_PATH)}: ${error instanceof Error ? error.message : String(error)}`)
    }

    const pluginManifestPath = path.join(cwd, CODEX_PLUGIN_MANIFEST_PATH)
    if (await deps.artifactExists(pluginManifestPath).catch(() => false)) {
      specialPresent.add(pluginManifestPath)
      discovered.add(pluginManifestPath)
    }

    const codexSkills = await discoverCodexControlPlaneSkills(cwd, deps)
    for (const filePath of codexSkills.paths) {
      discovered.add(filePath)
    }
    warnings.push(...codexSkills.warnings)
  }

  return {
    paths: [...discovered].sort(),
    warnings,
    specialPresent: [...specialPresent].sort(),
    unverifiedDirectories: [...unverifiedDirectories].sort(),
    unverifiedFiles: [...unverifiedFiles].sort(),
  }
}

async function inspectArtifacts(cwd: string, filePaths: string[], host: CliHost, deps: CliDeps) {
  const states = await Promise.all(filePaths.map(async (filePath) => ({ filePath, present: await deps.artifactExists(filePath) })))
  const discovered = await discoverOwnedArtifacts(cwd, host, deps)
  const specialPaths = new Set(host === "codex" ? [path.join(cwd, CODEX_MARKETPLACE_PATH)] : [])
  const expectedSet = new Set(filePaths)
  const ownedPresent = new Set([...discovered.paths, ...discovered.specialPresent])
  const unverifiedDirectories = new Set(discovered.unverifiedDirectories)
  const unverifiedFiles = new Set(discovered.unverifiedFiles)
  const expectedPresent = states
    .filter((state) => {
      if (specialPaths.has(state.filePath)) {
        return discovered.specialPresent.includes(state.filePath)
      }

      if (host === "opencode") {
        return state.present && (
          ownedPresent.has(state.filePath)
          || unverifiedDirectories.has(path.dirname(state.filePath))
          || unverifiedFiles.has(state.filePath)
        )
      }

      return state.present
    })
    .map((state) => state.filePath)
  const present = new Set(expectedPresent)

  for (const filePath of discovered.paths) {
    present.add(filePath)
  }

  for (const filePath of discovered.specialPresent) {
    present.add(filePath)
  }

  const stale = [...present]
    .filter((filePath) => !expectedSet.has(filePath))
    .sort()

  return {
    present: [...present].sort(),
    missing: states
      .filter((state) => !expectedPresent.includes(state.filePath))
      .map((state) => state.filePath),
    expectedPresent: expectedPresent.sort(),
    stale,
    ...(discovered.warnings.length > 0 ? { discoveryWarnings: discovered.warnings } : {}),
  }
}

function formatArtifactInspection(artifacts: Awaited<ReturnType<typeof inspectArtifacts>>) {
  return {
    present: artifacts.present,
    missing: artifacts.missing,
    ...(artifacts.discoveryWarnings ? { discoveryWarnings: artifacts.discoveryWarnings } : {}),
  }
}

async function writePreparedConfig(
  prepared: Awaited<ReturnType<typeof prepareControlPlaneStateWrite>>,
  deps: CliDeps,
) {
  await deps.mkdir(path.dirname(prepared.path), { recursive: true })
  await deps.writeFile(prepared.path, prepared.content)
}

function resolvePresetKey(resolved: ResolvedControlPlane, selector: string) {
  if (resolved.config.presets[selector]) {
    return selector
  }

  const shortMatch = Object.entries(resolved.config.presets)
    .find(([, preset]) => preset.short === selector)

  if (shortMatch) {
    return shortMatch[0]
  }

  throw new Error(`Unknown preset: ${selector}`)
}

async function removeOwnedArtifacts(
  filePaths: string[],
  deps: CliDeps,
): Promise<{ exitCode: 0 | 2; warnings: string[]; written: string[]; removed: string[] }> {
  const warnings: string[] = []
  const removed: string[] = []

  for (const filePath of filePaths) {
    if (!(await deps.artifactExists(filePath))) {
      continue
    }

    try {
      await deps.unlink(filePath)
      removed.push(filePath)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    exitCode: warnings.length > 0 ? 2 : 0,
    warnings,
    written: [] as string[],
    removed,
  }
}

async function materializeCodexLifecycle(
  cwd: string,
  configPath: string,
  routerConfig: Awaited<ReturnType<typeof loadRouterConfig>>["config"],
  controlPlaneSettings: ResolvedControlPlane["config"]["settings"],
  deps: CliDeps,
) {
  const lifecycleFiles = await buildCodexLifecycleFiles(cwd, configPath, controlPlaneSettings, deps)
  const controlPlaneSkillFiles = lifecycleFiles.filter((file) => file.path.endsWith("/SKILL.md"))
  const scaffoldFiles = lifecycleFiles.filter((file) => !file.path.endsWith("/SKILL.md"))
  const scaffoldWrites = await writeLifecycleFiles(cwd, scaffoldFiles, deps)
  const result = await deps.materializeArtifacts({
    cwd,
    artifacts: [
      ...deps.buildCodexArtifacts(routerConfig).agents,
      ...controlPlaneSkillFiles.map((file) => ({
        kind: "command" as const,
        directory: path.dirname(file.path),
        fileName: path.basename(file.path),
        ownerPrefix: "unused-for-stage1-metadata",
        content: file.content,
      })),
    ],
    fs: nodeFs,
  })

  return {
    exitCode: result.exitCode,
    warnings: result.warnings,
    written: [...scaffoldWrites, ...result.written],
    removed: result.removed,
  }
}

async function cleanupCodexLifecycle(cwd: string, deps: CliDeps) {
  const discovery = await discoverOwnedArtifacts(cwd, "codex", deps)
  if (discovery.warnings.length > 0) {
    return {
      exitCode: 2 as const,
      warnings: discovery.warnings,
      written: [] as string[],
      removed: [] as string[],
    }
  }

  const cleanup = await removeOwnedArtifacts(discovery.paths, deps)
  const written = [...cleanup.written]

  try {
    const rewrittenMarketplace = await removeCodexMarketplaceEntryFile(cwd, deps)
    if (rewrittenMarketplace) {
      written.push(rewrittenMarketplace)
    }
  } catch (error) {
    cleanup.warnings.push(error instanceof Error ? error.message : String(error))
  }

  return {
    exitCode: cleanup.warnings.length > 0 ? 2 as const : cleanup.exitCode,
    warnings: cleanup.warnings,
    written,
    removed: cleanup.removed,
  }
}

async function buildControlPlaneStatus(
  cwd: string,
  explicitPath: string | undefined,
  host: CliHost,
  runtimeLane: string | undefined,
  deps: CliDeps,
) {
  const resolved = await deps.resolveControlPlane({ command: "status", cwd, explicitPath, runtimeLane })
  assertWorkflowSupport(resolved.config, "status", host)
  const compatibility = await maybeResolveCompatibility(
    resolved.config,
    host,
    () => resolveCompatibilityForCliHost(host, resolved.config.settings.superpowersCompatibility.mode, deps),
  )
  const artifacts = await inspectArtifacts(
    cwd,
    await getExpectedArtifacts(cwd, resolved.config, resolved.laneState, host, deps),
    host,
    deps,
  )
  const formattedArtifacts = formatArtifactInspection(artifacts)
  const openCodeStatus = host === "opencode"
    ? (() => {
      const artifactSummary = summarizeControlPlaneArtifacts({
        present: artifacts.expectedPresent,
        missing: artifacts.missing,
        stale: artifacts.stale,
      })
      const state = buildOpenCodeStatusState({
        host,
        source: resolved.source,
        enabled: resolved.config.settings.enabled,
        compatibility,
        artifactSummary,
      })
      const nextAction = buildOpenCodeNextAction({
        host,
        workflow: resolved.config.workflow,
        state,
        activePresetShort: resolved.activePreset.preset.short,
      })

      return { state, ...(nextAction ? { nextAction } : {}), artifactSummary }
    })()
    : undefined

  return {
    enabled: resolved.config.settings.enabled,
    activePreset: {
      key: resolved.activePreset.key,
      label: resolved.activePreset.preset.label,
      short: resolved.activePreset.preset.short,
      description: resolved.activePreset.preset.description,
    },
    presets: Object.entries(resolved.config.presets)
      .map(([key, preset]) => ({ key, label: preset.label, short: preset.short, description: preset.description }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    source: formatControlPlaneSource(resolved),
    host,
    compatibility,
    artifacts: formattedArtifacts,
    ...summarizeLaneExplainability(resolved),
    ...openCodeStatus,
  }
}

async function buildControlPlaneDoctor(
  cwd: string,
  explicitPath: string | undefined,
  host: CliHost,
  runtimeLane: string | undefined,
  deps: CliDeps,
) {
  const resolved = await deps.resolveControlPlane({ command: "doctor", cwd, explicitPath, runtimeLane })
  assertWorkflowSupport(resolved.config, "doctor", host)
  const compatibility = await maybeResolveCompatibility(
    resolved.config,
    host,
    () => resolveCompatibilityForCliHost(host, resolved.config.settings.superpowersCompatibility.mode, deps),
  )
  const artifacts = await inspectArtifacts(
    cwd,
    await getExpectedArtifacts(cwd, resolved.config, resolved.laneState, host, deps),
    host,
    deps,
  )
  const formattedArtifacts = formatArtifactInspection(artifacts)
  const artifactSummary = host === "opencode"
    ? summarizeControlPlaneArtifacts({
      present: artifacts.expectedPresent,
      missing: artifacts.missing,
      stale: artifacts.stale,
    })
    : undefined

  return {
    activePreset: {
      key: resolved.activePreset.key,
      label: resolved.activePreset.preset.label,
      short: resolved.activePreset.preset.short,
    },
    source: formatControlPlaneSource(resolved),
    host,
    commands: {
      prefix: resolved.config.settings.commandPrefix,
      ...(host === "opencode"
        ? {
          rendered: listRenderedOpenCodeControlPlaneCommands(resolved.config.settings),
        }
        : resolved.config.settings.commands),
    },
    compatibility,
    artifacts: formattedArtifacts,
    ...summarizeLaneExplainability(resolved),
    ...(artifactSummary ? { artifactSummary } : {}),
    ...(host === "opencode"
      ? {
          routing: summarizeRoutingValidation(
            resolved.config,
            resolved.activePreset.key,
            resolved.trace?.activePresetDefinition?.preset,
          ),
        }
      : {}),
  }
}

export async function runCli(argv: string[], deps: CliDeps = defaultDeps): Promise<CliResult> {
  try {
    const { command, flags, positionals } = parseArgs(argv)
    const cwd = deps.getCwd()
    const host = getStringFlag(flags, "--host")
    const explicitPath = getStringFlag(flags, "--config")
    const runtimeLane = getStringFlag(flags, "--lane")

    if (
      command !== "sync"
      && command !== "explain"
      && command !== "bootstrap"
      && command !== "author"
      && command !== "status"
      && command !== "doctor"
      && command !== "use"
      && command !== "disable"
    ) {
      return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }
    }

    if (command === "bootstrap") {
      if (host !== "codex") {
        return { exitCode: 1, stdout: "", stderr: "bootstrap is currently only supported for --host codex" }
      }

      const result = await deps.buildCodexBootstrap({
        cwd,
        explicitPath,
        discoverConfigPath: deps.discoverConfigPath,
        loadConfig: deps.loadConfig,
        materializeArtifacts: deps.materializeArtifacts,
        buildCodexArtifacts: deps.buildCodexArtifacts,
        resolveCompatibility: async (policyMode) => resolveCompatibilityForHost(host, policyMode, deps),
        fs: nodeFs,
      })

      return {
        exitCode: result.syncResult.exitCode,
        stdout: JSON.stringify(result, null, 2),
        stderr: result.compatibility.shouldBlock
          ? formatCompatibilityBlock(result.compatibility)
          : joinStderr([
            formatCompatibilityWarning(result.compatibility),
            ...result.syncResult.warnings,
          ]),
      }
    }

    if (command === "author") {
      if (positionals[0] !== "routing") {
        return { exitCode: 1, stdout: "", stderr: "Unknown author subcommand" }
      }

      const mode = getStringFlag(flags, "--mode")
      if (!isAuthorRoutingMode(mode)) {
        return { exitCode: 1, stdout: "", stderr: "Missing or invalid --mode (supported: superpowers, direct)" }
      }

      const modelsPath = getStringFlag(flags, "--models")
      if (!modelsPath) {
        return { exitCode: 1, stdout: "", stderr: "Missing required --models" }
      }

      const write = flags.get("--write") === true

      return {
        exitCode: 0,
        stdout: JSON.stringify(await buildAuthorRoutingPreview(cwd, explicitPath, mode, modelsPath, write, deps), null, 2),
        stderr: "",
      }
    }

    if (!host) {
      return { exitCode: 1, stdout: "", stderr: "Missing required --host (supported: opencode, codex, qwen)" }
    }

    if (command === "explain" && host !== "opencode" && host !== "codex") {
      return { exitCode: 1, stdout: "", stderr: "Only --host opencode or --host codex is supported for explain in v1" }
    }

    if (command !== "explain" && host !== "opencode" && host !== "codex" && host !== "qwen") {
      return { exitCode: 1, stdout: "", stderr: "Only --host opencode, --host codex, or --host qwen is supported in v1" }
    }

    const cliHost = host as CliHost

    if (command === "status") {
      return {
        exitCode: 0,
        stdout: JSON.stringify(await buildControlPlaneStatus(cwd, explicitPath, cliHost, runtimeLane, deps), null, 2),
        stderr: "",
      }
    }

    if (command === "doctor") {
      return {
        exitCode: 0,
        stdout: JSON.stringify(await buildControlPlaneDoctor(cwd, explicitPath, cliHost, runtimeLane, deps), null, 2),
        stderr: "",
      }
    }

    if (command === "explain") {
      const loaded = await deps.loadConfig({ cwd, explicitPath })
      const resolved = host === "opencode" || (host === "codex" && runtimeLane)
        ? await deps.resolveControlPlane({ command: "status", cwd, explicitPath, runtimeLane })
        : null
      const explainConfig = resolved?.config ?? loaded.config
      assertWorkflowSupport(explainConfig, "explain", host as SupportedSuperpowersHost)

      if (explainConfig.workflow.kind === "direct") {
        const directConfig = resolved ? toRouterConfig(resolved.config, resolved.laneState) : loaded.config

        if (flags.get("--all") === true) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(formatExplainOutput(
              resolved
                ? attachLaneExplainability(
                  attachExplainTrace(explainAllDirect(directConfig), { cwd, resolved }),
                  resolved,
                )
                : explainAllDirect(directConfig),
              null,
            ), null, 2),
            stderr: "",
          }
        }

        const intent = getStringFlag(flags, "--intent")
        if (!intent) {
          return { exitCode: 1, stdout: "", stderr: "Missing --intent or --all" }
        }

        return {
          exitCode: 0,
          stdout: JSON.stringify(
            formatExplainOutput(
              resolved
                ? attachLaneExplainability(
                  attachExplainTrace(explainDirectIntent(directConfig, intent), { cwd, resolved }),
                  resolved,
                )
                : explainDirectIntent(directConfig, intent),
              null,
            ),
            null,
            2,
          ),
          stderr: "",
        }
      }

      if (flags.get("--all") === true) {
        const compatibility = await resolveCompatibilityForHost(
          host as SupportedSuperpowersHost,
          loaded.config.superpowersCompatibility.mode,
          deps,
        )

        return {
          exitCode: 0,
          stdout: JSON.stringify(formatExplainOutput(
            resolved
              ? attachLaneExplainability(
                attachExplainTrace(deps.explainAllForHost(toRouterConfig(resolved.config, resolved.laneState), host as "opencode" | "codex"), {
                  cwd,
                  resolved,
                }),
                resolved,
              )
              : deps.explainAllForHost(loaded.config, host as "opencode" | "codex"),
            compatibility,
          ), null, 2),
          stderr: "",
        }
      }

      const phase = getStringFlag(flags, "--phase")
      if (!phase) {
        return { exitCode: 1, stdout: "", stderr: "Missing --phase or --all" }
      }

      if (!BUILT_IN_PHASES.includes(phase as (typeof BUILT_IN_PHASES)[number])) {
        return { exitCode: 1, stdout: "", stderr: `Unknown phase: ${phase}` }
      }

      const compatibility = await resolveCompatibilityForHost(
        host as SupportedSuperpowersHost,
        loaded.config.superpowersCompatibility.mode,
        deps,
      )

      return {
        exitCode: 0,
        stdout: JSON.stringify(
          formatExplainOutput(
            resolved
              ? attachLaneExplainability(
                attachExplainTrace(
                  deps.explainPhaseForHost(
                    toRouterConfig(resolved.config, resolved.laneState),
                    host as "opencode" | "codex",
                    phase as BuiltInPhase,
                  ),
                  { cwd, resolved },
                ),
                resolved,
              )
              : deps.explainPhaseForHost(loaded.config, host as "opencode" | "codex", phase as BuiltInPhase),
            compatibility,
          ),
          null,
          2,
        ),
        stderr: "",
      }
    }

    if (command === "use") {
      const selector = positionals[0]
      if (!selector) {
        return { exitCode: 1, stdout: "", stderr: "Missing preset argument" }
      }

      const resolved = await deps.resolveControlPlane({ command: "status", cwd, explicitPath })
      assertWorkflowSupport(resolved.config, "use", cliHost)
      const nextPreset = resolvePresetKey(resolved, selector)
      const prepared = await deps.prepareControlPlaneStateWrite({
        command: "use",
        cwd,
        explicitPath,
        nextState: {
          activePreset: nextPreset,
          enabled: true,
        },
      })

      await writePreparedConfig(prepared, deps)

      const result = cliHost === "codex"
        ? await materializeCodexLifecycle(cwd, prepared.path, toRouterConfig(prepared.config), prepared.config.settings, deps)
        : await deps.materializeArtifacts({
          cwd,
          artifacts: await getArtifactsForHost(cwd, toRouterConfig(prepared.config), cliHost, deps, prepared.config.settings),
          fs: nodeFs,
        })
      const routeImpact = cliHost === "opencode"
        ? buildUseRouteImpact(resolved.config, prepared.config)
        : undefined
      const artifactsDiffer = result.exitCode !== 0
      const payload: {
        exitCode: 0 | 1 | 2
        warnings: string[]
        written: string[]
        removed: string[]
        changed: boolean
        source: ReturnType<typeof formatControlPlaneSource>
        artifactsDiffer: boolean
        routeImpact?: {
          changedPhases: BuiltInPhase[]
        }
        activePreset: {
          key: string
          label: string
          short: string
          description?: string
        }
        nextAction?: {
          command: string
          reason: string
        }
      } = (() => {
        const changed = nextPreset !== resolved.activePreset.key || !resolved.config.settings.enabled
        const activePreset = prepared.config.presets[nextPreset]!

        return {
          exitCode: result.exitCode,
          warnings: result.warnings,
          written: [prepared.path, ...result.written],
          removed: result.removed,
          changed,
          source: formatPostWriteControlPlaneSource(resolved, prepared),
          artifactsDiffer,
          ...(routeImpact ? { routeImpact } : {}),
          activePreset: {
            key: nextPreset,
            label: activePreset.label,
            short: activePreset.short,
            ...(activePreset.description ? { description: activePreset.description } : {}),
          },
          ...(cliHost === "opencode" && changed && result.exitCode === 2
            ? {
              nextAction: {
                command: "oh-my-superagents sync --host opencode",
                reason: "Retry the OpenCode artifact refresh for the newly active preset.",
              },
            }
            : {}),
        }
      })()

      return {
        exitCode: payload.exitCode,
        stdout: JSON.stringify(payload, null, 2),
        stderr: joinStderr(payload.warnings),
      }
    }

    if (command === "disable") {
      const resolved = await deps.resolveControlPlane({ command: "status", cwd, explicitPath })
      assertWorkflowSupport(resolved.config, "disable", cliHost)
      const prepared = await deps.prepareControlPlaneStateWrite({
        command: "disable",
        cwd,
        explicitPath,
        nextState: {
          activePreset: resolved.config.settings.activePreset,
          enabled: false,
        },
      })

      await writePreparedConfig(prepared, deps)

      const cleanup = cliHost === "codex"
        ? await cleanupCodexLifecycle(cwd, deps)
        : await (async () => {
          const discovery = await discoverOwnedArtifacts(cwd, cliHost, deps)
          if (discovery.warnings.length > 0) {
            return {
              exitCode: 2 as const,
              warnings: discovery.warnings,
              written: [] as string[],
              removed: [] as string[],
            }
          }

          return removeOwnedArtifacts(discovery.paths, deps)
        })()
      const payload: {
        exitCode: 0 | 1 | 2
        warnings: string[]
        written: string[]
        removed: string[]
      } = {
        exitCode: cleanup.exitCode,
        warnings: cleanup.warnings,
        written: [prepared.path, ...cleanup.written],
        removed: cleanup.removed,
      }

      return {
        exitCode: payload.exitCode,
        stdout: JSON.stringify(payload, null, 2),
        stderr: joinStderr(payload.warnings),
      }
    }

    if (command === "sync") {
      let resolved: ResolvedControlPlane
      let bootstrappedConfigPath: string | undefined

        try {
          resolved = await deps.resolveControlPlane({ command: "sync", cwd, explicitPath, runtimeLane })
        } catch (error) {
        if (cliHost !== "opencode" || !(error instanceof Error) || error.message !== "Command sync requires a real config source") {
          throw error
        }

        const fallback = await deps.resolveControlPlane({ command: "status", cwd, explicitPath, runtimeLane })
        const prepared = await deps.prepareControlPlaneStateWrite({
          command: "sync",
          cwd,
          explicitPath,
          nextState: {
            activePreset: fallback.config.settings.activePreset,
            enabled: fallback.config.settings.enabled,
          },
        })

        await writePreparedConfig(prepared, deps)
        bootstrappedConfigPath = prepared.path
        resolved = {
          source: {
            kind: "file",
            hasRealSource: true,
            path: prepared.path,
            sources: [prepared.path],
          },
          config: prepared.config,
          activePreset: fallback.activePreset,
          laneState: fallback.laneState,
        }
      }

      assertWorkflowSupport(resolved.config, "sync", cliHost)

      const compatibility = await maybeResolveCompatibility(
        resolved.config,
        cliHost,
        () => resolveCompatibilityForCliHost(
          cliHost,
          resolved.config.settings.superpowersCompatibility.mode,
          deps,
        ),
      )

      if (compatibility?.shouldBlock) {
        return {
          exitCode: 1,
          stdout: JSON.stringify(
            withCompatibility({ exitCode: 1 as const, warnings: [], written: [], removed: [] }, compatibility),
            null,
            2,
          ),
          stderr: formatCompatibilityBlock(compatibility),
        }
      }

      if (!resolved.config.settings.enabled) {
        const result = cliHost === "codex"
          ? await cleanupCodexLifecycle(cwd, deps)
          : await (async () => {
            const discovery = await discoverOwnedArtifacts(cwd, cliHost, deps)
            if (discovery.warnings.length > 0) {
              return {
                exitCode: 2 as const,
                warnings: discovery.warnings,
                written: [] as string[],
                removed: [] as string[],
              }
            }

            return removeOwnedArtifacts(discovery.paths, deps)
          })()

        return {
          exitCode: result.exitCode,
          stdout: JSON.stringify(withCompatibility(result, compatibility), null, 2),
          stderr: joinStderr([
            formatCompatibilityWarning(compatibility),
            ...result.warnings,
          ]),
        }
      }

      const result = cliHost === "codex"
        ? await materializeCodexLifecycle(
          cwd,
          resolved.source.kind === "file" && resolved.source.path
            ? resolved.source.path
            : path.join(cwd, "oh-my-superagents.config.jsonc"),
          toRouterConfig(resolved.config, resolved.laneState),
          resolved.config.settings,
          deps,
        )
        : await deps.materializeArtifacts({
          cwd,
          artifacts: await getArtifactsForHost(
            cwd,
            toRouterConfig(resolved.config, resolved.laneState),
            cliHost,
            deps,
            resolved.config.settings,
          ),
          fs: nodeFs,
        })

      return {
        exitCode: result.exitCode,
        stdout: JSON.stringify(withCompatibility({
          ...result,
          ...(bootstrappedConfigPath ? { written: [bootstrappedConfigPath, ...result.written] } : {}),
        }, compatibility), null, 2),
        stderr: joinStderr([
          formatCompatibilityWarning(compatibility),
          ...result.warnings,
        ]),
      }
    }

    return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }

  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }
  }
}
