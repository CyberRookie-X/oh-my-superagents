import path from "node:path"
import {
  defaultExists,
  defaultReadFile,
  type ControlPlaneLane,
  type ControlPlanePreset,
  type ControlPlaneProfile,
  type DirectIntentConfig,
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

      const reviewRoute = pickLaneIntentProfileId(inventoryEntries, lanes, lane, REVIEW_INTENT)
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
  const defaultRoute = defaultLane ? proposedLanes[defaultLane].defaultRoute : inventoryEntries[0][0]
  profiles[defaultRoute] ??= toProfile(inventory.models[defaultRoute])
  const intents = createDirectIntents(defaultRoute, proposedLanes)

  return {
    workflow: mode === "direct" ? { kind: "direct", intents } : { kind: "superpowers" },
    profiles,
    lanes: proposedLanes,
    presets: {
      default: {
        label: "Default",
        short: "def",
        usesLanes: lanes,
        defaultLane,
        routes: {},
        defaultRoute,
      },
    },
  }
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
    pickMatchingProfileId(inventoryEntries, lane, BUILD_INTENT) ??
    pickMatchingProfileId(inventoryEntries, lane) ??
    pickGenericIntentProfileId(inventoryEntries, lanes, BUILD_INTENT) ??
    inventoryEntries[0]?.[0]
  )
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

function createDirectIntents(defaultRoute: string, lanes: Record<string, ControlPlaneLane>) {
  const intents: Record<string, DirectIntentConfig> = {}

  if (defaultRoute) {
    intents.build = { label: "Build" }
  }

  const laneValues = Object.values(lanes)

  if (laneValues.some((lane) => Boolean(lane.routes.review))) {
    intents.review = { label: "Review" }
  }

  return intents
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
