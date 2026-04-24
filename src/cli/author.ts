import path from "node:path"
import { parse, type ParseError } from "jsonc-parser"
import { z } from "zod"
import {
  applyRoutingProposalToConfig,
  buildRoutingProposal,
  inspectRoutingAuthoringInputs,
  renderRoutingConfigDocument,
  type ModelInventory,
} from "../author-routing.js"
import { buildPolicyAuthoringProposal } from "../author-policy.js"
import {
  createDefaultControlPlaneConfig,
  discoverConfigPath,
  getGlobalConfigPath,
  getProjectConfigPath,
  loadControlPlaneConfig,
  readControlPlaneSourceDocument,
  type LayeredControlPlaneConfigInput,
} from "../config.js"
import { resolveControlPlane } from "../control-plane/index.js"
import { writeAuthorityWithRecoverySnapshotAtomically } from "../config-write.js"
import { isAuthorRoutingMode, isMissingFsError, isRecord, formatAuthorRoutingOutput, formatAuthorRoutingSummary, formatAuthorRoutingDiff, formatAuthorPolicyOutput, inferHomeDirFromGlobalConfigPath, authorityWorkloadMappingsEqual, authorityPolicyRulesEqual } from "./shared.js"
import type { CliDeps, CliResult } from "./types.js"

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
  const previousRenderedDocument = hasExistingConfig ? await deps.readArtifactFile(targetPath) : ""
  const effectiveConfig = (write || hasExistingConfig)
    ? (await deps.resolveControlPlane({ command: "status", cwd, explicitPath })).config
    : undefined
  const existingConfig = hasExistingConfig
    ? (await readControlPlaneSourceDocument(targetPath, async () => previousRenderedDocument)).config
    : undefined

  const nextDocument = applyRoutingProposalToConfig(
    proposal,
    existingConfig,
    { effectiveConfig },
  )
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

async function validateAuthorPolicyWriteCandidate(
  cwd: string,
  targetPath: string,
  sourcePath: string,
  renderedDocument: string,
  homeDirectory: string | undefined,
  deps: CliDeps,
) {
  const exists = async (filePath: string) => (
    filePath === targetPath || filePath === sourcePath ? true : deps.artifactExists(filePath)
  )
  const readFile = async (filePath: string) => (
    filePath === targetPath ? renderedDocument : deps.readArtifactFile(filePath)
  )

  await resolveControlPlane({
    command: "status",
    cwd,
    explicitPath: targetPath,
    ...(homeDirectory ? { homeDir: homeDirectory } : {}),
    exists,
    readFile,
    loadControlPlaneConfig: (input) => loadControlPlaneConfig({ ...input, allowRecovery: false }),
    buildContextIndex: async () => ({ artifacts: [], warnings: [] }),
    resolveContextProviders: async () => [],
  })
}

async function buildAuthorPolicyPreview(
  cwd: string,
  explicitPath: string | undefined,
  deps: CliDeps,
  write: boolean,
  answers: {
    verifyNeedsVision: boolean
    subagentsUsePackets: boolean
  },
) {
  const projectPath = getProjectConfigPath(cwd)
  const globalPath = deps.homeDir ? getGlobalConfigPath(deps.homeDir()) : undefined
  const explicitProjectOverlay = explicitPath === projectPath
  const explicitRuntimeLayer = explicitPath === projectPath || (globalPath !== undefined && explicitPath === globalPath)
  const discoveredPath = explicitProjectOverlay
    ? await deps.discoverConfigPath({
        cwd,
        exists: async (filePath: string) => filePath === projectPath ? false : deps.artifactExists(filePath),
      })
      ?? projectPath
    : explicitPath
      ?? await deps.discoverConfigPath({ cwd, exists: deps.artifactExists })
      ?? projectPath
  const targetPath = explicitPath && explicitPath !== projectPath
    ? projectPath
    : (explicitPath ?? projectPath)
  const emptyDocument: Awaited<ReturnType<typeof readControlPlaneSourceDocument>> = {
    format: "layered",
    config: { presets: {} },
  }
  const readDocumentOrEmpty = async (filePath: string) => {
    try {
      return await readControlPlaneSourceDocument(filePath, deps.readArtifactFile)
    } catch (error) {
      if (isMissingFsError(error)) {
        return emptyDocument
      }

      throw error
    }
  }
  const sourceDocument = await readDocumentOrEmpty(discoveredPath)
  const targetDocument = discoveredPath === targetPath
    ? sourceDocument
    : await deps.artifactExists(targetPath)
      ? await readDocumentOrEmpty(targetPath)
      : emptyDocument
  const layeredSourceDocument = explicitProjectOverlay && discoveredPath !== targetPath
    ? {
        config: {
          ...sourceDocument.config,
          settings: {
            ...sourceDocument.config.settings,
            ...targetDocument.config.settings,
          },
          authority: targetDocument.config.authority
            ? {
                workloadMappings: [
                  ...(sourceDocument.config.authority?.workloadMappings ?? []),
                  ...(targetDocument.config.authority?.workloadMappings ?? []),
                ],
                policyRules: [
                  ...(sourceDocument.config.authority?.policyRules ?? []),
                  ...(targetDocument.config.authority?.policyRules ?? []),
                ],
              }
            : sourceDocument.config.authority,
          evidence: targetDocument.config.evidence ?? sourceDocument.config.evidence,
        } satisfies LayeredControlPlaneConfigInput,
      }
    : sourceDocument
  const evidence = layeredSourceDocument.config.evidence
  const existingAuthority = targetDocument.config.authority
  const inheritedAuthority = layeredSourceDocument.config.authority
  const bootstrapDocument = (() => {
    const defaults = createDefaultControlPlaneConfig()
    return {
      settings: { activePreset: defaults.settings.activePreset },
      profiles: { build: { ...defaults.profiles.build! } },
      presets: {
        default: {
          label: defaults.presets.default.label,
          short: defaults.presets.default.short,
          routes: {},
          defaultRoute: "build",
        },
      },
    } satisfies LayeredControlPlaneConfigInput
  })()
  const standaloneSourceBootstrap = (() => {
    if (explicitPath === undefined || explicitRuntimeLayer || discoveredPath === targetPath) {
      return undefined
    }

    if (
      sourceDocument.config.settings
      && Object.keys(sourceDocument.config.presets).length > 0
      && sourceDocument.config.profiles
      && Object.keys(sourceDocument.config.profiles).length > 0
    ) {
      return sourceDocument.config
    }

    return undefined
  })()

  const proposal = buildPolicyAuthoringProposal({
    detectedPaths: evidence?.detectedPaths ?? [],
    answers,
  })
  const hasTargetOverlayState = Boolean(
    targetDocument.config.authority
    || targetDocument.config.settings
    || targetDocument.config.evidence
    || targetDocument.config.workflow
    || targetDocument.config.profiles
    || targetDocument.config.lanes
    || targetDocument.config.sourcePresets
    || targetDocument.config.compressionPresets
    || targetDocument.config.contextProviders
    || targetDocument.config.policyRules
    || Object.keys(targetDocument.config.presets).length > 0,
  )
  const mergedAuthority = {
    workloadMappings: [
      ...(existingAuthority?.workloadMappings ?? []),
      ...proposal.authority.workloadMappings.filter((mapping) => ![
        ...(inheritedAuthority?.workloadMappings ?? []),
        ...(existingAuthority?.workloadMappings ?? []),
      ].some((existing) => authorityWorkloadMappingsEqual(existing, mapping))),
    ],
    policyRules: [
      ...(existingAuthority?.policyRules ?? []),
      ...proposal.authority.policyRules.filter((rule) => ![
        ...(inheritedAuthority?.policyRules ?? []),
        ...(existingAuthority?.policyRules ?? []),
      ].some((existing) => authorityPolicyRulesEqual(existing as Record<string, unknown>, rule as Record<string, unknown>))),
    ],
  }
  const nextDocument: LayeredControlPlaneConfigInput = {
    ...(hasTargetOverlayState
      ? targetDocument.config
      : (standaloneSourceBootstrap
          ?? (discoveredPath !== targetPath ? { presets: {} } satisfies LayeredControlPlaneConfigInput : bootstrapDocument))),
    authority: mergedAuthority,
  }
  if (!hasTargetOverlayState && sourceDocument.config.settings?.defaultLane) {
    nextDocument.settings = {
      ...nextDocument.settings,
      defaultLane: null,
    }
  }
  const renderedDocument = `${JSON.stringify(nextDocument, null, 2)}\n`
  const operation = hasTargetOverlayState ? "update" as const : "create" as const

  if (write) {
    await validateAuthorPolicyWriteCandidate(
      cwd,
      targetPath,
      discoveredPath,
      renderedDocument,
      deps.homeDir?.() ?? inferHomeDirFromGlobalConfigPath(discoveredPath),
      deps,
    )
    await writeAuthorityWithRecoverySnapshotAtomically(targetPath, renderedDocument, deps)
  }

  return {
    proposal,
    preview: {
      path: targetPath,
      operation,
      rendered: renderedDocument,
    },
    written: write,
    summaryText: [
      `Authority authoring ${write ? "write" : "preview"}`,
      `Source: ${discoveredPath}`,
      `Target: ${targetPath}`,
      `Detected paths: ${evidence?.detectedPaths.length ?? 0}`,
      `Notes: ${proposal.notes.length}`,
    ].join("\n"),
  }
}

export async function handleAuthorRouting(
  cwd: string,
  explicitPath: string | undefined,
  flags: Map<string, string | true>,
  deps: CliDeps,
): Promise<CliResult> {
  const mode = flags.get("--mode")
  const modeStr = typeof mode === "string" ? mode : undefined
  if (!isAuthorRoutingMode(modeStr)) {
    return { exitCode: 1, stdout: "", stderr: "Missing or invalid --mode (supported: superpowers, direct)" }
  }

  const modelsPath = flags.get("--models")
  const modelsPathStr = typeof modelsPath === "string" ? modelsPath : undefined
  if (!modelsPathStr) {
    return { exitCode: 1, stdout: "", stderr: "Missing required --models" }
  }

  const write = flags.get("--write") === true
  const output = await buildAuthorRoutingPreview(cwd, explicitPath, modeStr, modelsPathStr, write, deps)

  return {
    exitCode: 0,
    stdout: JSON.stringify(output, null, 2),
    stderr: formatAuthorRoutingOutput(output),
  }
}

export async function handleConfigAuthor(
  cwd: string,
  explicitPath: string | undefined,
  flags: Map<string, string | true>,
  deps: CliDeps,
): Promise<CliResult> {
  const preview = flags.get("--preview") === true
  const write = flags.get("--write") === true
  if (preview === write) {
    return { exitCode: 1, stdout: "", stderr: "Specify exactly one of --preview or --write" }
  }
  const output = await buildAuthorPolicyPreview(cwd, explicitPath, deps, write, {
    verifyNeedsVision: flags.get("--verify-needs-vision") === true,
    subagentsUsePackets: flags.get("--subagents-use-packets") === true,
  })

  return {
    exitCode: 0,
    stdout: write
      ? `Wrote authority config to ${output.preview.path}\n\n${output.preview.rendered}`
      : `Proposed authority config\n\n${output.preview.rendered}`,
    stderr: formatAuthorPolicyOutput(output),
  }
}
