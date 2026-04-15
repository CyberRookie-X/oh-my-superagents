# Source and Host Capability Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize OMS support and fail-closed policy so source route support, host projection support, workflow-mode support, and command support all come from one shared capability registry instead of scattered local checks.

**Architecture:** Keep source-native route catalogs in the source adapters, then introduce one shared capability layer that evaluates support decisions against canonical routes, workflow mode, source entries, and host targets. Replace local ad-hoc checks in the CLI and host builders with calls into that registry, while preserving or tightening existing fail-closed behavior.

**Tech Stack:** TypeScript, Vitest, canonical route core from Stage 1, OMS CLI, host builders, config validation

---

## Scope Decomposition

This plan covers Stage 2 of the architecture remediation roadmap only.

It includes:

- a shared capability registry module
- structured support decisions and stable reason codes
- config, CLI, and host adapter refactors to consume the registry
- test coverage proving fail-closed behavior now comes from shared policy

Deferred to the next plan:

- upstream install detection and availability reporting
- generalized compatibility and readiness surfaces in `status`, `doctor`, and `explain`

## File Structure

### Shared capability layer

- Create: `src/capabilities.ts`
  - define reason codes, decision types, and support evaluators

### Core consumers

- Modify: `src/config.ts`
  - delegate source route support checks to the capability registry
- Modify: `src/cli.ts`
  - replace ad-hoc host and command support checks with registry decisions

### Host adapters

- Modify: `src/qwen.ts`
- Modify: `src/claude.ts`
  - stop owning support policy locally and delegate to shared capability decisions

### Exports

- Modify: `src/index.ts`
  - export the registry helpers for tests and future diagnostics

### Tests

- Create: `test/capabilities.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/qwen.test.ts`
- Modify: `test/claude.test.ts`

## Execution Notes

- Do not duplicate source-native route catalogs inside the capability registry.
- Route ownership remains the source adapter's job; support policy is the registry's job.
- Keep reason codes small and stable.
- Replace local support logic rather than wrapping it with another layer.

### Task 1: Create the Shared Capability Registry

**Files:**
- Create: `src/capabilities.ts`
- Create: `test/capabilities.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing capability tests**

Create `test/capabilities.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import {
  getControlPlaneCommandDecision,
  getHostProjectionDecision,
  isSourceRouteSupported,
} from "../src/capabilities.js"

describe("isSourceRouteSupported", () => {
  it("accepts gstack for supported canonical review routes only", () => {
    expect(isSourceRouteSupported("gstack", "phase.review")).toBe(true)
    expect(isSourceRouteSupported("gstack", "phase.visual")).toBe(false)
  })
})

describe("getHostProjectionDecision", () => {
  it("rejects qwen projecting gstack in the current supported slice", () => {
    expect(getHostProjectionDecision({
      host: "qwen",
      workflowKind: "superpowers",
      sourceEntry: { canonicalRoute: "phase.review", source: "gstack", entryName: "review" },
    })).toMatchObject({
      supported: false,
      reasonCode: "unsupported_host_source_projection",
    })
  })

  it("rejects claude direct projection in the current supported slice", () => {
    expect(getHostProjectionDecision({
      host: "claude",
      workflowKind: "direct",
      sourceEntry: { canonicalRoute: "intent.plan", source: "direct" },
    })).toMatchObject({
      supported: false,
      reasonCode: "unsupported_host_direct_projection",
    })
  })
})

describe("getControlPlaneCommandDecision", () => {
  it("rejects qwen explain in the current supported slice", () => {
    expect(getControlPlaneCommandDecision({
      host: "qwen",
      command: "explain",
      workflowKind: "superpowers",
    })).toMatchObject({
      supported: false,
      reasonCode: "unsupported_control_plane_command",
    })
  })
})
```

- [ ] **Step 2: Run the focused capability tests and verify failure**

Run: `npm test -- --run test/capabilities.test.ts`

Expected: FAIL because the shared capability registry does not exist yet.

- [ ] **Step 3: Implement the shared capability layer**

Create `src/capabilities.ts` with a small stable reason-code set and policy evaluators:

```ts
export const CAPABILITY_REASON_CODES = [
  "unsupported_source_route",
  "unsupported_host_source_projection",
  "unsupported_host_direct_projection",
  "unsupported_control_plane_command",
  "unsupported_workflow_mode",
] as const

export type CapabilityReasonCode = (typeof CAPABILITY_REASON_CODES)[number]

export type CapabilityDecision = {
  supported: boolean
  reasonCode?: CapabilityReasonCode
  reason?: string
}

export function isSourceRouteSupported(source: WorkflowSourceKind, canonicalRoute: CanonicalRouteId) {
  return source === "superpowers"
    ? Boolean(getSuperpowersSourceEntry(canonicalRoute))
    : source === "gstack"
      ? Boolean(getGstackSourceEntry(canonicalRoute))
      : canonicalRoute.startsWith("intent.")
}
```

Add host policy helpers such as:

```ts
export function getHostProjectionDecision(input: {
  host: "opencode" | "codex" | "qwen" | "claude"
  workflowKind: "superpowers" | "direct"
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  if (input.host === "qwen" && input.sourceEntry.source === "gstack") {
    return {
      supported: false,
      reasonCode: "unsupported_host_source_projection",
      reason: `Qwen cannot project ${input.sourceEntry.source} for ${input.sourceEntry.canonicalRoute} in the current supported slice.`,
    }
  }

  if (input.host === "claude" && input.workflowKind === "direct") {
    return {
      supported: false,
      reasonCode: "unsupported_host_direct_projection",
      reason: "Claude direct workflow projection is not supported yet.",
    }
  }

  return { supported: true }
}
```

Export the new helpers from `src/index.ts`.

- [ ] **Step 4: Run the focused capability tests and verify they pass**

Run: `npm test -- --run test/capabilities.test.ts`

Expected: PASS for the new registry tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/capabilities.ts src/index.ts test/capabilities.test.ts
git commit -m "feat: add source and host capability registry"
```

### Task 2: Replace Scattered Support Checks in Config and CLI

**Files:**
- Modify: `src/config.ts`
- Modify: `src/cli.ts`
- Modify: `test/config.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing config and CLI tests**

Update `test/config.test.ts` so invalid source-route combinations are asserted through the new policy boundary:

```ts
it("rejects unsupported source-route combinations through the shared capability policy", async () => {
  await expect(
    loadControlPlaneConfig({
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "sourcePresets": {
          "bad": {
            "routes": { "phase.visual": "gstack" }
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": { "build": { "model": "openai/gpt-5" } },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }),
  ).rejects.toThrow(/unsupported canonical route phase\.visual through gstack/i)
})
```

Update `test/cli.test.ts` so command support comes from shared policy:

```ts
it("rejects qwen explain through the shared capability policy", async () => {
  const result = await runCli(["explain", "--host", "qwen"], deps)
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toMatch(/unsupported|qwen|explain/i)
})
```

- [ ] **Step 2: Run the focused config and CLI tests and verify failure**

Run: `npm test -- --run test/config.test.ts test/cli.test.ts`

Expected: FAIL because config and CLI still encode support rules inline instead of through the registry.

- [ ] **Step 3: Delegate config and CLI support decisions to the registry**

In `src/config.ts`, replace source-specific inline checks with the shared source-route helper:

```ts
if (!isSourceRouteSupported(source, routeId as CanonicalRouteId)) {
  throw new Error(`${scope} cannot route unsupported canonical route ${routeId} through ${source} source`)
}
```

In `src/cli.ts`, replace host-specific assertions with capability decisions:

```ts
const decision = getControlPlaneCommandDecision({ host, command, workflowKind: config.workflow.kind })
if (!decision.supported) {
  throw new Error(decision.reason ?? `${command} is not supported for ${host}`)
}
```

Likewise, replace `assertQwenProjectionSupport()` with route-by-route evaluation through `getHostProjectionDecision()` and preserve the existing fail-closed error surface.

- [ ] **Step 4: Run the focused config and CLI tests and verify they pass**

Run: `npm test -- --run test/config.test.ts test/cli.test.ts`

Expected: PASS for the new capability-driven support assertions.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/config.ts src/cli.ts test/config.test.ts test/cli.test.ts
git commit -m "feat: route config and cli support checks through capabilities"
```

### Task 3: Replace Host-Local Support Policy in Qwen and Claude

**Files:**
- Modify: `src/qwen.ts`
- Modify: `src/claude.ts`
- Modify: `test/qwen.test.ts`
- Modify: `test/claude.test.ts`

- [ ] **Step 1: Write the failing host-adapter tests**

Update `test/qwen.test.ts` so the host failure is now capability-driven:

```ts
await expect(buildQwenArtifacts(config, deps)).rejects.toThrow(
  /unsupported_host_source_projection|qwen cannot project gstack/i,
)
```

Update `test/claude.test.ts` so Claude direct-mode rejection stays fail closed through the same shared policy boundary:

```ts
expect(() => buildClaudeArtifacts(directConfig as never)).toThrow(/unsupported_host_direct_projection|not supported/i)
```

- [ ] **Step 2: Run the focused host tests and verify failure**

Run: `npm test -- --run test/qwen.test.ts test/claude.test.ts`

Expected: FAIL because Qwen and Claude still own their unsupported-combination policy locally.

- [ ] **Step 3: Delegate host support policy to the capability registry**

In `src/qwen.ts`, replace the local `if (sourceEntry.source === "gstack")` block with:

```ts
const projectionDecision = getHostProjectionDecision({
  host: "qwen",
  workflowKind: config.workflow.kind,
  sourceEntry,
})

if (!projectionDecision.supported) {
  throw new Error(projectionDecision.reason ?? `Unsupported Qwen projection for ${sourceEntry.canonicalRoute}`)
}
```

In `src/claude.ts`, replace the direct-mode guard with the same shared policy path.

- [ ] **Step 4: Run the focused host tests and verify they pass**

Run: `npm test -- --run test/qwen.test.ts test/claude.test.ts`

Expected: PASS for the capability-driven fail-closed behavior.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/qwen.ts src/claude.ts test/qwen.test.ts test/claude.test.ts
git commit -m "feat: centralize host projection policy in capability registry"
```

### Task 4: Verify the Registry End-to-End and Update Architecture Docs

**Files:**
- Modify: `docs/README-architecture.md`

- [ ] **Step 1: Update the architecture doc to describe the new policy layer**

Add text to `docs/README-architecture.md` describing a dedicated shared capability layer between the route/source core and the host adapters:

```md
### Shared Capability Policy

- source adapters define what upstream entries exist
- the capability registry decides whether OMS supports a source-route, host-source, or command combination
- CLI and host adapters consume structured support decisions instead of carrying local fail-closed policy copies
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test && npm run check && npm run build`

Expected: all tests pass and all existing fail-closed behavior still works through the centralized capability layer.

- [ ] **Step 3: Commit Task 4**

```bash
git add docs/README-architecture.md
git commit -m "docs: describe shared capability policy layer"
```
