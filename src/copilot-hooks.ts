export type CopilotHookCommand = {
  type: "command"
  bash?: string
  powershell?: string
  cwd?: string
  env?: Record<string, string>
}

export type CopilotHooksConfig = {
  version: 1
  hooks: {
    sessionStart?: CopilotHookCommand[]
    sessionEnd?: CopilotHookCommand[]
    userPromptSubmitted?: CopilotHookCommand[]
    preToolUse?: CopilotHookCommand[]
    postToolUse?: CopilotHookCommand[]
    errorOccurred?: CopilotHookCommand[]
  }
}

export type BuildCopilotHooksConfigInput = {
  hasToolPolicy?: boolean
  hasCompression?: boolean
  scriptDirectory?: string
}

const DEFAULT_SCRIPT_DIR = "plugins/oh-my-superagents-copilot/scripts"

export function buildCopilotHooksConfig(input: BuildCopilotHooksConfigInput = {}): CopilotHooksConfig {
  const scriptDir = input.scriptDirectory ?? DEFAULT_SCRIPT_DIR

  const hooks: CopilotHooksConfig["hooks"] = {
    sessionStart: [
      {
        type: "command",
        bash: `./${scriptDir}/oms-session-init.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ],
    sessionEnd: [
      {
        type: "command",
        bash: `./${scriptDir}/oms-session-end.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ],
  }

  if (input.hasToolPolicy) {
    hooks.preToolUse = [
      {
        type: "command",
        bash: `./${scriptDir}/oms-tool-guard.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ]
  }

  if (input.hasCompression) {
    hooks.postToolUse = [
      {
        type: "command",
        bash: `./${scriptDir}/oms-compression-check.sh`,
        env: { OMS_HOST: "copilot" },
      },
    ]
  }

  return {
    version: 1,
    hooks,
  }
}

export function renderCopilotHookScript(hookType: "sessionStart" | "sessionEnd" | "preToolUse" | "postToolUse"): string {
  const scripts: Record<string, string> = {
    sessionStart: [
      "#!/bin/bash",
      "# OMS Session Init Hook for Copilot CLI",
      "",
      "set -e",
      "",
      "# Load OMS config and check compatibility",
      'CONFIG_PATH="${OMS_CONFIG_PATH:-oh-my-superagents.config.jsonc}"',
      "",
      "if command -v oh-my-superagents &> /dev/null; then",
      "  oh-my-superagents doctor --host copilot --config \"$CONFIG_PATH\" 2>/dev/null || true",
      "fi",
      "",
      "# Log session start",
      'echo "OMS session initialized for Copilot CLI at $(date)" >> .oms/session.log',
    ].join("\n"),

    sessionEnd: [
      "#!/bin/bash",
      "# OMS Session End Hook for Copilot CLI",
      "",
      "set -e",
      "",
      "# Snapshot control plane state",
      "if command -v oh-my-superagents &> /dev/null; then",
      "  oh-my-superagents status --host copilot --json 2>/dev/null > .oms/session-state.json || true",
      "fi",
      "",
      "# Log session end",
      'echo "OMS session ended for Copilot CLI at $(date)" >> .oms/session.log',
    ].join("\n"),

    preToolUse: [
      "#!/bin/bash",
      "# OMS Tool Guard Hook for Copilot CLI",
      "",
      "# Read tool policy from stdin JSON",
      "# This hook receives tool use context before execution",
      "# Exit 0 to allow, non-zero to block",
      "",
      "exit 0 # Default: allow all tools",
    ].join("\n"),

    postToolUse: [
      "#!/bin/bash",
      "# OMS Compression Check Hook for Copilot CLI",
      "",
      "# Check if context compression should be triggered",
      "# This hook receives tool use result after execution",
      "",
      "exit 0",
    ].join("\n"),
  }

  return scripts[hookType] ?? ""
}

export function renderCopilotHooksJson(config: CopilotHooksConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`
}