import { describe, expect, it } from "vitest"
import { getLastKnownGoodPath, shouldFallbackToLastKnownGood } from "../src/config-recovery.js"

describe("shouldFallbackToLastKnownGood", () => {
  it("requests fallback when authority load fails and lkg exists", () => {
    expect(shouldFallbackToLastKnownGood({
      authorityError: new Error("Invalid JSONC"),
      hasLastKnownGood: true,
    })).toBe(true)
  })
})

describe("getLastKnownGoodPath", () => {
  it("places the recovery snapshot under a project-local .oms directory", () => {
    expect(getLastKnownGoodPath("/repo/oh-my-superagents.config.jsonc")).toBe(
      "/repo/.oms/last-known-good.json",
    )
  })
})
