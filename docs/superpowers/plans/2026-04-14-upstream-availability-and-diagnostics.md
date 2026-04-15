# Upstream Availability and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize OMS readiness reporting so support, upstream availability, compatibility, and artifact sync state are reported coherently across `status`, `doctor`, and `explain` instead of being split between compatibility helpers, wrapper text, and host-specific checks.

**Architecture:** Build a shared readiness layer on top of the canonical route core and capability registry. Reuse existing `superpowers` compatibility detectors where they already exist, add the first explicit `gstack` detection path, and have the CLI render route/source/host readiness using one shared model that distinguishes support from availability and compatibility.

**Tech Stack:** TypeScript, Vitest, existing `superpowers` compatibility modules, OMS CLI/control-plane, host/source capability registry

---

## Scope Decomposition

This plan covers Stage 3 of the architecture remediation roadmap only.

It includes:

- a shared upstream readiness model
- generalized availability and compatibility evaluation
- first explicit `gstack` detector coverage
- `status`, `doctor`, and `explain` integration

Deferred from this plan:

- automated installation or self-healing flows
- identical detector depth for every host/source combination on day one

## File Structure

### Shared readiness layer

- Create: `src/upstream-readiness.ts`
  - define support/availability/compatibility/readiness types and evaluators

### Detectors

- Create: `src/gstack-detectors.ts`
  - detect `gstack` presence in known skill roots for supported host combinations
- Modify: `src/superpowers-compatibility.ts`
  - make current compatibility results easier to embed in the broader readiness model
- Modify: `src/superpowers-detectors.ts`
  - export any shared detector input shapes needed by the readiness layer

### CLI and control-plane integration

- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Modify: `src/index.ts`
  - surface readiness data to `status`, `doctor`, and `explain`

### Tests

- Create: `test/upstream-readiness.test.ts`
- Create: `test/gstack-detectors.test.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/control-plane.test.ts`

## Execution Notes

- Always report unsupported before attempting availability checks.
- Unknown state must not be treated as healthy by default.
- Keep existing `superpowers` compatibility behavior intact while lifting it into a broader readiness model.
- `gstack` detector quality may be host-specific, but every supported combination must report whether detection exists or not.

### Task 1: Introduce the Shared Readiness Model

**Files:**
- Create: `src/upstream-readiness.ts`
- Create: `test/upstream-readiness.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing readiness-model tests**

Create `test/upstream-readiness.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { evaluateProjectionReadiness } from "../src/upstream-readiness.js"

describe("evaluateProjectionReadiness", () => {
  it("reports unsupported combinations before availability checks", async () => {
    const readiness = await evaluateProjectionReadiness({
      host: "qwen",
      command: "sync",
      workflowKind: "superpowers",
      sourceEntry: { canonicalRoute: "phase.review", source: "gstack", entryName: "review" },
      detectSuperpowers: async () => { throw new Error("should not run") },
      detectGstack: async () => { throw new Error("should not run") },
    })

    expect(readiness.support).toMatchObject({
      supported: false,
      reasonCode: "unsupported_host_source_projection",
    })
    expect(readiness.availability).toBeUndefined()
  })

  it("reports supported but unavailable gstack readiness distinctly", async () => {
    const readiness = await evaluateProjectionReadiness({
      host: "claude",
      command: "sync",
      workflowKind: "superpowers",
      sourceEntry: { canonicalRoute: "phase.plan", source: "gstack", entryName: "plan-eng-review" },
      detectGstack: async () => ({ status: "not_detected", reason: "gstack skill root was not found" }),
    })

    expect(readiness.support.supported).toBe(true)
    expect(readiness.availability).toMatchObject({ status: "not_detected" })
  })
})
```

- [ ] **Step 2: Run the focused readiness-model tests and verify failure**

Run: `npm test -- --run test/upstream-readiness.test.ts`

Expected: FAIL because the shared readiness layer does not exist yet.

- [ ] **Step 3: Implement the shared readiness layer**

Create `src/upstream-readiness.ts` with a model that separates support from availability and compatibility:

```ts
export type AvailabilityStatus = "available" | "not_detected" | "error" | "not_implemented"

export type AvailabilityResult = {
  status: AvailabilityStatus
  reason: string
}

export type ProjectionReadiness = {
  support: CapabilityDecision
  availability?: AvailabilityResult
  compatibility?: SuperpowersCompatibilityResult | null
}
```

Add an evaluator shaped like:

```ts
export async function evaluateProjectionReadiness(input: {
  host: "opencode" | "codex" | "qwen" | "claude"
  command: "status" | "doctor" | "sync" | "explain"
  workflowKind: "superpowers" | "direct"
  sourceEntry: WorkflowSourceEntry
  detectSuperpowers?: () => Promise<SuperpowersCompatibilityResult | null>
  detectGstack?: () => Promise<AvailabilityResult>
}): Promise<ProjectionReadiness> {
  const support = getHostProjectionDecision({
    host: input.host,
    workflowKind: input.workflowKind,
    sourceEntry: input.sourceEntry,
  })

  if (!support.supported) {
    return { support }
  }

  if (input.sourceEntry.source === "superpowers" && input.detectSuperpowers) {
    return { support, compatibility: await input.detectSuperpowers() }
  }

  if (input.sourceEntry.source === "gstack" && input.detectGstack) {
    return { support, availability: await input.detectGstack() }
  }

  return {
    support,
    availability: { status: "not_implemented", reason: "No availability detector is implemented for this supported combination yet." },
  }
}
```

Export the new helpers from `src/index.ts`.

- [ ] **Step 4: Run the focused readiness-model tests and verify they pass**

Run: `npm test -- --run test/upstream-readiness.test.ts`

Expected: PASS for the new readiness-layer tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/upstream-readiness.ts src/index.ts test/upstream-readiness.test.ts
git commit -m "feat: add shared upstream readiness model"
```

### Task 2: Add the First Explicit Gstack Detector and Lift Superpowers Compatibility

**Files:**
- Create: `src/gstack-detectors.ts`
- Modify: `src/superpowers-compatibility.ts`
- Modify: `src/superpowers-detectors.ts`
- Create: `test/gstack-detectors.test.ts`

- [ ] **Step 1: Write the failing detector tests**

Create `test/gstack-detectors.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { detectClaudeGstack } from "../src/gstack-detectors.js"

describe("detectClaudeGstack", () => {
  it("prefers project-local gstack skills when present", async () => {
    const result = await detectClaudeGstack({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      pathExists: async (filePath) => filePath === "/workspace/project/.claude/skills/gstack",
    })

    expect(result).toMatchObject({
      status: "available",
      reason: expect.stringMatching(/project-local/i),
    })
  })

  it("reports not_detected when no known gstack skill root exists", async () => {
    const result = await detectClaudeGstack({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      pathExists: async () => false,
    })

    expect(result).toMatchObject({ status: "not_detected" })
  })
})
```

- [ ] **Step 2: Run the focused detector tests and verify failure**

Run: `npm test -- --run test/gstack-detectors.test.ts`

Expected: FAIL because the `gstack` detector module does not exist yet.

- [ ] **Step 3: Implement the gstack detector and compatibility lift**

Create `src/gstack-detectors.ts` with a first supported detector for Claude skill roots:

```ts
export async function detectClaudeGstack(input: {
  cwd?: string
  homeDir?: string
  pathExists?: (filePath: string) => Promise<boolean>
}): Promise<AvailabilityResult> {
  const cwd = input.cwd ?? process.cwd()
  const homeDir = input.homeDir ?? homedir()
  const pathExists = input.pathExists ?? defaultPathExists

  const projectPath = path.join(cwd, ".claude", "skills", "gstack")
  const homePath = path.join(homeDir, ".claude", "skills", "gstack")

  if (await pathExists(projectPath)) {
    return { status: "available", reason: `Detected project-local gstack at ${projectPath}` }
  }
  if (await pathExists(homePath)) {
    return { status: "available", reason: `Detected user-level gstack at ${homePath}` }
  }

  return { status: "not_detected", reason: "No known Claude gstack skill root was found." }
}
```

In `src/superpowers-compatibility.ts`, add a tiny adapter helper so the readiness layer can consume compatibility output without duplicating formatting logic:

```ts
export function toAvailabilityResult(result: SuperpowersCompatibilityResult | null) {
  if (!result) {
    return { status: "not_detected" as const, reason: "superpowers was not detected" }
  }

  return {
    status: result.status === "compatible" ? "available" as const : "error" as const,
    reason: result.reason,
  }
}
```

- [ ] **Step 4: Run the focused detector tests and verify they pass**

Run: `npm test -- --run test/gstack-detectors.test.ts`

Expected: PASS for the new gstack detector tests.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/gstack-detectors.ts src/superpowers-compatibility.ts src/superpowers-detectors.ts test/gstack-detectors.test.ts
git commit -m "feat: add first gstack availability detector"
```

### Task 3: Integrate Readiness into Status, Doctor, and Explain

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/control-plane.test.ts`

- [ ] **Step 1: Write the failing CLI and control-plane readiness tests**

Add to `test/control-plane.test.ts`:

```ts
it("attaches readiness context to explain traces", async () => {
  const resolved = await resolveControlPlane({ command: "status", cwd: "/workspace/project" })
  const trace = buildControlPlaneRouteExplainTrace({ cwd: "/workspace/project", resolved, routeId: "writing-plans" })

  expect(trace.sourceEntry?.canonicalRoute).toBe("phase.plan")
  expect(trace.projectionReadiness?.support.supported).toBe(true)
})
```

Add to `test/cli.test.ts`:

```ts
it("reports supported but unavailable gstack readiness in doctor", async () => {
  const result = await runCli(["doctor", "--host", "claude"], deps)
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toMatch(/gstack/i)
  expect(result.stdout).toMatch(/not_detected|unavailable/i)
})
```

- [ ] **Step 2: Run the focused CLI/control-plane tests and verify failure**

Run: `npm test -- --run test/cli.test.ts test/control-plane.test.ts`

Expected: FAIL because readiness is not yet integrated into shared CLI output.

- [ ] **Step 3: Integrate readiness evaluation into the CLI**

In `src/cli.ts`, build readiness summaries from the resolved routes and the new readiness helpers. For example:

```ts
const readiness = await Promise.all(
  phases.map((phase) => evaluateProjectionReadiness({
    host,
    command,
    workflowKind: config.workflow.kind,
    sourceEntry: resolvePhase(routerConfig, phase).sourceEntry,
    detectSuperpowers: () => resolveCompatibilityForCliHost(
      host,
      resolved.config.settings.superpowersCompatibility.mode,
      deps,
    ),
    detectGstack: host === "claude" ? () => detectClaudeGstack({ cwd, homeDir }) : undefined,
  }))
)
```

Render the results into `status`, `doctor`, and `explain` output so that supported-but-missing upstream dependencies show up explicitly instead of only in wrapper instructions. Extend the explain-trace payload to carry the readiness result that the CLI already computed, instead of forcing `explain` to recompute support and availability locally a second time.

- [ ] **Step 4: Run the focused CLI/control-plane tests and verify they pass**

Run: `npm test -- --run test/cli.test.ts test/control-plane.test.ts`

Expected: PASS for the new readiness surfaces.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/cli.ts src/control-plane.ts test/cli.test.ts test/control-plane.test.ts
git commit -m "feat: surface readiness in cli diagnostics"
```

### Task 4: Update Docs and Run the Full Verification Suite

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/README-architecture.md`

- [ ] **Step 1: Update docs to describe the readiness model**

Add documentation explaining that OMS now distinguishes:

```md
- support: whether OMS supports the route/source/host combination
- availability: whether the required upstream workflow dependency is present
- compatibility: whether a detected dependency is within a compatible or tested range
- sync state: whether OMS-managed artifacts are present and current
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test && npm run check && npm run build`

Expected: all tests, checks, and builds pass with readiness reporting wired through the shared diagnostics model.

- [ ] **Step 3: Commit Task 4**

```bash
git add README.md README.zh-CN.md docs/README-architecture.md
git commit -m "docs: describe upstream readiness diagnostics"
```
