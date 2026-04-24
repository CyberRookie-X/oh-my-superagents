import { describe, it, expect } from "vitest";
import { MissingConfigError } from "../src/errors.js";

describe("MissingConfigError", () => {
  it("is instanceof Error", () => {
    const err = new MissingConfigError("sync");
    expect(err).toBeInstanceOf(Error);
  });

  it("is instanceof MissingConfigError", () => {
    const err = new MissingConfigError("sync");
    expect(err).toBeInstanceOf(MissingConfigError);
  });

  it("has correct name", () => {
    const err = new MissingConfigError("sync");
    expect(err.name).toBe("MissingConfigError");
  });

  it("has code property", () => {
    const err = new MissingConfigError("sync");
    expect(err.code).toBe("MISSING_CONFIG");
  });

  it("has command property", () => {
    const err = new MissingConfigError("use");
    expect(err.command).toBe("use");
  });

  it("has descriptive message", () => {
    const err = new MissingConfigError("disable");
    expect(err.message).toContain("disable");
    expect(err.message).toContain("real config source");
  });
});
