import type { BuiltInPhase } from "../router.js"
import { assertWorkflowSupport, resolvePresetKey, buildUseRouteImpact, formatPostWriteControlPlaneSource, joinStderr, toRouterConfig, writePreparedConfig } from "./shared.js"
import { getArtifactsForHost, materializeCodexLifecycle } from "./artifacts.js"
import { nodeFs } from "./types.js"
import type { CliDeps, CliHost, CliResult } from "./types.js"

export async function handleUse(
  cwd: string,
  explicitPath: string | undefined,
  host: CliHost,
  selector: string,
  deps: CliDeps,
): Promise<CliResult> {
  const resolved = await deps.resolveControlPlane({ command: "status", cwd, explicitPath })
  assertWorkflowSupport(resolved.config, "use", host)
  const nextPreset = resolvePresetKey(resolved, selector)
  const prepared = await deps.prepareControlPlaneStateWrite({
    command: "use",
    cwd,
    explicitPath,
    nextState: {
      activePreset: nextPreset,
      enabled: true,
    },
  })

  await writePreparedConfig(prepared, deps)

  const result = host === "codex"
    ? await materializeCodexLifecycle(cwd, prepared.path, toRouterConfig(prepared.config), prepared.config.settings, deps)
    : await deps.materializeArtifacts({
      cwd,
      artifacts: await getArtifactsForHost(cwd, toRouterConfig(prepared.config), host, deps, prepared.config.settings),
      fs: nodeFs,
    })
  const routeImpact = host === "opencode"
    ? buildUseRouteImpact(resolved.config, prepared.config)
    : undefined
  const artifactsDiffer = result.exitCode !== 0
  const payload: {
    exitCode: 0 | 1 | 2
    warnings: string[]
    written: string[]
    removed: string[]
    changed: boolean
    source: ReturnType<typeof formatPostWriteControlPlaneSource>
    artifactsDiffer: boolean
    routeImpact?: {
      changedPhases: BuiltInPhase[]
    }
    activePreset: {
      key: string
      label: string
      short: string
      description?: string
    }
    nextAction?: {
      command: string
      reason: string
    }
  } = (() => {
    const changed = nextPreset !== resolved.activePreset.key || !resolved.config.settings.enabled
    const activePreset = prepared.config.presets[nextPreset]!

    return {
      exitCode: result.exitCode,
      warnings: result.warnings,
      written: [prepared.path, ...result.written],
      removed: result.removed,
      changed,
      source: formatPostWriteControlPlaneSource(resolved, prepared),
      artifactsDiffer,
      ...(routeImpact ? { routeImpact } : {}),
      activePreset: {
        key: nextPreset,
        label: activePreset.label,
        short: activePreset.short,
        ...(activePreset.description ? { description: activePreset.description } : {}),
      },
      ...(host === "opencode" && changed && result.exitCode === 2
        ? {
          nextAction: {
            command: "oh-my-superagents sync --host opencode",
            reason: "Retry the OpenCode artifact refresh for the newly active preset.",
          },
        }
        : {}),
    }
  })()

  return {
    exitCode: payload.exitCode,
    stdout: JSON.stringify(payload, null, 2),
    stderr: joinStderr(payload.warnings),
  }
}
