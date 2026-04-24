export const SUPERPOWERS_COMPATIBILITY_MODES = ["warn", "strict"] as const

export type SuperpowersCompatibilityMode = (typeof SUPERPOWERS_COMPATIBILITY_MODES)[number]

export const SUPERPOWERS_COMPATIBILITY_STATUSES = [
  "compatible",
  "untested",
  "incompatible",
  "not_detected",
] as const

export type SuperpowersCompatibilityStatus =
  (typeof SUPERPOWERS_COMPATIBILITY_STATUSES)[number]

export type SupportedSuperpowersHost = "opencode" | "codex"

export type SuperpowersCompatibilityMatrixEntry = {
  minimumSupportedVersion: string
  testedRanges: readonly string[]
  knownBadRanges: readonly string[]
}

export type SuperpowersCompatibilityMatrix = Record<
  SupportedSuperpowersHost,
  SuperpowersCompatibilityMatrixEntry
>

export interface CompatibilityOverride {
  minimumSupportedVersion?: string
  testedRanges?: string[]
  knownBadRanges?: string[]
}

export function mergeMatrixWithOverrides(
  matrix: SuperpowersCompatibilityMatrix,
  overrides?: Record<string, CompatibilityOverride>,
): SuperpowersCompatibilityMatrix {
  const result: SuperpowersCompatibilityMatrix = {
    opencode: { ...matrix.opencode },
    codex: { ...matrix.codex },
  }
  if (!overrides) {
    return result
  }
  for (const host of Object.keys(result) as SupportedSuperpowersHost[]) {
    const override = overrides[host]
    if (override) {
      result[host] = {
        minimumSupportedVersion: override.minimumSupportedVersion ?? result[host].minimumSupportedVersion,
        testedRanges: override.testedRanges ?? [...result[host].testedRanges],
        knownBadRanges: override.knownBadRanges ?? [...result[host].knownBadRanges],
      }
    }
  }
  return result
}

export const SUPERPOWERS_COMPATIBILITY = {
  opencode: {
    minimumSupportedVersion: "5.0.0",
    testedRanges: [">=5.0.0 <6.0.0"],
    knownBadRanges: [],
  },
  codex: {
    minimumSupportedVersion: "5.0.0",
    testedRanges: [">=5.0.0 <6.0.0"],
    knownBadRanges: [],
  },
} as const satisfies SuperpowersCompatibilityMatrix

export function normalizeSuperpowersVersion(value?: string | null) {
  return parseSemver(value)?.normalized ?? null
}

export function pickHighestSuperpowersVersion(values: Iterable<string>) {
  let highest: ParsedSemver | null = null

  for (const value of values) {
    const parsed = parseSemver(value)
    if (!parsed) {
      continue
    }

    if (!highest || compareSemver(parsed, highest) > 0) {
      highest = parsed
    }
  }

  return highest?.normalized ?? null
}

export type SuperpowersDetectionFailureStage =
  | "read-config"
  | "parse-config"
  | "resolve-symlink"
  | "inspect-git-checkout"

export type SuperpowersDetectionFailure = {
  source: string
  stage: SuperpowersDetectionFailureStage
  message: string
}

export type SuperpowersDetectionDetails = {
  configPath?: string
  pluginSpec?: string
  repoPath?: string
  headTags?: string[]
  failures?: SuperpowersDetectionFailure[]
}

export type SuperpowersDetectionResult = {
  host: SupportedSuperpowersHost
  source: string
  detectedVersion?: string | null
  detectedRef?: string | null
  details?: SuperpowersDetectionDetails
}

export type SuperpowersCompatibilityResult = {
  host: SupportedSuperpowersHost
  source: string
  detectedVersion: string | null
  detectedRef: string | null
  status: SuperpowersCompatibilityStatus
  reason: string
  policyMode: SuperpowersCompatibilityMode
  shouldBlock: boolean
}

export type SuperpowersAvailabilityResult = {
  status: "available" | "not_detected"
  reason: string
}

type ParsedSemver = {
  normalized: string
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

type ParsedComparator = {
  operator: ">=" | "<=" | ">" | "<" | "="
  boundary: ParsedSemver
}

type ParsedRange = {
  comparators: ParsedComparator[]
  includesPrereleaseBoundary: boolean
}

const SEMVER_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/

export function evaluateSuperpowersCompatibility(
  detection: SuperpowersDetectionResult,
  policyMode: SuperpowersCompatibilityMode = "warn",
  matrix: SuperpowersCompatibilityMatrix = SUPERPOWERS_COMPATIBILITY,
  allowUntested: "warn" | "block" = "warn",
): SuperpowersCompatibilityResult {
  const matrixEntry = validateMatrixEntry(detection.host, matrix[detection.host])
  const normalizedDetection = normalizeDetection(detection)

  if (!normalizedDetection.detectedVersion) {
    return finalizeCompatibilityResult(
      normalizedDetection,
      policyMode,
      getNotDetectedCompatibilityOutcome(normalizedDetection),
      allowUntested,
    )
  }

  const detectedVersion = parseSemver(normalizedDetection.detectedVersion)
  if (!detectedVersion) {
    throw new Error("Detected version normalization produced an invalid semantic version.")
  }

  const minCheckVersion = detectedVersion.prerelease.length > 0
    ? { ...detectedVersion, prerelease: [] as string[] }
    : detectedVersion

  if (compareSemver(minCheckVersion, matrixEntry.minimumSupportedVersion) < 0) {
    return finalizeCompatibilityResult(normalizedDetection, policyMode, {
      status: "incompatible",
      reason: `Version is below minimum supported version ${matrixEntry.minimumSupportedVersion.normalized}.`,
    }, allowUntested)
  }

  for (const badRange of matrixEntry.knownBadRanges) {
    if (matchesRange(detectedVersion, badRange)) {
      return finalizeCompatibilityResult(normalizedDetection, policyMode, {
        status: "incompatible",
        reason: `Version ${normalizedDetection.detectedVersion} is in a known bad range.`,
      }, allowUntested)
    }
  }

  if (matrixEntry.testedRanges.some((range) => matchesRange(detectedVersion, range))) {
    return finalizeCompatibilityResult(normalizedDetection, policyMode, {
      status: "compatible",
      reason: "Version is within a tested range.",
    }, allowUntested)
  }

  return finalizeCompatibilityResult(normalizedDetection, policyMode, {
    status: "untested",
    reason: "Version is parseable but outside tested ranges.",
  }, allowUntested)
}

export function toSuperpowersAvailabilityResult(
  compatibility: Pick<SuperpowersCompatibilityResult, "status" | "reason">,
): SuperpowersAvailabilityResult {
  if (compatibility.status === "not_detected") {
    return {
      status: "not_detected",
      reason: compatibility.reason,
    }
  }

  return {
    status: "available",
    reason: "Detected superpowers install can be evaluated for compatibility.",
  }
}

function validateMatrixEntry(
  host: SupportedSuperpowersHost,
  entry: unknown,
) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Missing compatibility matrix entry for host ${host}.`)
  }

  const matrixEntry = entry as Record<string, unknown>

  const minimumSupportedVersion = matrixEntry.minimumSupportedVersion
  if (typeof minimumSupportedVersion !== "string") {
    throw new Error(`Invalid minimum supported version for host ${host}: expected a string.`)
  }

  return {
    minimumSupportedVersion: parseRequiredSemver(
      minimumSupportedVersion,
      `Invalid minimum supported version for host ${host}: ${minimumSupportedVersion}`,
    ),
    knownBadRanges: parseRangeList(
      host,
      "knownBadRanges",
      matrixEntry.knownBadRanges,
      "known bad range",
    ),
    testedRanges: parseRangeList(
      host,
      "testedRanges",
      matrixEntry.testedRanges,
      "tested range",
    ),
  }
}

function parseRangeList(
  host: SupportedSuperpowersHost,
  field: "testedRanges" | "knownBadRanges",
  value: unknown,
  singularLabel: "tested range" | "known bad range",
) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field} for host ${host}: expected an array of strings.`)
  }

  return value.map((range, index) => {
    if (typeof range !== "string") {
      throw new Error(`Invalid ${field} at ${host}.${field}[${index}]: expected a string.`)
    }

    return parseRange(range, `Invalid ${singularLabel} at ${host}.${field}[${index}]`)
  })
}

function normalizeDetection(detection: SuperpowersDetectionResult) {
  const parsedVersion = parseSemver(detection.detectedVersion)

  if (parsedVersion) {
    return {
      ...detection,
      detectedVersion: parsedVersion.normalized,
      detectedRef: detection.detectedRef ?? null,
    }
  }

  const detectedRef = detection.detectedVersion ?? detection.detectedRef ?? null

  return {
    ...detection,
    detectedVersion: null,
    detectedRef,
  }
}

function getNotDetectedCompatibilityOutcome(
  detection: ReturnType<typeof normalizeDetection>,
): Pick<SuperpowersCompatibilityResult, "status" | "reason"> {
  if (isConflictDetectionSource(detection.source)) {
    return {
      status: "not_detected",
      reason: "Conflicting superpowers installs or install evidence were detected.",
    }
  }

  if (detection.detectedRef) {
    return {
      status: "not_detected",
      reason: `Detected a non-versioned or unparseable superpowers ref: ${detection.detectedRef}.`,
    }
  }

  const failureReason = formatDetectionFailureReason(detection.details?.failures)
  if (failureReason) {
    return {
      status: "not_detected",
      reason: failureReason,
    }
  }

  return {
    status: "not_detected",
    reason: "No superpowers install could be detected.",
  }
}

function isConflictDetectionSource(source: string) {
  return source.includes("multiple-installs") || source.includes("conflict")
}

function formatDetectionFailureReason(failures?: SuperpowersDetectionFailure[]) {
  if (!failures || failures.length === 0) {
    return null
  }

  const summarizedFailures = failures.map((failure) => (
    `${failure.source} ${failure.stage}: ${failure.message}`
  ))

  return `Superpowers detector failures prevented version detection: ${summarizedFailures.join("; ")}`
}

function finalizeCompatibilityResult(
  detection: ReturnType<typeof normalizeDetection>,
  policyMode: SuperpowersCompatibilityMode,
  outcome: Pick<SuperpowersCompatibilityResult, "status" | "reason">,
  allowUntested: "warn" | "block" = "warn",
): SuperpowersCompatibilityResult {
  return {
    host: detection.host,
    source: detection.source,
    detectedVersion: detection.detectedVersion,
    detectedRef: detection.detectedRef,
    status: outcome.status,
    reason: outcome.reason,
    policyMode,
    shouldBlock:
      (policyMode === "strict" && outcome.status === "incompatible") ||
      (allowUntested === "block" && outcome.status === "untested"),
  }
}

function parseSemver(value?: string | null): ParsedSemver | null {
  if (!value) {
    return null
  }

  const normalized = value.startsWith("v") ? value.slice(1) : value
  const match = normalized.match(SEMVER_PATTERN)

  if (!match?.groups) {
    return null
  }

  const prerelease = match.groups.prerelease?.split(".") ?? []
  if (!isValidPrerelease(prerelease)) {
    return null
  }

  const build = match.groups.build?.split(".") ?? []
  if (!isValidBuildMetadata(build)) {
    return null
  }

  return {
    normalized,
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease,
  }
}

function isValidPrerelease(identifiers: string[]) {
  return identifiers.every((identifier) => {
    if (identifier.length === 0) {
      return false
    }

    return !/^\d+$/.test(identifier) || identifier === "0" || !identifier.startsWith("0")
  })
}

function isValidBuildMetadata(identifiers: string[]) {
  return identifiers.every((identifier) => identifier.length > 0)
}

function parseRequiredSemver(value: string, errorMessage: string) {
  const parsed = parseSemver(value)

  if (!parsed) {
    throw new Error(errorMessage)
  }

  return parsed
}

function compareSemver(left: ParsedSemver, right: ParsedSemver) {
  const majorComparison = compareNumber(left.major, right.major)
  if (majorComparison !== 0) {
    return majorComparison
  }

  const minorComparison = compareNumber(left.minor, right.minor)
  if (minorComparison !== 0) {
    return minorComparison
  }

  const patchComparison = compareNumber(left.patch, right.patch)
  if (patchComparison !== 0) {
    return patchComparison
  }

  return comparePrerelease(left.prerelease, right.prerelease)
}

function compareNumber(left: number, right: number) {
  return left === right ? 0 : left < right ? -1 : 1
}

function comparePrerelease(left: string[], right: string[]) {
  if (left.length === 0 && right.length === 0) {
    return 0
  }

  if (left.length === 0) {
    return 1
  }

  if (right.length === 0) {
    return -1
  }

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftIdentifier = left[index]
    const rightIdentifier = right[index]

    if (leftIdentifier === undefined) {
      return -1
    }

    if (rightIdentifier === undefined) {
      return 1
    }

    const comparison = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier)
    if (comparison !== 0) {
      return comparison
    }
  }

  return 0
}

function comparePrereleaseIdentifier(left: string, right: string) {
  const leftIsNumeric = /^\d+$/.test(left)
  const rightIsNumeric = /^\d+$/.test(right)

  if (leftIsNumeric && rightIsNumeric) {
    return compareNumber(Number(left), Number(right))
  }

  if (leftIsNumeric) {
    return -1
  }

  if (rightIsNumeric) {
    return 1
  }

  return left === right ? 0 : left < right ? -1 : 1
}

function parseRange(range: string, errorPrefix: string): ParsedRange {
  const comparators = range.split(/\s+/).filter(Boolean)

  if (comparators.length === 0) {
    throw new Error(`${errorPrefix}: empty range`)
  }

  const parsedComparators = comparators.map((comparator) =>
    parseComparator(comparator, `${errorPrefix}: ${range}`),
  )

  return {
    comparators: parsedComparators,
    includesPrereleaseBoundary: parsedComparators.some(
      (comparator) => comparator.boundary.prerelease.length > 0,
    ),
  }
}

function parseComparator(comparator: string, errorMessage: string): ParsedComparator {
  const match = comparator.match(/^(>=|<=|>|<|=)?(.+)$/)
  if (!match) {
    throw new Error(errorMessage)
  }

  const operator = (match[1] ?? "=") as ParsedComparator["operator"]
  const boundary = parseRequiredSemver(match[2], errorMessage)

  return { operator, boundary }
}

function matchesRange(version: ParsedSemver, range: ParsedRange) {
  if (version.prerelease.length > 0) {
    if (range.includesPrereleaseBoundary) {
      if (
        !range.comparators.some(
          (comparator) =>
            comparator.boundary.prerelease.length > 0 && hasSameBaseVersion(version, comparator.boundary),
        )
      ) {
        return false
      }
      return range.comparators.every((comparator) => matchesComparator(version, comparator))
    }

    const coreVersion = { ...version, prerelease: [] as string[] }
    return range.comparators.every((comparator) => matchesComparator(coreVersion, comparator))
  }

  return range.comparators.every((comparator) => matchesComparator(version, comparator))
}

function hasSameBaseVersion(left: ParsedSemver, right: ParsedSemver) {
  return left.major === right.major && left.minor === right.minor && left.patch === right.patch
}

function matchesComparator(version: ParsedSemver, comparator: ParsedComparator) {
  const comparison = compareSemver(version, comparator.boundary)

  switch (comparator.operator) {
    case ">":
      return comparison > 0
    case ">=":
      return comparison >= 0
    case "<":
      return comparison < 0
    case "<=":
      return comparison <= 0
    case "=":
      return comparison === 0
    default:
      return false
  }
}
