# AGENTS.md Design

## Summary

This design adds a root-level `AGENTS.md` for `oh-my-superagents`.

The file is a short repository-level collaboration entrypoint for agents working in this repo.
It does not replace `README.md`, `docs/README-architecture.md`, or the existing spec and plan docs.
Its job is to surface the hardest repository rules in one place so an agent can start safely without rediscovering them.

## Problem

The repository currently has strong contributor guidance, but that guidance is spread across several files:

- `README.md`
- `docs/README-architecture.md`
- `docs/superpowers/specs/*`
- `docs/superpowers/plans/*`
- `.agents/superpowers/specs/*`

That is enough for a human maintainer who already knows the repo.
It is weaker for an agent entering the repository cold.

The missing piece is a conventional root file that tells an agent:

- which docs to read first
- which repository rules are non-negotiable
- which verification path is allowed
- which architectural boundaries must not be crossed
- where to look for task-specific specs and plans

Without that file, agents are more likely to:

- miss the Docker-only validation rule
- miss the `pnpm` and Corepack workflow
- over-thicken host adapters instead of extending the shared OMS core
- hand-edit generated artifacts instead of changing the source of truth
- change English docs without checking the Chinese mirror

## Goals

- Add a conventional root `AGENTS.md`.
- Make it useful as the first file an agent reads after entering the repo.
- Keep it short enough to scan quickly.
- Mirror the hardest existing repository rules without inventing a new workflow system.
- Point agents to the canonical longer docs when they need more detail.

## Non-Goals

- Replacing `README.md` as the main project guide.
- Rewriting all architecture and support-matrix content into `AGENTS.md`.
- Creating a long contributor handbook.
- Introducing a new spec or plan workflow beyond the one already present in the repo.
- Creating a bilingual `AGENTS` mirror unless a later concrete need appears.

## Options

### Option 1: minimal placeholder

Add a very short `AGENTS.md` with only a few lines and links.

Strengths:

- fastest to add
- very low maintenance cost

Weaknesses:

- too easy to miss hard repository rules
- weak safety value for cold-start agents

### Option 2: repository rule aggregator

Add a short but opinionated `AGENTS.md` that aggregates the highest-value repository rules and links to deeper docs.

Strengths:

- gives agents a safe default starting point
- keeps duplication limited
- matches the repo's current documentation structure

Weaknesses:

- some rules still live in linked docs
- requires discipline to keep the hard rules aligned with README and architecture docs

### Option 3: full contributor manual

Expand `AGENTS.md` into a large standalone handbook.

Strengths:

- many answers in one file

Weaknesses:

- duplicates too much existing documentation
- higher drift risk
- worse scanability for agents

## Recommendation

Adopt Option 2.

The repository needs a real root-level agent entrypoint, but it does not need a second README.
`AGENTS.md` should be a compact rule aggregator with links outward, not a full manual.

## File Location And Audience

- Location: repository root as `AGENTS.md`
- Audience: any agent or automated coding assistant working in this repository
- Language: English only for now, because the main goal is tool discovery through the conventional root filename and agent compatibility is more important here than mirrored prose

The existing bilingual mirror rule still applies to user-facing docs such as `README*` and `docs/README-architecture*`.
This design does not extend that requirement to `AGENTS.md`.

## Proposed Structure

The file should use these sections.

### 1. Purpose

Explain that `AGENTS.md` is the repository-level collaboration entrypoint.
State that it complements, rather than replaces, the main README and architecture docs.

### 2. Start Here

Tell agents to read these files first:

- `README.md`
- `docs/README-architecture.md`

Then direct task-specific work to:

- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
- `.agents/superpowers/specs/` when relevant

### 3. Repository Rules

Include the hardest repository rules in short form.

These should mirror the current wording and meaning from the canonical docs:

- `This repository is maintained with pnpm.`
- enable Corepack for repository work
- use `pnpm install` for repository dependency management
- do not hand-edit generated host artifacts when a config or renderer is the source of truth
- when changing user-facing docs, check whether the paired English and Chinese docs both need updates

### 4. Verification Rules

This section must be explicit and fail-closed.

It should mirror the current repository policy:

- `Host-local validation is disabled for this plugin repository.`
- `Run repository verification from a Debian Docker container only.`

It should list the approved verification entrypoints:

```bash
corepack enable
pnpm install
bash scripts/run-opencode-debian-canary.sh
bash scripts/run-codex-debian-canary.sh
```

### 5. Architecture Guardrails

Carry forward the main repository boundary:

> Keep the shared OMS core thicker than any single host adapter.

State the practical implications:

- prefer shared OMS-core changes over host-specific duplication when both are viable
- keep host adapters focused on rendering and host translation
- do not introduce heavy host-specific orchestration when shared policy belongs in the core
- preserve the canonical-route and host-native direct-mode model already documented by the repo

### 6. Host-Specific Notes

Keep this section short and limited to the highest-value constraints:

- Claude Code currently supports the `superpowers` slice only
- direct workflow projection is intentionally unsupported on Claude in the current slice
- Qwen has an explicitly limited support surface in the current slice
- `explain --intent` is not currently supported on Qwen
- direct intent ids must use lowercase letters, digits, and `-` only
- Codex and Qwen should use host-compatible model ids

This section should point to `README.md` for the full support matrix instead of reproducing the full table.

### 7. Working Style

State the expected repo-local editing behavior:

- prefer minimal, targeted changes
- follow existing patterns before inventing new ones
- if a task already has a spec or plan, follow it
- do not expand scope without a concrete reason

### 8. References

End with links to the canonical longer docs:

- `README.md`
- `docs/README-architecture.md`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`

## Content Rules

The future `AGENTS.md` should follow these authoring rules:

- keep the file short enough to scan quickly
- use hard rules and direct wording instead of narrative prose
- link outward instead of copying large sections from README or architecture docs
- preserve the exact meaning of repository constraints already documented elsewhere
- avoid tool-specific prompt theater or persona text that is not grounded in this repo's real workflow

## Verification

The implementation should verify only that:

- `AGENTS.md` exists at the repository root
- its content matches the agreed structure
- the verification section matches the current Docker-only repository policy
- the file does not contradict `README.md` or `docs/README-architecture.md`

Because repository validation is Docker-only, any test or script-based verification for this change must follow the existing Debian Docker canary policy.

## Open Questions

There are no remaining open design questions for the first version.
If future automation requires host-specific or tool-specific sections, those can be added incrementally without changing the core purpose of the file.
