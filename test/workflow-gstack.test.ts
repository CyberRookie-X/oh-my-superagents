import { describe, expect, it } from "vitest"
import { GSTACK_SOURCE_CATALOG, getGstackSourceEntry } from "../src/workflow-gstack.js"

describe("workflow-gstack", () => {
  it("defines the curated gstack source catalog for the canonical workflow phases", () => {
    expect(GSTACK_SOURCE_CATALOG).toMatchObject({
      "phase.plan": "plan-eng-review",
      "phase.execute": "ship",
      "phase.review": "review",
      "phase.verify": "qa",
    })
  })

  it("looks up a gstack source entry for a canonical route", () => {
    expect(getGstackSourceEntry("phase.plan")).toEqual({
      canonicalRoute: "phase.plan",
      source: "gstack",
      entryName: "plan-eng-review",
    })
  })

  it("does not normalize legacy superpowers canonical aliases", () => {
    expect(getGstackSourceEntry("phase.writing-plans")).toBeUndefined()
  })
})
