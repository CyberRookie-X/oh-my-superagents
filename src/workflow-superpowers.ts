import type { CanonicalRouteId, WorkflowSourceEntry, WorkflowSourceKind } from "./workflow-sources.js"

export const SUPERPOWERS_ROUTE_CATALOG = [
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "requesting-code-review",
  "verification-before-completion",
  "frontend-design",
  "webapp-testing",
] as const

export type BuiltInPhase = (typeof SUPERPOWERS_ROUTE_CATALOG)[number]

const SUPERPOWERS_SOURCE_ENTRY_CATALOG = {
  brainstorming: { canonicalRoute: "phase.brainstorm", source: "superpowers", entryName: "brainstorming" },
  "writing-plans": { canonicalRoute: "phase.plan", source: "superpowers", entryName: "writing-plans" },
  "subagent-driven-development": {
    canonicalRoute: "phase.execute",
    source: "superpowers",
    entryName: "subagent-driven-development",
  },
  "requesting-code-review": {
    canonicalRoute: "phase.review",
    source: "superpowers",
    entryName: "requesting-code-review",
  },
  "verification-before-completion": {
    canonicalRoute: "phase.verify",
    source: "superpowers",
    entryName: "verification-before-completion",
  },
  "frontend-design": { canonicalRoute: "phase.visual", source: "superpowers", entryName: "frontend-design" },
  "webapp-testing": { canonicalRoute: "phase.web-test", source: "superpowers", entryName: "webapp-testing" },
} as const satisfies Record<BuiltInPhase, WorkflowSourceEntry>

const SUPERPOWERS_SOURCE_ENTRY_VALUES = Object.values(SUPERPOWERS_SOURCE_ENTRY_CATALOG) as WorkflowSourceEntry[]

const SUPERPOWERS_SOURCE_ENTRY_LOOKUP = Object.fromEntries(
  SUPERPOWERS_SOURCE_ENTRY_VALUES.map((sourceEntry) => [sourceEntry.canonicalRoute, sourceEntry]),
) as Partial<Record<CanonicalRouteId, WorkflowSourceEntry>>

const SUPERPOWERS_SOURCE_ENTRY_BY_WORKFLOW_ENTRY_NAME = Object.fromEntries(
  SUPERPOWERS_SOURCE_ENTRY_VALUES.flatMap((sourceEntry) => {
    const workflowEntryName = sourceEntry.entryName ?? sourceEntry.canonicalRoute

    return [
      [workflowEntryName, sourceEntry],
      [`superpowers/${workflowEntryName}`, sourceEntry],
    ]
  }),
) as Record<string, WorkflowSourceEntry>

export function toSuperpowersCanonicalRouteId(phase: BuiltInPhase): CanonicalRouteId {
  return SUPERPOWERS_SOURCE_ENTRY_CATALOG[phase].canonicalRoute
}

export const SUPERPOWERS_CANONICAL_ROUTE_CATALOG = Array.from(
  new Set(SUPERPOWERS_SOURCE_ENTRY_VALUES.map(({ canonicalRoute }) => canonicalRoute)),
) as CanonicalRouteId[]

export const SUPERPOWERS_SOURCE_ENTRIES = Object.fromEntries(
  SUPERPOWERS_CANONICAL_ROUTE_CATALOG.map((canonicalRoute) => [canonicalRoute, "superpowers"]),
) as Partial<Record<CanonicalRouteId, WorkflowSourceKind>>

export function getSuperpowersSourceEntry(canonicalRoute: CanonicalRouteId): WorkflowSourceEntry | undefined {
  return SUPERPOWERS_SOURCE_ENTRY_LOOKUP[canonicalRoute]
}

export function getSuperpowersSourceEntryByWorkflowEntryName(workflowEntryName: string): WorkflowSourceEntry | undefined {
  return SUPERPOWERS_SOURCE_ENTRY_BY_WORKFLOW_ENTRY_NAME[workflowEntryName]
}

export const PHASE_TO_COMMAND = {
  brainstorming: "/sp-brainstorm",
  "writing-plans": "/sp-plan",
  "subagent-driven-development": "/sp-execute",
  "requesting-code-review": "/sp-review",
  "verification-before-completion": "/sp-verify",
  "frontend-design": "/sp-visual",
  "webapp-testing": "/sp-web-test",
} as const satisfies Record<BuiltInPhase, string>

export const PHASE_TO_AGENT = {
  brainstorming: "spr-strategy",
  "writing-plans": "spr-plan",
  "subagent-driven-development": "spr-build",
  "requesting-code-review": "spr-review",
  "verification-before-completion": "spr-verify",
  "frontend-design": "spr-visual",
  "webapp-testing": "spr-visual",
} as const satisfies Record<BuiltInPhase, string>
