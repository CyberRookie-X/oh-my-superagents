import { BUILT_IN_PHASES } from "./config.js"

export const SUPERPOWERS_ROUTE_CATALOG = BUILT_IN_PHASES

export type BuiltInPhase = (typeof SUPERPOWERS_ROUTE_CATALOG)[number]

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
