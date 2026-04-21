# AI-Readable Doc Stack and Onboarding Catalogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the machine-readable and AI-readable documentation stack OMS needs so AI-assisted onboarding can recommend selectors, policies, and capability usage without becoming a hidden runtime decision-maker.

**Architecture:** Keep one authoritative contract source and derive as much reference material as possible from it. Add explicit capability catalogs, onboarding question graphs, playbooks, and generated AI digest pages so authoring assistants can reason from stable artifacts instead of guessing from prose.

**Tech Stack:** TypeScript, JSON Schema, Markdown generation, Node filesystem APIs, Vitest, existing docs layout under `docs/superpowers`

---

## Scope Decomposition

This plan covers:

- capability catalogs
- onboarding question graph
- generated AI-readable references
- playbook-style human docs that are constrained by machine-readable truth

It does not cover:

- runtime policy evaluation
- startup fallback loading

## File Structure

- Create: `schemas/oms-capability-catalog.schema.json`
- Create: `schemas/oms-onboarding-question-graph.schema.json`
- Create: `src/docs-catalog.ts`
  - load and validate catalog documents
- Create: `scripts/generate-ai-docs.ts`
  - generate AI digest markdown from schemas and catalogs
- Create: `docs/ai/oms-capability-catalog.md`
- Create: `docs/ai/oms-onboarding-playbooks.md`
- Create: `docs/ai/llms.txt`
- Create: `docs/ai/llms-full.txt`
- Create: `catalogs/oms-capabilities.json`
- Create: `catalogs/oms-onboarding-question-graph.json`
- Create: `test/docs-catalog.test.ts`
- Modify: `package.json`

## Execution Notes

- Generated docs must not become a second truth source.
- Handwritten playbooks should explain recommendations, not redefine schema.
- Keep catalog vocabularies small and stable.

### Task 1: Add Machine-Readable Capability Catalogs

**Files:**
- Create: `schemas/oms-capability-catalog.schema.json`
- Create: `catalogs/oms-capabilities.json`
- Create: `src/docs-catalog.ts`
- Create: `test/docs-catalog.test.ts`

- [ ] **Step 1: Write the failing catalog loader test**

Create `test/docs-catalog.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import { parseCapabilityCatalog } from "../src/docs-catalog.js"

describe("parseCapabilityCatalog", () => {
  it("parses model and tool capability metadata", () => {
    const parsed = parseCapabilityCatalog({
      models: {
        "vision-review": {
          tags: ["vision-input", "review"],
          supports: ["vision-input", "text"],
        },
      },
      tools: {
        playwright: {
          tags: ["browser", "visual"],
          kind: "mcp",
        },
      },
    })

    expect(parsed.models["vision-review"].supports).toContain("vision-input")
  })
})
```

- [ ] **Step 2: Run the focused catalog test and verify failure**

Run: `pnpm test -- --run test/docs-catalog.test.ts`

Expected: FAIL because `src/docs-catalog.ts` does not exist yet.

- [ ] **Step 3: Implement the catalog loader and seed catalog**

Create `src/docs-catalog.ts` with:

```ts
import { z } from "zod"

export const CapabilityCatalogSchema = z.object({
  models: z.record(z.string(), z.object({
    tags: z.array(z.string()).default([]),
    supports: z.array(z.string()).default([]),
  })).default({}),
  tools: z.record(z.string(), z.object({
    kind: z.enum(["skill", "plugin", "mcp", "provider"]),
    tags: z.array(z.string()).default([]),
  })).default({}),
}).strict()

export function parseCapabilityCatalog(input: unknown) {
  return CapabilityCatalogSchema.parse(input)
}
```

Seed `catalogs/oms-capabilities.json` with entries like:

```json
{
  "models": {
    "backend-text": {
      "tags": ["backend", "reasoning-heavy"],
      "supports": ["text", "code"]
    },
    "vision-review": {
      "tags": ["frontend", "review"],
      "supports": ["text", "vision-input"]
    }
  },
  "tools": {
    "playwright": {
      "kind": "mcp",
      "tags": ["browser", "visual"]
    }
  }
}
```

- [ ] **Step 4: Run the focused catalog test and verify it passes**

Run: `pnpm test -- --run test/docs-catalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add schemas/oms-capability-catalog.schema.json catalogs/oms-capabilities.json src/docs-catalog.ts test/docs-catalog.test.ts
git commit -m "feat: add ai-readable capability catalog"
```

### Task 2: Add Onboarding Question Graph and Playbook Inputs

**Files:**
- Create: `schemas/oms-onboarding-question-graph.schema.json`
- Create: `catalogs/oms-onboarding-question-graph.json`
- Modify: `src/docs-catalog.ts`
- Modify: `test/docs-catalog.test.ts`

- [ ] **Step 1: Write the failing question-graph test**

Add this test to `test/docs-catalog.test.ts`:

```ts
it("parses onboarding question graph nodes with config patch targets", () => {
  const parsed = parseOnboardingQuestionGraph({
    version: 1,
    questions: [{
      id: "frontend-vision",
      prompt: "Do verify flows need screenshots or visual review?",
      writes: [{ path: "policyRules[0].policy.modelPolicy.requiredCapabilities", value: ["vision-input"] }],
    }],
  })

  expect(parsed.questions[0].id).toBe("frontend-vision")
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test -- --run test/docs-catalog.test.ts`

Expected: FAIL because question-graph parsing does not exist yet.

- [ ] **Step 3: Implement question-graph parsing and seed content**

Extend `src/docs-catalog.ts` with:

```ts
export const OnboardingQuestionGraphSchema = z.object({
  version: z.number().int().positive(),
  questions: z.array(z.object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    writes: z.array(z.object({
      path: z.string().min(1),
      value: z.unknown(),
    })).default([]),
  })),
}).strict()

export function parseOnboardingQuestionGraph(input: unknown) {
  return OnboardingQuestionGraphSchema.parse(input)
}
```

Seed `catalogs/oms-onboarding-question-graph.json` with concrete questions for:

- frontend visual verification
- subagent packet-first behavior
- review-heavy versus build-heavy workloads
- browser-related external tools

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm test -- --run test/docs-catalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add schemas/oms-onboarding-question-graph.schema.json catalogs/oms-onboarding-question-graph.json src/docs-catalog.ts test/docs-catalog.test.ts
git commit -m "feat: add onboarding question graph"
```

### Task 3: Generate AI Digest Docs from Stable Inputs

**Files:**
- Create: `scripts/generate-ai-docs.ts`
- Create: `docs/ai/oms-capability-catalog.md`
- Create: `docs/ai/oms-onboarding-playbooks.md`
- Create: `docs/ai/llms.txt`
- Create: `docs/ai/llms-full.txt`
- Modify: `package.json`

- [ ] **Step 1: Write the failing generation smoke test**

Add this npm script to `package.json` in the test first:

```json
{
  "scripts": {
    "docs:ai": "tsx scripts/generate-ai-docs.ts"
  }
}
```

Then run:

`pnpm docs:ai`

Expected: FAIL because the generator script does not exist yet.

- [ ] **Step 2: Implement the generator script**

Create `scripts/generate-ai-docs.ts` with logic like:

```ts
import fs from "node:fs/promises"
import { parseCapabilityCatalog, parseOnboardingQuestionGraph } from "../src/docs-catalog.js"

async function main() {
  const capabilityCatalog = parseCapabilityCatalog(JSON.parse(await fs.readFile("catalogs/oms-capabilities.json", "utf8")))
  const questionGraph = parseOnboardingQuestionGraph(JSON.parse(await fs.readFile("catalogs/oms-onboarding-question-graph.json", "utf8")))

  await fs.mkdir("docs/ai", { recursive: true })
  await fs.writeFile("docs/ai/oms-capability-catalog.md", renderCapabilityCatalog(capabilityCatalog))
  await fs.writeFile("docs/ai/oms-onboarding-playbooks.md", renderPlaybooks(questionGraph))
  await fs.writeFile("docs/ai/llms.txt", buildShortLlmIndex())
  await fs.writeFile("docs/ai/llms-full.txt", buildFullLlmReference(capabilityCatalog, questionGraph))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 3: Run the generator and verify outputs exist**

Run: `pnpm docs:ai && rtk git status --short docs/ai scripts/generate-ai-docs.ts`

Expected: generated markdown files exist and are tracked.

- [ ] **Step 4: Run verification**

Run: `pnpm test -- --run test/docs-catalog.test.ts && pnpm check`

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add package.json scripts/generate-ai-docs.ts docs/ai/oms-capability-catalog.md docs/ai/oms-onboarding-playbooks.md docs/ai/llms.txt docs/ai/llms-full.txt
git commit -m "feat: generate ai-readable onboarding docs"
```
