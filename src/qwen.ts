import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { SAFE_NAME_PATTERN } from "./adapters/shared.js"
import {
  BUILT_IN_PHASES,
  CONTROL_PLANE_COMMAND_KEYS,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type RouterConfig,
} from "./config.js"
import { getHostProjectionDecision } from "./capabilities.js"
import { CONTROL_PLANE_MARKER_PREFIX, MARKER, renderRouteOwnershipMetadata, type GeneratedArtifact } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase, type ResolvedRoute } from "./router.js"
import { getWorkflowSourceEntry } from "./workflow-sources.js"
import { toDirectCanonicalRouteId } from "./workflow-direct.js"
import {
  getSuperpowersSourceEntryByWorkflowEntryName,
  toSuperpowersCanonicalRouteId,
} from "./workflow-superpowers.js"

const PHASE_TO_QWEN_AGENT = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
} as const satisfies Record<BuiltInPhase, string>

const PHASE_TO_SKILL = {
  brainstorming: "brainstorming",
  "writing-plans": "writing-plans",
  "subagent-driven-development": "subagent-driven-development",
  "requesting-code-review": "requesting-code-review",
  "verification-before-completion": "verification-before-completion",
  "frontend-design": "frontend-design",
  "webapp-testing": "webapp-testing",
} as const satisfies Record<BuiltInPhase, string>

const DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS = new Set<ControlPlaneCommandKey>(["status", "sync", "doctor"])

export type QwenSkillName = (typeof PHASE_TO_SKILL)[BuiltInPhase]

export type DiscoverQwenUpstreamSkillsInput = {
  cwd: string
  homeDir?: string
  readDirectoryBasenames?: (directoryPath: string) => Promise<string[]>
}

export type BuildQwenArtifactsInput = DiscoverQwenUpstreamSkillsInput

type QwenControlPlaneSettings = Pick<ControlPlaneConfig["settings"], "commandPrefix" | "commands">

type RenderQwenAgentInput = {
  name: string
  description: string
  model: string
  skillName: string
  skillPath: string
  sourceEntry?: ResolvedRoute["sourceEntry"]
}

type RenderQwenDirectAgentInput = {
  name: string
  description: string
  model: string
  intent: string
  intentDescription: string
  sourceEntry?: ResolvedRoute["sourceEntry"]
}

function getSourceEntry(
  sourceEntry: ResolvedRoute["sourceEntry"] | undefined,
  fallback: ResolvedRoute["sourceEntry"],
) {
  return sourceEntry ? { ...fallback, ...sourceEntry } : fallback
}

function formatWorkflowEntryName(sourceEntry: ResolvedRoute["sourceEntry"]) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function getQwenWorkflowEntryName(sourceEntry: ResolvedRoute["sourceEntry"]) {
  return formatWorkflowEntryName(sourceEntry)
}

function formatSourceEntryName(sourceEntry: ResolvedRoute["sourceEntry"]) {
  return `${sourceEntry.source}/${sourceEntry.entryName ?? sourceEntry.canonicalRoute}`
}

function assertQwenProjectionSupport(workflowKind: RouterConfig["workflow"]["kind"] | undefined, sourceEntry: ResolvedRoute["sourceEntry"]) {
  const decision = getHostProjectionDecision({
    host: "qwen",
    workflowKind: workflowKind ?? "superpowers",
    sourceEntry,
  })

  if (decision.supported) {
    return
  }

  throw new Error(
    `Qwen projection blocked by capability policy (${decision.reasonCode}) for ${formatSourceEntryName(sourceEntry)} (${sourceEntry.canonicalRoute})`,
  )
}

export type BuildQwenArtifactsOptions = BuildQwenArtifactsInput & {
  controlPlaneSettings?: QwenControlPlaneSettings
  includeAgents?: boolean
  renderAgentFile?: (input: RenderQwenAgentInput) => string
  resolveRoute?: (config: RouterConfig, routeKey: QwenSkillName) => ResolvedRoute
}

const CONTROL_PLANE_COMMAND_DESCRIPTIONS: Record<ControlPlaneCommandKey, string> = {
  status: "Show OMS status for Qwen.",
  use: "Switch OMS to the selected preset for Qwen.",
  disable: "Disable OMS for Qwen.",
  sync: "Sync OMS artifacts for Qwen.",
  doctor: "Inspect OMS diagnostics for Qwen.",
}

async function defaultReadDirectoryBasenames(directoryPath: string) {
  try {
    return await readdir(directoryPath)
  } catch {
    return []
  }
}

function yamlScalar(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function getAllowedSkillDirectories(cwd: string, homeDir: string) {
  return [
    path.join(cwd, ".qwen", "skills"),
    path.join(cwd, ".agents", "skills"),
    path.join(homeDir, ".qwen", "skills"),
    path.join(homeDir, ".agents", "skills"),
  ]
}

export async function discoverQwenUpstreamSkills(input: DiscoverQwenUpstreamSkillsInput) {
  const readDirectoryBasenames = input.readDirectoryBasenames ?? defaultReadDirectoryBasenames
  const skillNames = BUILT_IN_PHASES.map((phase) => PHASE_TO_SKILL[phase])
  const discovered = Object.fromEntries(skillNames.map((skillName) => [skillName, undefined])) as Record<
    QwenSkillName,
    string | undefined
  >

  for (const directoryPath of getAllowedSkillDirectories(input.cwd, input.homeDir ?? homedir())) {
    const basenames = new Set(await readDirectoryBasenames(directoryPath))

    for (const skillName of skillNames) {
      if (!discovered[skillName] && basenames.has(skillName)) {
        discovered[skillName] = path.join(directoryPath, skillName)
      }
    }
  }

  return discovered
}

export function renderQwenAgentFile(input: RenderQwenAgentInput) {
  const sourceEntry = input.sourceEntry
    ? input.sourceEntry
    : getSuperpowersSourceEntryByWorkflowEntryName(input.skillName)

  if (!sourceEntry) {
    throw new Error(`Unknown superpowers workflow entry: ${input.skillName}`)
  }

  return [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    "---",
    "",
    MARKER,
    renderRouteOwnershipMetadata({
      host: "qwen",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.name,
    }),
    "",
    `Use the upstream workflow entry \`${input.skillName}\` for \`${sourceEntry.canonicalRoute}\` if it is available at \`${input.skillPath}\`.`,
    `If that ${sourceEntry.source} entry is unavailable, stop and report that the required Qwen workflow source is not installed.`,
    "",
  ].join("\n")
}

function renderQwenDirectAgentFile(input: RenderQwenDirectAgentInput) {
  const sourceEntry = getSourceEntry(input.sourceEntry, {
    canonicalRoute: toDirectCanonicalRouteId(input.intent),
    source: "direct",
  })

  return [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    "---",
    "",
    MARKER,
    renderRouteOwnershipMetadata({
      host: "qwen",
      source: sourceEntry.source,
      route: sourceEntry.canonicalRoute,
      projection: "agent",
      renderedName: input.name,
    }),
    "",
    `You are the ${input.name} routing agent for the \`${input.intent}\` intent.`,
    `Handle requests that match this intent: ${input.intentDescription}.`,
    "Follow the requested intent directly without any upstream skill handoff.",
    "",
  ].join("\n")
}

function renderQwenDirectCommandFile(input: { description: string; intent: string; agentName: string; renderedName: string }) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    "---",
    "",
    MARKER,
    `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=2; host=qwen; artifact=command; logical-command=intent; rendered-name=${input.renderedName} -->`,
    "",
    `Use the \`${input.agentName}\` direct-mode agent for this intent.`,
    "",
    "## Router Context",
    `- intent: ${input.intent}`,
    "- arguments: {{args}}",
    "",
  ].join("\n")
}

function renderQwenControlPlaneCommandFile(input: {
  description: string
  logicalCommand: ControlPlaneCommandKey
  renderedName: string
}) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    "---",
    "",
    MARKER,
    `<!-- ${CONTROL_PLANE_MARKER_PREFIX} stage=2; host=qwen; artifact=command; logical-command=${input.logicalCommand}; rendered-name=${input.renderedName} -->`,
    "",
    `Run \`oh-my-superagents ${input.logicalCommand} --host qwen $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

function buildQwenCommandArtifacts(
  settings: QwenControlPlaneSettings,
  supportedCommands: ReadonlySet<ControlPlaneCommandKey> = new Set(CONTROL_PLANE_COMMAND_KEYS),
): GeneratedArtifact[] {
  const ownerPrefix = `${settings.commandPrefix}-`
  const seenFileNames = new Map<string, string>()

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
    if (!supportedCommands.has(commandKey)) {
      return []
    }

    const command = settings.commands[commandKey]
    const renderedNames = [command.name, ...command.aliases]

    return renderedNames.map((renderedName) => {
      const fileName = `${settings.commandPrefix}-${renderedName}.md`
      const existingCommand = seenFileNames.get(fileName)

      if (existingCommand) {
        throw new Error(`Duplicate OMS command file rendering: ${fileName} (${existingCommand}, ${commandKey})`)
      }

      seenFileNames.set(fileName, commandKey)

      return {
        kind: "command" as const,
        directory: ".qwen/commands",
        fileName,
        ownerPrefix,
        content: renderQwenControlPlaneCommandFile({
          description: CONTROL_PLANE_COMMAND_DESCRIPTIONS[commandKey],
          logicalCommand: commandKey,
          renderedName: fileName.replace(/\.md$/, ""),
        }),
      }
    })
  })
}

function appendQwenCommandArtifact(commands: GeneratedArtifact[], command: GeneratedArtifact) {
  const existingCommand = commands.find((item) => item.fileName === command.fileName)

  if (existingCommand) {
    throw new Error(`Duplicate Qwen command file rendering: ${command.fileName}`)
  }

  commands.push(command)
}

export async function buildQwenArtifacts(config: RouterConfig, input: BuildQwenArtifactsOptions) {
  const commands = input.controlPlaneSettings
    ? buildQwenCommandArtifacts(
        input.controlPlaneSettings,
        config.workflow?.kind === "direct"
          ? DIRECT_MODE_SUPPORTED_CONTROL_PLANE_COMMANDS
          : new Set(CONTROL_PLANE_COMMAND_KEYS),
      )
    : []

  if (config.workflow?.kind === "direct") {
    const agents: GeneratedArtifact[] = []

    for (const [intent, intentConfig] of Object.entries(config.workflow.intents)) {
      if (!SAFE_NAME_PATTERN.test(intent)) {
        throw new Error(`Invalid direct intent id: ${intent}`)
      }

      const agentName = `rt-${intent}`
      const commandName = `ai-${intent}`
      const intentDescription = intentConfig.description
        ? `${intentConfig.label}: ${intentConfig.description}`
        : intentConfig.label

      appendQwenCommandArtifact(commands, {
        kind: "command",
        directory: ".qwen/commands",
        fileName: `${commandName}.md`,
        ownerPrefix: "ai-",
        content: renderQwenDirectCommandFile({
          description: `${intentConfig.label} command for Qwen direct mode.`,
          intent,
          agentName,
          renderedName: commandName,
        }),
      })

      if (input.includeAgents === false) {
        continue
      }

      const resolved = resolveRoute(config, intent)

      assertQwenProjectionSupport(config.workflow.kind, resolved.sourceEntry)

      agents.push({
        kind: "agent",
        directory: ".qwen/agents",
        fileName: `${agentName}.md`,
        ownerPrefix: "rt-",
          content: renderQwenDirectAgentFile({
            name: agentName,
            description: `${agentName} routing agent for ${intent}`,
            model: resolved.selection.model,
            intent,
            intentDescription,
            sourceEntry: resolved.sourceEntry,
          }),
        })
    }

    return { agents, commands }
  }

  if (input.includeAgents === false) {
    return { agents: [], commands }
  }

  const upstreamSkills = await discoverQwenUpstreamSkills(input)
  const renderAgentFile = input.renderAgentFile ?? renderQwenAgentFile
  const resolveMappedRoute = input.resolveRoute ?? ((nextConfig, routeKey) => resolvePhase(nextConfig, routeKey))
  const missingSkills = Object.entries(upstreamSkills)
    .filter(([, skillPath]) => !skillPath)
    .map(([skillName]) => skillName)

  const warnings: string[] = []

  if (missingSkills.length > 0) {
    warnings.push(`Missing upstream superpowers skills: ${missingSkills.join(", ")}. Install them to .qwen/skills/ or .agents/skills/.`)
  }

  const agents: GeneratedArtifact[] = []

  for (const phase of BUILT_IN_PHASES) {
    const upstreamSkillName = PHASE_TO_SKILL[phase]

    if (!upstreamSkills[upstreamSkillName]) {
      agents.push({
        kind: "agent",
        directory: ".qwen/agents",
        fileName: `${PHASE_TO_QWEN_AGENT[phase]}.md`,
        ownerPrefix: "oms-",
        content: `---\nname: ${PHASE_TO_QWEN_AGENT[phase]}\ndescription: '[MISSING UPSTREAM] ${upstreamSkillName}'\n---\n\n<!-- oms-route: canonicalRoute=phase.unknown host=qwen -->\n\n# WARNING: Upstream skill not found\n\nThe superpowers "${upstreamSkillName}" skill is not installed.\nInstall it first, then re-run: oh-my-superagents sync --host qwen\n`,
      })
      continue
    }

    const resolved = resolveMappedRoute(config, upstreamSkillName)
    const sourceEntry = getSourceEntry(
      resolved.sourceEntry,
      getWorkflowSourceEntry(toSuperpowersCanonicalRouteId(phase), "superpowers"),
    )

    assertQwenProjectionSupport(config.workflow?.kind, sourceEntry)

    const workflowEntryName = getQwenWorkflowEntryName(sourceEntry)

    agents.push({
      kind: "agent",
      directory: ".qwen/agents",
      fileName: `${PHASE_TO_QWEN_AGENT[phase]}.md`,
      ownerPrefix: "oms-",
      content: renderAgentFile({
        name: PHASE_TO_QWEN_AGENT[phase],
        description: `Qwen wrapper agent for the ${upstreamSkillName} phase`,
        model: resolved.selection.model,
        skillName: workflowEntryName,
        skillPath: upstreamSkills[upstreamSkillName]!,
        sourceEntry,
      }),
    })
  }

  return { agents, commands, warnings }
}
