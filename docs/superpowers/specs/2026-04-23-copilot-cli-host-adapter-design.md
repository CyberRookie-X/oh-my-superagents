# Copilot CLI Host Adapter Design

## Summary

This design adds GitHub Copilot CLI as a first-party host adapter in the repository's generic routing architecture.

Copilot CLI support should:
- consume the same resolved route, source, and profile decisions as other hosts
- project them into Copilot CLI-native artifacts
- preserve OMS as a thin routing and control-plane product

## Problem

The repository supports OpenCode, Codex, Qwen, and Claude Code, but Copilot CLI is missing.

GitHub Copilot CLI (gh copilot) provides:
- AI-powered terminal assistance
- `gh copilot suggest` for shell command suggestions
- `gh copilot explain` for explaining commands
- Agent-like workflows for complex tasks

There is a gap because:
- Copilot CLI is a meaningful host surface for AI-native development workflows
- The project already has enough core abstraction to support another host cleanly
- Adding Copilot CLI extends OMS routing capabilities to another major CLI platform

## Goals

- Add Copilot CLI as a first-party host adapter
- Keep Copilot CLI support inside the same routing-core architecture as other hosts
- Prefer Copilot CLI-native artifact projection that stays thin and explainable
- Define clear control-plane expectations for Copilot CLI
- Support both superpowers workflow mode and direct mode

## Non-Goals

- Recreating a thick orchestration layer inside this repository
- Making hook-driven orchestration the center of Copilot CLI support
- Building a large persona-based Copilot CLI-specific agent catalog
- Implementing gh copilot subscription management

## Product Positioning

Copilot CLI should be a host adapter.

It should sit beside:
- OpenCode
- Codex
- Qwen
- Claude Code

and consume the same resolved routing result.

Copilot CLI should not redefine:
- route semantics
- source semantics
- profile semantics

## Host Primitives Analysis

Copilot CLI provides these primitives:

### gh copilot suggest
- Suggests shell commands based on natural language input
- Supports `--tool` flag for specific tools (bash, git, docker, etc.)
- Output can be executed directly

### gh copilot explain
- Explains what a given command does
- Parses and describes command behavior

### Agent Mode (experimental)
- More complex task execution
- Multi-step workflows

### Configuration
- `~/.github/copilot` for global settings
- Project-scoped configuration support

## Preferred Projection Strategy

The projection should be centered on Copilot CLI native capabilities.

That means Copilot CLI support should favor:
- Project-scoped configuration artifacts
- Thin wrappers around Copilot CLI commands
- Integration with `gh` CLI ecosystem
- Route-aware descriptions

over heavier mechanisms such as:
- Hook-heavy orchestration
- Global config takeover
- Large runtime state machines

## Artifact Generation

### Direct Mode Artifacts

For Copilot CLI direct mode:
- No native artifact format required
- Generate shell scripts/wrappers that invoke `gh copilot` with proper arguments
- Project-specific `.github/copilot` configuration

### Superpowers Workflow Artifacts

Map superpowers phases to Copilot CLI commands:

| Phase | Copilot CLI Command |
| --- | --- |
| brainstorming | `gh copilot suggest` with context |
| writing-plans | `gh copilot suggest` for plan generation |
| subagent-driven-development | Custom wrapper scripts |
| receiving-code-review | `gh copilot explain` integration |
| verification-before-completion | Test execution wrappers |

## Control-Plane Commands

Copilot CLI should support the standard OMS control-plane commands:

- `status` - Report effective state for Copilot CLI
- `sync` - Materialize artifacts for Copilot CLI
- `doctor` - Diagnose missing artifacts or capability issues
- `explain` - Trace route, source, and profile resolution

### Host-Specific Considerations

- Check for `gh` CLI installation
- Verify Copilot CLI extension is installed (`gh copilot --version`)
- Detect Copilot subscription status

## Implementation Slices

### Slice 1: Basic Host Adapter
- Add Copilot CLI to host registry
- Basic `src/copilot.ts` adapter file
- Host detection (check for `gh copilot`)

### Slice 2: Control Plane Integration
- Implement `status` command for Copilot CLI
- Implement `doctor` command
- Add compatibility detection

### Slice 3: Artifact Materialization
- Implement `sync` command
- Generate project-specific wrappers
- Support direct mode intents

### Slice 4: Workflow Integration
- Map superpowers phases to Copilot CLI commands
- Implement `explain` command
- Add route-aware projections

## Explicit Boundaries

The following should remain outside the default Copilot CLI support model:
- Persona-first agent catalogs
- Hook-centric orchestration as primary execution model
- Large-scale config mutation
- Opaque runtime behavior that bypasses OMS explainability

## Diagnostics and Capability Reporting

Copilot CLI support should report:
- Whether `gh` CLI is installed
- Whether Copilot CLI extension is available
- Subscription status
- Which projected artifacts should exist
- Whether they are owned by OMS
- Which source and profile each route resolves to

## Compatibility Matrix

| Feature | Status |
| --- | --- |
| superpowers workflow mode | Supported |
| Direct mode | Supported |
| gstack workflow source | Not supported (same as Qwen) |
| Lane-aware routing | Supported |
| codexFast | Not applicable |

## Recommended Delivery Direction

Implementation should proceed in focused slices:

1. Add Copilot CLI as a thin host adapter with basic detection
2. Integrate control-plane reporting and diagnostics
3. Implement artifact materialization for direct mode
4. Add superpowers workflow mapping
5. Expand host-specific capability handling only where needed

## Recommendation

Add Copilot CLI as a first-party thin host adapter.

Keep OMS aligned with its own architecture:
- Generic routing core
- Explicit source and profile resolution
- Thin host-native projection
- No slide into a thick orchestration product
