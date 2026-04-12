# AI-Assisted Routing Authoring Design

## Summary

This design adds AI-assisted authoring for `lane`, `profile`, `preset`, and optional `intent` configuration.

The goal is not to make the assistant silently rewrite user config.
The goal is to help users bootstrap and evolve routing config faster and more accurately.

The first slice should be CLI-first and generic, so it can serve both:

- `superpowers` workflow mode
- direct mode

Host-local wrappers may be added later, but the authoring engine should begin as a core CLI feature.

## Problem

The routing core is now expressive enough that users can define:

- multiple profiles
- multiple lanes
- multiple presets
- optional direct-mode intents

That flexibility is valuable, but writing good config from scratch is hard.

Users must answer questions such as:

- what lanes should exist for this repo?
- which profiles should back each lane?
- which model inventory fits frontend/backend/review/test work best?
- how should presets and default lanes be arranged?

If that work stays entirely manual, the routing core becomes too hard to adopt.

## Goals

- Help users generate good initial routing config.
- Help users revise config when their repo or model inventory changes.
- Keep users in control of the final config.
- Support both workflow mode and direct mode.
- Avoid hidden writes.
- Produce a previewable config diff before applying changes.

## Non-Goals

- Full autonomous architecture design.
- Silent mutation of the project config.
- Provider auto-detection from secrets or remote accounts.
- Persona/roleplay agent generation.
- Host-specific UX as the primary authoring surface in the first slice.

## Product Definition

The product feature is:

> AI-assisted routing authoring that proposes `profile`, `lane`, `preset`, and optional `intent` configuration from repo signals and user-supplied model inventory, then shows a diff before applying changes.

This should be treated as authoring support, not runtime routing.

## First Surface

### CLI-first authoring

The first slice should introduce a top-level generic command, not a control-plane lifecycle command.

Recommended shape:

- `oh-my-superagents author routing`

Possible follow-up flags:

- `--write`
- `--host <host>`
- `--mode superpowers|direct`
- `--models <path>`

This command should:

1. inspect the current repo
2. load the existing config if present
3. accept or discover a model inventory description
4. produce a proposed config patch
5. print a human-readable summary and diff
6. only write after explicit confirmation or an explicit `--write` flag

## Input Model

The authoring engine should combine four inputs.

### 1. Repo signals

Examples:

- `package.json`
- lockfiles
- framework-specific files
- language/tooling directories
- existing app/backend split

The purpose is not full stack detection certainty.
The purpose is to infer useful candidate lanes.

### 2. Existing routing config

If a config already exists, the authoring engine should treat it as the source of truth to evolve, not overwrite blindly.

### 3. User-supplied model inventory

The assistant should not guess the user’s available providers/models from remote systems.

Instead, the first slice should accept a local model inventory description, such as:

- existing config profiles
- a simple JSON/JSONC file describing known models
- later, a host-local inventory command

### 4. Selected mode

The authoring engine should understand whether it is preparing config for:

- workflow mode (`superpowers`)
- direct mode

## Output Model

The authoring engine should generate proposals for:

- `profiles`
- `lanes`
- `presets`
- optional `workflow.intents` for direct mode

### Good output shape

- stable names
- minimal duplication
- explicit lane/profile links
- no persona prompts

### Example proposal

```jsonc
{
  "profiles": {
    "frontend-build": {
      "model": "openai/gpt-5",
      "effort": "balanced"
    },
    "backend-build": {
      "model": "gpt-5.4",
      "effort": "balanced",
      "codexFast": true
    },
    "review-heavy": {
      "model": "anthropic/claude-sonnet-4-5-20250929",
      "variant": "high"
    }
  },
  "lanes": {
    "frontend": {
      "label": "Frontend",
      "routes": {
        "build": "frontend-build",
        "review": "review-heavy"
      },
      "defaultRoute": "frontend-build"
    },
    "backend": {
      "label": "Backend",
      "routes": {
        "build": "backend-build",
        "review": "review-heavy"
      },
      "defaultRoute": "backend-build"
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "usesLanes": ["frontend", "backend"],
      "defaultLane": "backend",
      "routes": {},
      "defaultRoute": "backend-build"
    }
  }
}
```

## Confirmation Model

The user must explicitly confirm:

- lane names
- profile names
- model ids
- final write

Two acceptable write modes:

### Interactive confirmation

- show proposal summary
- show diff
- ask to apply

### Explicit non-interactive write

- allow `--write`
- still print summary and diff before success output

## Why CLI-First Is Best

CLI-first keeps the first slice:

- host-independent
- scriptable
- easy to test
- reusable by future host-local helper surfaces

Host wrappers can later call the same authoring engine, but the engine should not start host-bound.

## Relationship to Lane Routing

This feature should remain aligned with the lane-routing design:

- `lane` is a tech-stack route bundle
- `profile` is the execution leaf
- `preset` is the mode combiner
- `intent` is optional and mode-dependent

The authoring engine should reinforce those abstractions, not introduce new ones.

## Testing Strategy

The first slice should cover:

- repo signal parsing for common stack layouts
- proposal generation for a small model inventory
- preserving existing config sections when applying diffs
- diff generation correctness
- no-write behavior by default
- explicit write behavior when requested

## Recommendation

Implement AI-assisted routing authoring as a CLI-first generic feature.

The first slice should:

- propose lanes from repo signals
- propose profiles from user-supplied model inventory
- propose presets/default lanes
- show a config diff
- require explicit confirmation before writing

This gives the routing core a practical adoption path without turning the product into an autonomous planner.
