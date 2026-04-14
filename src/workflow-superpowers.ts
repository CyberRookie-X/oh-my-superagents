import type { CanonicalRouteId, WorkflowSourceKind } from "./workflow-sources.js"

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

export function toSuperpowersCanonicalRouteId(phase: BuiltInPhase): CanonicalRouteId {
  return `phase.${phase}`
}

export const SUPERPOWERS_CANONICAL_ROUTE_CATALOG = SUPERPOWERS_ROUTE_CATALOG.map(
  toSuperpowersCanonicalRouteId,
) as CanonicalRouteId[]

export const SUPERPOWERS_SOURCE_ENTRIES = Object.fromEntries(
  SUPERPOWERS_ROUTE_CATALOG.map((phase) => [toSuperpowersCanonicalRouteId(phase), "superpowers"]),
) as Partial<Record<CanonicalRouteId, WorkflowSourceKind>>

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
