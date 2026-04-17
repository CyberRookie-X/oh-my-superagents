import { describe, expect, it } from "vitest"
import { CONTEXT_LIFECYCLE_EVENTS, isContextLifecycleEvent } from "../src/context-events.js"

describe("CONTEXT_LIFECYCLE_EVENTS", () => {
  it("keeps the event catalog stable", () => {
    expect(CONTEXT_LIFECYCLE_EVENTS).toEqual([
      "session_start",
      "before_compact",
      "after_edit",
      "post_commit",
      "session_end",
      "reindex_complete",
    ])
    expect(Object.isFrozen(CONTEXT_LIFECYCLE_EVENTS)).toBe(true)
  })
})

describe("isContextLifecycleEvent", () => {
  it("accepts known event ids and rejects unknown ids", () => {
    expect(isContextLifecycleEvent("session_start")).toBe(true)
    expect(isContextLifecycleEvent("not-real")).toBe(false)
  })

  it("does not trust polluted Array.prototype.includes", () => {
    const originalIncludes = Array.prototype.includes

    Array.prototype.includes = function (searchElement, fromIndex) {
      if (searchElement === "not-real") {
        return true
      }

      return originalIncludes.call(this, searchElement, fromIndex)
    }

    try {
      expect(isContextLifecycleEvent("session_start")).toBe(true)
      expect(isContextLifecycleEvent("not-real")).toBe(false)
    } finally {
      Array.prototype.includes = originalIncludes
    }
  })

  it("rejects non-string input", () => {
    expect(isContextLifecycleEvent(42)).toBe(false)
    expect(isContextLifecycleEvent(null)).toBe(false)
  })
})
