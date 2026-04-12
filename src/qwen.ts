import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import {
  BUILT_IN_PHASES,
  CONTROL_PLANE_COMMAND_KEYS,
  type ControlPlaneCommandKey,
  type ControlPlaneConfig,
  type RouterConfig,
} from "./config.js"
import { CONTROL_PLANE_MARKER_PREFIX, MARKER, type GeneratedArtifact } from "./opencode.js"
import { resolvePhase, resolveRoute, type BuiltInPhase, type ResolvedRoute } from "./router.js"

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
}

type RenderQwenDirectAgentInput = {
  name: string
  description: string
  model: string
  intent: string
  intentDescription: string
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
  return [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    "---",
    "",
    MARKER,
    "",
    `Use the upstream \`${input.skillName}\` superpowers skill if it is available at \`${input.skillPath}\`.`,
    "If that upstream skill is unavailable, stop and report that Qwen-usable superpowers skills are not installed.",
    "",
  ].join("\n")
}

function renderQwenDirectAgentFile(input: RenderQwenDirectAgentInput) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    "---",
    "",
    MARKER,
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

function buildQwenCommandArtifacts(settings: QwenControlPlaneSettings): GeneratedArtifact[] {
  const ownerPrefix = `${settings.commandPrefix}-`
  const seenFileNames = new Map<string, string>()

  return CONTROL_PLANE_COMMAND_KEYS.flatMap((commandKey) => {
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
  const commands = input.controlPlaneSettings ? buildQwenCommandArtifacts(input.controlPlaneSettings) : []

  if (config.workflow?.kind === "direct") {
    const agents: GeneratedArtifact[] = []

    for (const [intent, intentConfig] of Object.entries(config.workflow.intents)) {
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

  if (missingSkills.length > 0) {
    throw new Error(
      `Qwen-usable superpowers skills are not installed. Missing required upstream skills: ${missingSkills.join(", ")}`,
    )
  }

  const agents: GeneratedArtifact[] = []

  for (const phase of BUILT_IN_PHASES) {
    const skillName = PHASE_TO_SKILL[phase]
    const resolved = resolveMappedRoute(config, skillName)

    agents.push({
      kind: "agent",
      directory: ".qwen/agents",
      fileName: `${PHASE_TO_QWEN_AGENT[phase]}.md`,
      ownerPrefix: "oms-",
      content: renderAgentFile({
        name: PHASE_TO_QWEN_AGENT[phase],
        description: `Qwen wrapper agent for the ${skillName} phase`,
        model: resolved.selection.model,
        skillName,
        skillPath: upstreamSkills[skillName]!,
      }),
    })
  }

  return { agents, commands }
}
