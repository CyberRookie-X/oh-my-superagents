import { describe, expect, it } from "vitest"
import { hasArtifactOwnershipMarker } from "../src/materialize.js"

describe("copilot materialize ownership", () => {
  it("detects copilot agent ownership via route marker", () => {
    const content = [
      "---",
      "name: oms-brainstorm",
      "description: test",
      'tools: ["bash"]',
      "---",
      "",
      "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
      "<!-- oms-route: stage=3; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->",
      "",
      "Agent content here",
    ].join("\n")

    expect(hasArtifactOwnershipMarker(content)).toBe(true)
  })

  it("detects copilot skill ownership via route marker", () => {
    const content = [
      "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
      "<!-- oms-route: stage=3; host=copilot; source=superpowers; route=phase.brainstorm; projection=skill; rendered-name=oms-brainstorm -->",
      "",
      "# Skill: oms-brainstorm",
    ].join("\n")

    expect(hasArtifactOwnershipMarker(content)).toBe(true)
  })

  it("detects copilot command ownership via control plane marker", () => {
    const content = [
      "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
      "<!-- oms-control-plane: stage=3; host=copilot; artifact=command; logical-command=status; rendered-name=oms-status -->",
      "",
      "Run oh-my-superagents status.",
    ].join("\n")

    expect(hasArtifactOwnershipMarker(content)).toBe(true)
  })
})
