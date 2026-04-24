import { describe, it, expect } from "vitest";
import { safeJsonParse } from "../src/utils/json.js";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    const result = safeJsonParse('{"key": "value"}', {});
    expect(result.value).toEqual({ key: "value" });
    expect(result.warning).toBeUndefined();
  });

  it("returns fallback for invalid JSON", () => {
    const result = safeJsonParse("{invalid", { default: true });
    expect(result.value).toEqual({ default: true });
    expect(result.warning).toContain("Failed to parse JSON");
  });

  it("returns fallback for empty string", () => {
    const result = safeJsonParse("", []);
    expect(result.value).toEqual([]);
    expect(result.warning).toBeDefined();
  });

  it("returns fallback for null input", () => {
    const result = safeJsonParse(null as unknown as string, "fallback");
    expect(result.value).toBe("fallback");
    expect(result.warning).toBeDefined();
  });

  it("parses arrays", () => {
    const result = safeJsonParse("[1, 2, 3]", [] as number[]);
    expect(result.value).toEqual([1, 2, 3]);
    expect(result.warning).toBeUndefined();
  });
});
