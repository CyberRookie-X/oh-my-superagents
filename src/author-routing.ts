import path from "node:path"
import {
  createDefaultControlPlaneConfig,
  defaultExists,
  defaultReadFile,
  type ControlPlaneLane,
  type ControlPlanePreset,
  type ControlPlaneProfile,
  type DirectIntentConfig,
  type LayeredControlPlaneConfigInput,
  type WorkflowConfig,
} from "./config.js"

export type ModelInventory = {
  models: Record<
    string,
    {
      model: string
      specialties?: string[]
      effort?: "fast" | "balanced" | "deep" | "max"
      codexFast?: boolean
    }
  >
}

export type InspectRoutingAuthoringInputsArgs = {
  cwd: string
  exists?: (filePath: string) => Promise<boolean>
  readFile?: (filePath: string) => Promise<string>
  readdir?: (filePath: string) => Promise<string[]>
}

export type RoutingAuthoringInputs = {
  suggestedLanes: string[]
}

export type BuildRoutingProposalArgs = {
  mode: WorkflowConfig["kind"]
  suggestedLanes: string[]
  inventory: ModelInventory
}

export type RoutingProposal = {
  workflow: WorkflowConfig
  profiles: Record<string, ControlPlaneProfile>
  lanes: Record<string, ControlPlaneLane>
  presets: {
    default: ControlPlanePreset
  }
}

type LayeredRoutingSections = Pick<LayeredControlPlaneConfigInput, "workflow" | "settings" | "profiles" | "lanes" | "presets">

const FRONTEND_LANE = "frontend"
const BACKEND_LANE = "backend"
const BUILD_INTENT = "build"
const REVIEW_INTENT = "review"
const KNOWN_LANES = [FRONTEND_LANE, BACKEND_LANE] as const

type InventoryEntry = [string, ModelInventory["models"][string]]

export async function inspectRoutingAuthoringInputs({
  cwd,
  exists = defaultExists,
  readFile = defaultReadFile,
}: InspectRoutingAuthoringInputsArgs): Promise<RoutingAuthoringInputs> {
  const packageJsonPath = path.join(cwd, "package.json")
  const packageJson = (await exists(packageJsonPath)) ? await readPackageJson(packageJsonPath, readFile) : undefined

  const suggestedLanes: string[] = []

  if (
    hasAnyDependency(packageJson, ["react", "next", "vue", "svelte", "@angular/core"]) ||
    (await hasAnyPath(cwd, ["src/components/App.tsx", "src/App.tsx", "app/page.tsx", "pages/index.tsx"], exists))
  ) {
    suggestedLanes.push(FRONTEND_LANE)
  }

  if (
    hasAnyDependency(packageJson, ["express", "fastify", "koa", "hono"]) ||
    (await hasAnyPath(cwd, ["server/main.py", "server/index.ts", "server.js", "api/index.ts", "backend/main.py"], exists))
  ) {
    suggestedLanes.push(BACKEND_LANE)
  }

  return { suggestedLanes }
}

export function buildRoutingProposal({
  mode,
  suggestedLanes,
  inventory,
}: BuildRoutingProposalArgs): RoutingProposal {
  const lanes = uniqueItems(suggestedLanes)
  const inventoryEntries = Object.entries(inventory.models).sort(([left], [right]) => left.localeCompare(right))

  if (inventoryEntries.length === 0) {
    throw new Error("Model inventory must include at least one model")
  }

  const profiles: Record<string, ControlPlaneProfile> = {}
  const proposedLanes = Object.fromEntries(
    lanes.map((lane) => {
      const defaultRoute = pickLaneDefaultProfileId(inventoryEntries, lanes, lane)

      if (!defaultRoute) {
        throw new Error(`Could not determine a default route for lane: ${lane}`)
      }

      const reviewRoute = mode === "direct" ? pickLaneIntentProfileId(inventoryEntries, lanes, lane, REVIEW_INTENT) : undefined
      const routes: Record<string, string> = {}

      profiles[defaultRoute] = toProfile(inventory.models[defaultRoute])

      if (reviewRoute) {
        routes.review = reviewRoute
        profiles[reviewRoute] = toProfile(inventory.models[reviewRoute])
      }

      return [
        lane,
        {
          label: titleCase(lane),
          routes,
          defaultRoute,
        },
      ]
    }),
  ) as Record<string, ControlPlaneLane>

  const defaultLane = lanes[0]
  const zeroLaneBuildRoute = lanes.length === 0 ? pickGenericIntentProfileId(inventoryEntries, lanes, BUILD_INTENT) : undefined
  const zeroLaneReviewRoute = mode === "direct" && lanes.length === 0
    ? pickGenericIntentProfileId(inventoryEntries, lanes, REVIEW_INTENT)
    : undefined
  const defaultRoute = defaultLane
    ? proposedLanes[defaultLane].defaultRoute
    : zeroLaneBuildRoute ?? zeroLaneReviewRoute ?? inventoryEntries[0][0]
  profiles[defaultRoute] ??= toProfile(inventory.models[defaultRoute])

  if (zeroLaneReviewRoute) {
    profiles[zeroLaneReviewRoute] ??= toProfile(inventory.models[zeroLaneReviewRoute])
  }

  const hasLaneReviewRoute = Object.values(proposedLanes).some((lane) => Boolean(lane.routes.review))
  const hasLaneBuildSupport = lanes.some((lane) => Boolean(pickLaneBuildProfileId(inventoryEntries, lanes, lane)))
  const presetRoutes: Record<string, string> = {}

  if (mode === "direct" && zeroLaneReviewRoute) {
    presetRoutes.review = zeroLaneReviewRoute
  }

  const workflow = mode === "direct"
    ? {
        kind: "direct" as const,
        intents: createDirectIntents(
          lanes.length === 0 ? Boolean(zeroLaneBuildRoute) : hasLaneBuildSupport,
          Boolean(hasLaneReviewRoute || zeroLaneReviewRoute),
        ),
      }
    : { kind: "superpowers" as const }

  return {
    workflow,
    profiles,
    lanes: proposedLanes,
    presets: {
      default: {
        label: "Default",
        short: "def",
        usesLanes: lanes,
        defaultLane,
        routes: presetRoutes,
        defaultRoute,
      },
    },
  }
}

export function applyRoutingProposalToConfig(
  proposal: RoutingProposal,
  existingConfig?: LayeredRoutingSections,
): LayeredRoutingSections {
  const baseConfig = existingConfig ?? createDefaultAuthorRoutingDocument()

  return {
    ...baseConfig,
    workflow: proposal.workflow,
    profiles: {
      ...(baseConfig.profiles ?? {}),
      ...proposal.profiles,
    },
    lanes: {
      ...(baseConfig.lanes ?? {}),
      ...proposal.lanes,
    },
    presets: {
      ...(baseConfig.presets ?? {}),
      default: mergeDefaultPreset(baseConfig.presets?.default, proposal.presets.default),
    },
  }
}

export function renderRoutingConfigDocument(config: LayeredRoutingSections) {
  return `${JSON.stringify(config, null, 2)}\n`
}

async function readPackageJson(
  filePath: string,
  readFile: (filePath: string) => Promise<string>,
): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined> {
  try {
    return JSON.parse(await readFile(filePath))
  } catch {
    return undefined
  }
}

function hasAnyDependency(
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined,
  dependencyNames: string[],
) {
  const dependencies = { ...packageJson?.dependencies, ...packageJson?.devDependencies }
  return dependencyNames.some((dependencyName) => dependencyName in dependencies)
}

async function hasAnyPath(
  cwd: string,
  relativePaths: string[],
  exists: (filePath: string) => Promise<boolean>,
) {
  for (const relativePath of relativePaths) {
    if (await exists(path.join(cwd, relativePath))) {
      return true
    }
  }

  return false
}

function pickLaneDefaultProfileId(inventoryEntries: InventoryEntry[], lanes: string[], lane: string) {
  return (
    pickLaneBuildProfileId(inventoryEntries, lanes, lane) ??
    pickMatchingProfileId(inventoryEntries, lane) ??
    inventoryEntries[0]?.[0]
  )
}

function pickLaneBuildProfileId(inventoryEntries: InventoryEntry[], lanes: string[], lane: string) {
  return pickMatchingProfileId(inventoryEntries, lane, BUILD_INTENT) ?? pickGenericIntentProfileId(inventoryEntries, lanes, BUILD_INTENT)
}

function pickLaneIntentProfileId(inventoryEntries: InventoryEntry[], lanes: string[], lane: string, intent: string) {
  return pickMatchingProfileId(inventoryEntries, lane, intent) ?? pickGenericIntentProfileId(inventoryEntries, lanes, intent)
}

function pickMatchingProfileId(inventoryEntries: InventoryEntry[], lane: string, intent?: string) {
  return inventoryEntries.find(([, profile]) => {
    const specialties = profile.specialties ?? []
    return specialties.includes(lane) && (!intent || specialties.includes(intent))
  })?.[0]
}

function pickGenericIntentProfileId(inventoryEntries: InventoryEntry[], lanes: string[], intent: string) {
  return inventoryEntries.find(([, profile]) => {
    const specialties = profile.specialties ?? []
    return specialties.includes(intent) && !lanes.some((lane) => specialties.includes(lane))
  })?.[0]
}

function toProfile(model: ModelInventory["models"][string]): ControlPlaneProfile {
  return {
    model: model.model,
    ...(model.effort ? { effort: model.effort } : {}),
    ...(model.codexFast !== undefined ? { codexFast: model.codexFast } : {}),
  }
}

function createDirectIntents(buildSupported: boolean, reviewSupported: boolean): Record<string, DirectIntentConfig> {
  return {
    ...(buildSupported ? { build: { label: "Build" } } : {}),
    ...(reviewSupported ? { review: { label: "Review" } } : {}),
  }
}

function createDefaultAuthorRoutingDocument(): LayeredRoutingSections {
  const defaults = createDefaultControlPlaneConfig()

  return {
    settings: {
      enabled: defaults.settings.enabled,
      activePreset: defaults.settings.activePreset,
      laneSelection: { ...defaults.settings.laneSelection },
      commandPrefix: defaults.settings.commandPrefix,
      commands: Object.fromEntries(
        Object.entries(defaults.settings.commands).map(([key, command]) => [key, { ...command, aliases: [...command.aliases] }]),
      ),
      superpowersCompatibility: { ...defaults.settings.superpowersCompatibility },
    },
    profiles: {},
    lanes: {},
    presets: {},
  }
}

function mergeDefaultPreset(
  existingPreset: ControlPlanePreset | undefined,
  proposedPreset: ControlPlanePreset,
): ControlPlanePreset {
  return {
    ...existingPreset,
    ...proposedPreset,
    usesLanes: dedupeItems([...(existingPreset?.usesLanes ?? []), ...(proposedPreset.usesLanes ?? [])]),
    routes: {
      ...(existingPreset?.routes ?? {}),
      ...proposedPreset.routes,
    },
  }
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function uniqueItems(values: string[]) {
  const seen = new Set<string>()
  const uniqueValues: string[] = []

  for (const value of values) {
    if (seen.has(value)) {
      continue
    }

    seen.add(value)
    uniqueValues.push(value)
  }

  return uniqueValues.filter((value): value is (typeof KNOWN_LANES)[number] => KNOWN_LANES.includes(value as never))
}

function dedupeItems(values: string[]) {
  const uniqueValues: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      continue
    }

    seen.add(value)
    uniqueValues.push(value)
  }

  return uniqueValues
}
