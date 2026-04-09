# Codex Bootstrap Layer Design

## Summary

Codex support in `oh-my-superagents` already covers the routing core:

- `oh-my-superagents sync --host codex`
- `oh-my-superagents explain --host codex`
- generated `.codex/agents/*.toml`

What it does not yet cover well is setup convenience. Users still need to discover the right install/update flow and re-run sync manually.

This design adds a thin Codex bootstrap layer that improves install and update ergonomics without moving routing logic out of the existing CLI and generated-agent path.

## Goals

- Add a `bootstrap --host codex` command.
- Scaffold a local Codex plugin bundle and local marketplace entry.
- Optionally create a starter `oh-my-superagents.config.jsonc` when the project does not have one yet.
- Keep `sync` and `explain` as the single routing truth source.
- Keep the bootstrap layer host-native and lightweight.

## Non-Goals

- Replacing `.codex/agents/*.toml` generation with plugin runtime logic.
- Publishing to the official Codex plugin directory.
- Adding app integrations or MCP servers.
- Making `oh-my-superagents` a cross-host sync layer.

## Product Boundary

The Codex bootstrap layer exists to reduce user friction around:

- installation
- local discovery in Codex
- updating generated agents after config changes or package upgrades

It does not own routing decisions.
Routing decisions continue to come from `oh-my-superagents.config.jsonc` and `sync --host codex`.

## Host Facts

Codex plugins are an installable distribution format for:

- skills
- apps
- MCP servers

Codex plugins are surfaced through marketplaces. Local marketplaces can live in:

- `$REPO_ROOT/.agents/plugins/marketplace.json`
- `~/.agents/plugins/marketplace.json`

Codex skills are a good fit for bootstrap helpers because installed skills appear directly in the Codex UI and can provide host-native entrypoints without reimplementing runtime routing.

## Recommended Architecture

Add a new Codex-specific bootstrap module with three responsibilities:

### 1. Scaffold local marketplace metadata

Generate a repo-local marketplace file:

- `.agents/plugins/marketplace.json`

It will expose one local plugin entry pointing at:

- `./plugins/oh-my-superagents-codex`

### 2. Scaffold a local Codex plugin bundle

Generate a plugin folder:

- `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`
- `plugins/oh-my-superagents-codex/skills/oh-my-superagents-sync/SKILL.md`
- `plugins/oh-my-superagents-codex/skills/oh-my-superagents-doctor/SKILL.md`

The plugin bundle is intentionally skill-only. It does not bundle apps or MCP servers.

Skill responsibilities:

- `oh-my-superagents-sync`: tell Codex to run `oh-my-superagents sync --host codex`
- `oh-my-superagents-doctor`: tell Codex to run `oh-my-superagents explain --host codex --all` and inspect the generated Codex agents

These skills are convenience entrypoints. They do not replace the CLI.

### 3. Scaffold starter config when missing

If `oh-my-superagents.config.jsonc` is missing, bootstrap writes a starter config with:

- one deep strategy profile
- one fast build profile
- one explicit `brainstorming` route
- one `defaultRoute`

If the config already exists, bootstrap leaves it untouched.

### 4. Reuse existing Codex sync path

After scaffolding, bootstrap should run the same Codex agent generation path used by `sync --host codex`.

This keeps one source of truth for:

- phase mapping
- model selection
- effort mapping
- generated `.codex/agents/*.toml`

## CLI Contract

Add:

- `oh-my-superagents bootstrap --host codex`

Behavior:

1. Ensure the project has a config file, writing a starter config if needed.
2. Scaffold marketplace and plugin files.
3. Generate `.codex/agents/*.toml`.
4. Return a JSON summary with generated files and next steps.

The JSON result should include at least:

- `configPath`
- `createdConfig`
- `bootstrapFiles`
- `syncResult`
- `nextSteps`

## Next-Step Guidance

Bootstrap output should tell the user to:

1. restart Codex
2. open the plugin directory
3. install the local `oh-my-superagents-codex` plugin from the repo marketplace
4. use the installed Codex skill entrypoints when they want a host-native way to resync or inspect routing

## Safety Rules

- bootstrap writes only inside the current project
- bootstrap never overwrites an existing `oh-my-superagents.config.jsonc`
- bootstrap may overwrite its own generated marketplace and plugin files
- bootstrap should mark generated files clearly

## Why This Design

This preserves the right separation of concerns:

- routing remains in the existing CLI + generated-agent path
- convenience moves into a thin Codex-native bootstrap layer

That directly addresses the user problem of install/update friction without turning the Codex adapter into a second runtime system.
