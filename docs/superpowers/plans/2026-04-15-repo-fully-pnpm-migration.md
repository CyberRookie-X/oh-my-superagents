# Repo-Fully-Pnpm Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the OMS repository from an effectively npm-managed maintainer workflow to a fully pnpm-managed maintainer workflow with one lockfile truth, one documented repository workflow, and fresh pnpm-based verification.

**Architecture:** Keep package consumption unchanged, but make repository maintenance truth explicit: `package.json` stays pinned to `pnpm`, `package-lock.json` is removed, `pnpm-lock.yaml` becomes the only committed lockfile, and repository development docs switch to a single pnpm workflow. Add small guard tests so lockfile truth and maintainer docs do not drift back into a mixed npm/pnpm state.

**Tech Stack:** pnpm 10.x, Node.js, TypeScript, Vitest, markdown docs

---

## Scope Decomposition

This plan covers the full single-package npm-to-pnpm repository migration.

It includes:

- lockfile migration from `package-lock.json` to `pnpm-lock.yaml`
- repository-level package-manager guard tests
- maintainer-workflow documentation updates in English and Chinese
- final pnpm-based verification using the committed lockfile

This plan does not include:

- monorepo conversion
- `pnpm-workspace.yaml`
- `.npmrc`
- `.pnpmfile.cjs`
- new CI systems

## File Structure

### Lockfile truth and migration guards

- Create: `test/package-manager-repo.test.ts`
  - verify that the repository is pinned to pnpm and only commits `pnpm-lock.yaml`
- Delete: `package-lock.json`
- Create: `pnpm-lock.yaml`

### Maintainer-workflow documentation

- Create: `test/package-manager-docs.test.ts`
  - verify that maintainer docs consistently describe pnpm as the repository workflow
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README-architecture.md`

### Existing files to verify but not necessarily edit

- Verify: `package.json`
  - keep the existing `packageManager` pin to `pnpm@10.32.1...`

## Execution Notes

- This is a one-shot migration. Do not preserve both lockfiles.
- Do not add pnpm-only config files unless the migration reveals a concrete technical need.
- This migration is about repository maintenance truth. Do not rewrite consumer installation examples such as `npx oh-my-superagents ...` into pnpm-specific consumption instructions.
- Use pnpm for all post-migration verification commands.

### Task 1: Replace the Committed Lockfile Truth

**Files:**
- Create: `test/package-manager-repo.test.ts`
- Delete: `package-lock.json`
- Create: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing repository package-manager guard test**

Create `test/package-manager-repo.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..")
const packageJson = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as { packageManager?: string }

describe("repository package-manager baseline", () => {
  it("pins pnpm in package.json", () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@10\.32\.1\+/)
  })

  it("uses pnpm-lock.yaml as the only committed lockfile", () => {
    expect(existsSync(path.join(repoRoot, "pnpm-lock.yaml"))).toBe(true)
    expect(existsSync(path.join(repoRoot, "package-lock.json"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the focused guard test and verify it fails**

Run: `pnpm test -- --run test/package-manager-repo.test.ts`

Expected: FAIL because `package-lock.json` still exists and `pnpm-lock.yaml` does not exist yet.

- [ ] **Step 3: Generate the pnpm lockfile and remove the npm lockfile**

Run:

```bash
pnpm import
rm package-lock.json
pnpm install
```

Expected result:

- `pnpm-lock.yaml` is created
- `package-lock.json` is removed
- `node_modules` is now managed through pnpm

- [ ] **Step 4: Run the focused guard test and verify it passes**

Run: `pnpm test -- --run test/package-manager-repo.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/package-manager-repo.test.ts pnpm-lock.yaml package.json
git rm package-lock.json
git commit -m "chore: migrate repository lockfile to pnpm"
```

### Task 2: Make Maintainer Docs Unambiguously Pnpm-Based

**Files:**
- Create: `test/package-manager-docs.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README-architecture.md`

- [ ] **Step 1: Write the failing maintainer-docs guard test**

Create `test/package-manager-docs.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..")

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8")
}

describe("repository package-manager docs", () => {
  it("documents pnpm as the maintainer workflow in README.md", () => {
    const readme = read("README.md")

    expect(readme).toContain("OMS is maintained as a pnpm repository.")
    expect(readme).toContain("corepack enable")
    expect(readme).toContain("pnpm install")
    expect(readme).toContain("pnpm test")
    expect(readme).toContain("pnpm check")
    expect(readme).toContain("pnpm build")
    expect(readme).not.toContain(["npm", "install"].join(" "))
    expect(readme).not.toContain(["npm", "test"].join(" "))
    expect(readme).not.toContain(["npm", "run", "check"].join(" "))
    expect(readme).not.toContain(["npm", "run", "build"].join(" "))
  })

  it("documents pnpm as the maintainer workflow in README.zh-CN.md", () => {
    const readme = read("README.zh-CN.md")

    expect(readme).toContain("OMS 仓库当前以 pnpm 作为标准维护工作流。")
    expect(readme).toContain("corepack enable")
    expect(readme).toContain("pnpm install")
    expect(readme).toContain("pnpm test")
    expect(readme).toContain("pnpm check")
    expect(readme).toContain("pnpm build")
    expect(readme).not.toContain(["npm", "install"].join(" "))
    expect(readme).not.toContain(["npm", "test"].join(" "))
    expect(readme).not.toContain(["npm", "run", "check"].join(" "))
    expect(readme).not.toContain(["npm", "run", "build"].join(" "))
  })

  it("captures the repository workflow in the architecture doc", () => {
    const architecture = read("docs/README-architecture.md")

    expect(architecture).toContain("### Repository Workflow")
    expect(architecture).toContain("pnpm install")
    expect(architecture).toContain("pnpm test")
    expect(architecture).toContain("pnpm check")
    expect(architecture).toContain("pnpm build")
  })
})
```

- [ ] **Step 2: Run the focused docs guard test and verify it fails**

Run: `pnpm test -- --run test/package-manager-docs.test.ts`

Expected: FAIL because the repository docs do not yet describe pnpm as the explicit maintainer workflow.

- [ ] **Step 3: Update the maintainer workflow docs**

Add this section to `README.md` in the repository-maintainer guidance area:

````md
## Repository Development

OMS is maintained as a pnpm repository.

If pnpm is not already available locally, enable Corepack first:

```bash
corepack enable
```

Then use the canonical maintainer workflow:

```bash
pnpm install
pnpm test
pnpm check
pnpm build
```

This repository workflow is for maintainers and contributors. Consumers of the published package or CLI do not need to adopt pnpm just to use OMS.
````

Add the corresponding section to `README.zh-CN.md`:

````md
## 仓库开发

OMS 仓库当前以 pnpm 作为标准维护工作流。

如果本机还没有可用的 pnpm，先启用 Corepack：

```bash
corepack enable
```

然后使用统一的维护命令：

```bash
pnpm install
pnpm test
pnpm check
pnpm build
```

这套流程面向仓库维护者和贡献者。发布包或 CLI 的消费者不需要为了使用 OMS 而切到 pnpm。
````

Add this section to `docs/README-architecture.md`:

````md
### Repository Workflow

OMS is maintained as a pnpm repository.

Canonical maintainer commands:

```bash
corepack enable
pnpm install
pnpm test
pnpm check
pnpm build
```

This package-manager choice applies to repository maintenance, not to package consumers.
````

- [ ] **Step 4: Run the focused docs guard test and verify it passes**

Run: `pnpm test -- --run test/package-manager-docs.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/package-manager-docs.test.ts README.md README.zh-CN.md docs/README-architecture.md
git commit -m "docs: document pnpm maintainer workflow"
```

### Task 3: Verify the Repository Under Pnpm End-to-End

**Files:**
- Verify: `package.json`
- Verify: `pnpm-lock.yaml`
- Verify: `README.md`
- Verify: `README.zh-CN.md`
- Verify: `docs/README-architecture.md`

- [ ] **Step 1: Reinstall with the committed pnpm lockfile**

Run: `pnpm install --frozen-lockfile`

Expected: PASS with no lockfile rewrite.

- [ ] **Step 2: Run the full test suite under pnpm**

Run: `pnpm test`

Expected: PASS

- [ ] **Step 3: Run the typecheck under pnpm**

Run: `pnpm check`

Expected: PASS

- [ ] **Step 4: Run the production build under pnpm**

Run: `pnpm build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pnpm-lock.yaml package.json README.md README.zh-CN.md docs/README-architecture.md test/package-manager-repo.test.ts test/package-manager-docs.test.ts
git commit -m "chore: finish repo pnpm migration"
```
