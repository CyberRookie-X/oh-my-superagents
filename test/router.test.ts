import { describe, expect, it } from "vitest"
import { explainAll, explainPhase, resolvePhase } from "../src/router.js"
import * as routerLibrary from "../src/router.js"
import { SUPERPOWERS_ROUTE_CATALOG } from "../src/workflow-superpowers.js"

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
  it("maps built-in phases onto true canonical phase routes", () => {
    const routeConfig = {
      workflow: { kind: "superpowers" as const },
      profiles: {
        build: { model: "openai/gpt-5" },
      },
      routes: {},
      defaultRoute: "build",
    }

    expect(resolvePhase(routeConfig as never, "brainstorming").canonicalRoute).toBe("phase.brainstorm")
    expect(resolvePhase(routeConfig as never, "writing-plans").canonicalRoute).toBe("phase.plan")
    expect(resolvePhase(routeConfig as never, "subagent-driven-development").canonicalRoute).toBe("phase.execute")
    expect(resolvePhase(routeConfig as never, "requesting-code-review").canonicalRoute).toBe("phase.review")
    expect(resolvePhase(routeConfig as never, "verification-before-completion").canonicalRoute).toBe("phase.verify")
    expect(resolvePhase(routeConfig as never, "frontend-design").canonicalRoute).toBe("phase.visual")
    expect(resolvePhase(routeConfig as never, "webapp-testing").canonicalRoute).toBe("phase.web-test")
  })

  it("uses exact phase route before default route", () => {
    expect(resolvePhase(config, "brainstorming").profileId).toBe("review")
  })

  it("routes through the effective lane before falling back to preset defaultRoute", () => {
    const laneAwareConfig = {
      profiles: {
        "frontend-strategy": { model: "frontend-model", effort: "deep" as const },
        "frontend-build": { model: "frontend-build-model" },
        "backend-build": { model: "backend-model" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { brainstorming: "frontend-strategy" },
          defaultRoute: "frontend-build",
        },
      },
      routes: {},
      defaultRoute: "backend-build",
    }

    expect(resolvePhase(laneAwareConfig as never, "brainstorming", { effectiveLane: "frontend" }).profileId).toBe(
      "frontend-strategy",
    )
    expect(resolvePhase(laneAwareConfig as never, "writing-plans", { effectiveLane: "frontend" }).profileId).toBe(
      "frontend-build",
    )
  })

  it("falls back to default route for other built-in phases", () => {
    expect(resolvePhase(config, "webapp-testing").profileId).toBe("build")
  })

  it("falls back to preset defaultRoute with preset-default metadata when there is no effective lane", () => {
    const laneAwareConfig = {
      profiles: { build: { model: "openai/gpt-5" } },
      lanes: {},
      routes: {},
      defaultRoute: "build",
    }

    expect(resolvePhase(laneAwareConfig as never, "writing-plans")).toMatchObject({
      profileId: "build",
      routeSource: "preset-default",
      effectiveLane: undefined,
    })
  })

  it("keeps effort and codexFast as independent resolved route properties", () => {
    const resolved = resolvePhase(
      {
        profiles: {
          build: { model: "gpt-5.4", effort: "deep", codexFast: true },
        },
        routes: {},
        defaultRoute: "build",
      },
      "writing-plans",
    )

    expect(resolved.selection).toMatchObject({
      model: "gpt-5.4",
      effort: "deep",
      codexFast: true,
      variant: "high",
    })
  })

  it("resolves canonical route, source, and source entry for a superpowers phase", () => {
    const resolved = resolvePhase(
      {
        workflow: { kind: "superpowers" as const },
        profiles: {
          build: { model: "openai/gpt-5" },
          review: { model: "anthropic/claude-sonnet-4-5" },
        },
        routes: {
          brainstorming: "review",
        },
        defaultRoute: "build",
        effectiveSources: {
          "phase.plan": "gstack",
        },
      } as never,
      "brainstorming",
    )

    expect(resolved).toMatchObject({
      canonicalRoute: "phase.brainstorm",
      resolvedSource: "superpowers",
      sourceEntry: {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
      },
      sourceResolution: "default",
    })
  })

  it("resolves the gstack source entry when the generic planning route is overridden to gstack", () => {
    const resolved = resolvePhase(
      {
        workflow: { kind: "superpowers" as const },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        routes: {},
        defaultRoute: "build",
        effectiveSources: {
          "phase.plan": "gstack",
        },
      } as never,
      "writing-plans",
    )

    expect(resolved).toMatchObject({
      canonicalRoute: "phase.plan",
      resolvedSource: "gstack",
      sourceResolution: "explicit",
    })
    expect(resolved.sourceEntry).toMatchObject({
      canonicalRoute: "phase.plan",
      source: "gstack",
      entryName: "plan-eng-review",
    })
  })

  it("requires true canonical built-in source override ids for in-memory source overrides", () => {
    const resolved = resolvePhase(
      {
        workflow: { kind: "superpowers" as const },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        routes: {},
        defaultRoute: "build",
        effectiveSources: {
          "phase.writing-plans": "gstack",
        } as never,
      } as never,
      "writing-plans",
    )

    expect(resolved).toMatchObject({
      canonicalRoute: "phase.plan",
      resolvedSource: "superpowers",
      sourceResolution: "default",
    })
    expect(resolved.sourceEntry).toMatchObject({
      canonicalRoute: "phase.plan",
      source: "superpowers",
    })
  })
})

describe("resolveRoute", () => {
  it("still exposes the superpowers built-in route catalog through the adapter", () => {
    expect(SUPERPOWERS_ROUTE_CATALOG).toContain("brainstorming")
  })

  it("resolves a direct-mode route id without relying on built-in superpowers phases", () => {
    const directConfig = {
      workflow: {
        kind: "direct" as const,
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      profiles: {
        planner: { model: "openai/gpt-5" },
        builder: { model: "gpt-5.4" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { plan: "planner" },
          defaultRoute: "builder",
        },
      },
      routes: {},
      defaultRoute: "builder",
      effectiveLane: "frontend",
    }

    expect(typeof routerLibrary.resolveRoute).toBe("function")
    expect(routerLibrary.resolveRoute(directConfig as never, "plan").profileId).toBe("planner")
  })

  it("rejects an unknown direct-mode route id instead of falling back", () => {
    const directConfig = {
      workflow: {
        kind: "direct" as const,
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      profiles: {
        planner: { model: "openai/gpt-5" },
        builder: { model: "gpt-5.4" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: { plan: "planner" },
          defaultRoute: "builder",
        },
      },
      routes: {},
      defaultRoute: "builder",
      effectiveLane: "frontend",
    }

    expect(() => routerLibrary.resolveRoute(directConfig as never, "pla")).toThrowError("Unknown intent: pla")
  })

  it("rejects an unknown superpowers route id instead of falling back", () => {
    expect(() => routerLibrary.resolveRoute(config as never, "brainstormng")).toThrowError("Unknown phase: brainstormng")
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

  it("includes lane metadata when routing through an effective lane", () => {
    const laneAwareConfig = {
      profiles: {
        "frontend-build": { model: "frontend-build-model" },
        "backend-build": { model: "backend-model" },
      },
      lanes: {
        frontend: {
          label: "Frontend",
          routes: {},
          defaultRoute: "frontend-build",
        },
      },
      routes: {},
      defaultRoute: "backend-build",
    }

    expect(explainPhase(laneAwareConfig as never, "writing-plans", { effectiveLane: "frontend" })).toMatchObject({
      profileId: "frontend-build",
      effectiveLane: "frontend",
      routeSource: "lane-default",
    })
  })
})

describe("explainAll", () => {
  it("returns all built-in phases in superpowers mode", () => {
    const superpowersConfig = {
      workflow: { kind: "superpowers" as const },
      profiles: {
        build: { model: "openai/gpt-5" },
      },
      routes: {},
      defaultRoute: "build",
    }
    const results = explainAll(superpowersConfig as never)
    expect(results).toHaveLength(7)
    expect(results[0]).toHaveProperty("phase")
    expect(results[0]).toHaveProperty("commandName")
    expect(results[0]).toHaveProperty("agentName")
  })

  it("returns user intents in direct mode", () => {
    const directConfig = {
      workflow: {
        kind: "direct" as const,
        intents: {
          plan: { label: "Plan" },
          build: { label: "Build" },
        },
      },
      profiles: {
        planner: { model: "openai/gpt-5" },
        builder: { model: "gpt-5.4" },
      },
      routes: {},
      defaultRoute: "builder",
    }
    const results = explainAll(directConfig as never)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      routeId: "plan",
      canonicalRoute: "intent.plan",
      resolvedSource: "direct",
    })
    expect(results[1]).toMatchObject({
      routeId: "build",
      canonicalRoute: "intent.build",
      resolvedSource: "direct",
    })
  })
})
