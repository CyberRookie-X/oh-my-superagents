import path from "node:path"

export type ConfigRecoveryState = {
  activeSource: "authority" | "last-known-good"
  authorityError?: string
  lastKnownGoodPath?: string
}

export function getLastKnownGoodPath(authorityPath: string) {
  return path.join(path.dirname(authorityPath), ".oms", "last-known-good.json")
}

export function shouldFallbackToLastKnownGood(input: {
  authorityError: Error
  hasLastKnownGood: boolean
}) {
  return Boolean(input.authorityError) && input.hasLastKnownGood
}
