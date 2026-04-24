import { describe, it, expect } from "vitest";
import {
  SAFE_NAME_PATTERN,
  validateProfile,
  buildRouteOwnershipMarker,
  renderYamlFrontmatter,
} from "../../src/adapters/shared.js";

describe("SAFE_NAME_PATTERN", () => {
  it("matches valid names", () => {
    expect(SAFE_NAME_PATTERN.test("my-intent")).toBe(true);
    expect(SAFE_NAME_PATTERN.test("build")).toBe(true);
    expect(SAFE_NAME_PATTERN.test("code-review")).toBe(true);
  });
  it("rejects invalid names", () => {
    expect(SAFE_NAME_PATTERN.test("My Intent")).toBe(false);
    expect(SAFE_NAME_PATTERN.test("build!")).toBe(false);
    expect(SAFE_NAME_PATTERN.test("")).toBe(false);
  });
});

describe("validateProfile", () => {
  const profiles = { sonnet: { model: "claude-sonnet" }, gpt5: { model: "gpt-5" } };
  it("returns profile if found", () => {
    expect(validateProfile(profiles, "sonnet").model).toBe("claude-sonnet");
  });
  it("throws for unknown profile", () => {
    expect(() => validateProfile(profiles, "unknown")).toThrow("Unknown profile");
  });
});

describe("buildRouteOwnershipMarker", () => {
  it("generates HTML comment marker", () => {
    const marker = buildRouteOwnershipMarker({
      canonicalRoute: "phase.plan", host: "opencode", profileId: "sonnet", source: "superpowers",
    });
    expect(marker).toContain("<!-- oms-route:");
    expect(marker).toContain("canonicalRoute=phase.plan");
    expect(marker).toContain("host=opencode");
  });
});

describe("renderYamlFrontmatter", () => {
  it("renders simple fields", () => {
    const yaml = renderYamlFrontmatter({ description: "test", model: "sonnet" });
    expect(yaml).toContain("description: 'test'");
    expect(yaml).toContain("model: 'sonnet'");
  });
  it("wraps in --- delimiters", () => {
    const yaml = renderYamlFrontmatter({ key: "value" });
    expect(yaml.startsWith("---\n")).toBe(true);
    expect(yaml.endsWith("---\n")).toBe(true);
  });
  it("escapes single quotes", () => {
    const yaml = renderYamlFrontmatter({ desc: "it's working" });
    expect(yaml).toContain("it''s working");
  });
});
