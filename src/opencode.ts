import { BUILT_IN_PHASES, type RouterConfig } from "./config.js"
import { PHASE_TO_AGENT, PHASE_TO_COMMAND, resolvePhase, type BuiltInPhase } from "./router.js"

const MARKER = "<!-- generated-by: oh-my-superagents; do-not-edit: true -->"

type PermissionTask = Record<string, "allow" | "deny" | "ask">

export type GeneratedArtifact = {
  kind: "agent" | "command"
  fileName: string
  content: string
}

function yamlScalar(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

export function renderAgentFile(input: {
  agentName: string
  description: string
  model: string
  variant?: string
  temperature?: number
  permissionTask?: PermissionTask
}) {
  const permissionBlock = input.permissionTask
    ? [
        "permission:",
        "  task:",
        ...Object.entries(input.permissionTask).map(([name, value]) => `    \"${name}\": ${value}`),
      ].join("\n") + "\n"
    : ""

  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    "mode: subagent",
    "hidden: true",
    `model: ${yamlScalar(input.model)}`,
    ...(input.variant ? [`variant: ${yamlScalar(input.variant)}`] : []),
    ...(input.temperature !== undefined ? [`temperature: ${input.temperature}`] : []),
    ...(permissionBlock ? [permissionBlock.trimEnd()] : []),
    "---",
    "",
    MARKER,
    "",
    `You are the ${input.agentName} helper agent.`,
    "Load the upstream superpowers skill named in the invoking command and follow it exactly.",
    "Use the forwarded router context arguments as the task context.",
    "",
  ].join("\n")
}

export function renderCommandFile(input: {
  description: string
  agentName: string
  skillName: string
  phase: BuiltInPhase
}) {
  return [
    "---",
    `description: ${yamlScalar(input.description)}`,
    `agent: ${yamlScalar(input.agentName)}`,
    "subtask: true",
    "---",
    "",
    MARKER,
    "",
    `Load and follow the upstream skill \`${input.skillName}\` exactly.`,
    "",
    "## Router Context",
    `- phase: ${input.phase}`,
    "- arguments: $ARGUMENTS",
    "",
  ].join("\n")
}

export function buildArtifacts(config: RouterConfig) {
  const commands: GeneratedArtifact[] = []
  const agents = new Map<string, GeneratedArtifact>()
  const agentSelections = new Map<string, string>()

  for (const phase of BUILT_IN_PHASES) {
    const resolved = resolvePhase(config, phase)
    const agentName = PHASE_TO_AGENT[phase]
    const commandName = PHASE_TO_COMMAND[phase].slice(1)
    const skillName = `superpowers/${phase}`

    if (!agents.has(agentName)) {
      agentSelections.set(
        agentName,
        JSON.stringify({
          model: resolved.selection.model,
          variant: resolved.selection.variant,
          temperature: resolved.selection.temperature,
        }),
      )

      agents.set(agentName, {
        kind: "agent",
        fileName: `${agentName}.md`,
        content: renderAgentFile({
          agentName,
          description: `${agentName} helper for ${phase}`,
          model: resolved.selection.model,
          variant: resolved.selection.variant,
          temperature: resolved.selection.temperature,
          permissionTask:
            agentName === "spr-build"
              ? { "*": "deny", "spr-review": "allow", "spr-verify": "allow" }
              : undefined,
        }),
      })
    } else {
      const nextSelection = JSON.stringify({
        model: resolved.selection.model,
        variant: resolved.selection.variant,
        temperature: resolved.selection.temperature,
      })
      if (agentSelections.get(agentName) !== nextSelection) {
        throw new Error(`Shared agent conflict for ${agentName}`)
      }
    }

    commands.push({
      kind: "command",
      fileName: `${commandName}.md`,
      content: renderCommandFile({
        description: `Route ${phase} through ${agentName}`,
        agentName,
        skillName,
        phase,
      }),
    })
  }

  return {
    agents: Array.from(agents.values()),
    commands,
  }
}

export { MARKER }
