import { describe, expect, it } from "vitest"
import { assertSafeArtifactPath, isOmsOwnedSkillFile, materializeArtifacts } from "../src/materialize.js"
import {
  RUNTIME_AGENT_METADATA_DIRECTORY,
  RUNTIME_AGENT_METADATA_FILE,
  RUNTIME_AGENT_METADATA_OWNER_PREFIX,
} from "../src/opencode.js"

const OWNERSHIP_MARKER = "<!-- generated-by: oh-my-superagents; do-not-edit: true -->"

function renderStage1ControlPlaneMetadata(
  host: "opencode" | "codex",
  artifact: "command" | "skill",
  logicalCommand: string,
  renderedName: string,
) {
  return `<!-- oms-control-plane: stage=1; host=${host}; artifact=${artifact}; logical-command=${logicalCommand}; rendered-name=${renderedName} -->`
}

function createNotFoundError(filePath: string) {
  const error = new Error(`ENOENT: ${filePath}`) as Error & { code?: string }
  error.code = "ENOENT"
  return error
}

function createMemoryFs(initialFiles: Record<string, string>) {
  const files = new Map(Object.entries(initialFiles))
  const removedPaths: string[] = []

  return {
    removedPaths,
    fs: {
      mkdir: async () => undefined,
      writeFile: async (filePath: string, content: string) => {
        files.set(filePath, content)
      },
      rename: async (from: string, to: string) => {
        const content = files.get(from)
        if (content === undefined) {
          throw createNotFoundError(from)
        }

        files.set(to, content)
        files.delete(from)
      },
      readdir: async (directory: string) => {
        const prefix = `${directory}/`
        const entries = new Set<string>()

        for (const filePath of files.keys()) {
          if (!filePath.startsWith(prefix)) {
            continue
          }

          const remainder = filePath.slice(prefix.length)
          const entry = remainder.split("/")[0]
          if (entry) {
            entries.add(entry)
          }
        }

        return Array.from(entries)
      },
      readFile: async (filePath: string) => {
        const content = files.get(filePath)
        if (content === undefined) {
          throw createNotFoundError(filePath)
        }
        return content
      },
      stat: async (filePath: string) => {
        if (files.has(filePath)) {
          return { isFile: () => true }
        }

        const hasChildren = Array.from(files.keys()).some((candidate) => candidate.startsWith(`${filePath}/`))
        if (hasChildren) {
          return { isFile: () => false }
        }

        throw createNotFoundError(filePath)
      },
      unlink: async (filePath: string) => {
        if (!files.has(filePath)) {
          throw createNotFoundError(filePath)
        }

        files.delete(filePath)
        removedPaths.push(filePath)
      },
    },
  }
}

function renderOwnedOpenCodeOmsCommand(logicalCommand: string, renderedName: string) {
  return [
    "---",
    "---",
    "",
    OWNERSHIP_MARKER,
    renderStage1ControlPlaneMetadata("opencode", "command", logicalCommand, renderedName),
    "",
    `Run \`oh-my-superagents ${logicalCommand} --host opencode $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

function renderMarkerTaggedOpenCodeCommand() {
  return ["---", "---", "", OWNERSHIP_MARKER, "", "Load and follow the upstream skill `superpowers/brainstorming` exactly.", ""].join("\n")
}

function renderOmsLookingOpenCodeWrapperWithoutOmsName() {
  return [
    "---",
    "---",
    "",
    OWNERSHIP_MARKER,
    "",
    "Run `oh-my-superagents status --host opencode $ARGUMENTS` from the repository root.",
    "",
  ].join("\n")
}

function renderOwnedCodexOmsSkill(skillName: string, logicalCommand: string) {
  return [
    `# ${OWNERSHIP_MARKER.slice(5, -4)}`,
    "---",
    `name: ${skillName}`,
    "description: Generated OMS skill",
    "---",
    "",
    renderStage1ControlPlaneMetadata("codex", "skill", logicalCommand, skillName),
    `Run \`oh-my-superagents ${logicalCommand} --host codex --config 'oh-my-superagents.config.jsonc' $ARGUMENTS\` from the repository root.`,
    `If the binary is not on PATH, run \`npx oh-my-superagents ${logicalCommand} --host codex --config 'oh-my-superagents.config.jsonc' $ARGUMENTS\` instead.`,
    "Forward any command arguments as-is.",
    `Treat this skill as the Codex host entry for the logical \`${logicalCommand}\` command key.`,
    "",
  ].join("\n")
}

function renderOwnedCodexTemporaryDisableHelperSkill(skillName: string) {
  return [
    `# ${OWNERSHIP_MARKER.slice(5, -4)}`,
    "---",
    `name: ${skillName}`,
    "description: Generated OMS helper skill",
    "---",
    "",
    `<!-- oms-auxiliary: stage=1; host=codex; artifact=skill; helper=temporary-disable; rendered-name=${skillName} -->`,
    "Tell the assistant:",
    "- do not use superpowers in this conversation",
    "- do not proactively load superpowers skills, workflows, or phase agents",
    "- only use superpowers again if I explicitly ask",
    "",
    "Extra instruction: $ARGUMENTS",
    "",
  ].join("\n")
}

function renderOwnedCodexDirectSkill(skillName: string, intent: string) {
  return [
    `# ${OWNERSHIP_MARKER.slice(5, -4)}`,
    "---",
    `name: ${skillName}`,
    "description: Generated OMS direct skill",
    "---",
    "",
    `<!-- oms-direct: stage=1; host=codex; artifact=skill; intent=${intent}; rendered-name=${skillName} -->`,
    `Use the Codex direct-mode agent \`rt-${intent}\` for the \`${intent}\` intent.`,
    "",
  ].join("\n")
}

function renderOwnedQwenOmsCommand(renderedName: string, logicalCommand: string) {
  return [
    "---",
    "description: 'Generated OMS Qwen command'",
    "---",
    "",
    OWNERSHIP_MARKER,
    `<!-- oms-control-plane: stage=2; host=qwen; artifact=command; logical-command=${logicalCommand}; rendered-name=${renderedName} -->`,
    "",
    `Run \`oh-my-superagents ${logicalCommand} --host qwen $ARGUMENTS\` from the repository root.`,
    "",
  ].join("\n")
}

function renderOwnedQwenAgent(name: string) {
  return [
    "---",
    `name: ${name}`,
    "description: 'Generated OMS Qwen agent'",
    "---",
    "",
    OWNERSHIP_MARKER,
    "",
  ].join("\n")
}

function renderSourceTaggedOpenCodeWrapper(renderedName: string) {
  return [
    "---",
    "---",
    "",
    OWNERSHIP_MARKER,
    `<!-- oms-route: stage=1; host=opencode; source=gstack; route=phase.brainstorm; projection=command; rendered-name=${renderedName} -->`,
    "",
    "Load and follow the upstream workflow entry `gstack/brainstorming` exactly.",
    "",
  ].join("\n")
}

function renderOwnedQwenDirectCommand(name: string) {
  return [
    "---",
    "description: 'Generated OMS Qwen direct command'",
    "---",
    "",
    OWNERSHIP_MARKER,
    "",
    `Use the \`rt-${name.replace(/^ai-/, "")}\` direct-mode agent for this intent.`,
    "",
  ].join("\n")
}

function renderOwnedClaudeSkill(renderedName: string) {
  return [
    "# generated-by: oh-my-superagents; do-not-edit: true",
    `<!-- oms-route: stage=1; host=claude; source=superpowers; route=phase.plan; projection=skill; rendered-name=${renderedName} -->`,
    "",
    `# Skill: ${renderedName}`,
    "",
  ].join("\n")
}

function renderUserCodexSkill(skillName: string) {
  return ["---", `name: ${skillName}`, "description: User-authored skill", "---", "", "Do something unrelated.", ""].join("\n")
}

function renderOwnedOpenCodeRuntimeMetadata() {
  return JSON.stringify({
    agents: {
      "spr-build": {
        profile: "build",
        profiles: ["build"],
        codexFast: true,
      },
    },
  }, null, 2)
}

describe("materializeArtifacts", () => {
  it("recognizes Claude SKILL.md wrappers through the shared ownership path", () => {
    expect(
      isOmsOwnedSkillFile(
        "/workspace/project/.claude/skills/oms-plan/SKILL.md",
        renderOwnedClaudeSkill("oms-plan"),
      ),
    ).toBe(true)

    expect(
      isOmsOwnedSkillFile(
        "/workspace/project/.claude/skills/oms-plan/SKILL.md",
        "# user-authored skill\n",
      ),
    ).toBe(false)
  })

  it("writes agents and commands into fixed .opencode directories", async () => {
    const writes: string[] = []

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: "spr-build.md",
          ownerPrefix: "spr-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "sp-review.md",
          ownerPrefix: "sp-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async (filePath: string) => {
          writes.push(filePath)
        },
        rename: async () => undefined,
        readdir: async () => [],
        readFile: async () => "",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(writes).toContain("/workspace/project/.opencode/agents/spr-build.md.tmp")
    expect(writes).toContain("/workspace/project/.opencode/commands/sp-review.md.tmp")
  })

  it("fails on collisions with non-router-owned files", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: "spr-build.md",
          ownerPrefix: "spr-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => [],
        readFile: async () => "---\nuser file\n---",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.exitCode).toBe(1)
  })

  it("returns exit code 2 when cleanup warnings occur", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: "spr-build.md",
          ownerPrefix: "spr-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => ["spr-stale.md"],
        readFile: async () => "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => {
          throw new Error("cleanup failed")
        },
      },
    })

    expect(result.exitCode).toBe(2)
  })

  it("does not treat marker text later in the file as router ownership", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: "spr-build.md",
          ownerPrefix: "spr-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => ["spr-user.md"],
        readFile: async (filePath: string) =>
          filePath.endsWith("spr-user.md")
            ? "---\ncustom: true\n---\n\nHello\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->"
            : "",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.removed).toEqual([])
  })

  it("treats existing OpenCode runtime metadata as OMS-owned on repeated sync without a marker", async () => {
    const runtimeArtifact = {
      kind: "command" as const,
      directory: RUNTIME_AGENT_METADATA_DIRECTORY,
      fileName: RUNTIME_AGENT_METADATA_FILE,
      ownerPrefix: RUNTIME_AGENT_METADATA_OWNER_PREFIX,
      content: renderOwnedOpenCodeRuntimeMetadata(),
    }

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [runtimeArtifact],
      fs: createMemoryFs({
        "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json": runtimeArtifact.content,
      }).fs,
    })

    expect(result.exitCode).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it("removes stale OpenCode runtime metadata when the current artifact set no longer includes it", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json": renderOwnedOpenCodeRuntimeMetadata(),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [],
      fs,
    })

    expect(result.removed).toEqual([
      "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json",
    ])
    expect(removedPaths).toEqual(result.removed)
  })

  it("treats a source-tagged OpenCode wrapper as OMS-owned and cleans it up", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/commands/brainstorm.md": renderSourceTaggedOpenCodeWrapper("brainstorm"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "sp-review.md",
          ownerPrefix: "sp-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs,
    })

    expect(result.exitCode).toBe(0)
    expect(result.removed).toEqual([
      "/workspace/project/.opencode/commands/brainstorm.md",
    ])
    expect(removedPaths).toEqual(result.removed)
  })

  it("allows a same-name OpenCode route artifact to be rewritten when the source changes", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          directory: ".opencode/commands",
          fileName: "sp-plan.md",
          ownerPrefix: "sp-",
          content: [
            "---",
            "description: 'Route writing-plans through spr-plan'",
            "agent: 'spr-plan'",
            "subtask: true",
            "---",
            "",
            "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
            "<!-- oms-route: stage=1; host=opencode; source=gstack; route=phase.plan; projection=command; rendered-name=sp-plan -->",
            "",
          ].join("\n"),
        },
      ],
      fs: createMemoryFs({
        "/workspace/project/.opencode/commands/sp-plan.md": [
          "---",
          "description: 'Route writing-plans through spr-plan'",
          "agent: 'spr-plan'",
          "subtask: true",
          "---",
          "",
          "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
          "<!-- oms-route: stage=1; host=opencode; source=superpowers; route=phase.plan; projection=command; rendered-name=sp-plan -->",
          "",
        ].join("\n"),
      }).fs,
    })

    expect(result.exitCode).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it("allows a same-name Claude skill artifact to be rewritten when the source changes", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          directory: ".claude/skills/oms-plan",
          fileName: "SKILL.md",
          ownerPrefix: "oms-",
          content: [
            "# generated-by: oh-my-superagents; do-not-edit: true",
            "<!-- oms-route: stage=1; host=claude; source=gstack; route=phase.plan; projection=skill; rendered-name=oms-plan -->",
            "",
            "# Skill: oms-plan",
            "",
          ].join("\n"),
        },
      ],
      fs: createMemoryFs({
        "/workspace/project/.claude/skills/oms-plan/SKILL.md": renderOwnedClaudeSkill("oms-plan"),
      }).fs,
    })

    expect(result.exitCode).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it("does not consider different routes with same filename as same contract", async () => {
    const planArtifact = {
      directory: ".opencode/commands",
      fileName: "sp-route.md",
      ownerPrefix: "sp-",
      content: [
        "---",
        "description: 'Route phase.plan'",
        "---",
        "",
        "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        "<!-- oms-route: stage=1; host=opencode; source=gstack; route=phase.plan; projection=command; rendered-name=sp-route -->",
        "",
      ].join("\n"),
    }

    const reviewContent = [
      "---",
      "description: 'Route phase.review'",
      "---",
      "",
      "<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
      "<!-- oms-route: stage=1; host=opencode; source=gstack; route=phase.review; projection=command; rendered-name=sp-route -->",
      "",
    ].join("\n")

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [planArtifact],
      fs: createMemoryFs({
        "/workspace/project/.opencode/commands/sp-route.md": reviewContent,
      }).fs,
    })

    expect(result.exitCode).toBe(1)
    expect(result.warnings).toEqual([
      "Collision at /workspace/project/.opencode/commands/sp-route.md",
    ])
  })

  it("treats Claude skill wrappers as OMS-owned and cleans up stale neighbors", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.claude/skills/oms-plan/SKILL.md": renderOwnedClaudeSkill("oms-plan"),
      "/workspace/project/.claude/skills/oms-old/SKILL.md": renderOwnedClaudeSkill("oms-old"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          directory: ".claude/skills/oms-plan",
          fileName: "SKILL.md",
          ownerPrefix: "oms-",
          content: renderOwnedClaudeSkill("oms-plan"),
        },
      ],
      fs,
    })

    expect(result.exitCode).toBe(0)
    expect(result.removed).toEqual([
      "/workspace/project/.claude/skills/oms-old/SKILL.md",
    ])
    expect(removedPaths).toEqual(result.removed)
  })

  it("rejects user-created JSON at the runtime metadata path when it does not match the OMS contract", async () => {
    const runtimeArtifact = {
      kind: "command" as const,
      directory: RUNTIME_AGENT_METADATA_DIRECTORY,
      fileName: RUNTIME_AGENT_METADATA_FILE,
      ownerPrefix: RUNTIME_AGENT_METADATA_OWNER_PREFIX,
      content: renderOwnedOpenCodeRuntimeMetadata(),
    }

    const runtimeFilePath = "/workspace/project/.opencode/oh-my-superagents/runtime-agent-metadata.json"
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [runtimeArtifact],
      fs: createMemoryFs({
        [runtimeFilePath]: JSON.stringify({ hello: "user" }, null, 2),
      }).fs,
    })

    expect(result.exitCode).toBe(1)
    expect(result.warnings).toEqual([`Collision at ${runtimeFilePath}`])
  })

  it("rejects path traversal in artifact filenames", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: "../escape.md",
          ownerPrefix: "spr-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => [],
        readFile: async () => "",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.exitCode).toBe(1)
  })

  it("treats existing Codex generated agents as router-owned", async () => {
    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          directory: ".codex/agents",
          fileName: "oms-review.toml",
          ownerPrefix: "oms-",
          content: "# generated-by: oh-my-superagents; do-not-edit: true\nname = \"oms-review\"\n",
        },
      ],
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readdir: async () => [],
        readFile: async () => "# generated-by: oh-my-superagents; do-not-edit: true\nname = \"oms-review\"\n",
        stat: async () => ({ isFile: () => true }),
        unlink: async () => undefined,
      },
    })

    expect(result.exitCode).toBe(0)
  })

  it("removes stale Codex direct agents when syncing superpowers agents", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.codex/agents/rt-plan.toml": "# generated-by: oh-my-superagents; do-not-edit: true\nname = \"rt-plan\"\n",
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "agent",
          directory: ".codex/agents",
          fileName: "oms-review.toml",
          ownerPrefix: "oms-",
          content: "# generated-by: oh-my-superagents; do-not-edit: true\nname = \"oms-review\"\n",
        },
      ],
      fs,
    })

    expect(result.removed).toEqual(["/workspace/project/.codex/agents/rt-plan.toml"])
    expect(removedPaths).toEqual(result.removed)
  })

  it("removes stale OMS OpenCode command files after prefix and name changes", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/commands/oms-status.md": renderOwnedOpenCodeOmsCommand("status", "oms-status"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "team-state.md",
          ownerPrefix: "team-",
          content: renderOwnedOpenCodeOmsCommand("status", "team-state"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual(["/workspace/project/.opencode/commands/oms-status.md"])
    expect(removedPaths).toEqual(result.removed)
  })

  it("removes stale OpenCode superpowers artifacts when syncing direct-mode artifacts", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/commands/sp-plan.md": "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->\n",
      "/workspace/project/.opencode/agents/spr-plan.md": "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->\n",
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "ai-plan.md",
          ownerPrefix: "ai-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->\n",
        },
        {
          kind: "agent",
          directory: ".opencode/agents",
          fileName: "rt-plan.md",
          ownerPrefix: "rt-",
          content: "---\n---\n\n<!-- generated-by: oh-my-superagents; do-not-edit: true -->\n",
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([
      "/workspace/project/.opencode/commands/sp-plan.md",
      "/workspace/project/.opencode/agents/spr-plan.md",
    ])
    expect(removedPaths).toEqual(result.removed)
  })

  it("removes stale OMS OpenCode command files with old custom prefixes", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/commands/legacy-state.md": renderOwnedOpenCodeOmsCommand("status", "legacy-state"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "team-state.md",
          ownerPrefix: "team-",
          content: renderOwnedOpenCodeOmsCommand("status", "team-state"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual(["/workspace/project/.opencode/commands/legacy-state.md"])
    expect(removedPaths).toEqual(result.removed)
  })

  it("preserves marker-tagged OpenCode command files that are not OMS control-plane wrappers", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/commands/oms-status.md": renderMarkerTaggedOpenCodeCommand(),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "team-state.md",
          ownerPrefix: "team-",
          content: renderOwnedOpenCodeOmsCommand("status", "team-state"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([])
    expect(removedPaths).toEqual([])
  })

  it("removes stale Qwen OMS command files after prefix and rendered-name changes", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.qwen/commands/legacy-state.md": renderOwnedQwenOmsCommand("legacy-state", "status"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".qwen/commands",
          fileName: "team-state.md",
          ownerPrefix: "team-",
          content: renderOwnedQwenOmsCommand("team-state", "status"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual(["/workspace/project/.qwen/commands/legacy-state.md"])
    expect(removedPaths).toEqual(result.removed)
  })

  it("removes stale Qwen direct artifacts when syncing superpowers workflow artifacts", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.qwen/commands/ai-plan.md": renderOwnedQwenDirectCommand("ai-plan"),
      "/workspace/project/.qwen/agents/rt-plan.md": renderOwnedQwenAgent("rt-plan"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".qwen/commands",
          fileName: "oms-status.md",
          ownerPrefix: "oms-",
          content: renderOwnedQwenOmsCommand("oms-status", "status"),
        },
        {
          kind: "agent",
          directory: ".qwen/agents",
          fileName: "oms-review.md",
          ownerPrefix: "oms-",
          content: renderOwnedQwenAgent("oms-review"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([
      "/workspace/project/.qwen/commands/ai-plan.md",
      "/workspace/project/.qwen/agents/rt-plan.md",
    ])
    expect(removedPaths).toEqual(result.removed)
  })

  it("preserves OMS-looking OpenCode wrapper content under a non-OMS filename", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/commands/custom-status.md": renderOmsLookingOpenCodeWrapperWithoutOmsName(),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "team-state.md",
          ownerPrefix: "team-",
          content: renderOwnedOpenCodeOmsCommand("status", "team-state"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([])
    expect(removedPaths).toEqual([])
  })

  it("preserves a custom-named OpenCode command file with copied Stage 1 metadata", async () => {
    const copiedMetadataContent = [
      "---",
      "---",
      "",
      OWNERSHIP_MARKER,
      renderStage1ControlPlaneMetadata("opencode", "command", "status", "team-state"),
      "",
      "Run `oh-my-superagents status --host opencode $ARGUMENTS` from the repository root.",
      "",
    ].join("\n")

    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/.opencode/commands/custom-status.md": copiedMetadataContent,
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: ".opencode/commands",
          fileName: "team-state.md",
          ownerPrefix: "team-",
          content: renderOwnedOpenCodeOmsCommand("status", "team-state"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([])
    expect(removedPaths).toEqual([])
  })

  it("removes stale Codex OMS skill files after prefix and name changes", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/plugins/oh-my-superagents-codex/skills/legacy-state/SKILL.md": renderOwnedCodexOmsSkill(
        "legacy-state",
        "status",
      ),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: "plugins/oh-my-superagents-codex/skills/team-state",
          fileName: "SKILL.md",
          ownerPrefix: "team-",
          content: renderOwnedCodexOmsSkill("team-state", "status"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([
      "/workspace/project/plugins/oh-my-superagents-codex/skills/legacy-state/SKILL.md",
    ])
    expect(removedPaths).toEqual(result.removed)
  })

  it("treats Codex temporary-disable helper skills as a distinct owned contract", async () => {
    const helperDirectory = "plugins/oh-my-superagents-codex/skills/oms-no-superpowers"
    const helperFilePath = "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-no-superpowers/SKILL.md"

    const ownedFs = createMemoryFs({
      [helperFilePath]: renderOwnedCodexTemporaryDisableHelperSkill("oms-no-superpowers"),
    })

    const helperArtifact = {
      kind: "command" as const,
      directory: helperDirectory,
      fileName: "SKILL.md",
      ownerPrefix: "unused-for-stage1-metadata",
      content: renderOwnedCodexTemporaryDisableHelperSkill("oms-no-superpowers"),
    }

    const ownedResult = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [helperArtifact],
      fs: ownedFs.fs,
    })

    expect(ownedResult.exitCode).toBe(0)
    expect(ownedResult.warnings).toEqual([])

    const controlPlaneFs = createMemoryFs({
      [helperFilePath]: renderOwnedCodexOmsSkill("oms-no-superpowers", "disable"),
    })

    const collisionResult = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [helperArtifact],
      fs: controlPlaneFs.fs,
    })

    expect(collisionResult.exitCode).toBe(1)
    expect(collisionResult.warnings).toEqual([`Collision at ${helperFilePath}`])
  })

  it("treats Codex direct-mode skills as a distinct owned contract", async () => {
    const skillDirectory = "plugins/oh-my-superagents-codex/skills/ai-plan"
    const skillFilePath = "/workspace/project/plugins/oh-my-superagents-codex/skills/ai-plan/SKILL.md"

    const ownedFs = createMemoryFs({
      [skillFilePath]: renderOwnedCodexDirectSkill("ai-plan", "plan"),
    })

    const directArtifact = {
      kind: "command" as const,
      directory: skillDirectory,
      fileName: "SKILL.md",
      ownerPrefix: "unused-for-stage1-metadata",
      content: renderOwnedCodexDirectSkill("ai-plan", "plan"),
    }

    const ownedResult = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [directArtifact],
      fs: ownedFs.fs,
    })

    expect(ownedResult.exitCode).toBe(0)
    expect(ownedResult.warnings).toEqual([])

    const controlPlaneFs = createMemoryFs({
      [skillFilePath]: renderOwnedCodexOmsSkill("ai-plan", "status"),
    })

    const collisionResult = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [directArtifact],
      fs: controlPlaneFs.fs,
    })

    expect(collisionResult.exitCode).toBe(1)
    expect(collisionResult.warnings).toEqual([`Collision at ${skillFilePath}`])
  })

  it("removes stale Codex direct-mode skill files after intent changes", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/plugins/oh-my-superagents-codex/skills/ai-plan/SKILL.md": renderOwnedCodexDirectSkill(
        "ai-plan",
        "plan",
      ),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: "plugins/oh-my-superagents-codex/skills/ai-build",
          fileName: "SKILL.md",
          ownerPrefix: "unused-for-stage1-metadata",
          content: renderOwnedCodexDirectSkill("ai-build", "build"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([
      "/workspace/project/plugins/oh-my-superagents-codex/skills/ai-plan/SKILL.md",
    ])
    expect(removedPaths).toEqual(result.removed)
  })

  it("preserves non-OMS Codex skill files that do not satisfy the OMS ownership contract", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md": renderUserCodexSkill(
        "oms-status",
      ),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: "plugins/oh-my-superagents-codex/skills/team-state",
          fileName: "SKILL.md",
          ownerPrefix: "team-",
          content: renderOwnedCodexOmsSkill("team-state", "status"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([])
    expect(removedPaths).toEqual([])
  })

  it("preserves OMS-looking Codex skill content without the ownership marker", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md": [
        "---",
        "name: oms-status",
        "description: Generated OMS skill",
        "---",
        "",
        "Run `oh-my-superagents status --host codex --config 'oh-my-superagents.config.jsonc' $ARGUMENTS` from the repository root.",
        "If the binary is not on PATH, run `npx oh-my-superagents status --host codex --config 'oh-my-superagents.config.jsonc' $ARGUMENTS` instead.",
        "Forward any command arguments as-is.",
        "Treat this skill as the Codex host entry for the logical `status` command key.",
        "",
      ].join("\n"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: "plugins/oh-my-superagents-codex/skills/team-state",
          fileName: "SKILL.md",
          ownerPrefix: "team-",
          content: renderOwnedCodexOmsSkill("team-state", "status"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([])
    expect(removedPaths).toEqual([])
  })

  it("preserves neighboring OMS skills that are not Stage 1 control-plane skills", async () => {
    const { fs, removedPaths } = createMemoryFs({
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md": renderOwnedCodexOmsSkill(
        "oms-status",
        "status",
      ),
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-future/SKILL.md": [
        `# ${OWNERSHIP_MARKER.slice(5, -4)}`,
        "---",
        "name: oms-future",
        "description: Future OMS skill",
        "---",
        "",
        "<!-- oms-future-slice: stage=2; host=codex; artifact=skill; logical-command=next -->",
        "Run `oh-my-superagents next --host codex $ARGUMENTS` from the repository root.",
        "",
      ].join("\n"),
    })

    const result = await materializeArtifacts({
      cwd: "/workspace/project",
      artifacts: [
        {
          kind: "command",
          directory: "plugins/oh-my-superagents-codex/skills/team-state",
          fileName: "SKILL.md",
          ownerPrefix: "team-",
          content: renderOwnedCodexOmsSkill("team-state", "status"),
        },
      ],
      fs,
    })

    expect(result.removed).toEqual([
      "/workspace/project/plugins/oh-my-superagents-codex/skills/oms-status/SKILL.md",
    ])
    expect(removedPaths).toEqual(result.removed)
  })
})

describe("assertSafeArtifactPath", () => {
  it("accepts safe relative path", () => {
    expect(() => assertSafeArtifactPath("/project", ".opencode/agents/file.md")).not.toThrow()
  })

  it("rejects path with .. traversal", () => {
    expect(() => assertSafeArtifactPath("/project", "../etc/passwd")).toThrow()
  })

  it("rejects absolute path", () => {
    expect(() => assertSafeArtifactPath("/project", "/etc/passwd")).toThrow()
  })

  it("rejects path escaping via nested ..", () => {
    expect(() => assertSafeArtifactPath("/project", ".opencode/../../etc/passwd")).toThrow()
  })
})
