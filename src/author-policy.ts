import {
  parseOmsAuthorityDocument,
  type OmsAuthorityDocument,
  type OmsEvidenceDocument,
} from "./authority-config.js"

export type PolicyAuthoringInput = {
  detectedPaths: OmsEvidenceDocument["detectedPaths"]
  answers: {
    verifyNeedsVision: boolean
    subagentsUsePackets: boolean
  }
}

export function buildPolicyAuthoringProposal(input: PolicyAuthoringInput) {
  const authority: OmsAuthorityDocument = {
    workloadMappings: input.detectedPaths
      .filter((entry) => entry.suggestedTags.length > 0)
      .map((entry) => ({
        path: [entry.path],
        workloadTags: [...entry.suggestedTags],
      })),
    policyRules: [],
  }

  if (input.answers.subagentsUsePackets) {
    authority.policyRules.push({
      id: "subagent-packet-default",
      selector: { agentRole: ["subagent"] },
      policy: { contextPolicy: { packetFirst: true } },
    })
  }

  if (input.answers.verifyNeedsVision) {
    authority.policyRules.push({
      id: "verify-vision",
      selector: { lifecycleStage: ["verify"], modalityRequirements: ["vision-input"] },
      policy: { modelPolicy: { requiredCapabilities: ["vision-input"] } },
    })
  }

  const notes = [
    "Review workload tag mappings before writing authority config.",
  ]

  if (input.answers.verifyNeedsVision) {
    notes.push("Review verify-stage capability requirements before writing authority config.")
  }

  if (input.answers.subagentsUsePackets) {
    notes.push("Review subagent packet-first policy before writing authority config.")
  }

  return {
    authority: parseOmsAuthorityDocument(authority),
    notes,
  }
}
