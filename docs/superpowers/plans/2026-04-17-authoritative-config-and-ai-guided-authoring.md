# Authoritative Config and AI-Guided Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authoritative config model and AI-guided authoring flow so OMS can help users create project policy safely without turning AI suggestions into hidden runtime truth.

**Architecture:** Split durable concerns into user-global inventory, project authority, and non-authoritative evidence. Keep runtime resolution dependent only on confirmed authority plus stable catalogs. Build proposal-based authoring helpers and CLI commands that render diffs before writing.

**Tech Stack:** TypeScript, Zod, JSONC parsing, existing `src/config.ts`, `src/cli.ts`, authoring helpers, Vitest

---

## Scope Decomposition

This plan covers:

- user-global inventory shape
- project authority shape
- non-authoritative evidence shape
- AI-guided proposal helpers
- CLI authoring workflow for init and project setup

It does not cover:

- last-known-good startup fallback
- heavy hot reload

## File Structure

- Create: `src/authority-config.ts`
  - define authority, inventory, and evidence document contracts
- Create: `src/author-policy.ts`
  - proposal rendering and authority application helpers
- Modify: `src/config.ts`
  - load and merge user-global inventory with project authority boundaries
- Modify: `src/cli.ts`
  - add proposal-driven authoring commands
- Modify: `src/control-plane.ts`
  - read policy from authority plus inventory only
- Modify: `schemas/oh-my-superagents.schema.json`
- Create: `test/authority-config.test.ts`
- Create: `test/author-policy.test.ts`
- Modify: `test/config.test.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/control-plane.test.ts`

## Execution Notes

- Runtime decisions must not depend on unconfirmed AI output.
- Evidence files may be used by authoring and diagnostics, but deleting them must not change resolved runtime policy.
- Proposal rendering should always produce a human-reviewable diff or full document preview before writing.

### Task 1: Model Authority, Inventory, and Evidence Separately

**Files:**
- Create: `src/authority-config.ts`
- Create: `test/authority-config.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing authority-model tests**

Create `test/authority-config.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { parseOmsAuthorityDocument, parseOmsInventoryDocument } from "../src/authority-config.js"

describe("parseOmsInventoryDocument", () => {
  it("accepts user-global models and tool inventory", () => {
    expect(parseOmsInventoryDocument({
      models: {
        "backend-text": { model: "openai/gpt-5", capabilities: ["text", "code"] },
      },
      tools: {
        playwright: { kind: "mcp", tags: ["browser", "visual"] },
      },
    })).toMatchObject({
      models: { "backend-text": { model: "openai/gpt-5" } },
    })
  })
})

describe("parseOmsAuthorityDocument", () => {
  it("accepts confirmed workload mappings and policy rules", () => {
    expect(parseOmsAuthorityDocument({
      workloadMappings: [{ path: ["frontend/**"], workloadTags: ["frontend", "visual"] }],
      policyRules: [],
    })).toMatchObject({
      workloadMappings: [{ workloadTags: ["frontend", "visual"] }],
    })
  })
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm test -- --run test/authority-config.test.ts`

Expected: FAIL because `src/authority-config.ts` does not exist yet.

- [ ] **Step 3: Implement the document boundaries**

Create `src/authority-config.ts` with:

```ts
import { z } from "zod"

export const OmsInventorySchema = z.object({
  models: z.record(z.string(), z.object({
    model: z.string().min(1),
    capabilities: z.array(z.string()).default([]),
    maxContextWindow: z.number().int().positive().optional(),
  })).default({}),
  tools: z.record(z.string(), z.object({
    kind: z.enum(["skill", "plugin", "mcp", "provider"]),
    tags: z.array(z.string()).default([]),
  })).default({}),
}).strict()

export const OmsAuthoritySchema = z.object({
  workloadMappings: z.array(z.object({
    path: z.array(z.string()).min(1),
    workloadTags: z.array(z.string()).min(1),
  })).default([]),
  policyRules: z.array(z.object({
    id: z.string().min(1).optional(),
    selector: z.record(z.string(), z.unknown()),
    policy: z.record(z.string(), z.unknown()),
  })).default([]),
}).strict()

export const OmsEvidenceSchema = z.object({
  detectedPaths: z.array(z.object({ path: z.string(), suggestedTags: z.array(z.string()) })).default([]),
  notes: z.array(z.string()).default([]),
}).strict()

export function parseOmsInventoryDocument(input: unknown) {
  return OmsInventorySchema.parse(input)
}

export function parseOmsAuthorityDocument(input: unknown) {
  return OmsAuthoritySchema.parse(input)
}
```

Export the new module from `src/index.ts`.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm test -- --run test/authority-config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/authority-config.ts src/index.ts test/authority-config.test.ts
git commit -m "feat: add authority and inventory document model"
```

### Task 2: Build Proposal-Based Authoring Helpers

**Files:**
- Create: `src/author-policy.ts`
- Create: `test/author-policy.test.ts`
- Modify: `src/config.ts`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Write the failing authoring helper test**

Create `test/author-policy.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { buildPolicyAuthoringProposal } from "../src/author-policy.js"

describe("buildPolicyAuthoringProposal", () => {
  it("turns detected evidence and answers into a reviewable authority proposal", () => {
    const proposal = buildPolicyAuthoringProposal({
      detectedPaths: [
        { path: "frontend/**", suggestedTags: ["frontend", "visual"] },
      ],
      answers: {
        verifyNeedsVision: true,
        subagentsUsePackets: true,
      },
    })

    expect(proposal.authority.workloadMappings[0]).toEqual({
      path: ["frontend/**"],
      workloadTags: ["frontend", "visual"],
    })
    expect(proposal.notes.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test -- --run test/author-policy.test.ts`

Expected: FAIL because `src/author-policy.ts` does not exist yet.

- [ ] **Step 3: Implement proposal helpers and config loading boundaries**

Create `src/author-policy.ts` with:

```ts
import type { z } from "zod"
import { OmsAuthoritySchema } from "./authority-config.js"

type PolicyAuthoringInput = {
  detectedPaths: Array<{ path: string; suggestedTags: string[] }>
  answers: {
    verifyNeedsVision: boolean
    subagentsUsePackets: boolean
  }
}

export function buildPolicyAuthoringProposal(input: PolicyAuthoringInput) {
  const authority: z.infer<typeof OmsAuthoritySchema> = {
    workloadMappings: input.detectedPaths.map((entry) => ({
      path: [entry.path],
      workloadTags: entry.suggestedTags,
    })),
    policyRules: input.answers.subagentsUsePackets
      ? [{
          id: "subagent-packet-default",
          selector: { agentRole: ["subagent"] },
          policy: { contextPolicy: { packetFirst: true } },
        }]
      : [],
  }

  if (input.answers.verifyNeedsVision) {
    authority.policyRules.push({
      id: "verify-vision",
      selector: { lifecycleStage: ["verify"], modalityRequirements: ["vision-input"] },
      policy: { modelPolicy: { requiredCapabilities: ["vision-input"] } },
    })
  }

  return {
    authority,
    notes: [
      "Review workload tag mappings before writing authority config.",
      "Review verify-stage capability requirements before writing authority config.",
    ],
  }
}
```

Update `src/config.ts` so runtime config loading never merges evidence into active policy.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm test -- --run test/author-policy.test.ts test/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/author-policy.ts src/config.ts test/author-policy.test.ts test/config.test.ts
git commit -m "feat: add proposal-based policy authoring"
```

### Task 3: Add CLI Proposal, Preview, and Confirmed Write Flow

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/control-plane.ts`
- Modify: `test/cli.test.ts`
- Modify: `test/control-plane.test.ts`

- [ ] **Step 1: Write the failing CLI authoring test**

Add this test to `test/cli.test.ts`:

```ts
it("renders an authority proposal preview before write", async () => {
  const result = await runCli(["config", "author", "--preview"], deps)
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("Proposed authority config")
  expect(result.stdout).toContain("workloadMappings")
})
```

- [ ] **Step 2: Run the focused CLI test and verify failure**

Run: `pnpm test -- --run test/cli.test.ts`

Expected: FAIL because the `config author` flow does not exist yet.

- [ ] **Step 3: Implement proposal preview and confirmed write**

Add a CLI branch in `src/cli.ts` with behavior like:

```ts
case "config": {
  if (positionals[0] === "author") {
    const proposal = buildPolicyAuthoringProposal(authoringInput)
    if (flags.get("--preview") === true) {
      return okResult(`Proposed authority config\n\n${JSON.stringify(proposal.authority, null, 2)}`)
    }
    if (flags.get("--write") === true) {
      await writePreparedConfig(preparedAuthority, deps)
      return okResult(`Wrote authority config to ${preparedAuthority.path}`)
    }
  }
}
```

Update `src/control-plane.ts` so explain output can distinguish between authority-driven policy and discarded evidence.

- [ ] **Step 4: Run the focused CLI and control-plane tests**

Run: `pnpm test -- --run test/cli.test.ts test/control-plane.test.ts`

Expected: PASS with preview-first behavior.

- [x] **Step 5: Commit Task 3**

```bash
git add src/cli.ts src/control-plane.ts test/cli.test.ts test/control-plane.test.ts
git commit -m "feat: add authority config authoring flow"
```

---

## Implementation Status: ✅ Complete

All tasks in this plan have been implemented and verified.

### Code Coverage

| Plan Task | Implementation Files | Test Files |
|-----------|---------------------|------------|
| Task 1: Authority/Inventory/Evidence models | `src/authority-config.ts` | `test/authority-config.test.ts` |
| Task 2: Proposal-based authoring helpers | `src/author-policy.ts`, `src/config.ts` | `test/author-policy.test.ts`, `test/config.test.ts` |
| Task 3: CLI proposal/preview/write flow | `src/cli.ts`, `src/control-plane.ts` | `test/cli.test.ts`, `test/control-plane.test.ts` |

### Key Implementation Details

- **Authority/Inventory/Evidence separation**: `src/authority-config.ts:33-68` defines `OmsInventorySchema`, `OmsAuthoritySchema`, and `OmsEvidenceSchema` with strict parsing
- **Runtime policy ignores evidence**: `src/config.ts:833-875` merges authority from layers only; evidence is never merged into active policy
- **Proposal generation**: `src/author-policy.ts:15-58` turns detected paths and answers into reviewable authority proposals
- **CLI authoring flow**: `src/cli.ts:935-994` builds preview/write flow with `config author --preview` and `config author --write`
- **Atomic writes with recovery**: `src/cli.ts:993` uses `writeAuthorityWithRecoverySnapshotAtomically` for safe writes
- **Explainability**: `src/control-plane.ts:1600-1665` builds policy diagnostics showing authority vs evidence counts

### Verification

- All focused tests pass: `test/authority-config.test.ts`, `test/author-policy.test.ts`, `test/config.test.ts`, `test/cli.test.ts`, `test/control-plane.test.ts`
- Full test suite: 770/771 tests pass (1 unrelated failure in `test/package-manager-repo.test.ts`)
- `pnpm check` and `pnpm build` both pass
