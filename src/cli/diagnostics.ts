import path from "node:path"
import { RUNTIME_AGENT_METADATA_DIRECTORY, RUNTIME_AGENT_METADATA_FILE } from "../opencode.js"
import { isOpenCodeRuntimeMetadataContent } from "../materialize.js"
import { safeJsonParse } from "../utils/json.js"
import { toRouterConfig } from "./shared.js"
import type { CliDeps } from "./types.js"
import type { ResolvedControlPlane } from "../control-plane/index.js"

export function buildOpenCodeCodexFastRuntimeDiagnostics(
  cwd: string,
  config: ResolvedControlPlane["config"],
  laneState: ResolvedControlPlane["laneState"] | undefined,
  deps: CliDeps,
) {
  const manifestPath = path.join(cwd, RUNTIME_AGENT_METADATA_DIRECTORY, RUNTIME_AGENT_METADATA_FILE)
  const built = deps.buildArtifacts(toRouterConfig(config, laneState), config.settings)
  const runtimeMetadataArtifact = built.commands.find((artifact) => (
    artifact.directory === RUNTIME_AGENT_METADATA_DIRECTORY
    && artifact.fileName === RUNTIME_AGENT_METADATA_FILE
  ))

  if (!runtimeMetadataArtifact || !isOpenCodeRuntimeMetadataContent(runtimeMetadataArtifact.content)) {
    return {
      manifestPath,
      hasEnabledAgents: false,
    }
  }

  const { value: parsed, warning } = safeJsonParse<{
    agents: Record<string, { codexFast: boolean }>
  }>(runtimeMetadataArtifact.content, { agents: {} })
  if (warning) {
    return [{ level: "warning", message: warning }]
  }

  return {
    manifestPath,
    hasEnabledAgents: Object.values(parsed.agents).some((agent) => agent.codexFast),
  }
}
