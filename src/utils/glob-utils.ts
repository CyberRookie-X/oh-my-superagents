export function escapeGlobPattern(pattern: string): string {
  let result = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    switch (ch) {
      case "*":
        if (pattern[i + 1] === "*") {
          if (pattern[i + 2] === "/") {
            result += "(?:.+/)?";
            i += 2;
          } else if (pattern[i + 2] === undefined) {
            result += ".*";
            i += 2;
          } else {
            result += ".*";
            i += 1;
          }
        } else {
          result += "[^/]*";
        }
        break;
      case "?":
        result += "[^/]";
        break;
      case ".": case "\\": case "+": case "^": case "$":
      case "{": case "}": case "(": case ")": case "|":
      case "[": case "]":
        result += "\\" + ch;
        break;
      default:
        result += ch;
    }
  }
  return result;
}

export function matchesGlobPattern(pattern: string, value: string): boolean {
  if (value.includes("..")) return false;
  const escaped = escapeGlobPattern(normalizeRelativePath(pattern));
  const regex = new RegExp("^" + escaped + "$");
  return regex.test(value);
}

export function normalizeRelativePath(p: string): string {
  let result = p.replace(/\\/g, "/");
  if (result.endsWith("/") && result.length > 1) {
    result = result.slice(0, -1);
  }
  return result;
}
