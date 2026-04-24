import path from "node:path"
import { MissingConfigError } from "../errors.js"
import type { ResolvedControlPlane } from "../control-plane/index.js"
import { assertWorkflowSupport, formatCompatibilityBlock, formatCompatibilityWarning, joinStderr, maybeResolveCompatibility, resolveCompatibilityForCliHost, summarizeContextProviders, toRouterConfig, withCompatibility, writePreparedConfig } from "./shared.js"
import { getArtifactsForHost, discoverOwnedArtifacts, removeOwnedArtifacts, cleanupCodexLifecycle, materializeCodexLifecycle } from "./artifacts.js"
import { nodeFs } from "./types.js"
import type { CliDeps, CliHost, CliResult } from "./types.js"
import type { SuperpowersCompatibilityResult } from "../superpowers-compatibility.js"

export async function handleSync(
  cwd: string,
  explicitPath: string | undefined,
  host: CliHost,
  runtimeLane: string | undefined,
  deps: CliDeps,
): Promise<CliResult> {
  let resolved: ResolvedControlPlane
  let bootstrappedConfigPath: string | undefined
  let compatibilityOverride: SuperpowersCompatibilityResult | null | undefined

  try {
    resolved = await deps.resolveControlPlane({ command: "sync", cwd, explicitPath, runtimeLane })
  } catch (error) {
    if (host !== "opencode" || !(error instanceof MissingConfigError) || error.command !== "sync") {
      throw error
    }

    const fallback = await deps.resolveControlPlane({ command: "status", cwd, explicitPath, runtimeLane })
    compatibilityOverride = await maybeResolveCompatibility(
      fallback.config,
      host,
      () => resolveCompatibilityForCliHost(
        host,
        fallback.config.settings.superpowersCompatibility.mode,
        deps,
        fallback.config.settings.superpowersCompatibility.allowUntested,
        fallback.config.settings.superpowersCompatibility.overrides,
      ),
    )

    if (compatibilityOverride?.shouldBlock) {
      return {
        exitCode: 1,
        stdout: JSON.stringify(
          withCompatibility(
            { exitCode: 1 as const, warnings: [], written: [], removed: [] },
            compatibilityOverride,
            undefined,
            undefined,
            summarizeContextProviders([]),
          ),
          null,
          2,
        ),
        stderr: formatCompatibilityBlock(compatibilityOverride),
      }
    }

    const prepared = await deps.prepareControlPlaneStateWrite({
      command: "sync",
      cwd,
      explicitPath,
      nextState: {
        activePreset: fallback.config.settings.activePreset,
        enabled: fallback.config.settings.enabled,
      },
    })

    await writePreparedConfig(prepared, deps)
    bootstrappedConfigPath = prepared.path
    resolved = {
      source: {
        kind: "file",
        hasRealSource: true,
        path: prepared.path,
        sources: [prepared.path],
      },
      config: prepared.config,
      activePreset: fallback.activePreset,
      laneState: fallback.laneState,
      contextProviders: fallback.contextProviders,
      effectiveSources: fallback.effectiveSources,
    }
  }

  assertWorkflowSupport(resolved.config, "sync", host)

  const compatibility = await maybeResolveCompatibility(
    resolved.config,
    host,
    () => resolveCompatibilityForCliHost(
      host,
      resolved.config.settings.superpowersCompatibility.mode,
      deps,
      resolved.config.settings.superpowersCompatibility.allowUntested,
      resolved.config.settings.superpowersCompatibility.overrides,
    ),
  )
  const effectiveCompatibility = compatibilityOverride ?? compatibility

  if (effectiveCompatibility?.shouldBlock) {
    return {
      exitCode: 1,
      stdout: JSON.stringify(
        withCompatibility(
          { exitCode: 1 as const, warnings: [], written: [], removed: [] },
          effectiveCompatibility,
          undefined,
          undefined,
          summarizeContextProviders([]),
        ),
        null,
        2,
      ),
      stderr: formatCompatibilityBlock(effectiveCompatibility),
    }
  }

  if (!resolved.config.settings.enabled) {
    const result = host === "codex"
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

    return {
      exitCode: result.exitCode,
      stdout: JSON.stringify(
        withCompatibility(result, effectiveCompatibility, undefined, undefined, summarizeContextProviders([])),
        null,
        2,
      ),
      stderr: joinStderr([
        formatCompatibilityWarning(effectiveCompatibility),
        ...result.warnings,
      ]),
    }
  }

  const result = host === "codex"
    ? await materializeCodexLifecycle(
      cwd,
      resolved.source.kind === "file" && resolved.source.path
        ? resolved.source.path
        : path.join(cwd, "oh-my-superagents.config.jsonc"),
      toRouterConfig(resolved.config, resolved.laneState),
      resolved.config.settings,
      deps,
    )
    : await deps.materializeArtifacts({
      cwd,
      artifacts: await getArtifactsForHost(
        cwd,
        toRouterConfig(resolved.config, resolved.laneState),
        host,
        deps,
        resolved.config.settings,
      ),
      fs: nodeFs,
    })

  return {
    exitCode: result.exitCode,
    stdout: JSON.stringify(withCompatibility({
      ...result,
      ...(bootstrappedConfigPath ? { written: [bootstrappedConfigPath, ...result.written] } : {}),
    }, effectiveCompatibility, undefined, undefined, summarizeContextProviders([])), null, 2),
    stderr: joinStderr([
      formatCompatibilityWarning(effectiveCompatibility),
      ...result.warnings,
    ]),
  }
}
