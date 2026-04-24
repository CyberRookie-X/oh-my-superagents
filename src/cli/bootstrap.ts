import { resolveCompatibilityForHost, formatCompatibilityBlock, formatCompatibilityWarning, joinStderr } from "./shared.js"
import { nodeFs } from "./types.js"
import type { CliDeps, CliResult } from "./types.js"

export async function handleBootstrap(
  cwd: string,
  explicitPath: string | undefined,
  deps: CliDeps,
): Promise<CliResult> {
  const host = "codex" as const
  const result = await deps.buildCodexBootstrap({
    cwd,
    explicitPath,
    discoverConfigPath: deps.discoverConfigPath,
    loadConfig: deps.loadConfig,
    materializeArtifacts: deps.materializeArtifacts,
    buildCodexArtifacts: deps.buildCodexArtifacts,
    resolveCompatibility: async (policyMode) => resolveCompatibilityForHost(host, policyMode, deps),
    fs: nodeFs,
  })

  return {
    exitCode: result.syncResult.exitCode,
    stdout: JSON.stringify(result, null, 2),
    stderr: result.compatibility?.shouldBlock
      ? formatCompatibilityBlock(result.compatibility)
      : joinStderr([
        formatCompatibilityWarning(result.compatibility),
        ...result.syncResult.warnings,
      ]),
  }
}
