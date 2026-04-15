# Repo-Fully-Pnpm Migration Design

## Summary

This design migrates the OMS repository from an effectively `npm`-managed development workflow to a fully `pnpm`-managed development workflow.

The goal is not to make `pnpm` merely one supported option.
The goal is to make `pnpm` the repository's single development truth layer for dependency installation, lockfile management, local verification, and contributor documentation.

This is a repository-maintainer migration.
It does not require end users of the published package or CLI to adopt `pnpm` in order to consume OMS.

## Problem

The repository is currently in a mixed package-manager state.

Current signals:

- `package.json` now declares `"packageManager": "pnpm@10.32.1..."`
- `package-lock.json` still exists
- `pnpm-lock.yaml` does not exist
- repository docs and workflows have historically been run through `npm`

That mixed state creates four concrete problems:

1. contributors cannot tell whether the canonical development workflow is `npm` or `pnpm`
2. tooling may treat the repository as `pnpm`-managed while the actual lockfile truth is still `npm`
3. future installs can drift into a dual-lockfile state
4. the repository keeps package-manager ambiguity even though the intended direction is already clear

Because OMS has not formally launched yet, the correct move is to finish this migration cleanly now rather than preserve a long-lived mixed state.

## Goals

- make `pnpm` the repository's single maintainer and contributor package-manager workflow
- replace `package-lock.json` with `pnpm-lock.yaml`
- keep `package.json` explicitly pinned to the supported `pnpm` version through `packageManager`
- update repository docs so local development commands consistently use `pnpm`
- verify that a clean `pnpm` install can pass the full OMS validation surface

## Non-Goals

- forcing consumers of the published package to install `pnpm`
- adding monorepo-only files such as `pnpm-workspace.yaml` when the repository is still a single package
- introducing `.npmrc`, `.pnpmfile.cjs`, patches, or overrides unless migration reveals a concrete need
- adding new CI systems where none exist today
- preserving `npm` as an equal first-class repository workflow after the migration

## Core Decision

OMS adopts the `Repo Fully Pnpm` migration boundary.

That means:

- repository development truth: `pnpm`
- lockfile truth: `pnpm-lock.yaml`
- maintainer and contributor docs: `pnpm`
- `npm` is no longer documented as the standard repository workflow

This does not mean package consumers must use `pnpm`.
It means repository maintainers and contributors do.

## Current State

At the time of this design, the repository is a single-package Node/TypeScript project with:

- `package.json`
- `package-lock.json`
- no `pnpm-lock.yaml`
- no `pnpm-workspace.yaml`
- no `.npmrc`

That shape matters because the correct migration is a single-package `npm -> pnpm` migration, not a monorepo conversion.

## Migration Boundary

### Files that must change

- `package.json`
  - keep `packageManager` pinned to the selected `pnpm` version
- delete `package-lock.json`
- add `pnpm-lock.yaml`
- update repository docs that describe local development and verification commands

### Files that should not be added unless migration proves they are necessary

- `pnpm-workspace.yaml`
- `.npmrc`
- `.pnpmfile.cjs`

The migration should stay minimal and intentional.
It should not accumulate pnpm-specific files without a concrete technical reason.

## Repository Workflow After Migration

### Maintainer and contributor flow

The canonical local workflow becomes:

1. `corepack enable` if `pnpm` is not already available
2. `pnpm install`
3. `pnpm test`
4. `pnpm check`
5. `pnpm build`

The documentation should present that as the standard repository workflow.

### Consumer boundary

The migration does not change how end users consume OMS as a published package or built CLI.

Consumers may still:

- install the package with another package manager when consuming it as a dependency
- run the published CLI without being repository contributors

The migration is about repository maintenance truth, not consumer enforcement.

## Documentation Model

The repository docs should distinguish clearly between:

- repository development workflow
- package consumption workflow

Repository development docs should stop presenting `npm` as the default or equal repository workflow.

Recommended wording:

- OMS is maintained as a `pnpm` repository
- if `pnpm` is not installed yet, enable it through `corepack`
- use `pnpm install`, `pnpm test`, `pnpm check`, and `pnpm build` for local development

## Migration Risks

### Risk 1: phantom dependency exposure

`pnpm` is stricter than `npm` about dependency resolution.
If the repository currently relies on undeclared transitive dependencies that happened to be available under `npm` flattening behavior, `pnpm` may expose those gaps.

This is not a reason to avoid the migration.
It is a reason to treat any such failure as a real dependency-declaration bug that should be fixed.

### Risk 2: lockfile recalculation drift

Switching lockfile format recalculates the dependency graph under pnpm semantics.
Even without changing declared versions, the transitive tree may not match the old `npm`-resolved tree exactly.

That means migration success cannot be defined by “install completed.”
It must be defined by fresh verification on the pnpm-installed repository.

### Risk 3: mixed workflow relapse

If `package-lock.json` is left in the repository, or docs continue to present `npm` as a normal maintainer path, contributors can easily reintroduce package-manager ambiguity.

That is why the migration should be one-shot and explicit, not mixed-mode.

## Migration Strategy

OMS should use a one-shot repository migration.

That means:

1. remove `package-lock.json`
2. generate and commit `pnpm-lock.yaml`
3. verify the repository from a pnpm-managed install
4. update docs so the repository workflow is consistently described as pnpm-managed

The migration should not attempt to preserve both lockfiles or both workflows.

## Verification Strategy

Migration verification must be based on a fresh pnpm-managed install and the full repository validation surface.

Required verification commands:

- `pnpm install`
- `pnpm test`
- `pnpm check`
- `pnpm build`

If pnpm exposes any dependency-resolution or script-execution failures, those must be treated as migration blockers and fixed before the migration is considered complete.

## Success Criteria

The migration is complete only if all of the following are true:

- `package-lock.json` is removed
- `pnpm-lock.yaml` is added and committed
- `package.json` pins the repository to the supported `pnpm` version
- repository development docs consistently describe `pnpm` as the maintainer workflow
- a clean pnpm-managed install passes `pnpm test`, `pnpm check`, and `pnpm build`
- no dual-workflow ambiguity remains in the repository maintenance surface

## Deferred Follow-Up

This migration does not itself require:

- workspace conversion
- pnpm overrides or patches
- new CI systems

Those should only be introduced later if the repository actually grows into a use case that needs them.
