import { exec } from "node:child_process"
import { promisify } from "node:util"
import {
  BUILT_IN_PHASES,
  type ControlPlaneCommandKey,
  type RouterConfig,
} from "./config.js"
import { getHostProjectionDecision } from "./capabilities.js"
import { CONTROL_PLANE_MARKER_PREFIX, MARKER, renderRouteOwnershipMetadata, type GeneratedArtifact } from "./opencode.js"
import { resolvePhase, type BuiltInPhase, type ResolvedRoute } from "./router.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"

const execAsync = promisify(exec)

const PHASE_TO_COPILOT_COMMAND = {
  brainstorming: "suggest",
  "writing-plans": "suggest",
  "subagent-driven-development": "suggest",
  "requesting-code-review": "explain",
  "verification-before-completion": "suggest",
  "frontend-design": "suggest",
  "webapp-testing": "suggest",
} as const satisfies Record<BuiltInPhase, string>

const DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "sync", "doctor"])

export type CopilotArtifact = {
  kind: "script"
  directory: string
  fileName: string
  ownerPrefix: string
  content: string
}

type RenderCopilotScriptInput = {
  name: string
  phase: BuiltInPhase
  profileId: string
  model: string
  command: string
  sourceEntry: ResolvedRoute["sourceEntry"]
}

function renderCopilotRouteMetadata(input: {
  source: string
  route: string
  renderedName: string
}) {
  return `# ${CONTROL_PLANE_MARKER_PREFIX} stage=1; host=copilot; source=${input.source}; route=${input.route}; projection=script; rendered-name=${input.renderedName}`
}

function renderCopilotScript(input: RenderCopilotScriptInput) {
  const metadata = renderCopilotRouteMetadata({
    source: input.sourceEntry.source,
    route: input.sourceEntry.canonicalRoute,
    renderedName: input.name,
  })

  return `${metadata}

# OMS Copilot CLI Wrapper: ${input.name}

This script wraps the \`gh copilot ${input.command}\` command for phase \`${input.phase}\`.

## Route Metadata
- canonical route: \`${input.sourceEntry.canonicalRoute}\`
- source: \`${input.sourceEntry.source}\`
- profile: \`${input.profileId}\`
- model: \`${input.model}\`

## Usage
${MARKER}

#!/bin/bash
# OMS Copilot CLI wrapper for ${input.phase}
gh copilot ${input.command} "$@"
`
}

function assertCopilotProjectionSupport(workflowKind: RouterConfig["workflow"]["kind"], sourceEntry: ResolvedRoute["sourceEntry"]) {
  const decision = getHostProjectionDecision({
    host: "copilot",
    workflowKind,
    sourceEntry,
  })

  if (decision.supported) {
    return
  }

  throw new Error(
    `Copilot projection blocked by capability policy (${decision.reasonCode}) for ${sourceEntry.source}/${sourceEntry.canonicalRoute}`,
  )
}

export async function detectCopilotCLI(): Promise<{ installed: boolean; version?: string; error?: string }> {
  try {
    const { stdout: ghVersion } = await execAsync("gh --version", { encoding: "utf-8" })
    const { stdout: copilotVersion } = await execAsync("gh copilot --version", { encoding: "utf-8" })
    return {
      installed: true,
      version: copilotVersion.trim(),
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        installed: false,
        error: error.message,
      }
    }
    return {
      installed: false,
      error: "Unknown error",
    }
  }
}

export function buildCopilotArtifacts(config: RouterConfig): { scripts: CopilotArtifact[] } {
  if (config.workflow?.kind === "direct") {
    const firstIntent = Object.keys(config.workflow.intents)[0] ?? "direct"
    const sourceEntry = {
      canonicalRoute: toDirectCanonicalRouteId(firstIntent),
      source: "direct",
    } as const

    assertCopilotProjectionSupport(config.workflow.kind, sourceEntry)

    return { scripts: [] }
  }

  const scripts = BUILT_IN_PHASES.map<CopilotArtifact>((phase) => {
    const resolved = resolvePhase(config, phase)
    const scriptName = `oms-${phase}`
    const command = PHASE_TO_COPILOT_COMMAND[phase]

    assertCopilotProjectionSupport(config.workflow.kind, resolved.sourceEntry)

    return {
      kind: "script",
      directory: ".github/copilot",
      fileName: scriptName,
      ownerPrefix: "oms-",
      content: renderCopilotScript({
        name: scriptName,
        phase,
        profileId: resolved.profileId,
        model: resolved.selection.model,
        command,
        sourceEntry: resolved.sourceEntry,
      }),
    }
  })

  return { scripts }
}

export function getCopilotControlPlaneCommands(): ControlPlaneCommandKey[] {
  return Array.from(DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS)
}

export function getCopilotOwnedArtifactRules() {
  return [
    { directory: ".github/copilot", extension: "" },
  ]
}

export function isCopilotArtifactPath(path: string): boolean {
  return path.startsWith(".github/copilot/")
}
