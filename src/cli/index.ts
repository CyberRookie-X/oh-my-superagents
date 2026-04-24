import path from "node:path"
import { BUILT_IN_PHASES } from "../config.js"
import { MissingConfigError } from "../errors.js"
import { CONTEXT_LIFECYCLE_STAGES } from "../context-lifecycle.js"
import { WORKFLOW_SOURCE_KINDS } from "../workflow-sources.js"
import { listRenderedOpenCodeControlPlaneCommands } from "../opencode.js"
import { resolveControlPlane } from "../control-plane/index.js"
import type { ResolvedControlPlane, ResolveControlPlaneInput } from "../control-plane/index.js"
import type { BuiltInPhase } from "../router.js"

import { defaultDeps, nodeFs } from "./types.js"
import type { CliDeps, CliHost, CliResult, CliRuntimeSelectorInputs, ExplainCliHost } from "./types.js"

import {
  parseArgs,
  getStringFlag,
  getCommaSeparatedFlag,
  formatExplainOutput,
  formatCompatibilityWarning,
  formatCompatibilityBlock,
  joinStderr,
  withCompatibility,
  summarizeContextIndex,
  summarizeContextCompression,
  summarizeContextProviders,
  summarizeRecoveryWarnings,
  summarizePolicyResolution,
  resolveCompatibilityForHost,
  resolveCompatibilityForCliHost,
  isCompatibilityHost,
  attachExplainTrace,
  attachExplainReadiness,
  attachLaneExplainability,
  createProjectionReadinessResolver,
  toRouterConfig,
  isGloballyUnsupportedControlPlaneCommand,
  assertWorkflowSupport,
  formatControlPlaneSource,
  formatPostWriteControlPlaneSource,
  buildUseRouteImpact,
  resolvePresetKey,
  writePreparedConfig,
  maybeResolveCompatibility,
  shouldSkipExpectedArtifactBuild,
  createEmptyArtifactInspection,
} from "./shared.js"

import {
  getArtifactsForHost,
  getExpectedArtifacts,
  inspectArtifacts,
  formatArtifactInspection,
  discoverOwnedArtifacts,
  removeOwnedArtifacts,
  cleanupCodexLifecycle,
  materializeCodexLifecycle,
} from "./artifacts.js"

import { buildOpenCodeCodexFastRuntimeDiagnostics } from "./diagnostics.js"
import { buildControlPlaneStatus } from "./status.js"
import { buildControlPlaneDoctor } from "./doctor.js"
import { handleUse } from "./use.js"
import { handleDisable } from "./disable.js"
import { handleSync } from "./sync.js"
import { handleBootstrap } from "./bootstrap.js"
import { handleAuthorRouting, handleConfigAuthor } from "./author.js"
import {
  explainDirectIntent,
  explainAllDirect,
  explainAllForCliHost,
  explainPhaseForCliHost,
} from "./explain.js"

export { defaultDeps, nodeFs } from "./types.js"
export type { CliDeps, CliHost, CliResult, CliRuntimeSelectorInputs } from "./types.js"
export { parseArgs } from "./shared.js"

export async function runCli(argv: string[], deps: CliDeps = defaultDeps): Promise<CliResult> {
  try {
    const { command, flags, positionals } = parseArgs(argv)
    const cwd = deps.getCwd()
    const host = getStringFlag(flags, "--host")
    const explicitPath = getStringFlag(flags, "--config")
    const runtimeLane = getStringFlag(flags, "--lane")
    const rawRuntimeRelativePath = getStringFlag(flags, "--path")
    const rawRuntimeLifecycleStage = getStringFlag(flags, "--lifecycle-stage")
    const rawRuntimeWorkflowSource = getStringFlag(flags, "--workflow-source")
    const rawRuntimeWorkloadTags = getCommaSeparatedFlag(flags, "--workload-tags")
    const rawRuntimeModalityRequirements = getCommaSeparatedFlag(flags, "--modality-requirements")
    const rawRuntimeAgentRole = getStringFlag(flags, "--agent-role")

    if (rawRuntimeLifecycleStage && !(CONTEXT_LIFECYCLE_STAGES as readonly string[]).includes(rawRuntimeLifecycleStage)) {
      return { exitCode: 1, stdout: "", stderr: `Invalid --lifecycle-stage: ${rawRuntimeLifecycleStage}` }
    }

    if (rawRuntimeWorkflowSource && !(WORKFLOW_SOURCE_KINDS as readonly string[]).includes(rawRuntimeWorkflowSource)) {
      return { exitCode: 1, stdout: "", stderr: `Invalid --workflow-source: ${rawRuntimeWorkflowSource}` }
    }

    if (rawRuntimeAgentRole && rawRuntimeAgentRole !== "primary" && rawRuntimeAgentRole !== "subagent") {
      return { exitCode: 1, stdout: "", stderr: `Invalid --agent-role: ${rawRuntimeAgentRole}` }
    }

    const runtimeSelectorInputs = {
      runtimeRelativePath: rawRuntimeRelativePath,
      runtimeLifecycleStage: rawRuntimeLifecycleStage as ResolveControlPlaneInput["runtimeLifecycleStage"],
      runtimeWorkflowSource: rawRuntimeWorkflowSource as ResolveControlPlaneInput["runtimeWorkflowSource"],
      runtimeWorkloadTags: rawRuntimeWorkloadTags,
      runtimeModalityRequirements: rawRuntimeModalityRequirements,
      runtimeAgentRole: rawRuntimeAgentRole as ResolveControlPlaneInput["runtimeAgentRole"],
    }

    if (
      command !== "sync"
      && command !== "explain"
      && command !== "bootstrap"
      && command !== "author"
      && command !== "config"
      && command !== "status"
      && command !== "doctor"
      && command !== "use"
      && command !== "disable"
    ) {
      return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }
    }

    if (command === "bootstrap") {
      if (host !== "codex") {
        return { exitCode: 1, stdout: "", stderr: "bootstrap is currently only supported for --host codex" }
      }

      return await handleBootstrap(cwd, explicitPath, deps)
    }

    if (command === "config") {
      if (positionals[0] === "author") {
        return await handleConfigAuthor(cwd, explicitPath, flags, deps)
      }

      return { exitCode: 1, stdout: "", stderr: "Unknown config subcommand" }
    }

    if (command === "author") {
      if (positionals[0] !== "routing") {
        return { exitCode: 1, stdout: "", stderr: "Unknown author subcommand" }
      }

      return await handleAuthorRouting(cwd, explicitPath, flags, deps)
    }

    if (!host) {
      return { exitCode: 1, stdout: "", stderr: "Missing required --host (supported: opencode, codex, qwen, claude)" }
    }

    if (command === "explain" && host !== "opencode" && host !== "codex" && host !== "qwen" && host !== "claude") {
      return { exitCode: 1, stdout: "", stderr: "Only --host opencode, --host codex, or --host claude is supported for explain in v1" }
    }

    if (command !== "explain" && host !== "opencode" && host !== "codex" && host !== "qwen" && host !== "claude") {
      return { exitCode: 1, stdout: "", stderr: "Only --host opencode, --host codex, --host qwen, or --host claude is supported in v1" }
    }

    const cliHost = host as CliHost

    if (command === "explain" && isGloballyUnsupportedControlPlaneCommand(cliHost, command)) {
      return { exitCode: 1, stdout: "", stderr: `Command ${command} is not supported for --host ${cliHost}` }
    }

    if (command === "status") {
      return {
        exitCode: 0,
        stdout: JSON.stringify(await buildControlPlaneStatus(cwd, explicitPath, cliHost, runtimeLane, runtimeSelectorInputs, deps), null, 2),
        stderr: "",
      }
    }

    if (command === "doctor") {
      return {
        exitCode: 0,
        stdout: JSON.stringify(await buildControlPlaneDoctor(cwd, explicitPath, cliHost, runtimeLane, runtimeSelectorInputs, deps), null, 2),
        stderr: "",
      }
    }

    if (command === "explain") {
      const loaded = await deps.loadConfig({ cwd, explicitPath })
      const explainResolved = await deps.resolveControlPlane({ command: "status", cwd, explicitPath, runtimeLane, ...runtimeSelectorInputs })
      const shouldAttachExplainControlPlaneDiagnostics = host === "opencode"
        || runtimeLane !== undefined
        || (host === "codex" && loaded.config.workflow.kind === "direct")
      const resolved = shouldAttachExplainControlPlaneDiagnostics
        ? explainResolved
        : null
      const explainConfig = resolved?.config ?? loaded.config
      const contextIndex = summarizeContextIndex(explainResolved.contextIndex)
      const contextCompression = summarizeContextCompression(explainResolved.contextCompression)
      const contextProviders = summarizeContextProviders(explainResolved.contextProviders)
      const warnings = summarizeRecoveryWarnings(explainResolved.recovery)
      const policyResolution = summarizePolicyResolution(explainResolved.policyResolution)
      const policyDiagnostics = explainResolved.policyDiagnostics
      assertWorkflowSupport(explainConfig, "explain", cliHost)

      if (explainConfig.workflow.kind === "direct") {
        const directConfig = resolved ? toRouterConfig(resolved.config, resolved.laneState) : loaded.config

        if (flags.get("--all") === true) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(formatExplainOutput(
              resolved
                ? attachLaneExplainability(
                  await attachExplainReadiness(
                    attachExplainTrace(explainAllDirect(directConfig), { cwd, resolved }),
                    {
                      cwd,
                      resolved,
                      resolveReadiness: createProjectionReadinessResolver({
                        cwd,
                        host: cliHost,
                        config: resolved.config,
                        deps,
                      }),
                    },
                  ),
                  resolved,
                )
                : explainAllDirect(directConfig),
               null,
               contextIndex,
               contextCompression,
               contextProviders,
               warnings,
               policyResolution,
               policyDiagnostics,
             ), null, 2),
            stderr: "",
          }
        }

        const intent = getStringFlag(flags, "--intent")
        if (!intent) {
          return { exitCode: 1, stdout: "", stderr: "Missing --intent or --all" }
        }

        return {
          exitCode: 0,
          stdout: JSON.stringify(
            formatExplainOutput(
              resolved
                ? attachLaneExplainability(
                  await attachExplainReadiness(
                    attachExplainTrace(explainDirectIntent(directConfig, intent), { cwd, resolved }),
                    {
                      cwd,
                      resolved,
                      resolveReadiness: createProjectionReadinessResolver({
                        cwd,
                        host: cliHost,
                        config: resolved.config,
                        deps,
                      }),
                    },
                  ),
                  resolved,
                )
                : explainDirectIntent(directConfig, intent),
               null,
               contextIndex,
               contextCompression,
               contextProviders,
               warnings,
               policyResolution,
               policyDiagnostics,
             ),
            null,
            2,
          ),
          stderr: "",
        }
      }

        if (flags.get("--all") === true) {
          const compatibility = await resolveCompatibilityForCliHost(
            cliHost,
            loaded.config.superpowersCompatibility.mode,
            deps,
            loaded.config.superpowersCompatibility.allowUntested,
            loaded.config.superpowersCompatibility.overrides,
          )

        return {
          exitCode: 0,
          stdout: JSON.stringify(formatExplainOutput(
              resolved
                ? attachLaneExplainability(
                  await attachExplainReadiness(
                    attachExplainTrace(explainAllForCliHost(toRouterConfig(resolved.config, resolved.laneState), cliHost as ExplainCliHost, deps), {
                      cwd,
                      resolved,
                    }),
                    {
                      cwd,
                      resolved,
                      resolveReadiness: createProjectionReadinessResolver({
                        cwd,
                        host: cliHost,
                        config: resolved.config,
                        deps,
                        compatibility,
                      }),
                    },
                  ),
                  resolved,
                )
                : explainAllForCliHost(loaded.config, cliHost as ExplainCliHost, deps),
               compatibility,
               contextIndex,
               contextCompression,
               contextProviders,
               warnings,
               policyResolution,
               policyDiagnostics,
             ), null, 2),
            stderr: "",
        }
      }

      const phase = getStringFlag(flags, "--phase")
      if (!phase) {
        return { exitCode: 1, stdout: "", stderr: "Missing --phase or --all" }
      }

      if (!BUILT_IN_PHASES.includes(phase as (typeof BUILT_IN_PHASES)[number])) {
        return { exitCode: 1, stdout: "", stderr: `Unknown phase: ${phase}` }
      }

      const compatibility = await resolveCompatibilityForCliHost(
        cliHost,
        loaded.config.superpowersCompatibility.mode,
        deps,
        loaded.config.superpowersCompatibility.allowUntested,
        loaded.config.superpowersCompatibility.overrides,
      )

      return {
        exitCode: 0,
        stdout: JSON.stringify(
          formatExplainOutput(
              resolved
                ? attachLaneExplainability(
                  await attachExplainReadiness(
                    attachExplainTrace(
                      explainPhaseForCliHost(
                        toRouterConfig(resolved.config, resolved.laneState),
                        cliHost as ExplainCliHost,
                        phase as BuiltInPhase,
                        deps,
                      ),
                      { cwd, resolved },
                    ),
                    {
                      cwd,
                      resolved,
                      resolveReadiness: createProjectionReadinessResolver({
                        cwd,
                        host: cliHost,
                        config: resolved.config,
                        deps,
                        compatibility,
                      }),
                    },
                  ),
                  resolved,
                )
                : explainPhaseForCliHost(loaded.config, cliHost as ExplainCliHost, phase as BuiltInPhase, deps),
               compatibility,
               contextIndex,
               contextCompression,
               contextProviders,
               warnings,
               policyResolution,
               policyDiagnostics,
             ),
            null,
          2,
        ),
        stderr: "",
      }
    }

    if (command === "use") {
      const selector = positionals[0]
      if (!selector) {
        return { exitCode: 1, stdout: "", stderr: "Missing preset argument" }
      }

      return await handleUse(cwd, explicitPath, cliHost, selector, deps)
    }

    if (command === "disable") {
      return await handleDisable(cwd, explicitPath, cliHost, deps)
    }

    if (command === "sync") {
      return await handleSync(cwd, explicitPath, cliHost, runtimeLane, deps)
    }

    return { exitCode: 1, stdout: "", stderr: `Unknown command: ${command ?? ""}` }

  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }
  }
}
