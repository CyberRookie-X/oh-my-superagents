# Selector and Policy Family Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selector-first policy model so OMS can express scope-aware model, context, and tool decisions without repeating the same conditions in multiple config families.

**Architecture:** Introduce a shared runtime context snapshot, a selector matcher, and stable policy-family types. Thread the resolved selector matches into control-plane explainability before changing any host projection behavior so the foundation can be verified independently.

**Tech Stack:** TypeScript, Zod, Node, existing `src/config.ts`, `src/control-plane.ts`, JSON schema generation, Vitest

---

## Scope Decomposition

This plan covers only the selector and policy-family foundation.

It includes:

- runtime context snapshot contracts
- selector matching
- policy-family config types
- explainability for selector matches

It does not include:

- AI onboarding flow
- last-known-good fallback
- OpenSpec artifact integration

## File Structure

- Create: `src/policy-selectors.ts`
  - define runtime context snapshot and selector matching
- Create: `src/policy-families.ts`
  - define policy family types and merge helpers
- Create: `src/policy-resolution.ts`
  - evaluate selector matches and build resolved policy output
- Modify: `src/config.ts`
  - add selector and policy-family schema
- Modify: `src/control-plane.ts`
  - build runtime context snapshot and include selector diagnostics
- Modify: `src/cli.ts`
  - surface selector matches in `status` and `explain`
- Modify: `src/index.ts`
  - export new policy modules
- Modify: `schemas/oh-my-superagents.schema.json`
- Create: `test/policy-selectors.test.ts`
- Create: `test/policy-families.test.ts`
- Create: `test/policy-resolution.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

## Execution Notes

- Keep selectors declarative. Do not add arbitrary expression evaluation.
- Prefer allowlisted selector dimensions such as `path`, `lifecycleStage`, `workflowSource`, `agentRole`, `workloadTags`, and `modalityRequirements`.
- Keep policy resolution deterministic and explainable. Matching rules should be visible in diagnostics.

### Task 1: Add Runtime Context Snapshot and Selector Matching

**Files:**
- Create: `src/policy-selectors.ts`
- Create: `test/policy-selectors.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing selector tests**

Create `test/policy-selectors.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { buildRuntimeContextSnapshot, matchesPolicySelector } from "../src/policy-selectors.js"

describe("buildRuntimeContextSnapshot", () => {
  it("normalizes runtime facts into a stable snapshot", () => {
    expect(buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend", "web-test"],
      modalityRequirements: ["vision-input"],
    })).toMatchObject({
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend", "web-test"],
    })
  })
})

describe("matchesPolicySelector", () => {
  it("matches path, stage, role, and workload tags together", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend", "visual"],
      modalityRequirements: ["vision-input"],
    })

    expect(matchesPolicySelector(snapshot, {
      path: ["frontend/**"],
      lifecycleStage: ["verify"],
      agentRole: ["subagent"],
      workloadTags: ["frontend"],
      modalityRequirements: ["vision-input"],
    })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the focused selector test and verify failure**

Run: `pnpm test -- --run test/policy-selectors.test.ts`

Expected: FAIL because `src/policy-selectors.ts` does not exist yet.

- [ ] **Step 3: Implement the selector contracts**

Create `src/policy-selectors.ts` with:

```ts
import { minimatch } from "minimatch"

export type RuntimeContextSnapshot = {
  cwd: string
  relativePath: string
  lifecycleStage: string
  workflowSource: "superpowers" | "gstack" | "direct"
  agentRole: "primary" | "subagent"
  workloadTags: string[]
  modalityRequirements: string[]
}

export type PolicySelector = {
  path?: string[]
  lifecycleStage?: string[]
  workflowSource?: Array<RuntimeContextSnapshot["workflowSource"]>
  agentRole?: Array<RuntimeContextSnapshot["agentRole"]>
  workloadTags?: string[]
  modalityRequirements?: string[]
}

export function buildRuntimeContextSnapshot(input: RuntimeContextSnapshot): RuntimeContextSnapshot {
  return {
    ...input,
    workloadTags: [...new Set(input.workloadTags)].sort(),
    modalityRequirements: [...new Set(input.modalityRequirements)].sort(),
  }
}

export function matchesPolicySelector(snapshot: RuntimeContextSnapshot, selector: PolicySelector): boolean {
  if (selector.path && !selector.path.some((pattern) => minimatch(snapshot.relativePath, pattern))) {
    return false
  }
  if (selector.lifecycleStage && !selector.lifecycleStage.includes(snapshot.lifecycleStage)) {
    return false
  }
  if (selector.workflowSource && !selector.workflowSource.includes(snapshot.workflowSource)) {
    return false
  }
  if (selector.agentRole && !selector.agentRole.includes(snapshot.agentRole)) {
    return false
  }
  if (selector.workloadTags && !selector.workloadTags.every((tag) => snapshot.workloadTags.includes(tag))) {
    return false
  }
  if (selector.modalityRequirements && !selector.modalityRequirements.every((tag) => snapshot.modalityRequirements.includes(tag))) {
    return false
  }
  return true
}
```

Export the module from `src/index.ts`:

```ts
export * from "./policy-selectors.js"
```

- [ ] **Step 4: Run the selector test and verify it passes**

Run: `pnpm test -- --run test/policy-selectors.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/policy-selectors.ts src/index.ts test/policy-selectors.test.ts
git commit -m "feat: add selector matching foundation"
```

### Task 2: Add Policy Family Types and Config Schema

**Files:**
- Create: `src/policy-families.ts`
- Create: `test/policy-families.test.ts`
- Modify: `src/config.ts`
- Modify: `schemas/oh-my-superagents.schema.json`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Write the failing policy-family tests**

Create `test/policy-families.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { mergePolicyFamilies } from "../src/policy-families.js"

describe("mergePolicyFamilies", () => {
  it("merges sparse model, context, and tool policies without overwriting unrelated families", () => {
    expect(mergePolicyFamilies(
      {
        modelPolicy: { preferredProfiles: ["backend-text"] },
        contextPolicy: { compressionPreset: "default" },
      },
      {
        toolPolicy: { allowedMcpTags: ["browser"] },
      },
    )).toEqual({
      modelPolicy: { preferredProfiles: ["backend-text"] },
      contextPolicy: { compressionPreset: "default" },
      toolPolicy: { allowedMcpTags: ["browser"] },
    })
  })
})
```

Add this config test to `test/config.test.ts`:

```ts
it("accepts selector-based policy rules", async () => {
  const loaded = await loadControlPlaneConfig({
    cwd: "/repo",
    explicitPath: "/repo/oh-my-superagents.config.jsonc",
    exists: async () => true,
    readFile: async () => JSON.stringify({
      settings: { activePreset: "default" },
      presets: { default: { label: "Default", short: "def", routes: {}, defaultRoute: "build" } },
      profiles: { build: { model: "openai/gpt-5" } },
      policyRules: [{
        selector: { path: ["frontend/**"], lifecycleStage: ["verify"] },
        policy: { modelPolicy: { preferredProfiles: ["frontend-vision"] } },
      }],
    }),
  })

  expect(loaded.config.policyRules?.[0]?.policy.modelPolicy?.preferredProfiles).toEqual(["frontend-vision"])
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm test -- --run test/policy-families.test.ts test/config.test.ts`

Expected: FAIL because policy-family helpers and schema fields do not exist yet.

- [ ] **Step 3: Implement policy-family helpers and config schema**

Create `src/policy-families.ts` with:

```ts
export type ModelPolicy = {
  preferredProfiles?: string[]
  effort?: "fast" | "balanced" | "deep" | "max"
  preferWindowClass?: "small" | "medium" | "large"
  requiredCapabilities?: string[]
}

export type ContextPolicy = {
  compressionPreset?: string
  packetFirst?: boolean
  maxCharsBeforeCompression?: number
}

export type ToolPolicy = {
  allowedSkillTags?: string[]
  allowedMcpTags?: string[]
  blockedToolTags?: string[]
}

export type PolicyFamilies = {
  modelPolicy?: ModelPolicy
  contextPolicy?: ContextPolicy
  toolPolicy?: ToolPolicy
}

export function mergePolicyFamilies(base: PolicyFamilies, override: PolicyFamilies): PolicyFamilies {
  return {
    modelPolicy: { ...base.modelPolicy, ...override.modelPolicy },
    contextPolicy: { ...base.contextPolicy, ...override.contextPolicy },
    toolPolicy: { ...base.toolPolicy, ...override.toolPolicy },
  }
}
```

Add this schema shape to `src/config.ts`:

```ts
const PolicyRuleSchema = z.object({
  selector: z.object({
    path: z.array(z.string()).optional(),
    lifecycleStage: z.array(z.string()).optional(),
    workflowSource: z.array(z.enum(["superpowers", "gstack", "direct"])) .optional(),
    agentRole: z.array(z.enum(["primary", "subagent"])) .optional(),
    workloadTags: z.array(z.string()).optional(),
    modalityRequirements: z.array(z.string()).optional(),
  }).strict(),
  policy: z.object({
    modelPolicy: z.object({
      preferredProfiles: z.array(z.string()).optional(),
      effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
      preferWindowClass: z.enum(["small", "medium", "large"]).optional(),
      requiredCapabilities: z.array(z.string()).optional(),
    }).optional(),
    contextPolicy: z.object({
      compressionPreset: z.string().optional(),
      packetFirst: z.boolean().optional(),
      maxCharsBeforeCompression: z.number().int().positive().optional(),
    }).optional(),
    toolPolicy: z.object({
      allowedSkillTags: z.array(z.string()).optional(),
      allowedMcpTags: z.array(z.string()).optional(),
      blockedToolTags: z.array(z.string()).optional(),
    }).optional(),
  }).strict(),
}).strict()
```

Thread `policyRules` through the layered config input and generated JSON schema.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm test -- --run test/policy-families.test.ts test/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/policy-families.ts src/config.ts schemas/oh-my-superagents.schema.json test/policy-families.test.ts test/config.test.ts
git commit -m "feat: add selector policy family schema"
```

### Task 3: Resolve and Explain Selector-Based Policy Output

**Files:**
- Create: `src/policy-resolution.ts`
- Create: `test/policy-resolution.test.ts`
- Modify: `src/control-plane.ts`
- Modify: `src/cli.ts`
- Modify: `test/control-plane.test.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing resolution test**

Create `test/policy-resolution.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { buildRuntimeContextSnapshot } from "../src/policy-selectors.js"
import { resolvePolicyFamilies } from "../src/policy-resolution.js"

describe("resolvePolicyFamilies", () => {
  it("applies matching rules in declaration order and records matched rule ids", () => {
    const snapshot = buildRuntimeContextSnapshot({
      cwd: "/repo",
      relativePath: "frontend/app/page.tsx",
      lifecycleStage: "verify",
      workflowSource: "superpowers",
      agentRole: "subagent",
      workloadTags: ["frontend"],
      modalityRequirements: ["vision-input"],
    })

    const resolved = resolvePolicyFamilies(snapshot, [
      {
        id: "frontend-verify",
        selector: { path: ["frontend/**"], lifecycleStage: ["verify"] },
        policy: { modelPolicy: { preferredProfiles: ["vision-review"] } },
      },
    ])

    expect(resolved.matchedRuleIds).toEqual(["frontend-verify"])
    expect(resolved.policy.modelPolicy?.preferredProfiles).toEqual(["vision-review"])
  })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test -- --run test/policy-resolution.test.ts`

Expected: FAIL because `src/policy-resolution.ts` does not exist yet.

- [ ] **Step 3: Implement selector-aware policy resolution and diagnostics**

Create `src/policy-resolution.ts` with:

```ts
import type { PolicyFamilies } from "./policy-families.js"
import { mergePolicyFamilies } from "./policy-families.js"
import { matchesPolicySelector, type PolicySelector, type RuntimeContextSnapshot } from "./policy-selectors.js"

export type PolicyRule = {
  id: string
  selector: PolicySelector
  policy: PolicyFamilies
}

export function resolvePolicyFamilies(snapshot: RuntimeContextSnapshot, rules: PolicyRule[]) {
  let policy: PolicyFamilies = {}
  const matchedRuleIds: string[] = []

  for (const rule of rules) {
    if (!matchesPolicySelector(snapshot, rule.selector)) {
      continue
    }

    policy = mergePolicyFamilies(policy, rule.policy)
    matchedRuleIds.push(rule.id)
  }

  return { policy, matchedRuleIds }
}
```

Thread the result through `src/control-plane.ts` so resolved control-plane output includes something like:

```ts
policyResolution: {
  snapshot,
  matchedRuleIds,
  policy,
}
```

Update `src/cli.ts` so `status` and `explain` render matched selector rule ids.

- [ ] **Step 4: Run the focused tests and a narrow integration check**

Run: `pnpm test -- --run test/policy-resolution.test.ts test/control-plane.test.ts test/cli.test.ts`

Expected: PASS with selector rule ids visible in diagnostics.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/policy-resolution.ts src/control-plane.ts src/cli.ts test/policy-resolution.test.ts test/control-plane.test.ts test/cli.test.ts
git commit -m "feat: resolve selector-based policy rules"
```
