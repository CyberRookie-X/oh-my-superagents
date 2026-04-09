import { describe, expect, it } from "vitest"
import { evaluateSuperpowersCompatibility } from "../src/superpowers-compatibility.js"

function getThrownError(fn: () => unknown) {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

describe("evaluateSuperpowersCompatibility", () => {
  it("returns not_detected with a missing-install reason when no install evidence is available", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "opencode-install-detection",
      },
      "warn",
    )

    expect(result.status).toBe("not_detected")
    expect(result.shouldBlock).toBe(false)
    expect(result.reason).toMatch(/no .*superpowers install/i)
  })

  it("returns not_detected with a conflict reason for multiple install evidence", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "opencode-multiple-installs",
      },
      "warn",
    )

    expect(result.status).toBe("not_detected")
    expect(result.reason).toMatch(/conflict|multiple install/i)
  })

  it("returns incompatible when below the minimum supported version", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedVersion: "4.9.9",
      },
      "warn",
    )

    expect(result.status).toBe("incompatible")
    expect(result.shouldBlock).toBe(false)
  })

  it("returns incompatible for a known bad range before checked tested ranges", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: ["5.0.2"],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    const result = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedVersion: "5.0.2",
      },
      "warn",
      matrix,
    )

    expect(result.status).toBe("incompatible")
  })

  it("returns compatible for a version in a tested range", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedVersion: "5.1.0",
      },
      "warn",
    )

    expect(result.status).toBe("compatible")
  })

  it("returns untested for a parseable version outside tested ranges", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedVersion: "6.0.0",
      },
      "warn",
    )

    expect(result.status).toBe("untested")
  })

  it("normalizes leading v prefixes and preserves prerelease labels", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "codex",
        source: "test",
        detectedVersion: "v5.1.0-beta.1",
      },
      "warn",
    )

    expect(result.detectedVersion).toBe("5.1.0-beta.1")
    expect(result.status).toBe("untested")
  })

  it("treats sha-like commit refs as not_detected", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "codex",
        source: "test",
        detectedVersion: "1a2b3c4d5e6f7a8b9c0d1234567890abcdef1234",
      },
      "warn",
    )

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe("1a2b3c4d5e6f7a8b9c0d1234567890abcdef1234")
    expect(result.status).toBe("not_detected")
    expect(result.reason).toMatch(/ref|unparseable|non-versioned/i)
  })

  it("treats unparseable refs as not_detected with a ref-specific reason", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "codex",
        source: "test",
        detectedVersion: "main",
      },
      "warn",
    )

    expect(result.detectedVersion).toBeNull()
    expect(result.detectedRef).toBe("main")
    expect(result.status).toBe("not_detected")
    expect(result.reason).toMatch(/ref|unparseable|non-versioned/i)
    expect(result.reason).toMatch(/main/)
  })

  it("returns not_detected with a detector-failure reason when detector details include failures", () => {
    const result = evaluateSuperpowersCompatibility(
      {
        host: "codex",
        source: "codex-repo-clone",
        details: {
          failures: [
            {
              source: "codex-repo-clone",
              stage: "inspect-git-checkout",
              message: "git failed",
            },
          ],
        },
      },
      "warn",
    )

    expect(result.status).toBe("not_detected")
    expect(result.reason).toMatch(/detector/i)
    expect(result.reason).toMatch(/inspect-git-checkout|git failed/)
  })

  it("treats prereleases as compatible only when the tested range explicitly includes prereleases", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0-beta.1",
        testedRanges: [">=5.1.0-beta.1 <5.1.0"],
        knownBadRanges: [],
      },
    } as const

    const result = evaluateSuperpowersCompatibility(
      {
        host: "codex",
        source: "test",
        detectedVersion: "v5.1.0-beta.1",
      },
      "warn",
      matrix,
    )

    expect(result.detectedVersion).toBe("5.1.0-beta.1")
    expect(result.status).toBe("compatible")
  })

  it("does not match unrelated prerelease bases just because a range includes some prerelease boundary", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0-beta.1",
        testedRanges: [">=5.0.0-beta.1 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    const result = evaluateSuperpowersCompatibility(
      {
        host: "codex",
        source: "test",
        detectedVersion: "5.7.0-alpha.1",
      },
      "warn",
      matrix,
    )

    expect(result.status).toBe("untested")
  })

  it("throws for malformed minimum supported versions in the matrix", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "not-a-version",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    expect(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    ).toThrow(/minimum supported version/i)
  })

  it("throws for prerelease numeric identifiers with leading zeros in the matrix", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0-01",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    expect(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    ).toThrow(/minimum supported version/i)
  })

  it("throws for prerelease identifiers with empty segments in range expressions", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0-alpha..1 <6.0.0"],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    expect(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    ).toThrow(/tested range/i)
  })

  it("throws for build metadata identifiers with empty segments in the matrix", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0+alpha..1",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    expect(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    ).toThrow(/minimum supported version/i)
  })

  it("throws for malformed range expressions in the matrix", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">>5.0.0"],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    expect(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    ).toThrow(/tested range/i)
  })

  it("throws for empty range expressions in the matrix", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [""],
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as const

    expect(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    ).toThrow(/empty range/i)
  })

  it("throws a clear error when the host matrix entry is missing", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as unknown as Parameters<typeof evaluateSuperpowersCompatibility>[2]

    const error = getThrownError(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "codex",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect((error as Error).message).toMatch(/missing compatibility matrix entry.*codex/i)
  })

  it("throws a clear error when testedRanges is not an array", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: ">=5.0.0 <6.0.0",
        knownBadRanges: [],
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as unknown as Parameters<typeof evaluateSuperpowersCompatibility>[2]

    const error = getThrownError(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect((error as Error).message).toMatch(/testedranges.*array of strings/i)
  })

  it("throws a clear error when knownBadRanges is not an array", () => {
    const matrix = {
      opencode: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: "5.0.2",
      },
      codex: {
        minimumSupportedVersion: "5.0.0",
        testedRanges: [">=5.0.0 <6.0.0"],
        knownBadRanges: [],
      },
    } as unknown as Parameters<typeof evaluateSuperpowersCompatibility>[2]

    const error = getThrownError(() =>
      evaluateSuperpowersCompatibility(
        {
          host: "opencode",
          source: "test",
          detectedVersion: "5.1.0",
        },
        "warn",
        matrix,
      ),
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect((error as Error).message).toMatch(/knownbadranges.*array of strings/i)
  })

  it("blocks only incompatible results in strict mode", () => {
    const incompatible = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedVersion: "4.9.9",
      },
      "strict",
    )
    const compatible = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedVersion: "5.1.0",
      },
      "strict",
    )
    const untested = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedVersion: "6.0.0",
      },
      "strict",
    )
    const notDetected = evaluateSuperpowersCompatibility(
      {
        host: "opencode",
        source: "test",
        detectedRef: "feature-branch",
      },
      "strict",
    )

    expect(incompatible.shouldBlock).toBe(true)
    expect(compatible.shouldBlock).toBe(false)
    expect(untested.shouldBlock).toBe(false)
    expect(notDetected.shouldBlock).toBe(false)
  })
})
