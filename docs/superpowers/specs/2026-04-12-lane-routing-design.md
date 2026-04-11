# Lane Routing Design

## Summary

This design adds a new routing layer to `oh-my-superagents` for task-type and tech-stack specialization without replacing the existing `superpowers` phase model.

The core idea is:

- keep `phase` fixed as the upstream `superpowers` workflow key
- add reusable global `lanes` as tech-stack route bundles
- keep `profiles` as the leaf model/config definitions
- let `presets` compose and constrain which lanes and profiles are active for a given work mode

This feature is not about role-playing agents.
It is about routing different kinds of work to different model configurations while remaining compatible with `superpowers`.

## Problem

Today OMS routes only by built-in phase.

That is often not enough.
In real projects:

- some models are stronger at frontend work
- some are stronger at backend work
- some are stronger at review, docs, data, or infra work

Upstream `superpowers` does not distinguish those domains directly.
If OMS keeps a flat `phase -> profile` model, users either:

- accept one coarse model choice per phase, or
- duplicate many presets and profiles to simulate stack-sensitive routing

That creates friction and weakens the value of OMS as a thin routing layer.

## Goals

- Add a lightweight lane abstraction for tech-stack routing.
- Keep `superpowers` phases fixed and compatible.
- Avoid role-playing agent systems and heavy orchestration frameworks.
- Preserve explicit routing and explainability.
- Support both manual and AI-assisted lane selection.
- Keep room for future lane-aware subagent execution without turning OMS into a workflow engine.

## Non-Goals

- Creating new top-level workflow phases such as `frontend-brainstorming` or `backend-plan`.
- Replacing `superpowers` skills or workflow ownership.
- Adding hard-coded specialist personas like Roo/Kilo/oh-my-opencode agent families.
- Building a full autonomous orchestration framework.
- Making lane-aware multi-subagent execution part of the first runtime core.

## Design Principles

### 1. Phase remains the stable public workflow input

OMS must continue to route from existing built-in `superpowers` phases.
Lane routing happens below that layer.

### 2. Profiles remain the leaf model/config objects

Profiles continue to carry executable model settings such as:

- `model`
- `variant`
- `effort`
- `codexFast`
- `temperature`

Lanes do not directly carry these fields.

### 3. Lanes are tech-stack route bundles

A lane is not a persona and not a workflow.
It is a named mapping from built-in phases to profiles, plus a default route.

Examples:

- `frontend`
- `backend`
- `infra`
- `data`

### 4. Presets remain work-mode combiners

Presets are still the top-level work mode abstraction.
They select and constrain which lanes and profiles belong to that work mode.

Examples:

- `default`
- `review`
- `fast-iteration`

### 5. No role-playing prompts as the core abstraction

OMS should route between model/config bundles, not pre-baked personalities.
If a model is strong for frontend or backend work, that should be expressed through profile/lane routing rather than fictional specialist personas.

## Core Concepts

### Phase

`phase` is the fixed upstream `superpowers` workflow stage.

Examples:

- `brainstorming`
- `writing-plans`
- `subagent-driven-development`
- `requesting-code-review`

Phase remains fixed and schema-validated.

### Profile

`profile` is the leaf execution config.

A profile answers:

> If a phase resolves here, which model/config should the host wrapper use?

Example:

```jsonc
"frontend-build": {
  "model": "openai/gpt-5",
  "effort": "balanced",
  "temperature": 0.2
}
```

### Lane

`lane` is a tech-stack route bundle.

A lane answers:

> For this tech-stack context, which profile should each phase use?

Example:

```jsonc
"frontend": {
  "label": "Frontend",
  "description": "React, Vue, and UI tasks",
  "routes": {
    "brainstorming": "frontend-strategy",
    "writing-plans": "frontend-strategy",
    "frontend-design": "frontend-build",
    "webapp-testing": "frontend-build"
  },
  "defaultRoute": "frontend-build"
}
```

Lane does not carry model parameters.
It only routes to profiles.

### Preset

`preset` is a work-mode combiner.

A preset answers:

> In this overall work mode, which lanes and profiles are available, what is the default lane, and what phase-specific preset overrides exist?

Example:

```jsonc
"review": {
  "label": "Review",
  "short": "rev",
  "usesLanes": ["frontend", "backend"],
  "defaultLane": "backend",
  "routes": {
    "requesting-code-review": "review-heavy",
    "verification-before-completion": "review-heavy"
  },
  "defaultRoute": "backend-build"
}
```

## Proposed Config Shape

The intended layered shape is:

```jsonc
{
  "settings": {
    "enabled": true,
    "activePreset": "default",
    "defaultLane": "backend",
    "laneSelection": {
      "mode": "suggest"
    }
  },

  "profiles": {
    "frontend-strategy": {
      "model": "model-frontend-think",
      "effort": "deep"
    },
    "frontend-build": {
      "model": "model-frontend-build",
      "effort": "balanced"
    },
    "backend-strategy": {
      "model": "model-backend-think",
      "effort": "deep"
    },
    "backend-build": {
      "model": "model-backend-build",
      "effort": "balanced",
      "codexFast": true
    },
    "review-heavy": {
      "model": "model-review",
      "effort": "deep"
    }
  },

  "lanes": {
    "frontend": {
      "label": "Frontend",
      "description": "React, Vue, and UI tasks",
      "routes": {
        "brainstorming": "frontend-strategy",
        "writing-plans": "frontend-strategy",
        "frontend-design": "frontend-build",
        "webapp-testing": "frontend-build"
      },
      "defaultRoute": "frontend-build"
    },
    "backend": {
      "label": "Backend",
      "description": "API, service, and database tasks",
      "routes": {
        "brainstorming": "backend-strategy",
        "writing-plans": "backend-strategy"
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
    },
    "review": {
      "label": "Review",
      "short": "rev",
      "usesLanes": ["frontend", "backend"],
      "defaultLane": "backend",
      "routes": {
        "requesting-code-review": "review-heavy",
        "verification-before-completion": "review-heavy"
      },
      "defaultRoute": "backend-build"
    }
  }
}
```

## Layer Responsibilities

### `settings.defaultLane`

`settings.defaultLane` is the persisted control-plane baseline lane.

It means:

- when a preset is active and no stronger runtime override exists
- this is the default lane OMS should use for routing

It is not the same thing as the runtime-effective lane in all cases.

### `presets.<name>.defaultLane`

This is the preset-local default lane.

It means:

- if a preset is selected
- and `settings.defaultLane` is absent or not allowed by the preset
- then fall back to the preset’s own default lane

### `usesLanes`

`usesLanes` is the preset whitelist of globally defined lanes.

This keeps work modes explicit and avoids every preset seeing every lane by default.

## Resolution Model

The intended runtime concept is:

`phase -> lane -> profile`

with `preset` constraining and selecting the available lane/profile space.

### Effective lane resolution

The effective lane for a given execution should be resolved in this priority order:

1. runtime lane override
2. AI-confirmed or AI-auto effective lane for the current session/execution
3. `settings.defaultLane`
4. `preset.defaultLane`
5. no lane, then preset-only routing fallback

### Effective profile resolution

Once the effective lane is known:

1. If the active preset has a phase-specific override, that override wins.
2. Otherwise, if the effective lane has a phase route, that route is used.
3. Otherwise, if the effective lane has a default route, that route is used.
4. Otherwise, the preset `defaultRoute` is used.

This preserves the current OMS principle that the system always resolves a phase to one final profile.

## Manual, Suggest, and Auto Modes

Lane selection should be explicit and configurable.

### Proposed setting

```jsonc
"laneSelection": {
  "mode": "manual"
}
```

Allowed values:

- `manual`
- `suggest`
- `auto`

### `manual`

- OMS uses only the persisted/default lane path.
- No AI recommendation is applied.

### `suggest`

- OMS may compute a recommended lane for the current task.
- The user must explicitly confirm before it becomes the effective lane.
- This is the recommended default mode.

### `auto`

- OMS may compute and apply a session/execution-scoped effective lane automatically.
- It must not silently persist the change into configuration.

## Why Auto Should Not Persist By Default

Automatic lane choice should be session-scoped, not automatically written into config.

Reasons:

- persistent config is the shared truth source
- silent writes are surprising
- host artifacts are materialized from persisted control-plane state
- future lane-based multi-subagent execution may require multiple simultaneous effective lanes that cannot all be persisted into one field

If the user wants to promote an auto-selected lane into durable config, that should happen through an explicit control-plane action.

## OpenCode Runtime Model

### Current OpenCode behavior

Today OpenCode behavior is artifact-driven.

During `sync`:

1. OMS resolves each built-in phase to a final profile.
2. OpenCode artifacts are generated from those resolved selections.
3. `.opencode/agents/*.md` and `.opencode/commands/*.md` are materialized.

This means model selection is currently baked into generated OpenCode wrapper artifacts.

### How lane routing fits

In the simplest lane-aware OpenCode model:

1. resolve the effective lane
2. resolve each phase through that lane to a final profile
3. generate OpenCode agents/commands from the resulting profile selections
4. sync the artifacts

Then OpenCode naturally uses the lane-aware selection because its wrappers already point at the lane-selected model/config.

### Simple lane switching in OpenCode

The lightweight form is:

- change lane state
- run `sync --host opencode`
- regenerate wrappers for the new lane context

This supports one effective lane at a time for the project/session baseline.

### Future lane-specific subagents

For later-phase lane-aware multi-subagent execution, OpenCode may need lane-specific agent families.

Conceptually, that would look like:

- `spr-build--frontend`
- `spr-build--backend`

instead of one globally fixed `spr-build` selection.

That should be treated as a later execution-layer enhancement, not the first core lane feature.

## AI-Assisted Lane and Profile Authoring

AI should help users create lane/profile structures, but not silently rewrite them.

Good uses:

- propose lanes from detected project stack
- suggest profiles from available provider/model inventory supplied by the user
- suggest which phases should differ between lanes
- generate a preview config diff

The user should explicitly confirm:

- lane names
- profile names
- actual model ids
- final writes to the config file

## Lane-Based Subagent Splitting

The user wants future support for splitting a mixed task into multiple subagents, each with a different lane.

Example:

- frontend subagent -> `lane=frontend`
- backend subagent -> `lane=backend`

This can fit the design, but it should not become a new top-level OMS workflow abstraction.

### Good fit

- execution-layer enhancement under `subagent-driven-development`
- host-local or runner-local lane override passed into each spawned subagent
- still uses the existing `superpowers/subagent-driven-development` phase skill

### Bad fit

- new top-level routed phases such as `frontend-build-phase`
- OMS becoming a general planner that owns decomposition and orchestration globally

## Why This Is Lighter Than oh-my-opencode

This design intentionally avoids:

- fixed persona agents
- role-playing prompts as the main abstraction
- heavyweight orchestration harnesses
- hard-coded category taxonomies that replace `superpowers` phases

Instead, it keeps:

- stable upstream phases
- explicit model/config leaf nodes
- reusable tech-stack route bundles
- work-mode composition

## Architectural Impact

This design would eventually affect:

- `src/config.ts`
  - add global `profiles`, global `lanes`, preset lane selection, and lane selection settings
- `src/control-plane.ts`
  - validate `defaultLane`, lane visibility, and future lane state writes
- `src/router.ts`
  - resolve effective lane and route through lane + preset fallback rules
- `src/cli.ts`
  - expose lane-aware status/explain/doctor outputs and future lane selection commands
- host adapters
  - especially OpenCode, because generated artifacts encode resolved selections

## Testing Strategy

When implemented, tests should cover:

- schema validation for global lanes and lane selection settings
- preset lane whitelisting
- effective lane resolution priority
- lane-aware phase resolution
- explain/status/doctor visibility for default vs effective lane
- OpenCode artifact changes when lane selection changes
- later execution-layer tests for lane-aware multi-subagent fan-out

## Recommendation

Implement this as a staged feature.

### Stage 1

- global `profiles`
- global `lanes`
- preset lane whitelisting and `defaultLane`
- `settings.defaultLane`
- lane selection mode: `manual | suggest | auto`
- `auto` as session-scoped effective-lane override only
- lane-aware explainability

### Stage 2

- lane-aware OpenCode execution ergonomics
- AI-assisted lane/profile config generation
- explicit lane switching UX

### Stage 3

- lane-aware multi-subagent execution under `subagent-driven-development`

This staging preserves OMS as a thin, explicit router while still moving toward finer model/config routing for different kinds of work.
