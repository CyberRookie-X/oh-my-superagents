import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

type PathExists = (filePath: string) => Promise<boolean>
type GstackAvailabilityResult = {
  status: "available" | "not_detected"
  reason: string
}

export type ClaudeGstackAvailabilitySource =
  | "claude-project-gstack-skill-root"
  | "claude-user-gstack-skill-root"
  | "claude-gstack-skill-root-detection"

export type ClaudeGstackAvailabilityResult = GstackAvailabilityResult & {
  host: "claude"
  source: ClaudeGstackAvailabilitySource
  detectedRoot: string | null
}

export type ClaudeGstackDetectorInput = {
  cwd?: string
  homeDir?: string
  pathExists?: PathExists
}

export async function detectClaudeGstackAvailability(
  input: ClaudeGstackDetectorInput = {},
): Promise<ClaudeGstackAvailabilityResult> {
  const cwd = input.cwd ?? process.cwd()
  const homeDir = input.homeDir ?? homedir()
  const pathExists = input.pathExists ?? defaultPathExists

  const projectRoot = getClaudeProjectGstackSkillRoot(cwd)
  if (await pathExists(projectRoot)) {
    return {
      host: "claude",
      source: "claude-project-gstack-skill-root",
      status: "available",
      reason: `Detected gstack install in Claude skill root ${projectRoot}.`,
      detectedRoot: projectRoot,
    }
  }

  const userRoot = getClaudeUserGstackSkillRoot(homeDir)
  if (await pathExists(userRoot)) {
    return {
      host: "claude",
      source: "claude-user-gstack-skill-root",
      status: "available",
      reason: `Detected gstack install in Claude skill root ${userRoot}.`,
      detectedRoot: userRoot,
    }
  }

  return {
    host: "claude",
    source: "claude-gstack-skill-root-detection",
    status: "not_detected",
    reason: "No gstack install could be detected in Claude skill roots.",
    detectedRoot: null,
  }
}

async function defaultPathExists(filePath: string) {
  try {
    return (await stat(filePath)).isDirectory()
  } catch {
    return false
  }
}

function getClaudeProjectGstackSkillRoot(cwd: string) {
  return path.join(cwd, ".claude", "skills", "gstack")
}

function getClaudeUserGstackSkillRoot(homeDir: string) {
  return path.join(homeDir, ".claude", "skills", "gstack")
}
