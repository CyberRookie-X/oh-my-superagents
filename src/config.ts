import { access, readFile } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { parse, type ParseError } from "jsonc-parser"
import { z } from "zod"
import { isSourceRouteSupported } from "./capabilities.js"
import { CONTEXT_PROVIDER_CAPABILITIES, type ContextProviderCapability } from "./context-manifest.js"
import {
  SUPERPOWERS_COMPATIBILITY_MODES,
  type SuperpowersCompatibilityMode,
} from "./superpowers-compatibility.js"
import {
  CANONICAL_ROUTE_ID_PATTERN,
  WORKFLOW_SOURCE_KINDS,
  normalizeWorkflowSourceRoutes,
  type CanonicalRouteId,
  type SourcePresetConfig,
  type WorkflowSourceKind,
} from "./workflow-sources.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import { GSTACK_SOURCE_CATALOG } from "./workflow-gstack.js"
import { CONTEXT_LIFECYCLE_STAGES } from "./context-lifecycle.js"
import { clonePolicyRules, type PolicyRule } from "./policy-families.js"
import {
  getLastKnownGoodPath,
  shouldFallbackToLastKnownGood,
  type ConfigRecoveryState,
} from "./config-recovery.js"
import { SUPERPOWERS_ROUTE_CATALOG, toSuperpowersCanonicalRouteId } from "./workflow-superpowers.js"

export { SUPERPOWERS_ROUTE_CATALOG as BUILT_IN_PHASES } from "./workflow-superpowers.js"

const BUILT_IN_PHASE_SET = new Set<string>(SUPERPOWERS_ROUTE_CATALOG)
export const SAFE_NAME_PATTERN = /^[a-z0-9-]+$/

export const CONTROL_PLANE_COMMAND_KEYS = ["status", "use", "disable", "sync", "doctor"] as const
const CONTEXT_PROVIDER_BASE_DIR_KEY = "baseDir" as const

const LEGACY_ROUTER_ONLY_KEYS = [
  "routes",
  "defaultRoute",
  "superpowersCompatibility",
] as const

const ProfileSchema = z
  .object({
    model: z.string().min(1),
    variant: z.string().min(1).optional(),
    effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
    codexFast: z.boolean().optional(),
    temperature: z.number().optional(),
  })
  .strict()

const CompatibilityOverrideSchema = z
  .object({
    minimumSupportedVersion: z.string().optional(),
    testedRanges: z.array(z.string()).optional(),
    knownBadRanges: z.array(z.string()).optional(),
  })
  .strict()

const SuperpowersCompatibilitySchema = z
  .object({
    mode: z.enum(SUPERPOWERS_COMPATIBILITY_MODES).default("warn"),
    allowUntested: z.enum(["warn", "block"]).default("warn"),
    overrides: z
      .object({
        opencode: CompatibilityOverrideSchema.optional(),
        codex: CompatibilityOverrideSchema.optional(),
      })
      .optional(),
  })
  .strict()

const LaneSelectionSchema = z
  .object({
    mode: z.enum(["manual", "suggest", "auto"]).default("suggest"),
  })
  .strict()

const SubagentExecutionSchema = z
  .object({
    mode: z.enum(["manual", "suggest", "auto"]).default("suggest"),
  })
  .strict()

const ContextCompressionModeSchema = z.enum(["manual", "suggest", "auto"])

const ContextCompressionEngineSchema = z.enum(["builtin", "external", "hybrid"])

const ContextInlineLevelSchema = z.enum(["minimal", "standard", "full"])

const ContextCompressionMomentsSchema = z
  .object({
    subagentHandoff: z.boolean().optional(),
    planCheckpoint: z.boolean().optional(),
    reviewCheckpoint: z.boolean().optional(),
    verificationCheckpoint: z.boolean().optional(),
    sessionResume: z.boolean().optional(),
    sourceSwitch: z.boolean().optional(),
    branchIntegration: z.boolean().optional(),
  })
  .strict()

const ContextCompressionSafetySchema = z
  .object({
    allowConditional: z.boolean().optional(),
    requireFreshVerification: z.boolean().optional(),
  })
  .strict()

const ContextCompressionSchema = z
  .object({
    preset: z.union([z.string().min(1), z.null()]).optional(),
    mode: ContextCompressionModeSchema.optional(),
    engine: ContextCompressionEngineSchema.optional(),
    inlineLevel: ContextInlineLevelSchema.optional(),
    moments: ContextCompressionMomentsSchema.optional(),
    safety: ContextCompressionSafetySchema.optional(),
  })
  .strict()

const CompressionPresetSchema = z
  .object({
    mode: ContextCompressionModeSchema.optional(),
    engine: ContextCompressionEngineSchema.optional(),
    inlineLevel: ContextInlineLevelSchema.optional(),
    moments: ContextCompressionMomentsSchema.optional(),
    safety: ContextCompressionSafetySchema.optional(),
  })
  .strict()

const ContextProviderCapabilitySchema = z.enum(CONTEXT_PROVIDER_CAPABILITIES)

const FileContextProviderConfigSchema = z
  .object({
    kind: z.literal("file"),
    enabled: z.boolean(),
    root: z.string().min(1),
    capabilities: z.array(ContextProviderCapabilitySchema),
  })
  .strict()

const CliContextProviderConfigSchema = z
  .object({
    kind: z.literal("cli"),
    enabled: z.boolean(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    capabilities: z.array(ContextProviderCapabilitySchema),
  })
  .strict()

const McpContextProviderConfigSchema = z
  .object({
    kind: z.literal("mcp"),
    enabled: z.boolean(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    capabilities: z.array(ContextProviderCapabilitySchema),
  })
  .strict()

const EvidenceDetectedPathSchema = z
  .object({
    path: z.string().min(1),
    suggestedTags: z.array(z.string().min(1)).default([]),
  })
  .strict()

const EvidenceSchema = z
  .object({
    detectedPaths: z.array(EvidenceDetectedPathSchema).default([]),
    notes: z.array(z.string().min(1)).default([]),
  })
  .strict()

const ContextProviderConfigSchema = z.discriminatedUnion("kind", [
  FileContextProviderConfigSchema,
  CliContextProviderConfigSchema,
  McpContextProviderConfigSchema,
])

const PolicyModelSchema = z
  .object({
    preferredProfiles: z.array(z.string().min(1)).optional(),
    effort: z.enum(["fast", "balanced", "deep", "max"]).nullable().optional(),
    preferWindowClass: z.enum(["small", "medium", "large"]).nullable().optional(),
    requiredCapabilities: z.array(z.string().min(1)).optional(),
  })
  .strict()

const PolicyContextSchema = z
  .object({
    compressionPreset: z.string().min(1).nullable().optional(),
    packetFirst: z.boolean().nullable().optional(),
    maxCharsBeforeCompression: z.number().int().positive().nullable().optional(),
  })
  .strict()

const PolicyToolSchema = z
  .object({
    allowedSkillTags: z.array(z.string().min(1)).optional(),
    allowedMcpTags: z.array(z.string().min(1)).optional(),
    blockedToolTags: z.array(z.string().min(1)).optional(),
  })
  .strict()

const PolicySelectorSchema = z
  .object({
    path: z.array(z.string().min(1)).min(1).optional(),
    lifecycleStage: z.array(z.enum(CONTEXT_LIFECYCLE_STAGES)).min(1).optional(),
    workflowSource: z.array(z.enum(WORKFLOW_SOURCE_KINDS)).min(1).optional(),
    agentRole: z.array(z.enum(["primary", "subagent"])).min(1).optional(),
    workloadTags: z.array(z.string().min(1)).min(1).optional(),
    modalityRequirements: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()

const PolicyFamiliesSchema = z
  .object({
    modelPolicy: PolicyModelSchema.optional(),
    contextPolicy: PolicyContextSchema.optional(),
    toolPolicy: PolicyToolSchema.optional(),
  })
  .strict()

export const PolicyRuleSchema = z
  .object({
    id: z.string().min(1),
    selector: PolicySelectorSchema,
    policy: PolicyFamiliesSchema,
  })
  .strict()

const AuthorityWorkloadMappingSchema = z
  .object({
    path: z.array(z.string().min(1)).min(1),
    workloadTags: z.array(z.string().min(1)).min(1),
  })
  .strict()

const AuthoritySchema = z
  .object({
    workloadMappings: z.array(AuthorityWorkloadMappingSchema).default([]),
    policyRules: z.array(PolicyRuleSchema).default([]),
  })
  .strict()

const LaneSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().min(1).optional(),
    routes: z.record(z.string().min(1), z.string().min(1)),
    defaultRoute: z.string().min(1),
  })
  .strict()

const SuperpowersWorkflowSchema = z
  .object({
    kind: z.literal("superpowers"),
  })
  .strict()

const DirectIntentSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().min(1).optional(),
  })
  .strict()

const DirectWorkflowSchema = z
  .object({
    kind: z.literal("direct"),
    intents: z.record(z.string().regex(SAFE_NAME_PATTERN), DirectIntentSchema),
  })
  .strict()

const WorkflowSchema = z.discriminatedUnion("kind", [SuperpowersWorkflowSchema, DirectWorkflowSchema])

const CanonicalRouteIdSchema = z.string().regex(CANONICAL_ROUTE_ID_PATTERN)

export const WorkflowSourceKindSchema = z.enum(WORKFLOW_SOURCE_KINDS)

export const SourcePresetSchema = z
  .object({
    routes: z.record(CanonicalRouteIdSchema, WorkflowSourceKindSchema),
  })
  .strict()

const LegacyRouterConfigSchema = z
  .object({
    workflow: WorkflowSchema.optional(),
    profiles: z.record(z.string().min(1), ProfileSchema),
    routes: z.record(z.string().min(1), z.string().min(1)).optional(),
    defaultRoute: z.string().min(1),
    superpowersCompatibility: SuperpowersCompatibilitySchema.optional(),
  })
  .strict()

  const SafeNameSchema = z.string().min(1).regex(SAFE_NAME_PATTERN)

  const CommandEntryOverrideSchema = z
    .object({
      name: SafeNameSchema.optional(),
      aliases: z.array(SafeNameSchema).optional(),
    })
    .strict()

  const CommandsOverrideSchema = z
    .object({
      status: CommandEntryOverrideSchema.optional(),
      use: CommandEntryOverrideSchema.optional(),
      disable: CommandEntryOverrideSchema.optional(),
      sync: CommandEntryOverrideSchema.optional(),
      doctor: CommandEntryOverrideSchema.optional(),
    })
    .strict()

  const LayeredSettingsSchema = z
    .object({
      enabled: z.boolean().optional(),
      activePreset: z.string().min(1).optional(),
      defaultLane: z.union([z.string().min(1), z.null()]).optional(),
      laneSelection: LaneSelectionSchema.optional(),
      subagentExecution: SubagentExecutionSchema.optional(),
      contextCompression: ContextCompressionSchema.optional(),
      commandPrefix: SafeNameSchema.optional(),
      commands: CommandsOverrideSchema.optional(),
      superpowersCompatibility: SuperpowersCompatibilitySchema.optional(),
      policyRulesMerge: z.enum(["concat", "replace"]).optional(),
      workloadMappingsMerge: z.enum(["concat", "replace"]).optional(),
  })
  .strict()

const ControlPlanePresetSchema = z
  .object({
    label: z.string().min(1),
    short: SafeNameSchema,
    description: z.string().min(1).optional(),
    extends: z.string().min(1).optional(),
    profiles: z.record(z.string().min(1), ProfileSchema).optional(),
    usesLanes: z.array(z.string().min(1)).optional(),
    defaultLane: z.string().min(1).optional(),
    sourcePreset: z.string().min(1).optional(),
    sourceRoutes: z.record(CanonicalRouteIdSchema, WorkflowSourceKindSchema).optional(),
    routes: z.record(z.string().min(1), z.string().min(1)),
    defaultRoute: z.string().min(1),
  })
  .strict()

const LayeredControlPlaneConfigSchema = z
  .object({
    workflow: WorkflowSchema.optional(),
    settings: LayeredSettingsSchema.optional(),
    sourcePresets: z.record(z.string().min(1), SourcePresetSchema).optional(),
    compressionPresets: z.record(z.string().min(1), CompressionPresetSchema).optional(),
    contextProviders: z.record(z.string().min(1), ContextProviderConfigSchema).optional(),
    authority: AuthoritySchema.optional(),
    evidence: EvidenceSchema.optional(),
    policyRules: z.array(PolicyRuleSchema).optional(),
    profiles: z.record(z.string().min(1), ProfileSchema).optional(),
    lanes: z.record(z.string().min(1), LaneSchema).optional(),
    presets: z.record(z.string().min(1), ControlPlanePresetSchema),
  })
  .strict()

type LegacyRouterConfigInput = z.infer<typeof LegacyRouterConfigSchema>
export type SuperpowersCompatibilityConfig = {
  mode: SuperpowersCompatibilityMode
  allowUntested: "warn" | "block"
  overrides?: {
    opencode?: {
      minimumSupportedVersion?: string
      testedRanges?: string[]
      knownBadRanges?: string[]
    }
    codex?: {
      minimumSupportedVersion?: string
      testedRanges?: string[]
      knownBadRanges?: string[]
    }
  }
}
export type DirectIntentConfig = z.infer<typeof DirectIntentSchema>
export type WorkflowConfig = z.infer<typeof WorkflowSchema>

export function getWorkflowRouteIds(workflow?: WorkflowConfig) {
  return workflow?.kind === "direct" ? Object.keys(workflow.intents) : [...SUPERPOWERS_ROUTE_CATALOG]
}

function validateDirectIntentIds(workflow: WorkflowConfig) {
  if (workflow.kind !== "direct") {
    return
  }

  for (const intentId of Object.keys(workflow.intents)) {
    if (!SAFE_NAME_PATTERN.test(intentId)) {
      throw new Error(`Invalid direct intent id: ${intentId}`)
    }
  }
}

export type RouterConfig = {
  workflow: WorkflowConfig
  profiles: Record<string, ControlPlaneProfile>
  lanes?: Record<string, ControlPlaneLane>
  availableLanes?: string[]
  effectiveSources?: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
  routes: Record<string, string>
  defaultRoute: string
  effectiveLane?: string
  superpowersCompatibility?: SuperpowersCompatibilityConfig
}

export type LoadedRouterConfig = {
  path: string
  config: RouterConfig & { superpowersCompatibility: SuperpowersCompatibilityConfig }
}

export type ControlPlaneCommandKey = (typeof CONTROL_PLANE_COMMAND_KEYS)[number]
export type ControlPlaneCommandConfig = {
  name: string
  aliases: string[]
}
export type ControlPlaneProfile = z.infer<typeof ProfileSchema>
export type ControlPlaneLaneSelection = z.infer<typeof LaneSelectionSchema>
export type ControlPlaneSubagentExecution = z.infer<typeof SubagentExecutionSchema>
export type ControlPlaneContextCompressionMode = z.infer<typeof ContextCompressionModeSchema>
export type ControlPlaneContextCompressionEngine = z.infer<typeof ContextCompressionEngineSchema>
export type ControlPlaneContextInlineLevel = z.infer<typeof ContextInlineLevelSchema>
type LayeredContextCompression = z.infer<typeof ContextCompressionSchema>
type LayeredCompressionPreset = z.infer<typeof CompressionPresetSchema>
export type ControlPlaneContextCompressionMoments = Required<z.infer<typeof ContextCompressionMomentsSchema>>
export type ControlPlaneContextCompressionSafety = Required<z.infer<typeof ContextCompressionSafetySchema>>
export type ControlPlaneContextCompression = Omit<Required<LayeredContextCompression>, "preset" | "moments" | "safety"> & {
  preset?: string
  moments: ControlPlaneContextCompressionMoments
  safety: ControlPlaneContextCompressionSafety
}
export type ControlPlaneCompressionPreset = Omit<ControlPlaneContextCompression, "preset">
export type ControlPlaneLane = z.infer<typeof LaneSchema>
export type ControlPlanePreset = z.infer<typeof ControlPlanePresetSchema>
export type ControlPlaneSourcePreset = SourcePresetConfig
export type ControlPlaneContextProviderCapability = ContextProviderCapability
type ParsedControlPlaneFileContextProviderConfig = z.infer<typeof FileContextProviderConfigSchema>
type ParsedControlPlaneCliContextProviderConfig = z.infer<typeof CliContextProviderConfigSchema>
type ParsedControlPlaneMcpContextProviderConfig = z.infer<typeof McpContextProviderConfigSchema>
export type ControlPlaneFileContextProviderConfig = Omit<ParsedControlPlaneFileContextProviderConfig, "capabilities"> & {
  capabilities: readonly ControlPlaneContextProviderCapability[]
}
export type ControlPlaneCliContextProviderConfig = Omit<ParsedControlPlaneCliContextProviderConfig, "args" | "capabilities"> & {
  args?: readonly string[]
  capabilities: readonly ControlPlaneContextProviderCapability[]
}
export type ControlPlaneMcpContextProviderConfig = Omit<ParsedControlPlaneMcpContextProviderConfig, "args" | "capabilities"> & {
  args?: readonly string[]
  capabilities: readonly ControlPlaneContextProviderCapability[]
}
export type ControlPlaneContextProviderConfig =
  | ControlPlaneFileContextProviderConfig
  | ControlPlaneCliContextProviderConfig
  | ControlPlaneMcpContextProviderConfig
export type ControlPlanePolicyRule = PolicyRule
export type ControlPlaneConfig = {
  workflow: WorkflowConfig
  settings: {
    enabled: boolean
    activePreset: string
    defaultLane?: string
    laneSelection: ControlPlaneLaneSelection
    subagentExecution: ControlPlaneSubagentExecution
    contextCompression?: ControlPlaneContextCompression
    commandPrefix: string
    commands: Record<ControlPlaneCommandKey, ControlPlaneCommandConfig>
    superpowersCompatibility: SuperpowersCompatibilityConfig
  }
  sourcePresets: Record<string, ControlPlaneSourcePreset>
  compressionPresets?: Record<string, ControlPlaneCompressionPreset>
  contextProviders?: Record<string, ControlPlaneContextProviderConfig>
  policyRules?: ControlPlanePolicyRule[]
  profiles: Record<string, ControlPlaneProfile>
  lanes: Record<string, ControlPlaneLane>
  presets: Record<string, ControlPlanePreset>
}

export type LayeredControlPlaneConfigInput = z.infer<typeof LayeredControlPlaneConfigSchema>
type CommandEntryOverride = z.infer<typeof CommandEntryOverrideSchema>
type CommandsOverride = z.infer<typeof CommandsOverrideSchema>
export type ControlPlaneSourceFormat = "layered" | "legacy"
export type LoadedControlPlaneSourceDocument = {
  format: ControlPlaneSourceFormat
  config: LayeredControlPlaneConfigInput
}

export type DiscoverConfigPathInput = {
  cwd: string
  homeDir?: string
  explicitPath?: string
  exists?: (filePath: string) => Promise<boolean>
}

export type LoadRouterConfigInput = {
  cwd: string
  explicitPath?: string
  exists?: (filePath: string) => Promise<boolean>
  readFile?: (filePath: string) => Promise<string>
}

export type LoadControlPlaneConfigInput = {
  cwd: string
  homeDir?: string
  explicitPath?: string
  allowRecovery?: boolean
  exists?: (filePath: string) => Promise<boolean>
  readFile?: (filePath: string) => Promise<string>
}

export type LoadedControlPlaneConfig = {
  path: string
  sources: string[]
  layers: Array<{
    path: string
    config: LayeredControlPlaneConfigInput
  }>
  hasRealSource: boolean
  config: ControlPlaneConfig
  recovery?: ConfigRecoveryState
}

type ControlPlaneLoadCandidate = {
  sources: string[]
  layers: LoadedControlPlaneConfig["layers"]
  merged: LayeredControlPlaneConfigInput
}

export class MissingControlPlaneConfigError extends Error {
  constructor() {
    super("Could not find oh-my-superagents.config.jsonc")
    this.name = "MissingControlPlaneConfigError"
  }
}

const DEFAULT_COMMANDS: Record<ControlPlaneCommandKey, ControlPlaneCommandConfig> = {
  status: { name: "status", aliases: ["st"] },
  use: { name: "use", aliases: ["u"] },
  disable: { name: "off", aliases: ["o"] },
  sync: { name: "sync", aliases: ["sy"] },
  doctor: { name: "doctor", aliases: ["dr"] },
}

const DEFAULT_CONTEXT_COMPRESSION_MOMENTS: ControlPlaneContextCompressionMoments = {
  subagentHandoff: false,
  planCheckpoint: false,
  reviewCheckpoint: false,
  verificationCheckpoint: false,
  sessionResume: false,
  sourceSwitch: false,
  branchIntegration: false,
}

const DEFAULT_CONTEXT_COMPRESSION_SAFETY: ControlPlaneContextCompressionSafety = {
  allowConditional: false,
  requireFreshVerification: true,
}

function finalizeContextCompressionMoments(
  moments: z.infer<typeof ContextCompressionMomentsSchema> | undefined,
): ControlPlaneContextCompressionMoments {
  return {
    ...DEFAULT_CONTEXT_COMPRESSION_MOMENTS,
    ...moments,
  }
}

function finalizeContextCompressionSafety(
  safety: z.infer<typeof ContextCompressionSafetySchema> | undefined,
): ControlPlaneContextCompressionSafety {
  return {
    ...DEFAULT_CONTEXT_COMPRESSION_SAFETY,
    ...safety,
  }
}

function finalizeContextCompression(
  compression: LayeredContextCompression | undefined,
): ControlPlaneContextCompression {
  return {
    ...(typeof compression?.preset === "string" ? { preset: compression.preset } : {}),
    mode: compression?.mode ?? "manual",
    engine: compression?.engine ?? "builtin",
    inlineLevel: compression?.inlineLevel ?? "minimal",
    moments: finalizeContextCompressionMoments(compression?.moments),
    safety: finalizeContextCompressionSafety(compression?.safety),
  }
}

function finalizeCompressionPresets(
  compressionPresets: Record<string, LayeredCompressionPreset> | undefined,
): Record<string, ControlPlaneCompressionPreset> {
  return Object.fromEntries(
    Object.entries(compressionPresets ?? {}).map(([key, preset]) => [
      key,
      {
        mode: preset.mode ?? "manual",
        engine: preset.engine ?? "builtin",
        inlineLevel: preset.inlineLevel ?? "minimal",
        moments: finalizeContextCompressionMoments(preset.moments),
        safety: finalizeContextCompressionSafety(preset.safety),
      },
    ]),
  )
}

export async function defaultExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return false
    }
    return false
  }
}

export function defaultReadFile(filePath: string) {
  return readFile(filePath, "utf8")
}

export function getProjectConfigPath(cwd: string) {
  return path.join(cwd, "oh-my-superagents.config.jsonc")
}

export function getGlobalConfigPath(homeDirectory: string) {
  return path.join(homeDirectory, ".config", "oh-my-superagents", "config.jsonc")
}

function synthesizeCommandEntry(
  key: ControlPlaneCommandKey,
  override: CommandEntryOverride | undefined,
): ControlPlaneCommandConfig {
  return {
    name: override?.name ?? DEFAULT_COMMANDS[key].name,
    aliases: [...(override?.aliases ?? DEFAULT_COMMANDS[key].aliases)],
  }
}

function synthesizeCommands(
  overrides: CommandsOverride | undefined,
): Record<ControlPlaneCommandKey, ControlPlaneCommandConfig> {
  return {
    status: synthesizeCommandEntry("status", overrides?.status),
    use: synthesizeCommandEntry("use", overrides?.use),
    disable: synthesizeCommandEntry("disable", overrides?.disable),
    sync: synthesizeCommandEntry("sync", overrides?.sync),
    doctor: synthesizeCommandEntry("doctor", overrides?.doctor),
  }
}

function cloneProfiles(profiles: Record<string, ControlPlaneProfile> | undefined) {
  if (!profiles) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(profiles).map(([key, profile]) => [key, { ...profile }]),
  )
}

function cloneLanes(lanes: Record<string, ControlPlaneLane>) {
  return Object.fromEntries(
    Object.entries(lanes).map(([key, lane]) => [key, { ...lane, routes: { ...lane.routes } }]),
  )
}

function createDefaultPreset(): ControlPlanePreset {
  return {
    label: "Default",
    short: "def",
    description: "General daily development",
    profiles: {
      strategy: { model: "anthropic/claude-sonnet-4-5-20250929", variant: "high" },
      build: { model: "openai/gpt-5", effort: "balanced" },
    },
    routes: {
      brainstorming: "strategy",
    },
    defaultRoute: "build",
  }
}

export function createDefaultControlPlaneConfig(): ControlPlaneConfig {
  const defaultPreset = createDefaultPreset()

  return {
    workflow: { kind: "superpowers" },
    settings: {
      enabled: true,
      activePreset: "default",
      laneSelection: { mode: "suggest" },
      subagentExecution: { mode: "suggest" },
      contextCompression: finalizeContextCompression(undefined),
      commandPrefix: "oms",
      commands: synthesizeCommands(undefined),
      superpowersCompatibility: { mode: "warn", allowUntested: "warn" },
    },
    sourcePresets: {},
    compressionPresets: {},
    contextProviders: {},
    policyRules: [],
    profiles: cloneProfiles(defaultPreset.profiles) ?? {},
    lanes: {},
    presets: {
      default: defaultPreset,
    },
  }
}

function hasOwnKey(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isMixedShape(rawConfig: Record<string, unknown>) {
  const isLayered = hasOwnKey(rawConfig, "settings")
    || hasOwnKey(rawConfig, "presets")
    || hasOwnKey(rawConfig, "compressionPresets")
    || hasOwnKey(rawConfig, "contextProviders")
    || hasOwnKey(rawConfig, "authority")
    || hasOwnKey(rawConfig, "evidence")
    || hasOwnKey(rawConfig, "policyRules")
  const hasLegacyKeys = LEGACY_ROUTER_ONLY_KEYS.some((key) => hasOwnKey(rawConfig, key))
  return isLayered && hasLegacyKeys
}

function migrateLegacyConfig(rawConfig: unknown): LayeredControlPlaneConfigInput {
  const parsed: LegacyRouterConfigInput = LegacyRouterConfigSchema.parse(rawConfig)

  return {
    workflow: parsed.workflow,
    settings: parsed.superpowersCompatibility
      ? { superpowersCompatibility: parsed.superpowersCompatibility }
      : undefined,
    profiles: parsed.profiles,
    presets: {
      default: {
        label: "Default",
        short: "def",
        description: "Migrated legacy OMS configuration",
        profiles: parsed.profiles,
        routes: parsed.routes ?? {},
        defaultRoute: parsed.defaultRoute,
      },
    },
  }
}

function getSourceFormat(rawConfig: Record<string, unknown>): ControlPlaneSourceFormat {
  return hasOwnKey(rawConfig, "settings")
    || hasOwnKey(rawConfig, "presets")
    || hasOwnKey(rawConfig, "compressionPresets")
    || hasOwnKey(rawConfig, "contextProviders")
    || hasOwnKey(rawConfig, "authority")
    || hasOwnKey(rawConfig, "evidence")
    || hasOwnKey(rawConfig, "policyRules")
    ? "layered"
    : "legacy"
}

export function normalizeRawConfig(rawConfig: unknown): LayeredControlPlaneConfigInput {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error("Config must be a JSON object")
  }

  const rawObject = rawConfig as Record<string, unknown>
  if (isMixedShape(rawObject)) {
    throw new Error("Invalid mixed-shape config: do not mix layered settings/presets with legacy routing keys")
  }

  if (
    hasOwnKey(rawObject, "settings")
    || hasOwnKey(rawObject, "presets")
    || hasOwnKey(rawObject, "compressionPresets")
    || hasOwnKey(rawObject, "contextProviders")
    || hasOwnKey(rawObject, "authority")
    || hasOwnKey(rawObject, "evidence")
    || hasOwnKey(rawObject, "policyRules")
  ) {
    return LayeredControlPlaneConfigSchema.parse(rawObject)
  }

  return migrateLegacyConfig(rawObject)
}

function mergeLayeredConfigs(
  lowerPriority: LayeredControlPlaneConfigInput,
  higherPriority: LayeredControlPlaneConfigInput,
): LayeredControlPlaneConfigInput {
  const mergedContextCompression =
    lowerPriority.settings?.contextCompression || higherPriority.settings?.contextCompression
      ? {
          ...lowerPriority.settings?.contextCompression,
          ...higherPriority.settings?.contextCompression,
          moments: {
            ...lowerPriority.settings?.contextCompression?.moments,
            ...higherPriority.settings?.contextCompression?.moments,
          },
          safety: {
            ...lowerPriority.settings?.contextCompression?.safety,
            ...higherPriority.settings?.contextCompression?.safety,
          },
        }
      : undefined

  const mergedSettings = {
    ...lowerPriority.settings,
    ...higherPriority.settings,
    commands: {
      ...lowerPriority.settings?.commands,
      ...higherPriority.settings?.commands,
    },
    contextCompression: mergedContextCompression,
  }

  if (higherPriority.settings && hasOwnKey(higherPriority.settings, "defaultLane") && higherPriority.settings.defaultLane === null) {
    mergedSettings.defaultLane = undefined
  }

  if (
    mergedContextCompression
    && higherPriority.settings?.contextCompression
    && hasOwnKey(higherPriority.settings.contextCompression, "preset")
    && higherPriority.settings.contextCompression.preset === null
  ) {
    mergedContextCompression.preset = undefined
  }

  const mergedCompressionPresets: NonNullable<LayeredControlPlaneConfigInput["compressionPresets"]> = {}
  for (const presetKey of new Set([
    ...Object.keys(lowerPriority.compressionPresets ?? {}),
    ...Object.keys(higherPriority.compressionPresets ?? {}),
  ])) {
    const lowerPreset = lowerPriority.compressionPresets?.[presetKey]
    const higherPreset = higherPriority.compressionPresets?.[presetKey]

    if (!lowerPreset && !higherPreset) {
      continue
    }

    mergedCompressionPresets[presetKey] = {
      ...lowerPreset,
      ...higherPreset,
      moments: {
        ...lowerPreset?.moments,
        ...higherPreset?.moments,
      },
      safety: {
        ...lowerPreset?.safety,
        ...higherPreset?.safety,
      },
    }
  }

  const workloadMappingsMerge = higherPriority.settings?.workloadMappingsMerge ?? "concat"
  const policyRulesMerge = higherPriority.settings?.policyRulesMerge ?? "concat"

  const mergedAuthority = lowerPriority.authority || higherPriority.authority
    ? {
        workloadMappings: workloadMappingsMerge === "replace"
          ? (higherPriority.authority?.workloadMappings ?? [])
          : [
              ...(lowerPriority.authority?.workloadMappings ?? []),
              ...(higherPriority.authority?.workloadMappings ?? []),
            ],
        policyRules: [
          ...(lowerPriority.authority?.policyRules ?? []),
          ...(higherPriority.authority?.policyRules ?? []),
        ],
      }
    : undefined

  return {
    workflow: higherPriority.workflow ?? lowerPriority.workflow,
    settings: mergedSettings,
    sourcePresets: {
      ...lowerPriority.sourcePresets,
      ...higherPriority.sourcePresets,
    },
    compressionPresets: mergedCompressionPresets,
    contextProviders: {
      ...lowerPriority.contextProviders,
      ...higherPriority.contextProviders,
    },
    authority: mergedAuthority,
    policyRules: policyRulesMerge === "replace"
      ? (higherPriority.policyRules ?? [])
      : [
          ...(lowerPriority.policyRules ?? []),
          ...(higherPriority.policyRules ?? []),
        ],
    profiles: {
      ...lowerPriority.profiles,
      ...higherPriority.profiles,
    },
    lanes: {
      ...lowerPriority.lanes,
      ...higherPriority.lanes,
    },
    presets: {
      ...lowerPriority.presets,
      ...higherPriority.presets,
    },
  }
}

function validateLaneReferences(config: ControlPlaneConfig) {
  const availableLanes = new Set(Object.keys(config.lanes))

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    for (const laneKey of preset.usesLanes ?? []) {
      if (!availableLanes.has(laneKey)) {
        throw new Error(`Preset ${presetKey} references unknown lane: ${laneKey}`)
      }
    }

    if (preset.defaultLane && !availableLanes.has(preset.defaultLane)) {
      throw new Error(`Preset ${presetKey} references unknown lane: ${preset.defaultLane}`)
    }
  }
}

function validateContextCompressionPresetReferences(config: ControlPlaneConfig) {
  const presetName = config.settings.contextCompression?.preset
  if (!presetName) {
    return
  }

  if (!config.compressionPresets?.[presetName]) {
    throw new Error(`Unknown compression preset: ${presetName}`)
  }
}

function validatePolicyRules(config: ControlPlaneConfig) {
  for (const [index, rule] of (config.policyRules ?? []).entries()) {
    for (const [key, value] of Object.entries(rule.selector)) {
      if (Array.isArray(value) && value.length === 0) {
        throw new Error(`Policy rule ${rule.id ?? index + 1} has an empty selector array for ${key}`)
      }
    }

    const compressionPreset = rule.policy.contextPolicy?.compressionPreset
    if (typeof compressionPreset === "string" && !config.compressionPresets?.[compressionPreset]) {
      throw new Error(`Policy rule ${rule.id ?? index + 1} references unknown compression preset: ${compressionPreset}`)
    }
  }
}

function assignDefaultRuleIds(rules: PolicyRule[]): PolicyRule[] {
  return rules.map((rule, i) => ({
    ...rule,
    id: rule.id || `rule-${String(i + 1).padStart(2, "0")}`,
  }))
}

function finalizeConfig(merged: LayeredControlPlaneConfigInput): ControlPlaneConfig {
  const finalized: ControlPlaneConfig = {
    workflow: merged.workflow ?? { kind: "superpowers" },
    settings: {
      enabled: merged.settings?.enabled ?? true,
      activePreset: merged.settings?.activePreset ?? "default",
      defaultLane: merged.settings?.defaultLane ?? undefined,
      laneSelection: merged.settings?.laneSelection ?? { mode: "suggest" },
      subagentExecution: merged.settings?.subagentExecution ?? { mode: "suggest" },
      contextCompression: finalizeContextCompression(merged.settings?.contextCompression),
      commandPrefix: merged.settings?.commandPrefix ?? "oms",
      commands: synthesizeCommands(merged.settings?.commands),
      superpowersCompatibility: merged.settings?.superpowersCompatibility ?? { mode: "warn", allowUntested: "warn" },
    },
    sourcePresets: merged.sourcePresets ?? {},
    compressionPresets: finalizeCompressionPresets(merged.compressionPresets),
    contextProviders: cloneContextProviders(merged.contextProviders),
    policyRules: assignDefaultRuleIds([
      ...(clonePolicyRules(merged.authority?.policyRules) ?? []),
      ...(clonePolicyRules(merged.policyRules) ?? []),
    ]),
    profiles: cloneProfiles(merged.profiles) ?? {},
    lanes: cloneLanes(merged.lanes ?? {}),
    presets: merged.presets,
  }

  validateDirectIntentIds(finalized.workflow)
  validateLaneReferences(finalized)
  validateContextCompressionPresetReferences(finalized)
  validatePolicyRules(finalized)
  return finalized
}

function attachContextProviderBaseDirs(
  providers: Record<string, ControlPlaneContextProviderConfig> | undefined,
  baseDir: string,
): void {
  for (const provider of Object.values(providers ?? {})) {
    Object.defineProperty(provider, CONTEXT_PROVIDER_BASE_DIR_KEY, {
      value: baseDir,
      enumerable: false,
      configurable: true,
      writable: true,
    })
  }
}

function getContextProviderBaseDir(
  provider: ControlPlaneContextProviderConfig,
): string | undefined {
  const baseDir = Reflect.get(provider, CONTEXT_PROVIDER_BASE_DIR_KEY)
  return typeof baseDir === "string" ? baseDir : undefined
}

function cloneContextProvider(
  provider: ControlPlaneContextProviderConfig,
): ControlPlaneContextProviderConfig {
  const baseDir = getContextProviderBaseDir(provider)

  if (provider.kind === "file") {
    const cloned = {
      ...provider,
      capabilities: [...provider.capabilities],
    }

    if (baseDir) {
      attachContextProviderBaseDirs({ provider: cloned }, baseDir)
    }

    return cloned
  }

  const cloned = {
    ...provider,
    args: provider.args ? [...provider.args] : undefined,
    capabilities: [...provider.capabilities],
  }

  if (baseDir) {
    attachContextProviderBaseDirs({ provider: cloned }, baseDir)
  }

  return cloned
}

function cloneContextProviders(
  providers: Record<string, ControlPlaneContextProviderConfig> | undefined,
): Record<string, ControlPlaneContextProviderConfig> {
  if (!providers) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(providers).map(([providerId, provider]) => [providerId, cloneContextProvider(provider)]),
  )
}

function clonePreset(preset: ControlPlanePreset): ControlPlanePreset {
  return {
    ...preset,
    profiles: cloneProfiles(preset.profiles),
    usesLanes: preset.usesLanes ? [...preset.usesLanes] : undefined,
    sourceRoutes: preset.sourceRoutes ? { ...preset.sourceRoutes } : undefined,
    routes: { ...preset.routes },
  }
}

function getEffectiveProfilesForPreset(config: ControlPlaneConfig, preset: ControlPlanePreset) {
  return {
    ...config.profiles,
    ...(preset.profiles ?? {}),
  }
}

function validateLaneTargets(config: ControlPlaneConfig) {
  const validRouteIds = new Set(getWorkflowRouteIds(config.workflow))

  for (const lane of Object.values(config.lanes)) {
    for (const routeId of Object.keys(lane.routes)) {
      if (!validRouteIds.has(routeId)) {
        throw new Error(config.workflow.kind === "direct" ? `Unknown intent: ${routeId}` : `Unknown phase: ${routeId}`)
      }
    }
  }

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    const effectiveProfiles = getEffectiveProfilesForPreset(config, preset)

    for (const laneKey of preset.usesLanes ?? []) {
      const lane = config.lanes[laneKey]
      if (!lane) {
        continue
      }

      if (!effectiveProfiles[lane.defaultRoute]) {
        throw new Error(`Preset ${presetKey} lane ${laneKey} has unknown defaultRoute profile: ${lane.defaultRoute}`)
      }

      for (const target of Object.values(lane.routes)) {
        if (!effectiveProfiles[target]) {
          throw new Error(`Preset ${presetKey} lane ${laneKey} has unknown profile: ${target}`)
        }
      }
    }
  }
}

function getValidCanonicalRouteIds(workflow: WorkflowConfig): Set<string> {
  return new Set<string>(
    workflow.kind === "direct"
      ? Object.keys(workflow.intents).map((intentId) => toDirectCanonicalRouteId(intentId))
      : [
          ...SUPERPOWERS_ROUTE_CATALOG.map((phase) => toSuperpowersCanonicalRouteId(phase)),
          ...Object.keys(GSTACK_SOURCE_CATALOG),
        ],
  )
}

function validateSourceRouting(config: ControlPlaneConfig) {
  const validCanonicalRouteIds = getValidCanonicalRouteIds(config.workflow)
  const validateSourceKindForRoute = (scope: string, routeId: string, source: WorkflowSourceKind) => {
    if (isSourceRouteSupported(source, routeId as CanonicalRouteId)) {
      return
    }

    if (source === "direct") {
      throw new Error(`${scope} cannot route ${routeId} through direct source`)
    }

    if (routeId.startsWith("intent.")) {
      throw new Error(`${scope} cannot route ${routeId} through non-direct source ${source}`)
    }

    throw new Error(`${scope} cannot route unsupported canonical route ${routeId} through ${source} source`)
  }

  for (const [sourcePresetKey, sourcePreset] of Object.entries(config.sourcePresets)) {
    for (const [routeId, source] of Object.entries(sourcePreset.routes) as Array<[string, WorkflowSourceKind]>) {
      if (!validCanonicalRouteIds.has(routeId)) {
        throw new Error(`Source preset ${sourcePresetKey} references unknown canonical route: ${routeId}`)
      }

      validateSourceKindForRoute(`Source preset ${sourcePresetKey}`, routeId, source)
    }
  }

  for (const [presetKey, preset] of Object.entries(config.presets)) {
    if (preset.sourcePreset && !config.sourcePresets[preset.sourcePreset]) {
      throw new Error(`Preset ${presetKey} references unknown sourcePreset: ${preset.sourcePreset}`)
    }

    for (const [routeId, source] of Object.entries(preset.sourceRoutes ?? {}) as Array<[string, WorkflowSourceKind]>) {
      if (!validCanonicalRouteIds.has(routeId as string)) {
        throw new Error(`Preset ${presetKey} references unknown canonical route: ${routeId}`)
      }

      validateSourceKindForRoute(`Preset ${presetKey}`, routeId, source)
    }
  }
}

const MAX_EXTENDS_DEPTH = 5

function validatePresetExtendsDepth(
  presets: Record<string, ControlPlanePreset>,
  presetKey: string,
  depth: number = 0,
  visiting: Set<string> = new Set(),
): void {
  if (depth > MAX_EXTENDS_DEPTH) {
    throw new Error(`Preset extends chain exceeds maximum depth of ${MAX_EXTENDS_DEPTH}`)
  }

  if (visiting.has(presetKey)) {
    throw new Error(`Circular preset extends detected: ${presetKey}`)
  }

  const preset = presets[presetKey]
  if (!preset) {
    throw new Error(`Unknown preset: ${presetKey}`)
  }

  if (preset.extends) {
    const parentPreset = presets[preset.extends]
    if (!parentPreset) {
      throw new Error(`Preset ${presetKey} extends unknown preset: ${preset.extends}`)
    }
    visiting.add(presetKey)
    validatePresetExtendsDepth(presets, preset.extends, depth + 1, visiting)
  }
}

export function resolvePresetReuse(config: ControlPlaneConfig): ControlPlaneConfig {
  for (const presetKey of Object.keys(config.presets)) {
    validatePresetExtendsDepth(config.presets, presetKey)
  }

  const visiting = new Set<string>()
  const resolved = new Map<string, ControlPlanePreset>()

  const resolvePreset = (presetKey: string): ControlPlanePreset => {
    const cached = resolved.get(presetKey)
    if (cached) {
      return cached
    }

    const preset = config.presets[presetKey]
    if (!preset) {
      throw new Error(`Unknown preset: ${presetKey}`)
    }

    if (visiting.has(presetKey)) {
      throw new Error(`Circular preset extends detected: ${presetKey}`)
    }

    visiting.add(presetKey)

    let nextPreset: ControlPlanePreset
    if (!preset.extends) {
      nextPreset = clonePreset(preset)
    } else {
      const parentPreset = config.presets[preset.extends]
      if (!parentPreset) {
        throw new Error(`Preset ${presetKey} extends unknown preset: ${preset.extends}`)
      }

      const resolvedParent = resolvePreset(preset.extends)
      nextPreset = {
        ...preset,
        defaultLane: preset.defaultLane ?? resolvedParent.defaultLane,
        sourcePreset: preset.sourcePreset ?? resolvedParent.sourcePreset,
        profiles:
          resolvedParent.profiles || preset.profiles
            ? {
                ...(resolvedParent.profiles ?? {}),
                ...(preset.profiles ?? {}),
              }
            : undefined,
        usesLanes: preset.usesLanes
          ? [...preset.usesLanes]
          : resolvedParent.usesLanes
            ? [...resolvedParent.usesLanes]
            : undefined,
        routes: {
          ...resolvedParent.routes,
          ...preset.routes,
        },
        sourceRoutes:
          resolvedParent.sourceRoutes || preset.sourceRoutes
            ? {
                ...(resolvedParent.sourceRoutes ?? {}),
                ...(preset.sourceRoutes ?? {}),
              }
            : undefined,
      }
    }

    visiting.delete(presetKey)
    resolved.set(presetKey, nextPreset)
    return nextPreset
  }

  return {
    ...config,
    presets: Object.fromEntries(
      Object.keys(config.presets).map((presetKey) => [presetKey, resolvePreset(presetKey)]),
    ),
  }
}

export async function readControlPlaneSourceDocument(
  filePath: string,
  reader: (filePath: string) => Promise<string>,
  baseDir = path.dirname(filePath),
): Promise<LoadedControlPlaneSourceDocument> {
  const parseErrors: ParseError[] = []
  const rawConfig = parse(await reader(filePath), parseErrors)

  if (parseErrors.length > 0) {
    throw new Error(`Invalid JSONC in ${filePath}`)
  }

  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error("Config must be a JSON object")
  }

  const rawObject = rawConfig as Record<string, unknown>

  const config = normalizeRawConfig(rawObject)
  attachContextProviderBaseDirs(config.contextProviders, baseDir)

  return {
    format: getSourceFormat(rawObject),
    config,
  }
}

async function readConfigFile(
  filePath: string,
  reader: (filePath: string) => Promise<string>,
  baseDir = path.dirname(filePath),
): Promise<LayeredControlPlaneConfigInput> {
  return (await readControlPlaneSourceDocument(filePath, reader, baseDir)).config
}

export async function defaultIsWritable(filePath: string) {
  try {
    await access(filePath, constants.F_OK)
  } catch {
    let candidate = path.dirname(filePath)

    while (true) {
      try {
        await access(candidate, constants.F_OK)
        try {
          await access(candidate, constants.W_OK)
          return true
        } catch {
          return false
        }
      } catch {
        const parent = path.dirname(candidate)
        if (parent === candidate) {
          break
        }

        candidate = parent
      }
    }

    return false
  }

  try {
    await access(filePath, constants.W_OK)
    return true
  } catch {
    return false
  }
}

export async function discoverConfigPath(input: DiscoverConfigPathInput) {
  const exists = input.exists ?? defaultExists
  const homeDirectory = input.homeDir ?? homedir()

  if (input.explicitPath) {
    return input.explicitPath
  }

  const projectPath = getProjectConfigPath(input.cwd)
  if (await exists(projectPath)) {
    return projectPath
  }

  const globalPath = getGlobalConfigPath(homeDirectory)
  if (await exists(globalPath)) {
    return globalPath
  }

  return undefined
}

export async function loadControlPlaneConfig(
  input: LoadControlPlaneConfigInput,
): Promise<LoadedControlPlaneConfig> {
  const exists = input.exists
  const reader = input.readFile ?? defaultReadFile
  const fileAvailable = exists ?? (async (filePath: string): Promise<boolean> => {
    try {
      await reader(filePath)
      return true
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return false
      }
      throw err
    }
  })
  const homeDirectory = input.homeDir ?? homedir()
  const globalPath = getGlobalConfigPath(homeDirectory)
  const projectPath = getProjectConfigPath(input.cwd)
  let overlayPath: string | undefined
  let sources: string[]

  if (input.explicitPath) {
    if (input.explicitPath === projectPath) {
      const [explicitAvailable, globalAvailable] = await Promise.all([
        fileAvailable(input.explicitPath),
        fileAvailable(globalPath),
      ])

      if (explicitAvailable) {
        sources = globalAvailable
          ? [globalPath, input.explicitPath]
          : [input.explicitPath]
      } else if (globalAvailable) {
        overlayPath = input.explicitPath
        sources = [globalPath]
      } else {
        sources = []
      }
    } else {
      sources = (await fileAvailable(input.explicitPath)) ? [input.explicitPath] : []
    }
  } else {
    sources = (
      await Promise.all([
        globalPath,
        projectPath,
      ].map(async (filePath) => ((await fileAvailable(filePath)) ? filePath : undefined)))
    ).filter((filePath): filePath is string => Boolean(filePath))
  }

  if (sources.length === 0) {
    throw new MissingControlPlaneConfigError()
  }

  const authorityPath = sources[sources.length - 1]!
  const baseSources = sources.slice(0, -1)

  let mergedBase: LayeredControlPlaneConfigInput | undefined
  const baseLayers: LoadedControlPlaneConfig["layers"] = []
  for (const filePath of baseSources) {
    const loaded = await readConfigFile(filePath, reader)
    baseLayers.push({ path: filePath, config: loaded })
    mergedBase = mergedBase ? mergeLayeredConfigs(mergedBase, loaded) : loaded
  }

  const loadCandidate = async (activeAuthorityPath: string): Promise<ControlPlaneLoadCandidate> => {
    let merged = mergedBase
    const layers: LoadedControlPlaneConfig["layers"] = [...baseLayers]

    const loaded = await readConfigFile(activeAuthorityPath, reader)
    layers.push({ path: activeAuthorityPath, config: loaded })
    merged = merged ? mergeLayeredConfigs(merged, loaded) : loaded

    if (overlayPath) {
      const overlayConfig: LayeredControlPlaneConfigInput = { presets: {} }
      layers.push({ path: overlayPath, config: overlayConfig })
      merged = merged ? mergeLayeredConfigs(merged, overlayConfig) : overlayConfig
    }

    return {
      sources: [
        ...baseSources,
        activeAuthorityPath,
      ],
      layers,
      merged: merged ?? { presets: {} },
    }
  }

  const resolveValidatedConfig = (merged: LayeredControlPlaneConfigInput): ControlPlaneConfig => {
    const config = resolvePresetReuse(finalizeConfig(merged))
    validateSourceRouting(config)
    validateLaneTargets(config)
    return config
  }

  if (mergedBase) {
    resolveValidatedConfig(mergedBase)
  }

  const finalizeLoadedConfig = (
    candidate: ControlPlaneLoadCandidate,
    recovery?: ConfigRecoveryState,
  ): LoadedControlPlaneConfig => {
    const config = resolveValidatedConfig(candidate.merged)

    return {
      path: recovery?.activeSource === "last-known-good"
        ? authorityPath
        : overlayPath ?? authorityPath,
      sources: candidate.sources,
      layers: candidate.layers,
      hasRealSource: true,
      config,
      recovery: recovery ?? { activeSource: "authority" },
    }
  }

  try {
    return finalizeLoadedConfig(await loadCandidate(authorityPath))
  } catch (error) {
    if (input.allowRecovery === false) {
      throw error
    }

    const authorityError = error instanceof Error ? error : new Error(String(error))
    const lastKnownGoodPath = getLastKnownGoodPath(authorityPath)
    const hasLastKnownGood = await fileAvailable(lastKnownGoodPath)
    if (!shouldFallbackToLastKnownGood({ authorityError, hasLastKnownGood })) {
      throw error
    }

    return finalizeLoadedConfig(
      await (async () => {
        let merged = mergedBase
        const layers: LoadedControlPlaneConfig["layers"] = [...baseLayers]

        const loaded = await readConfigFile(lastKnownGoodPath, reader, path.dirname(authorityPath))
        layers.push({ path: lastKnownGoodPath, config: loaded })
        merged = merged ? mergeLayeredConfigs(merged, loaded) : loaded

        if (overlayPath) {
          const overlayConfig: LayeredControlPlaneConfigInput = { presets: {} }
          layers.push({ path: overlayPath, config: overlayConfig })
          merged = merged ? mergeLayeredConfigs(merged, overlayConfig) : overlayConfig
        }

        return {
          sources: [
            ...baseSources,
            lastKnownGoodPath,
          ],
          layers,
          merged: merged ?? { presets: {} },
        }
      })(),
      {
        activeSource: "last-known-good",
        authorityError: authorityError.message,
        lastKnownGoodPath,
      },
    )
  }
}

export async function loadRouterConfig(input: LoadRouterConfigInput): Promise<LoadedRouterConfig> {
  const loaded = await loadControlPlaneConfig(input)
  const activePreset = loaded.config.presets[loaded.config.settings.activePreset]

  if (!activePreset) {
    throw new Error(`Unknown preset: ${loaded.config.settings.activePreset}`)
  }

  const effectiveSources = normalizeWorkflowSourceRoutes(
    loaded.config.workflow,
    {
      ...(activePreset.sourcePreset ? (loaded.config.sourcePresets[activePreset.sourcePreset]?.routes ?? {}) : {}),
      ...(activePreset.sourceRoutes ?? {}),
    },
  )

  const config: LoadedRouterConfig["config"] = {
    workflow: loaded.config.workflow,
    profiles: {
      ...loaded.config.profiles,
      ...(activePreset.profiles ?? {}),
    },
    lanes: loaded.config.lanes,
    availableLanes: activePreset.usesLanes,
    effectiveSources,
    routes: activePreset.routes,
    defaultRoute: activePreset.defaultRoute,
    effectiveLane: loaded.config.settings.defaultLane ?? activePreset.defaultLane,
    superpowersCompatibility: loaded.config.settings.superpowersCompatibility,
  }

  const validRouteIds = new Set(getWorkflowRouteIds(config.workflow))

  for (const routeId of Object.keys(config.routes)) {
    if (!validRouteIds.has(routeId)) {
      throw new Error(
        config.workflow.kind === "direct" ? `Unknown intent: ${routeId}` : `Unknown phase: ${routeId}`,
      )
    }

    const target = config.routes[routeId]
    if (!config.profiles[target]) {
      throw new Error(`Unknown profile: ${target}`)
    }
  }

  if (!config.profiles[config.defaultRoute]) {
    throw new Error(`Unknown profile: ${config.defaultRoute}`)
  }

  return {
    path: loaded.path,
    config,
  }
}
