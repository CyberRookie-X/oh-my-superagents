import { isContextLifecycleEvent, type ContextLifecycleEvent } from "./context-events.js"

const CONTEXT_PROVIDER_KINDS = ["file", "cli", "mcp"] as const
const CONTEXT_PROVIDER_MANIFEST_FIELDS = ["id", "kind", "capabilities", "events"] as const
const CONTEXT_PROVIDER_KIND_SET: ReadonlySet<string> = new Set(CONTEXT_PROVIDER_KINDS)
const CONTEXT_PROVIDER_MANIFEST_FIELD_SET: ReadonlySet<PropertyKey> = new Set(CONTEXT_PROVIDER_MANIFEST_FIELDS)

type ContextProviderKind = (typeof CONTEXT_PROVIDER_KINDS)[number]

export const CONTEXT_PROVIDER_CAPABILITIES = Object.freeze(["recall", "search", "summarize", "pack", "status"] as const)

const CONTEXT_PROVIDER_CAPABILITY_SET: ReadonlySet<string> = new Set(CONTEXT_PROVIDER_CAPABILITIES)

export type ContextProviderCapability = (typeof CONTEXT_PROVIDER_CAPABILITIES)[number]

export type ContextProviderManifest = {
  readonly id: string
  readonly kind: ContextProviderKind
  readonly capabilities: readonly ContextProviderCapability[]
  readonly events: readonly ContextLifecycleEvent[]
}

export function parseContextProviderManifest(input: unknown): ContextProviderManifest {
  if (!isContextProviderManifestRecord(input)) {
    throw new TypeError("Context provider manifest must be an object.")
  }

  if (!isPlainObject(input)) {
    throw new TypeError("Context provider manifest must be a plain object.")
  }

  assertContextProviderManifestFields(input)

  const capabilities = Object.freeze(parseContextProviderManifestCapabilities(input.capabilities))
  const events = Object.freeze(parseContextProviderManifestEvents(input.events))

  return Object.freeze({
    id: parseContextProviderManifestId(input.id),
    kind: parseContextProviderManifestKind(input.kind),
    capabilities,
    events,
  })
}

function parseContextProviderManifestId(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Context provider manifest id must be a string.")
  }

  return value
}

function parseContextProviderManifestKind(value: unknown): ContextProviderKind {
  if (typeof value !== "string" || !isContextProviderKind(value)) {
    throw new TypeError("Context provider manifest kind must be one of: file, cli, mcp.")
  }

  return value
}

function parseContextProviderManifestCapabilities(value: unknown): ContextProviderCapability[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Context provider manifest capabilities must be an array.")
  }

  assertStrictArrayShape(value, {
    sparseMessage: "Context provider manifest capabilities must not be sparse.",
    nonEnumerableEntryMessagePrefix: "Context provider manifest capabilities",
    extraPropertyMessagePrefix: "Context provider manifest capabilities must not define extra properties:",
  })

  return normalizeArrayEntries(value, parseContextProviderCapability)
}

function parseContextProviderManifestEvents(value: unknown): ContextLifecycleEvent[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Context provider manifest events must be an array.")
  }

  assertStrictArrayShape(value, {
    sparseMessage: "Context provider manifest events must not be sparse.",
    nonEnumerableEntryMessagePrefix: "Context provider manifest events",
    extraPropertyMessagePrefix: "Context provider manifest events must not define extra properties:",
  })

  return normalizeArrayEntries(value, parseContextLifecycleEvent)
}

function parseContextProviderCapability(value: unknown): ContextProviderCapability {
  if (typeof value !== "string" || !isContextProviderCapability(value)) {
    throw new TypeError(`Unknown context provider capability: ${String(value)}`)
  }

  return value
}

function parseContextLifecycleEvent(value: unknown): ContextLifecycleEvent {
  if (typeof value !== "string" || !isContextLifecycleEvent(value)) {
    throw new TypeError(`Unknown context lifecycle event: ${String(value)}`)
  }

  return value
}

function isContextProviderManifestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPlainObject(value: Record<string, unknown>): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertContextProviderManifestFields(value: Record<string, unknown>): void {
  for (const field of CONTEXT_PROVIDER_MANIFEST_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field)
    if (!descriptor) {
      throw new TypeError(`Context provider manifest must define own property: ${field}`)
    }

    if (!descriptor.enumerable) {
      throw new TypeError(`Context provider manifest property must be enumerable: ${field}`)
    }
  }

  for (const key of Reflect.ownKeys(value)) {
    if (!isContextProviderManifestField(key)) {
      throw new TypeError(`Unexpected context provider manifest field: ${formatPropertyKey(key)}`)
    }
  }
}

function assertStrictArrayShape(
  value: readonly unknown[],
  options: {
    sparseMessage: string
    nonEnumerableEntryMessagePrefix: string
    extraPropertyMessagePrefix: string
  },
): void {
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor) {
      throw new TypeError(options.sparseMessage)
    }

    if (!descriptor.enumerable) {
      throw new TypeError(`${options.nonEnumerableEntryMessagePrefix}[${index}] must be enumerable.`)
    }
  }

  const allowedKeys = new Set<PropertyKey>(["length"])
  for (let index = 0; index < value.length; index += 1) {
    allowedKeys.add(String(index))
  }

  for (const key of Reflect.ownKeys(value)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`${options.extraPropertyMessagePrefix} ${formatPropertyKey(key)}`)
    }
  }
}

function normalizeArrayEntries<T>(
  value: readonly unknown[],
  parser: (entry: unknown) => T,
): T[] {
  const normalized: T[] = []
  for (let index = 0; index < value.length; index += 1) {
    normalized.push(parser(value[index]))
  }

  return normalized
}

function isContextProviderManifestField(value: PropertyKey): value is (typeof CONTEXT_PROVIDER_MANIFEST_FIELDS)[number] {
  return typeof value === "string" && CONTEXT_PROVIDER_MANIFEST_FIELD_SET.has(value)
}

function formatPropertyKey(value: PropertyKey): string {
  return typeof value === "string" ? value : String(value)
}

function isContextProviderKind(value: string): value is ContextProviderKind {
  return CONTEXT_PROVIDER_KIND_SET.has(value)
}

function isContextProviderCapability(value: string): value is ContextProviderCapability {
  return CONTEXT_PROVIDER_CAPABILITY_SET.has(value)
}
