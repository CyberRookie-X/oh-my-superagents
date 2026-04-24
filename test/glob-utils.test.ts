import { describe, it, expect } from "vitest";
import { escapeGlobPattern, matchesGlobPattern, normalizeRelativePath } from "../src/utils/glob-utils.js";

describe("escapeGlobPattern", () => {
  it("escapes regex metacharacters", () => {
    const escaped = escapeGlobPattern("src/*.ts");
    expect(escaped).toBe("src/[^/]*\\.ts");
  });

  it("handles ** pattern", () => {
    const escaped = escapeGlobPattern("src/**/*.ts");
    expect(escaped).toContain("(?:.+/)?");
  });

  it("handles question marks", () => {
    const escaped = escapeGlobPattern("file?.ts");
    expect(escaped).toContain("[^/]");
  });

  it("handles character classes", () => {
    const escaped = escapeGlobPattern("file[abc].ts");
    expect(escaped).toBe("file\\[abc\\]\\.ts");
  });

  it("handles empty string", () => {
    expect(escapeGlobPattern("")).toBe("");
  });
});

describe("matchesGlobPattern", () => {
  it("matches exact pattern", () => {
    expect(matchesGlobPattern("*.ts", "file.ts")).toBe(true);
    expect(matchesGlobPattern("*.ts", "file.js")).toBe(false);
  });

  it("matches ** recursive", () => {
    expect(matchesGlobPattern("src/**/*.ts", "src/foo/bar/file.ts")).toBe(true);
    expect(matchesGlobPattern("src/**/*.ts", "src/file.ts")).toBe(true);
  });

  it("rejects path traversal in match", () => {
    expect(matchesGlobPattern("*.ts", "../file.ts")).toBe(false);
  });

  it("matches question mark", () => {
    expect(matchesGlobPattern("file?.ts", "file1.ts")).toBe(true);
    expect(matchesGlobPattern("file?.ts", "file12.ts")).toBe(false);
  });
});

describe("normalizeRelativePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizeRelativePath("src\\foo\\bar.ts")).toBe("src/foo/bar.ts");
  });

  it("trims trailing slash", () => {
    expect(normalizeRelativePath("src/foo/")).toBe("src/foo");
  });

  it("handles already normalized path", () => {
    expect(normalizeRelativePath("src/foo/bar.ts")).toBe("src/foo/bar.ts");
  });
});
