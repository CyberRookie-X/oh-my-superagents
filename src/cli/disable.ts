import { assertWorkflowSupport, joinStderr, writePreparedConfig } from "./shared.js"
import { discoverOwnedArtifacts, removeOwnedArtifacts, cleanupCodexLifecycle } from "./artifacts.js"
import type { CliDeps, CliHost, CliResult } from "./types.js"

export async function handleDisable(
  cwd: string,
  explicitPath: string | undefined,
  host: CliHost,
  deps: CliDeps,
): Promise<CliResult> {
  const resolved = await deps.resolveControlPlane({ command: "status", cwd, explicitPath })
  assertWorkflowSupport(resolved.config, "disable", host)
  const prepared = await deps.prepareControlPlaneStateWrite({
    command: "disable",
    cwd,
    explicitPath,
    nextState: {
      activePreset: resolved.config.settings.activePreset,
      enabled: false,
    },
  })

  await writePreparedConfig(prepared, deps)

  const cleanup = host === "codex"
    ? await cleanupCodexLifecycle(cwd, deps)
    : await (async () => {
      const discovery = await discoverOwnedArtifacts(cwd, host, deps)
      if (discovery.warnings.length > 0) {
        return {
          exitCode: 2 as const,
          warnings: discovery.warnings,
          written: [] as string[],
          removed: [] as string[],
        }
      }

      return removeOwnedArtifacts(discovery.paths, deps)
    })()
  const payload: {
    exitCode: 0 | 1 | 2
    warnings: string[]
    written: string[]
    removed: string[]
  } = {
    exitCode: cleanup.exitCode,
    warnings: cleanup.warnings,
    written: [prepared.path, ...cleanup.written],
    removed: cleanup.removed,
  }

  return {
    exitCode: payload.exitCode,
    stdout: JSON.stringify(payload, null, 2),
    stderr: joinStderr(payload.warnings),
  }
}
