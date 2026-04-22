import { buildCopilotHooksConfig, renderCopilotHooksJson, renderCopilotHookScript } from "./copilot-hooks.js"

export type BootstrapFile = {
  path: string
  content: string
}

const PLUGIN_ROOT = "plugins/oh-my-superagents-copilot"
const SCRIPT_DIR = `${PLUGIN_ROOT}/scripts`

export function renderCopilotPluginManifest(): string {
  const manifest = {
    name: "oh-my-superagents-copilot",
    version: "0.1.0",
    description: "OMS routing and control plane for GitHub Copilot CLI",
    agents: "agents",
    skills: "skills",
    hooks: "hooks.json",
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function buildCopilotBootstrapFiles(): BootstrapFile[] {
  const files: BootstrapFile[] = []

  files.push({
    path: `${PLUGIN_ROOT}/plugin.json`,
    content: renderCopilotPluginManifest(),
  })

  files.push({
    path: `${PLUGIN_ROOT}/hooks.json`,
    content: renderCopilotHooksJson(buildCopilotHooksConfig()),
  })

  const hookScripts = [
    { name: "oms-session-init.sh", type: "sessionStart" as const },
    { name: "oms-session-end.sh", type: "sessionEnd" as const },
    { name: "oms-tool-guard.sh", type: "preToolUse" as const },
    { name: "oms-compression-check.sh", type: "postToolUse" as const },
  ]

  for (const script of hookScripts) {
    files.push({
      path: `${SCRIPT_DIR}/${script.name}`,
      content: renderCopilotHookScript(script.type),
    })
  }

  return files
}