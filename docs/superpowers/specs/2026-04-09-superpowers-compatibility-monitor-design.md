# Superpowers Compatibility Monitor Design

## Summary

`oh-my-superagents` depends on upstream `superpowers`, but does not control how users install or update it.
That creates a real compatibility risk: routing logic in `oh-my-superagents` may assume a `superpowers` skill layout or installation path that differs from what the user currently has.

This design adds a thin compatibility monitor that detects the installed upstream `superpowers` version or reference when possible, evaluates it against a local compatibility matrix, and surfaces the result through `sync`, `explain`, `bootstrap`, and startup diagnostics.

The monitor is policy-driven:

- default mode is `warn`
- users may switch to `strict`

It does not install or update `superpowers`.
It only reports whether the currently detected upstream state looks compatible with this version of `oh-my-superagents`.

## Problem

`oh-my-superagents` treats `superpowers` as an upstream dependency.
Users install that upstream separately, and installation varies by host:

- OpenCode uses a plugin spec
- Codex uses cloned repo + symlink-based skill discovery
- Gemini CLI uses native extensions

This means the following failure modes are possible:

- user is on an older upstream tag that lacks expected skill behavior
- user is on a newer upstream tag whose structure changed
- user is on a floating branch or local checkout with unknown compatibility
- `oh-my-superagents` cannot detect the upstream version at all and has to guess

Without explicit compatibility monitoring, users only learn about these problems indirectly when host-specific flows start behaving strangely.

## Goals

- Detect upstream `superpowers` version or reference when possible.
- Evaluate that detection against a local compatibility matrix in this repo.
- Surface one of four states:
  - `compatible`
  - `untested`
  - `incompatible`
  - `not_detected`
- Support policy modes:
  - `warn`
  - `strict`
- Integrate with current user-facing flows:
  - `sync`
  - `explain`
  - `bootstrap`
  - OpenCode startup diagnostics

## Non-Goals

- Installing or updating upstream `superpowers`.
- Replacing upstream installation instructions.
- Querying GitHub or remote registries on every run.
- Guaranteeing compatibility with arbitrary unversioned local clones.
- Blocking all unknown states by default.

## Product Boundary

The compatibility monitor is observational, not managerial.

It exists to answer:

> Given this host, this installation path, and this detected upstream ref, how confident are we that `oh-my-superagents` is compatible with the installed `superpowers`?

It does not answer:

- how to upgrade upstream automatically
- how to rewrite upstream installation state
- how to manage multiple upstream versions across hosts

## Key Decisions

### 1. Local compatibility matrix, not remote live probing

Compatibility is judged against a version matrix stored in this repository.

Why:

- deterministic and testable
- works offline
- distinguishes “known compatible” from merely “latest upstream exists”
- avoids turning normal CLI operations into network-dependent flows

### 2. Host-specific detectors, shared compatibility model

Each supported host gets its own detector because upstream installation shape differs by host.

The compatibility evaluator stays shared.

### 3. `warn` by default, `strict` configurable

Default behavior must not block users unexpectedly.
First release behavior:

- `warn`: always continue, but emit compatibility status
- `strict`: block only on `incompatible`

`untested` and `not_detected` remain non-blocking even in `strict` mode.
This avoids making normal local development unusable just because detection is imperfect.

If internal monitor logic throws unexpectedly, that failure degrades to `not_detected` rather than producing a synthetic `incompatible` result.

### 4. Detection is best-effort

Some upstream installations are inherently hard to fingerprint, especially local clones without tags.

The monitor must treat incomplete evidence as a first-class state, not as an error.

### 5. Compatibility checks happen before side effects

For commands that can write files:

- compute compatibility first
- if policy says block, exit before any writes
- only then continue into sync or bootstrap file generation

## High-Level Architecture

The compatibility monitor has four parts.

### 1. Compatibility Matrix

A local data file defines the compatibility policy for supported hosts.

Each host entry may define:

- `minimumSupportedVersion`
- `testedRanges`
- `knownBadRanges`
- optional notes

The matrix is versioned with this repo.
The first release will store it in:

- `src/superpowers-compatibility.ts`

### 2. Host Detectors

Each detector inspects the host-specific upstream installation shape and returns a normalized detection result.

Normalized fields:

- `host`
- `source`
- `detectedVersion`
- `detectedRef`
- `details`

### 3. Evaluator

The evaluator combines:

- normalized detection result
- host entry from the compatibility matrix
- selected policy mode

It returns a normalized compatibility result with:

- `status`
- `reason`
- `policyMode`
- `shouldBlock`

Evaluator precedence is fixed for the first release:

1. if `detectedVersion` is missing, return `not_detected`
2. if `detectedVersion` is lower than `minimumSupportedVersion`, return `incompatible`
3. if `detectedVersion` matches any `knownBadRanges`, return `incompatible`
4. if `detectedVersion` matches any `testedRanges`, return `compatible`
5. otherwise return `untested`

Version normalization rules for the first release:

- strip a leading `v` from tag names before semver parsing
- preserve prerelease labels for semver comparison
- if multiple semver tags point at `HEAD`, use the highest normalized semver tag
- exact commits, branches, or floating refs without a parseable semver set `detectedRef` only and evaluate to `not_detected`

### 4. Command Integration

`sync`, `explain`, `bootstrap`, and OpenCode startup diagnostics call the monitor.

For CLI flows, the compatibility result is included in command output.
The monitor may read host installation metadata only.
It must never rewrite, upgrade, or relocate upstream `superpowers` installations.

## Host Detection Strategy

### OpenCode

Detect from the plugin config and standard local install paths when possible.

Sources to inspect:

- project-level `opencode.json`
- user-level OpenCode config at `${XDG_CONFIG_HOME:-~/.config}/opencode/opencode.json`
- project-level installed plugin path `.opencode/plugins/superpowers.js`
- user-level installed plugin path `${XDG_CONFIG_HOME:-~/.config}/opencode/plugins/superpowers.js`

Detection rules:

- resolve project scope first from project config, then project installed plugin path
- resolve user scope second from user config, then user installed plugin path
- if both scopes resolve to the same upstream ref or version, prefer the project-scope detection in the normalized result
- if project and user scopes resolve to different upstream refs or versions, return a conservative non-versioned detection that evaluates to `not_detected`
- supported plugin-spec detections for the first release:
  - git URLs with `#tag` or `#ref`
  - plain git URLs without fragment
- local file specs or other non-git plugin forms, which become `detectedRef` only
- installed plugin paths become `detectedRef` only
- if a plugin spec pins a semver-looking tag, normalize it and set `detectedVersion`
- if a plugin spec pins a non-semver ref or a floating branch, set `detectedRef` only
- if no upstream plugin entry or installed plugin path is found in either scope, return `not_detected`

### Codex

Detect from the upstream clone and skill symlink path described by official upstream docs.

Primary targets:

- `~/.codex/superpowers/.git`
- `~/.agents/skills/superpowers`

Detection rules:

- if `~/.agents/skills/superpowers` exists, resolve its symlink target first
- if the symlink target resolves into a git checkout, prefer that checkout over `~/.codex/superpowers`
- otherwise fall back to `~/.codex/superpowers/.git`
- if the resolved upstream repo has a semver tag on `HEAD`, normalize it and set `detectedVersion`
- if the repo exists but only a commit is available, set `detectedRef`
- if both symlink and clone targets are missing or unreadable, return `not_detected`

### Gemini CLI

Gemini detection is explicitly out of scope for the first release.
The monitor should define extensible interfaces so Gemini can be added later, but no Gemini detector is part of this implementation cycle.

## Compatibility Matrix Shape

Chosen file:

- `src/superpowers-compatibility.ts`

Chosen structure:

```ts
export const SUPERPOWERS_COMPATIBILITY = {
  opencode: {
    minimumSupportedVersion: "5.0.0",
    testedRanges: [">=5.0.0 <6.0.0"],
    knownBadRanges: [],
  },
  codex: {
    minimumSupportedVersion: "5.0.0",
    testedRanges: [">=5.0.0 <6.0.0"],
    knownBadRanges: [],
  },
} as const
```

This first release can keep version handling intentionally simple:

- exact semantic version parsing
- semver range checks
- commit refs or floating branches become `not_detected`

## Config Surface

Add to `oh-my-superagents.config.jsonc`:

```jsonc
{
  "superpowersCompatibility": {
    "mode": "warn"
  }
}
```

Allowed values:

- `warn`
- `strict`

Default when omitted:

- `warn`

## Command Behavior

### `explain`

Always return the compatibility result in output.
Never block.

`explain` output shape rules:

- single-phase `explain` keeps the existing object payload and adds a top-level `compatibility` object
- `explain --all` preserves the existing top-level array shape, so each array item carries the same `compatibility` object instead of introducing a wrapper

### `sync`

In `warn` mode:

- run normally
- include compatibility result in output
- emit warning text for `untested`, `incompatible`, or `not_detected`

In `strict` mode:

- block only if status is `incompatible`
- continue for `compatible`, `untested`, and `not_detected`

`sync` must evaluate compatibility before any materialization writes begin.
`sync` output shape remains the existing payload plus a top-level `compatibility` object.

### `bootstrap`

Same policy as `sync`.

`bootstrap` must evaluate compatibility before writing starter config, plugin scaffolds, or generated host artifacts.
`bootstrap` output shape remains the existing payload plus a top-level `compatibility` object.

### OpenCode plugin startup diagnostics

Never block.
Only log:

- missing upstream detection
- incompatible upstream version

Plugin startup never writes files.

## Output Contract

Add a `compatibility` object to relevant CLI JSON outputs.

Example:

```json
{
  "compatibility": {
    "host": "codex",
    "source": "repo-clone",
    "detectedVersion": "5.0.7",
    "detectedRef": null,
    "status": "compatible",
    "reason": "Version is within tested range >=5.0.0 <6.0.0",
    "policyMode": "warn",
    "shouldBlock": false
  }
}
```

## Failure Handling

The compatibility monitor should not crash host workflows if detection logic fails unexpectedly.

Behavior:

- detector exceptions degrade to `not_detected`
- evaluator exceptions degrade to `not_detected`
- OpenCode plugin startup logs the detector issue and continues
- CLI commands treat degraded `not_detected` exactly like any other `not_detected` result for policy purposes

## Testing Strategy

Required coverage:

- version matrix evaluation
- host detector success and failure paths
- `warn` vs `strict`
- `incompatible` blocks `sync/bootstrap` in strict mode
- `untested` and `not_detected` do not block even in strict mode
- CLI JSON output includes compatibility object
- OpenCode startup diagnostics include compatibility warnings without crashing

## MVP Scope

The first release is complete when it can:

- evaluate a local compatibility matrix
- detect Codex upstream version or ref when the official install path exists
- detect OpenCode upstream plugin spec or installed plugin path when available
- surface compatibility in `sync`, `explain`, and `bootstrap`
- support configurable `warn` and `strict` behavior
- leave Gemini detection out of scope for this release

## Acceptance Criteria

- The feature stays host-observational, not host-managerial.
- No upstream install/update logic is added.
- `strict` mode blocks only on explicit incompatibility.
- `warn` mode never blocks command execution.
- The monitor improves reliability for existing OpenCode and Codex support before any new host is added.
