import { describe, expect, it } from "vitest"
import { mergePolicyFamilies } from "../src/policy-families.js"

describe("mergePolicyFamilies", () => {
  it("merges sparse model, context, and tool policies without overwriting unrelated families", () => {
    expect(mergePolicyFamilies(
      {
        modelPolicy: { preferredProfiles: ["backend-text"] },
        contextPolicy: { compressionPreset: "default" },
      },
      {
        toolPolicy: { allowedMcpTags: ["browser"] },
      },
    )).toEqual({
      modelPolicy: { preferredProfiles: ["backend-text"] },
      contextPolicy: { compressionPreset: "default" },
      toolPolicy: { allowedMcpTags: ["browser"] },
    })
  })

  it("keeps unrelated policy families absent when neither side defines them", () => {
    expect(mergePolicyFamilies({}, {})).toEqual({})
  })

  it("allows a more specific rule to clear an inherited list-valued policy", () => {
    expect(mergePolicyFamilies(
      {
        modelPolicy: { preferredProfiles: ["backend-text"] },
      },
      {
        modelPolicy: { preferredProfiles: [] },
      },
    )).toEqual({
      modelPolicy: { preferredProfiles: [] },
    })
  })

  it("returns cloned list values instead of aliasing source arrays", () => {
    const base = {
      modelPolicy: { preferredProfiles: ["backend-text"] },
    }
    const override = {
      toolPolicy: { allowedMcpTags: ["browser"] },
    }

    const merged = mergePolicyFamilies(base, override)
    merged.modelPolicy?.preferredProfiles?.push("changed")
    merged.toolPolicy?.allowedMcpTags?.push("changed")

    expect(base.modelPolicy.preferredProfiles).toEqual(["backend-text"])
    expect(override.toolPolicy.allowedMcpTags).toEqual(["browser"])
  })

  it("allows a more specific rule to clear inherited scalar policy values with null", () => {
    expect(mergePolicyFamilies(
      {
        modelPolicy: {
          effort: "deep",
          preferWindowClass: "large",
        },
        contextPolicy: {
          compressionPreset: "review",
          maxCharsBeforeCompression: 2048,
        },
      },
      {
        modelPolicy: {
          effort: null,
          preferWindowClass: null,
        },
        contextPolicy: {
          compressionPreset: null,
          maxCharsBeforeCompression: null,
        },
      },
    )).toEqual({})
  })
})
