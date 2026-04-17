import { describe, expect, it } from "vitest"
import {
  CONTEXT_PROVIDER_CAPABILITIES,
  parseContextProviderManifest,
} from "../src/context-manifest.js"

describe("CONTEXT_PROVIDER_CAPABILITIES", () => {
  it("keeps the capability catalog stable and frozen at runtime", () => {
    expect(CONTEXT_PROVIDER_CAPABILITIES).toEqual(["recall", "search", "summarize", "pack", "status"])
    expect(Object.isFrozen(CONTEXT_PROVIDER_CAPABILITIES)).toBe(true)
  })
})

describe("parseContextProviderManifest", () => {
  it("parses a provider manifest with normalized capabilities", () => {
    const input = {
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall", "search", "summarize", "status"],
      events: ["session_start", "before_compact", "session_end"],
    }

    const manifest = parseContextProviderManifest(input)

    expect(manifest).toEqual({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall", "search", "summarize", "status"],
      events: ["session_start", "before_compact", "session_end"],
    })
    expect(manifest.capabilities).not.toBe(input.capabilities)
    expect(manifest.events).not.toBe(input.events)
  })

  it("freezes the parsed manifest result and nested arrays", () => {
    const manifest = parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start"],
    })

    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.capabilities)).toBe(true)
    expect(Object.isFrozen(manifest.events)).toBe(true)
  })

  it("rejects malformed non-object manifests", () => {
    expect(() => parseContextProviderManifest(null)).toThrow(
      "Context provider manifest must be an object.",
    )
  })

  it("does not treat Object.prototype pollution as a valid manifest", () => {
    Object.defineProperties(Object.prototype, {
      id: {
        value: "memory-graph",
        configurable: true,
      },
      kind: {
        value: "mcp",
        configurable: true,
      },
      capabilities: {
        value: ["recall"],
        configurable: true,
      },
      events: {
        value: ["session_start"],
        configurable: true,
      },
    })

    try {
      expect(() => parseContextProviderManifest({})).toThrow(
        "Context provider manifest must define own property: id",
      )
    } finally {
      delete (Object.prototype as { id?: unknown }).id
      delete (Object.prototype as { kind?: unknown }).kind
      delete (Object.prototype as { capabilities?: unknown }).capabilities
      delete (Object.prototype as { events?: unknown }).events
    }
  })

  it("rejects non-enumerable required manifest fields", () => {
    const manifest = {
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start"],
    }

    Object.defineProperty(manifest, "id", {
      value: "memory-graph",
      enumerable: false,
      configurable: true,
      writable: true,
    })

    expect(() => parseContextProviderManifest(manifest)).toThrow(
      "Context provider manifest property must be enumerable: id",
    )
  })

  it("rejects prototype-derived manifest fields", () => {
    const inheritedManifest = {
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start"],
    }

    expect(() => parseContextProviderManifest(Object.create(inheritedManifest))).toThrow(
      "Context provider manifest must be a plain object.",
    )
  })

  it("rejects unsupported provider kinds", () => {
    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "socket",
      capabilities: ["recall"],
      events: ["session_start"],
    })).toThrow("Context provider manifest kind must be one of: file, cli, mcp.")
  })

  it("does not trust polluted Array.prototype.includes for kind, capability, and event validation", () => {
    const originalIncludes = Array.prototype.includes

    Array.prototype.includes = function (searchElement, fromIndex) {
      if (searchElement === "socket" || searchElement === "invent" || searchElement === "mystery_event") {
        return true
      }

      return originalIncludes.call(this, searchElement, fromIndex)
    }

    try {
      expect(() => parseContextProviderManifest({
        id: "memory-graph",
        kind: "socket",
        capabilities: ["recall"],
        events: ["session_start"],
      })).toThrow("Context provider manifest kind must be one of: file, cli, mcp.")

      expect(() => parseContextProviderManifest({
        id: "memory-graph",
        kind: "mcp",
        capabilities: ["invent"],
        events: ["session_start"],
      })).toThrow("Unknown context provider capability: invent")

      expect(() => parseContextProviderManifest({
        id: "memory-graph",
        kind: "mcp",
        capabilities: ["recall"],
        events: ["mystery_event"],
      })).toThrow("Unknown context lifecycle event: mystery_event")
    } finally {
      Array.prototype.includes = originalIncludes
    }
  })

  it("rejects unknown capabilities", () => {
    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall", "invent"],
      events: ["session_start"],
    })).toThrow("Unknown context provider capability: invent")
  })

  it("rejects unknown events", () => {
    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start", "mystery_event"],
    })).toThrow("Unknown context lifecycle event: mystery_event")
  })

  it("rejects unexpected top-level manifest fields", () => {
    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start"],
      extra: true,
    })).toThrow("Unexpected context provider manifest field: extra")
  })

  it("rejects non-enumerable extra manifest fields", () => {
    const manifest = {
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start"],
    }

    Object.defineProperty(manifest, "hidden", {
      value: true,
      enumerable: false,
    })

    expect(() => parseContextProviderManifest(manifest)).toThrow(
      "Unexpected context provider manifest field: hidden",
    )
  })

  it("rejects symbol-keyed extra manifest fields", () => {
    const hidden = Symbol("hidden")
    const manifest = {
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start"],
      [hidden]: true,
    }

    expect(() => parseContextProviderManifest(manifest)).toThrow(
      "Unexpected context provider manifest field: Symbol(hidden)",
    )
  })

  it("does not trust polluted Array.prototype.find for extra manifest and array keys", () => {
    const originalFind = Array.prototype.find
    const capabilities = ["recall"]

    Object.defineProperty(capabilities, "hidden", {
      value: true,
      enumerable: false,
    })

    Array.prototype.find = function () {
      return undefined
    }

    try {
      expect(() => parseContextProviderManifest({
        id: "memory-graph",
        kind: "mcp",
        capabilities: ["recall"],
        events: ["session_start"],
        extra: true,
      })).toThrow("Unexpected context provider manifest field: extra")

      expect(() => parseContextProviderManifest({
        id: "memory-graph",
        kind: "mcp",
        capabilities,
        events: ["session_start"],
      })).toThrow("Context provider manifest capabilities must not define extra properties: hidden")
    } finally {
      Array.prototype.find = originalFind
    }
  })

  it("rejects manifests without string ids", () => {
    expect(() => parseContextProviderManifest({
      id: 42,
      kind: "mcp",
      capabilities: ["recall"],
      events: ["session_start"],
    })).toThrow(
      "Context provider manifest id must be a string.",
    )
  })

  it("rejects non-array capability lists", () => {
    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: "recall",
      events: ["session_start"],
    })).toThrow(
      "Context provider manifest capabilities must be an array.",
    )
  })

  it("rejects sparse capability arrays", () => {
    const capabilities = new Array<string>(1)
    capabilities[0] = "recall"
    delete capabilities[0]

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities,
      events: ["session_start"],
    })).toThrow("Context provider manifest capabilities must not be sparse.")
  })

  it("rejects prototype-backed sparse capability arrays", () => {
    const capabilities = new Array<string>(1)
    Object.setPrototypeOf(capabilities, ["recall"])

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities,
      events: ["session_start"],
    })).toThrow("Context provider manifest capabilities must not be sparse.")
  })

  it("rejects extra own properties on capabilities arrays", () => {
    const capabilities = ["recall"]

    Object.defineProperty(capabilities, "hidden", {
      value: true,
      enumerable: false,
    })

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities,
      events: ["session_start"],
    })).toThrow("Context provider manifest capabilities must not define extra properties: hidden")
  })

  it("does not trust inherited capabilities map implementations", () => {
    const capabilities = ["invent"]
    const prototype = Object.create(Array.prototype, {
      map: {
        value: () => ["recall"],
      },
    })

    Object.setPrototypeOf(capabilities, prototype)

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities,
      events: ["session_start"],
    })).toThrow("Unknown context provider capability: invent")
  })

  it("rejects non-enumerable required capability entries", () => {
    const capabilities = ["recall"]

    Object.defineProperty(capabilities, "0", {
      value: "recall",
      enumerable: false,
      configurable: true,
      writable: true,
    })

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities,
      events: ["session_start"],
    })).toThrow("Context provider manifest capabilities[0] must be enumerable.")
  })

  it("rejects non-array event lists", () => {
    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events: "session_start",
    })).toThrow(
      "Context provider manifest events must be an array.",
    )
  })

  it("rejects sparse event arrays", () => {
    const events = new Array<string>(1)
    events[0] = "session_start"
    delete events[0]

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events,
    })).toThrow("Context provider manifest events must not be sparse.")
  })

  it("rejects prototype-backed sparse event arrays", () => {
    const events = new Array<string>(1)
    Object.setPrototypeOf(events, ["session_start"])

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events,
    })).toThrow("Context provider manifest events must not be sparse.")
  })

  it("rejects extra own properties on event arrays", () => {
    const extra = Symbol("extra")
    const events = ["session_start"]
    events[extra] = true

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events,
    })).toThrow("Context provider manifest events must not define extra properties: Symbol(extra)")
  })

  it("does not trust inherited events map implementations", () => {
    const events = ["mystery_event"]
    const prototype = Object.create(Array.prototype, {
      map: {
        value: () => ["session_start"],
      },
    })

    Object.setPrototypeOf(events, prototype)

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events,
    })).toThrow("Unknown context lifecycle event: mystery_event")
  })

  it("rejects non-enumerable required event entries", () => {
    const events = ["session_start"]

    Object.defineProperty(events, "0", {
      value: "session_start",
      enumerable: false,
      configurable: true,
      writable: true,
    })

    expect(() => parseContextProviderManifest({
      id: "memory-graph",
      kind: "mcp",
      capabilities: ["recall"],
      events,
    })).toThrow("Context provider manifest events[0] must be enumerable.")
  })
})
