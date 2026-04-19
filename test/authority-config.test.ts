import { describe, expect, it } from "vitest"
import { parseOmsAuthorityDocument, parseOmsInventoryDocument } from "../src/authority-config.js"

describe("parseOmsInventoryDocument", () => {
  it("accepts user-global models and tool inventory", () => {
    expect(parseOmsInventoryDocument({
      models: {
        "backend-text": { model: "openai/gpt-5", capabilities: ["text", "code"] },
      },
      tools: {
        playwright: { kind: "mcp", tags: ["browser", "visual"] },
      },
    })).toMatchObject({
      models: { "backend-text": { model: "openai/gpt-5" } },
    })
  })
})

describe("parseOmsAuthorityDocument", () => {
  it("accepts confirmed workload mappings and policy rules", () => {
    expect(parseOmsAuthorityDocument({
      workloadMappings: [{ path: ["frontend/**"], workloadTags: ["frontend", "visual"] }],
      policyRules: [],
    })).toMatchObject({
      workloadMappings: [{ workloadTags: ["frontend", "visual"] }],
    })
  })

  it("rejects malformed policyRules selector and policy shapes", () => {
    expect(() => parseOmsAuthorityDocument({
      workloadMappings: [],
      policyRules: [{
        selector: { unknownSelector: ["frontend/**"] },
        policy: { modelPolicy: { preferredProfiles: ["frontend-vision"] } },
      }],
    })).toThrow()

    expect(() => parseOmsAuthorityDocument({
      workloadMappings: [],
      policyRules: [{
        selector: { path: ["frontend/**"] },
        policy: { unknownPolicy: { preferredProfiles: ["frontend-vision"] } },
      }],
    })).toThrow()
  })
})
