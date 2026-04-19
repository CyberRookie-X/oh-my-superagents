import { describe, expect, it } from "vitest"
import { buildPolicyAuthoringProposal } from "../src/author-policy.js"

describe("buildPolicyAuthoringProposal", () => {
  it("turns detected evidence and answers into a reviewable authority proposal", () => {
    const proposal = buildPolicyAuthoringProposal({
      detectedPaths: [
        { path: "frontend/**", suggestedTags: ["frontend", "visual"] },
      ],
      answers: {
        verifyNeedsVision: true,
        subagentsUsePackets: true,
      },
    })

    expect(proposal.authority.workloadMappings[0]).toEqual({
      path: ["frontend/**"],
      workloadTags: ["frontend", "visual"],
    })
    expect(proposal.authority.policyRules.map((rule) => rule.id)).toEqual([
      "subagent-packet-default",
      "verify-vision",
    ])
    expect(proposal.notes.length).toBeGreaterThan(0)
  })

  it("skips evidence entries that do not have confirmed suggested tags yet", () => {
    const proposal = buildPolicyAuthoringProposal({
      detectedPaths: [
        { path: "frontend/**", suggestedTags: [] },
      ],
      answers: {
        verifyNeedsVision: false,
        subagentsUsePackets: false,
      },
    })

    expect(proposal.authority.workloadMappings).toEqual([])
    expect(proposal.notes.length).toBeGreaterThan(0)
  })
})
