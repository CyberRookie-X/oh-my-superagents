export function classifyOpenSpecArtifact(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, "/")

  if (/^openspec\/specs\/.+\.md$/.test(normalizedPath)) {
    return { kind: "spec" as const, dialect: "openspec" as const }
  }

  if (/^openspec\/changes\/.+\/tasks\.md$/.test(normalizedPath)) {
    return { kind: "plan" as const, dialect: "openspec" as const }
  }

  return undefined
}
