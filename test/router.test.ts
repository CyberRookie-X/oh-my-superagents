import { describe, expect, it } from "vitest"
import { explainAll, explainPhase, resolvePhase } from "../src/router.js"

const config = {
  profiles: {
    build: { model: "openai/gpt-5", effort: "balanced" as const },
    review: { model: "anthropic/claude-sonnet-4-5", variant: "high" },
  },
  routes: {
    brainstorming: "review",
  },
  defaultRoute: "build",
}

describe("resolvePhase", () => {
  it("uses exact phase route before default route", () => {
    expect(resolvePhase(config, "brainstorming").profileId).toBe("review")
  })

  it("falls back to default route for other built-in phases", () => {
    expect(resolvePhase(config, "webapp-testing").profileId).toBe("build")
  })
})

describe("explainPhase", () => {
  it("returns fixed command and agent names", () => {
    expect(explainPhase(config, "requesting-code-review")).toMatchObject({
      phase: "requesting-code-review",
      profileId: "build",
      commandName: "/sp-review",
      agentName: "spr-review",
      model: "openai/gpt-5",
      variant: "medium",
    })
  })
})

describe("explainAll", () => {
  it("returns all built-in phases", () => {
    expect(explainAll(config)).toHaveLength(7)
  })
})
