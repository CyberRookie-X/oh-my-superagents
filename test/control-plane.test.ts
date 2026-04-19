import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"
import { describe, expect, it } from "vitest"
import {
  buildOpenCodeStatusState,
  buildControlPlaneExplainTrace,
  prepareControlPlaneStateWrite,
  resolveControlPlane,
  summarizeSourceToolRoleExplainability,
  summarizeEffectiveSourceReadiness,
  summarizeEffectiveSourceEntries,
  summarizeSubagentExecutionDiagnostics,
  summarizeRoutingValidation,
} from "../src/control-plane.js"
import { enhanceCompressionBundleWithSummary } from "../src/context-compression.js"
import { createDefaultControlPlaneConfig } from "../src/config.js"

const defaultSuperpowersSourceEntries = {
  "phase.brainstorm": {
    canonicalRoute: "phase.brainstorm",
    source: "superpowers",
    entryName: "brainstorming",
  },
  "phase.plan": {
    canonicalRoute: "phase.plan",
    source: "superpowers",
    entryName: "writing-plans",
  },
  "phase.execute": {
    canonicalRoute: "phase.execute",
    source: "superpowers",
    entryName: "subagent-driven-development",
  },
  "phase.review": {
    canonicalRoute: "phase.review",
    source: "superpowers",
    entryName: "requesting-code-review",
  },
  "phase.verify": {
    canonicalRoute: "phase.verify",
    source: "superpowers",
    entryName: "verification-before-completion",
  },
  "phase.visual": {
    canonicalRoute: "phase.visual",
    source: "superpowers",
    entryName: "frontend-design",
  },
  "phase.web-test": {
    canonicalRoute: "phase.web-test",
    source: "superpowers",
    entryName: "webapp-testing",
  },
} as const

const planningContextIndex = {
  artifacts: [
    {
      kind: "spec" as const,
      path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
      authority: "authoritative" as const,
      source: "oms" as const,
      lifecycleStage: "design" as const,
    },
    {
      kind: "plan" as const,
      path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
      authority: "authoritative" as const,
      source: "oms" as const,
      lifecycleStage: "plan" as const,
    },
  ],
  warnings: [],
}

const defaultContextCompressionSettings = {
  mode: "manual" as const,
  engine: "builtin" as const,
  inlineLevel: "minimal" as const,
  moments: {
    subagentHandoff: false,
    planCheckpoint: false,
    reviewCheckpoint: false,
    verificationCheckpoint: false,
    sessionResume: false,
    sourceSwitch: false,
    branchIntegration: false,
  },
  safety: {
    allowConditional: false,
    requireFreshVerification: true,
  },
}

const defaultControlPlaneSettings = {
  laneSelection: { mode: "suggest" as const },
  subagentExecution: { mode: "suggest" as const },
  contextCompression: defaultContextCompressionSettings,
}

function createExists(files: Record<string, string>) {
  return async (filePath: string) => filePath in files
}

function createReadFile(files: Record<string, string>) {
  return async (filePath: string) => {
    const value = files[filePath]
    if (value === undefined) {
      throw new Error(`Unexpected read: ${filePath}`)
    }

    return value
  }
}

function createIsWritable(writablePaths: string[]) {
  const writable = new Set(writablePaths)
  return async (filePath: string) => writable.has(filePath)
}

describe("resolveControlPlane", () => {
  it("adds an optional summary on top of the built-in compression bundle", () => {
    const enhancedBundle = enhanceCompressionBundleWithSummary({
      bundle: {
        packIds: ["spec-core"],
        entries: [{
          path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
          kind: "spec",
          content: "# Summary",
        }],
      },
      summarizer: (bundle) => `packs:${bundle.packIds.join(",")}`,
    })

    expect(enhancedBundle.summary).toBe("packs:spec-core")
  })

  it("allows no-config defaults for status and doctor", async () => {
    const status = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
    })
    const doctor = await resolveControlPlane({
      command: "doctor",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
    })

    expect(status.source.kind).toBe("default")
    expect(doctor.source.kind).toBe("default")
    expect(status.config.settings.activePreset).toBe("default")
    expect(doctor.config.settings.commandPrefix).toBe("oms")
    expect(status.activePreset.preset).toEqual({
      label: "Default",
      short: "def",
      description: "General daily development",
      profiles: {
        strategy: {
          model: "anthropic/claude-sonnet-4-5-20250929",
          variant: "high",
        },
        build: {
          model: "openai/gpt-5",
          effort: "balanced",
        },
      },
      routes: {
        brainstorming: "strategy",
      },
      defaultRoute: "build",
    })
  })

  it("includes a read-only context index summary in resolved control-plane state", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "spec",
            path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "design",
          },
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.contextIndex?.artifacts).toHaveLength(2)
  })

  it("surfaces config recovery state when last-known-good is active", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/repo",
      loadControlPlaneConfig: async () => ({
        path: "/repo/oh-my-superagents.config.jsonc",
        sources: ["/repo/.oms/last-known-good.json"],
        layers: [],
        hasRealSource: true,
        config: createDefaultControlPlaneConfig(),
        recovery: {
          activeSource: "last-known-good",
          authorityError: "Invalid JSONC",
          lastKnownGoodPath: "/repo/.oms/last-known-good.json",
        },
      }),
      buildContextIndex: async () => ({
        artifacts: [],
        warnings: [],
      }),
    })

    expect(resolved.recovery?.activeSource).toBe("last-known-good")
  })

  it("surfaces selector-based policy matches in resolved control-plane state", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [
      {
        id: "frontend-verify",
        selector: {
          path: ["frontend/**"],
          lifecycleStage: ["verify"],
          workflowSource: ["superpowers"],
          workloadTags: ["frontend"],
          modalityRequirements: ["vision-input"],
        },
        policy: {
          modelPolicy: { preferredProfiles: ["vision-review"] },
        },
      },
    ]

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [],
        hasRealSource: true,
        config,
      }),
      runtimeLifecycleStage: "verify",
      runtimeWorkflowSource: "superpowers",
      runtimeRelativePath: "frontend/app/page.tsx",
      runtimeWorkloadTags: ["frontend"],
      runtimeModalityRequirements: ["vision-input"],
      buildContextIndex: async () => ({
        artifacts: [{
          kind: "spec",
          path: "docs/superpowers/specs/frontend-verify.md",
          authority: "authoritative",
          source: "oms",
          lifecycleStage: "plan",
        }],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.matchedRuleIds).toEqual(["frontend-verify"])
    expect(resolved.policyResolution?.policy.modelPolicy?.preferredProfiles).toEqual(["vision-review"])
    expect(resolved.policyResolution?.provenance).toEqual({
      lifecycleStage: "explicit",
      workflowSource: "explicit",
      relativePath: "explicit",
      workloadTags: "explicit",
      modalityRequirements: "explicit",
      agentRole: "defaulted",
    })
  })

  it("applies matched contextPolicy overrides to effective context compression", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [
      {
        id: "verify-compression",
        selector: {
          lifecycleStage: ["verify"],
        },
        policy: {
          contextPolicy: {
            compressionPreset: "review",
            maxCharsBeforeCompression: 1024,
          },
        },
      },
    ]
    config.compressionPresets = {
      review: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
      },
    }

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [],
        hasRealSource: true,
        config,
      }),
      runtimeLifecycleStage: "verify",
      buildContextIndex: async () => ({
        artifacts: [],
        warnings: [],
      }),
    })

    expect(resolved.contextCompression?.policy).toMatchObject({
      preset: "review",
      mode: "auto",
      engine: "hybrid",
      inlineLevel: "standard",
    })
  })

  it("allows matched selector rules to clear an authored contextCompression preset", async () => {
    const config = createDefaultControlPlaneConfig()
    config.settings.contextCompression = {
      preset: "review",
    }
    config.policyRules = [
      {
        id: "clear-review-compression",
        selector: {
          lifecycleStage: ["verify"],
        },
        policy: {
          contextPolicy: {
            compressionPreset: null,
          },
        },
      },
    ]
    config.compressionPresets = {
      review: {
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
      },
    }

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [
          {
            path: "/workspace/project/oh-my-superagents.config.jsonc",
            config: {
              settings: {
                contextCompression: {
                  preset: "review",
                },
              },
              compressionPresets: config.compressionPresets,
              presets: config.presets,
            },
          },
        ],
        hasRealSource: true,
        config,
      }),
      runtimeLifecycleStage: "verify",
      buildContextIndex: async () => ({
        artifacts: [],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.matchedRuleIds).toEqual(["clear-review-compression"])
    expect(resolved.contextCompression?.policy.preset).toBeUndefined()
    expect(resolved.contextCompression?.policy).toMatchObject({
      mode: "manual",
      engine: "builtin",
      inlineLevel: "minimal",
    })
  })

  it("does not infer selector path matches from indexed artifact paths when runtime path is absent", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [
      {
        id: "frontend-verify",
        selector: {
          path: ["frontend/**"],
        },
        policy: {
          modelPolicy: { preferredProfiles: ["vision-review"] },
        },
      },
    ]

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [],
        hasRealSource: true,
        config,
      }),
      buildContextIndex: async () => ({
        artifacts: [{
          kind: "spec",
          path: "frontend/spec.md",
          authority: "authoritative",
          source: "oms",
          lifecycleStage: "plan",
        }],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.matchedRuleIds).toEqual([])
  })

  it("does not infer selector lifecycle stage from historical indexed artifacts when runtime stage is absent", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [
      {
        id: "verify-only",
        selector: {
          lifecycleStage: ["verify"],
        },
        policy: {
          modelPolicy: { preferredProfiles: ["vision-review"] },
        },
      },
    ]

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [],
        hasRealSource: true,
        config,
      }),
      buildContextIndex: async () => ({
        artifacts: [{
          kind: "spec",
          path: "docs/superpowers/specs/old-verify.md",
          authority: "authoritative",
          source: "oms",
          lifecycleStage: "verify",
        }],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.snapshot.lifecycleStage).toBe("plan")
    expect(resolved.policyResolution?.matchedRuleIds).toEqual([])
    expect(resolved.policyResolution?.provenance).toEqual({
      lifecycleStage: "defaulted",
      workflowSource: "derived",
      relativePath: "defaulted",
      workloadTags: "derived",
      modalityRequirements: "defaulted",
      agentRole: "defaulted",
    })
  })

  it("does not infer selector workload tag matches from runtime path when runtime tags are omitted", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [
      {
        id: "frontend-workload",
        selector: {
          workloadTags: ["frontend"],
        },
        policy: {
          modelPolicy: { preferredProfiles: ["vision-review"] },
        },
      },
    ]

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [],
        hasRealSource: true,
        config,
      }),
      runtimeRelativePath: "frontend/app/page.tsx",
      buildContextIndex: async () => ({
        artifacts: [],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.snapshot.workloadTags).toEqual([])
    expect(resolved.policyResolution?.matchedRuleIds).toEqual([])
  })

  it("preserves the resolved default context compression policy in state", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => planningContextIndex,
    })

    expect(resolved.contextCompression).toMatchObject({
      policy: {
        mode: "manual",
        engine: "builtin",
        inlineLevel: "minimal",
      },
      selection: {
        lifecycleStage: "plan",
        packIds: [],
      },
    })
  })

  it("resolves preset-selected compression policy from authored layered settings instead of finalized defaults", async () => {
    const configPath = "/workspace/project/oh-my-superagents.config.jsonc"
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: configPath,
      exists: async (filePath) => filePath === configPath,
      readFile: async (filePath) => {
        if (filePath !== configPath) {
          throw new Error(`Unexpected read: ${filePath}`)
        }

        return `{
          "settings": {
            "activePreset": "default",
            "contextCompression": {
              "preset": "review"
            }
          },
          "compressionPresets": {
            "review": {
              "mode": "auto",
              "engine": "hybrid",
              "inlineLevel": "standard",
              "moments": {
                "planCheckpoint": true
              },
              "safety": {
                "allowConditional": false,
                "requireFreshVerification": true
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`
      },
      buildContextIndex: async () => planningContextIndex,
    })

    expect(resolved.contextCompression).toMatchObject({
      policy: {
        preset: "review",
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
      },
      selection: {
        packIds: ["spec-core", "plan-core"],
      },
    })
  })

  it("includes compression readiness and engine details in resolved context compression state", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
    })

    expect(resolved.contextCompression?.readiness).toBeDefined()
    expect(resolved.contextCompression?.engineBundle).toBeDefined()
  })

  it("derives explicit freshness for readiness from boundary-relevant artifacts", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            headCommit: "abc123",
            reviewedCommit: "abc123",
            commitsSinceArtifact: 0,
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.contextCompression?.readiness).toMatchObject({
      state: "safe",
      resumePacket: {
        freshness: {
          headCommit: "abc123",
          reviewedCommit: "abc123",
          commitsSinceArtifact: 0,
        },
      },
    })
  })

  it("treats expired staleAfter freshness as non-safe", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      now: "2026-04-16T00:00:00.000Z",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            staleAfter: "2026-04-15T00:00:00.000Z",
          },
        ],
        warnings: [],
      }),
    } as Parameters<typeof resolveControlPlane>[0])

    expect(resolved.contextCompression?.readiness).toMatchObject({
      state: "unsafe",
      reason: "Freshness verification failed and conditional compression is disabled by policy.",
    })
  })

  it("treats missing freshness metadata on any boundary-relevant authoritative artifact as non-safe", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            headCommit: "abc123",
            reviewedCommit: "abc123",
            commitsSinceArtifact: 0,
          },
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.contextCompression?.readiness).toMatchObject({
      state: "unsafe",
      reason: "Freshness verification failed and conditional compression is disabled by policy.",
    })
  })

  it("treats partially populated freshness metadata as non-safe", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            headCommit: "abc123",
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.contextCompression?.readiness).toMatchObject({
      state: "unsafe",
      reason: "Freshness verification failed and conditional compression is disabled by policy.",
    })
  })

  it("treats conflicting boundary freshness metadata as non-safe", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            headCommit: "abc123",
            reviewedCommit: "abc123",
            commitsSinceArtifact: 0,
          },
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            headCommit: "def456",
            reviewedCommit: "def456",
            commitsSinceArtifact: 0,
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.contextCompression?.readiness).toMatchObject({
      state: "unsafe",
      reason: "Freshness verification failed and conditional compression is disabled by policy.",
    })
  })

  it("adds engine bundle warnings when selected artifact content cannot be read", async () => {
    const configPath = "/workspace/project/oh-my-superagents.config.jsonc"
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: configPath,
      exists: async (filePath) => filePath === configPath,
      readFile: async (filePath) => {
        if (filePath === configPath) {
          return `{
            "settings": {
              "activePreset": "default",
              "contextCompression": {
                "mode": "auto",
                "engine": "hybrid",
                "inlineLevel": "standard",
                "moments": { "planCheckpoint": true },
                "safety": {
                  "allowConditional": false,
                  "requireFreshVerification": true
                }
              }
            },
            "presets": {
              "default": {
                "label": "Default",
                "short": "def",
                "profiles": {
                  "build": { "model": "openai/gpt-5" }
                },
                "routes": {},
                "defaultRoute": "build"
              }
            }
          }`
        }

        throw new Error(`artifact unavailable: ${filePath}`)
      },
      buildContextIndex: async () => planningContextIndex,
    })

    expect(resolved.contextCompression?.engineBundle.warnings).toEqual([
      "Failed to read context artifact docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md: artifact unavailable: /workspace/project/docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
      "Failed to read context artifact docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md: artifact unavailable: /workspace/project/docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
    ])
  })

  it("keeps engine bundle warnings ordered by selection when reads fail out of order", async () => {
    const configPath = "/workspace/project/oh-my-superagents.config.jsonc"
    const specPath = "/workspace/project/docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md"
    const planPath = "/workspace/project/docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md"
    const pendingRejectors = new Map<string, (error: Error) => void>()
    let readyResolve!: () => void
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve
    })

    const resolvedPromise = resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: configPath,
      exists: async (filePath) => filePath === configPath,
      readFile: async (filePath) => {
        if (filePath === configPath) {
          return `{
            "settings": {
              "activePreset": "default",
              "contextCompression": {
                "mode": "auto",
                "engine": "hybrid",
                "inlineLevel": "standard",
                "moments": { "planCheckpoint": true },
                "safety": {
                  "allowConditional": false,
                  "requireFreshVerification": true
                }
              }
            },
            "presets": {
              "default": {
                "label": "Default",
                "short": "def",
                "profiles": {
                  "build": { "model": "openai/gpt-5" }
                },
                "routes": {},
                "defaultRoute": "build"
              }
            }
          }`
        }

        return await new Promise<string>((_resolve, reject) => {
          pendingRejectors.set(filePath, reject)
          if (pendingRejectors.size === 2) {
            readyResolve()
          }
        })
      },
      buildContextIndex: async () => planningContextIndex,
    })

    await ready
    pendingRejectors.get(planPath)?.(new Error(`artifact unavailable: ${planPath}`))
    pendingRejectors.get(specPath)?.(new Error(`artifact unavailable: ${specPath}`))

    const resolved = await resolvedPromise

    expect(resolved.contextCompression?.engineBundle.warnings).toEqual([
      `Failed to read context artifact docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md: artifact unavailable: ${specPath}`,
      `Failed to read context artifact docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md: artifact unavailable: ${planPath}`,
    ])
  })

  it("treats unreadable selected authoritative artifacts as non-safe readiness", async () => {
    const configPath = "/workspace/project/oh-my-superagents.config.jsonc"
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: configPath,
      exists: async (filePath) => filePath === configPath,
      readFile: async (filePath) => {
        if (filePath === configPath) {
          return `{
            "settings": {
              "activePreset": "default",
              "contextCompression": {
                "mode": "auto",
                "engine": "hybrid",
                "inlineLevel": "standard",
                "moments": {
                  "planCheckpoint": true
                },
                "safety": {
                  "allowConditional": false,
                  "requireFreshVerification": true
                }
              }
            },
            "presets": {
              "default": {
                "label": "Default",
                "short": "def",
                "profiles": {
                  "build": { "model": "openai/gpt-5" }
                },
                "routes": {},
                "defaultRoute": "build"
              }
            }
          }`
        }

        if (filePath === "/workspace/project/docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md") {
          return "# Plan\n\nReadable"
        }

        throw new Error(`artifact unavailable: ${filePath}`)
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "spec",
            path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "design",
          },
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            headCommit: "abc123",
            reviewedCommit: "abc123",
            commitsSinceArtifact: 0,
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.contextCompression?.readiness).toMatchObject({
      state: "unsafe",
    })
    expect(resolved.contextCompression?.engineBundle.warnings).toEqual([
      "Failed to read context artifact docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md: artifact unavailable: /workspace/project/docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
    ])
  })

  it("forces unreadable selected authoritative artifacts to unsafe even when readiness was conditional", async () => {
    const configPath = "/workspace/project/oh-my-superagents.config.jsonc"
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: configPath,
      exists: async (filePath) => filePath === configPath,
      readFile: async (filePath) => {
        if (filePath === configPath) {
          return `{
            "settings": {
              "activePreset": "default",
              "contextCompression": {
                "mode": "auto",
                "engine": "hybrid",
                "inlineLevel": "standard",
                "moments": {
                  "planCheckpoint": true
                },
                "safety": {
                  "allowConditional": true,
                  "requireFreshVerification": true
                }
              }
            },
            "presets": {
              "default": {
                "label": "Default",
                "short": "def",
                "profiles": {
                  "build": { "model": "openai/gpt-5" }
                },
                "routes": {},
                "defaultRoute": "build"
              }
            }
          }`
        }

        throw new Error(`artifact unavailable: ${filePath}`)
      },
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "spec",
            path: "docs/superpowers/specs/2026-04-15-hybrid-context-orchestration-design.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "design",
          },
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-session-aware-context-pack-selection.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
            commitsSinceArtifact: 1,
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.contextCompression?.readiness).toMatchObject({
      state: "unsafe",
      reason: "One or more selected authoritative artifacts could not be read for compression diagnostics.",
    })
  })

  it("keeps default effective context compression stable after first-write defaults are persisted", async () => {
    const unresolvedWorkspace = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      buildContextIndex: async () => planningContextIndex,
    })
    const prepared = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
      isWritable: async () => true,
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })
    const persistedWorkspace = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: prepared.path,
      exists: async (filePath) => filePath === prepared.path,
      readFile: async (filePath) => {
        if (filePath !== prepared.path) {
          throw new Error(`Unexpected read: ${filePath}`)
        }

        return prepared.content
      },
      buildContextIndex: async () => planningContextIndex,
    })

    expect(unresolvedWorkspace.contextCompression).toEqual(persistedWorkspace.contextCompression)
    expect(persistedWorkspace.contextCompression).toMatchObject({
      policy: {
        mode: "manual",
        engine: "builtin",
        inlineLevel: "minimal",
      },
      selection: {
        lifecycleStage: "plan",
        packIds: [],
      },
    })
  })

  it("includes a context index summary for config-backed resolution", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
          },
        ],
        warnings: [],
      }),
    })

    expect(resolved.source.kind).toBe("file")
    expect(resolved.contextIndex).toEqual({
      artifacts: [
        {
          kind: "plan",
          path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
          authority: "authoritative",
          source: "oms",
          lifecycleStage: "plan",
        },
      ],
      warnings: [],
    })
  })

  it("records a context index warning when indexing fails", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      buildContextIndex: async () => {
        throw new Error("index unavailable")
      },
    })

    expect(resolved.source.kind).toBe("file")
    expect(resolved.activePreset.key).toBe("default")
    expect(resolved.contextIndex).toEqual({
      artifacts: [],
      warnings: ["Failed to build context index: index unavailable"],
    })
  })

  it("includes resolved context provider availability in control-plane diagnostics", async () => {
    let receivedProviderConfig: unknown

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "contextCompression": {
            "mode": "auto",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "planCheckpoint": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "contextProviders": {
          "memoryBank": {
            "kind": "file",
            "enabled": true,
            "root": ".memorybank",
            "capabilities": ["recall", "status"]
          },
          "graphiti": {
            "kind": "mcp",
            "enabled": true,
            "command": "graphiti-mcp",
            "capabilities": ["recall", "search", "summarize", "status"]
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      buildContextIndex: async () => ({
        artifacts: [
          {
            kind: "plan",
            path: "docs/superpowers/plans/2026-04-15-context-index-and-diagnostics.md",
            authority: "authoritative",
            source: "oms",
            lifecycleStage: "plan",
          },
        ],
        warnings: [],
      }),
      resolveContextProviders: async (input) => {
        receivedProviderConfig = input.config
        return [
          {
            id: "memoryBank",
            kind: "file",
            root: "/workspace/project/.memorybank",
            available: false,
            capabilities: ["recall", "status"],
          },
          {
            id: "graphiti",
            kind: "mcp",
            command: "graphiti-mcp",
            args: [],
            available: true,
            capabilities: ["recall", "search", "summarize", "status"],
          },
        ]
      },
    })

    expect(receivedProviderConfig).toMatchObject({
      memoryBank: {
        kind: "file",
        root: ".memorybank",
      },
      graphiti: {
        kind: "mcp",
        command: "graphiti-mcp",
      },
    })
    expect(resolved.contextProviders).toEqual([
      {
        id: "memoryBank",
        kind: "file",
        root: "/workspace/project/.memorybank",
        available: false,
        capabilities: ["recall", "status"],
      },
      {
        id: "graphiti",
        kind: "mcp",
        command: "graphiti-mcp",
        args: [],
        available: true,
        capabilities: ["recall", "search", "summarize", "status"],
      },
    ])
    expect(resolved.contextIndex?.providers).toEqual({
      availableIds: ["graphiti"],
      unavailableIds: ["memoryBank"],
      capabilityMap: {
        recall: ["graphiti", "memoryBank"],
        search: ["graphiti"],
        summarize: ["graphiti"],
        status: ["graphiti", "memoryBank"],
      },
    })
    expect(resolved.contextCompression?.selection.providers).toEqual({
      availableIds: ["graphiti"],
      unavailableIds: ["memoryBank"],
      capabilityMap: {
        recall: ["graphiti", "memoryBank"],
        search: ["graphiti"],
        summarize: ["graphiti"],
        status: ["graphiti", "memoryBank"],
      },
    })
    expect(resolved.contextCompression?.readiness.providers).toEqual({
      availableIds: ["graphiti"],
      unavailableIds: ["memoryBank"],
      capabilityMap: {
        recall: ["graphiti", "memoryBank"],
        search: ["graphiti"],
        summarize: ["graphiti"],
        status: ["graphiti", "memoryBank"],
      },
    })
  })

  it("allows read-only fallback when --config points at a missing file", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/missing.jsonc",
      exists: async () => false,
      readFile: async () => {
        throw new Error("should not read")
      },
    })

    expect(result.source.kind).toBe("default")
    expect(result.config.settings.activePreset).toBe("default")
  })

  it("uses lower-priority global config when an explicit missing project config path is selected for reads", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "shared"
        },
        "presets": {
          "shared": {
            "label": "Shared",
            "short": "sha",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: createExists(files),
      readFile: createReadFile(files),
      buildContextIndex: async () => ({ artifacts: [], warnings: [] }),
    })

    expect(result.source.kind).toBe("file")
    expect(result.activePreset.key).toBe("shared")
    expect(Object.keys(result.config.presets)).toEqual(["shared"])
  })

  it("preserves lower-priority preset sets when writing through an explicit missing project config path", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "shared"
        },
        "presets": {
          "shared": {
            "label": "Shared",
            "short": "sha",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "shared",
        enabled: false,
      },
    })
    const serialized = parse(result.content) as {
      settings?: { activePreset?: string; enabled?: boolean }
      presets?: Record<string, unknown>
    }

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(serialized.settings).toEqual({
      activePreset: "shared",
      enabled: false,
    })
    expect(serialized.presets).toEqual({})
  })

  it("rejects sync when there is no real config source", async () => {
    await expect(
      resolveControlPlane({
        command: "sync",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        exists: async () => false,
        readFile: async () => {
          throw new Error("should not read")
        },
      }),
    ).rejects.toThrow(/real config source/i)
  })

  it("validates active preset and route graph", async () => {
    await expect(
      resolveControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "missing"
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {
                "brainstorming": "missing"
              },
              "defaultRoute": "also-missing"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/activePreset|defaultRoute|Unknown profile|missing/i)
  })

  it("rejects duplicate preset shorts", async () => {
    await expect(
      resolveControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "default"
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "dup",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            },
            "review": {
              "label": "Review",
              "short": "dup",
              "profiles": {
                "build": { "model": "anthropic/claude-sonnet-4-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/short/i)
  })

  it("rejects duplicate rendered command names and aliases", async () => {
    await expect(
      resolveControlPlane({
        command: "doctor",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "default",
            "commands": {
              "status": {
                "name": "same",
                "aliases": ["dup"]
              },
              "doctor": {
                "name": "doctor",
                "aliases": ["same"]
              }
            }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/unique|duplicate|alias|command/i)
  })

  it("rejects colliding lane execution slugs during control-plane validation", async () => {
    await expect(
      resolveControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "default"
          },
          "profiles": {
            "build": { "model": "openai/gpt-5" }
          },
          "lanes": {
            "café": { "label": "Cafe", "routes": {}, "defaultRoute": "build" },
            "cafe\u0301": { "label": "Cafe combining", "routes": {}, "defaultRoute": "build" }
          },
          "presets": {
            "default": {
              "label": "Default",
              "short": "def",
              "usesLanes": ["café", "cafe\u0301"],
              "defaultLane": "café",
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/lane slug collision|both map/i)
  })

  it("uses layered config before validation", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "review": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "review"
          }
        }
      }`,
    }

    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
    })

    expect(result.activePreset.key).toBe("default")
    expect(result.activePreset.preset.defaultRoute).toBe("review")
  })

  it("accepts direct preset routes during status resolution", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "workflow": {
          "kind": "direct",
          "intents": {
            "plan": { "label": "Plan" },
            "build": { "label": "Build" }
          }
        },
        "settings": {
          "activePreset": "default"
        },
        "profiles": {
          "planner": { "model": "openai/gpt-5" },
          "builder": { "model": "gpt-5.4" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {
              "plan": "planner"
            },
            "defaultRoute": "builder"
          }
        }
      }`,
    })

    expect(result.config.workflow).toEqual({
      kind: "direct",
      intents: {
        plan: { label: "Plan" },
        build: { label: "Build" },
      },
    })
    expect(result.activePreset.preset.routes).toEqual({ plan: "planner" })
  })

  it("defaults direct-workflow selector source to direct when runtime workflow source is omitted", async () => {
    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "workflow": {
          "kind": "direct",
          "intents": {
            "plan": { "label": "Plan" },
            "build": { "label": "Build" }
          }
        },
        "settings": {
          "activePreset": "default"
        },
        "profiles": {
          "planner": { "model": "openai/gpt-5" },
          "builder": { "model": "gpt-5.4" }
        },
        "policyRules": [{
          "id": "direct-only",
          "selector": {
            "workflowSource": ["direct"]
          },
          "policy": {
            "modelPolicy": {
              "preferredProfiles": ["builder"]
            }
          }
        }],
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {
              "plan": "planner"
            },
            "defaultRoute": "builder"
          }
        }
      }`,
      runtimeLifecycleStage: "execute_task",
    })

    expect(resolved.policyResolution?.snapshot.workflowSource).toBe("direct")
    expect(resolved.policyResolution?.matchedRuleIds).toEqual(["direct-only"])
  })

  it("tracks authority-driven policy separately from discarded evidence diagnostics", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [
      {
        id: "frontend-verify",
        selector: {
          lifecycleStage: ["verify"],
        },
        policy: {
          modelPolicy: { preferredProfiles: ["vision-review"] },
        },
      },
    ]

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [
          {
            path: "/workspace/project/oh-my-superagents.config.jsonc",
              config: {
                settings: { activePreset: "default" },
                authority: {
                  workloadMappings: [{
                    path: ["frontend/**"],
                    workloadTags: ["frontend", "visual"],
                  }],
                  policyRules: config.policyRules,
                },
                evidence: {
                  detectedPaths: [{ path: "frontend/**", suggestedTags: ["frontend", "visual"] }],
                  notes: ["Detected likely frontend workload"],
              },
              presets: config.presets,
            },
          },
        ],
        hasRealSource: true,
        config,
      }),
      runtimeLifecycleStage: "verify",
      buildContextIndex: async () => ({
        artifacts: [],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.matchedRuleIds).toEqual(["frontend-verify"])
    expect(resolved.policyDiagnostics).toEqual({
      authorityWorkloadMappingCount: 1,
      authorityRuleCount: 1,
      evidenceDetectedPathCount: 1,
      evidenceIgnoredForRuntime: true,
    })
  })

  it("does not count ordinary top-level policyRules as authority-backed diagnostics", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [
      {
        id: "top-level-policy",
        selector: {
          lifecycleStage: ["verify"],
        },
        policy: {
          modelPolicy: { preferredProfiles: ["vision-review"] },
        },
      },
    ]

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [
          {
            path: "/workspace/project/oh-my-superagents.config.jsonc",
            config: {
              settings: { activePreset: "default" },
              policyRules: config.policyRules,
              evidence: {
                detectedPaths: [{ path: "frontend/**", suggestedTags: ["frontend", "visual"] }],
                notes: ["Detected likely frontend workload"],
              },
              presets: config.presets,
            },
          },
        ],
        hasRealSource: true,
        config,
      }),
      runtimeLifecycleStage: "verify",
      buildContextIndex: async () => ({
        artifacts: [],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.matchedRuleIds).toEqual(["top-level-policy"])
    expect(resolved.policyDiagnostics).toEqual({
      authorityWorkloadMappingCount: 0,
      authorityRuleCount: 0,
      evidenceDetectedPathCount: 1,
      evidenceIgnoredForRuntime: true,
    })
  })

  it("applies authority workload mappings to runtime workloadTags for selector matching", async () => {
    const config = createDefaultControlPlaneConfig()
    config.policyRules = [{
      id: "frontend-mapped-policy",
      selector: {
        workloadTags: ["frontend"],
      },
      policy: {
        modelPolicy: { preferredProfiles: ["vision-review"] },
      },
    }]

    const resolved = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      loadControlPlaneConfig: async () => ({
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        layers: [
          {
            path: "/workspace/project/oh-my-superagents.config.jsonc",
            config: {
              settings: { activePreset: "default" },
              authority: {
                workloadMappings: [{
                  path: ["frontend/**"],
                  workloadTags: ["frontend", "visual"],
                }],
                policyRules: config.policyRules,
              },
              evidence: {
                detectedPaths: [{ path: "frontend/**", suggestedTags: ["frontend", "visual"] }],
                notes: ["Detected likely frontend workload"],
              },
              presets: config.presets,
            },
          },
        ],
        hasRealSource: true,
        config,
      }),
      runtimeRelativePath: "frontend/app/page.tsx",
      buildContextIndex: async () => ({
        artifacts: [],
        warnings: [],
      }),
    })

    expect(resolved.policyResolution?.snapshot.workloadTags).toEqual(["frontend", "visual"])
    expect(resolved.policyResolution?.matchedRuleIds).toEqual(["frontend-mapped-policy"])
    expect(resolved.policyDiagnostics).toEqual({
      authorityWorkloadMappingCount: 1,
      authorityRuleCount: 1,
      evidenceDetectedPathCount: 1,
      evidenceIgnoredForRuntime: true,
    })
  })

  it("resolves single-parent preset reuse before validation", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "child"
        },
        "presets": {
          "base": {
            "label": "Base",
            "short": "base",
            "profiles": {
              "build": { "model": "openai/gpt-5" },
              "strategy": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {
              "brainstorming": "strategy",
              "verification-before-completion": "build"
            },
            "defaultRoute": "build"
          },
          "child": {
            "label": "Child",
            "short": "child",
            "extends": "base",
            "profiles": {
              "review": { "model": "google/gemini-2.5-pro" }
            },
            "routes": {
              "brainstorming": "review"
            },
            "defaultRoute": "review"
          }
        }
      }`,
    })

    expect(result.activePreset.key).toBe("child")
    expect(result.activePreset.preset.defaultRoute).toBe("review")
    expect(result.activePreset.preset.profiles).toEqual({
      build: { model: "openai/gpt-5" },
      strategy: { model: "anthropic/claude-sonnet-4-5" },
      review: { model: "google/gemini-2.5-pro" },
    })
    expect(result.activePreset.preset.routes).toEqual({
      brainstorming: "review",
      "verification-before-completion": "build",
    })
  })

  it("resolves a preset that uses top-level profiles", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" },
          "strategy": { "model": "anthropic/claude-sonnet-4-5" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {
              "brainstorming": "strategy"
            },
            "defaultRoute": "build"
          }
        }
      }`,
    })

    expect(result.activePreset.key).toBe("default")
    expect(result.config.profiles.strategy.model).toBe("anthropic/claude-sonnet-4-5")
  })

  it("expands sourcePreset and sourceRoutes into an effective source table", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "sourcePresets": {
          "foundation": {
            "routes": {
              "phase.brainstorm": "superpowers",
              "phase.verify": "gstack"
            }
          }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "sourcePreset": "foundation",
            "sourceRoutes": {
              "phase.plan": "gstack"
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    })

    expect(result.effectiveSources).toEqual({
      "phase.brainstorm": "superpowers",
      "phase.plan": "gstack",
      "phase.verify": "gstack",
    })
  })

  it("resolves settings.defaultLane when allowed by the active preset", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "frontend"
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend", "backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })

    expect(result.config.settings.defaultLane).toBe("frontend")
    expect(result.laneState).toEqual({
      allowedLanes: ["frontend", "backend"],
      defaultLane: "frontend",
      effectiveLane: "frontend",
      mode: "suggest",
      nonApplyingReason: "Lane suggestions do not change routing in Stage 1. Use a runtime lane override with laneSelection.mode=auto to apply a lane for the current session.",
      presetDefaultLane: "backend",
      runtimeLane: undefined,
    })
  })

  it("keeps a runtime lane override non-applying in manual mode", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      runtimeLane: "frontend",
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "laneSelection": { "mode": "manual" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend", "backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })

    expect(result.laneState).toMatchObject({
      mode: "manual",
      runtimeLane: "frontend",
      effectiveLane: "backend",
      nonApplyingReason: undefined,
    })
  })

  it("applies a runtime lane override in auto mode", async () => {
    const result = await resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      runtimeLane: "frontend",
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "laneSelection": { "mode": "auto" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["frontend", "backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })

    expect(result.laneState).toMatchObject({
      mode: "auto",
      runtimeLane: "frontend",
      effectiveLane: "frontend",
      nonApplyingReason: undefined,
    })
  })

  it("rejects settings.defaultLane when the active preset does not allow that lane", async () => {
    await expect(resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "frontend"
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })).rejects.toThrow(/defaultLane|lane/i)
  })

  it("rejects preset.defaultLane when it is not included in usesLanes", async () => {
    await expect(resolveControlPlane({
      command: "status",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: async () => true,
      readFile: async () => `{
        "settings": {
          "activePreset": "default"
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": { "label": "Frontend", "routes": {}, "defaultRoute": "frontend-build" },
          "backend": { "label": "Backend", "routes": {}, "defaultRoute": "backend-build" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["backend"],
            "defaultLane": "frontend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    })).rejects.toThrow(/defaultLane|usesLanes|lane/i)
  })

  it("rejects cyclic preset reuse", async () => {
    await expect(
      resolveControlPlane({
        command: "status",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
        exists: async () => true,
        readFile: async () => `{
          "settings": {
            "activePreset": "a"
          },
          "presets": {
            "a": {
              "label": "A",
              "short": "a",
              "extends": "b",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            },
            "b": {
              "label": "B",
              "short": "b",
              "extends": "a",
              "profiles": {
                "review": { "model": "anthropic/claude-sonnet-4-5" }
              },
              "routes": {},
              "defaultRoute": "review"
            }
          }
        }`,
      }),
    ).rejects.toThrow(/cycle|cyclic|extends/i)
  })

  it("selects --config as the write target", async () => {
    const files = {
      "/workspace/project/explicit.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Explicit",
            "short": "exp",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "project"
        },
        "presets": {
          "project": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "build": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global"
        },
        "presets": {
          "global": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "google/gemini-2.5-pro" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/explicit.jsonc",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/explicit.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })

    expect(result.path).toBe("/workspace/project/explicit.jsonc")
  })

  it("does not force standalone compression defaults when explicit --config targets the project path with a lower-priority source", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "contextCompression": {
            "mode": "auto",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "planCheckpoint": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "compressionPresets": {
          "review": {
            "mode": "suggest",
            "engine": "external",
            "inlineLevel": "full"
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      explicitPath: "/workspace/project/oh-my-superagents.config.jsonc",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        contextCompression?: unknown
        commandPrefix?: string
        subagentExecution?: unknown
      }
      compressionPresets?: Record<string, unknown>
      presets?: Record<string, unknown>
    }

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(serialized.settings).toEqual({
      activePreset: "default",
      enabled: false,
    })
    expect(serialized.compressionPresets).toBeUndefined()
    expect(serialized.presets).toEqual({})
  })

  it("selects the project config as the write target when it exists", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "project"
        },
        "presets": {
          "project": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "review": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "review"
          }
        }
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global",
          "commandPrefix": "team"
        },
        "presets": {
          "global": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "project",
        enabled: false,
      },
    })
    const serialized = parse(result.content) as {
      settings?: { commandPrefix?: string; activePreset?: string; enabled?: boolean }
      presets?: Record<string, unknown>
    }

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(serialized.settings).toEqual({
      activePreset: "project",
      enabled: false,
    })
    expect(serialized.presets).toEqual({
      project: {
        label: "Project",
        short: "prj",
        profiles: {
          review: { model: "anthropic/claude-sonnet-4-5" },
        },
        routes: {},
        defaultRoute: "review",
      },
    })
    expect(serialized.settings?.commandPrefix).toBeUndefined()
  })

  it("selects the global config as the write target when it is the only real source", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/home/tester/.config/oh-my-superagents/config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })

    expect(result.path).toBe("/home/tester/.config/oh-my-superagents/config.jsonc")
  })

  it("fails when the selected write target is not writable", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global"
        },
        "presets": {
          "global": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    await expect(
      prepareControlPlaneStateWrite({
        command: "disable",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        exists: createExists(files),
        readFile: createReadFile(files),
        isWritable: createIsWritable([]),
        nextState: {
          activePreset: "default",
          enabled: false,
        },
      }),
    ).rejects.toThrow(/writ/i)
  })

  it("creates a valid layered config at the global target on first write when no config exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-"))

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      await mkdir(projectDir, { recursive: true })
      await mkdir(homeDir, { recursive: true })
      await mkdir(path.join(homeDir, ".config", "oh-my-superagents"), { recursive: true })

      const result = await prepareControlPlaneStateWrite({
        command: "use",
        cwd: projectDir,
        homeDir,
        nextState: {
          activePreset: "default",
          enabled: true,
        },
      })
      const serialized = parse(result.content) as {
        settings: {
          activePreset: string
          enabled: boolean
          commandPrefix: string
          commands: Record<string, { name: string; aliases: string[] }>
          subagentExecution: { mode: string }
        }
        presets: Record<string, unknown>
      }

      expect(result.path).toBe(path.join(homeDir, ".config", "oh-my-superagents", "config.jsonc"))
      expect(serialized.settings.activePreset).toBe("default")
      expect(serialized.settings.enabled).toBe(true)
      expect(serialized.settings.subagentExecution).toEqual({ mode: "suggest" })
      expect(serialized.settings.commandPrefix).toBe("oms")
      expect(serialized.settings.commands.use).toEqual({
        name: "use",
        aliases: ["u"],
      })
      expect(serialized.presets.default).toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("includes contextCompression settings and compressionPresets on first write", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-context-compression-"))

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      await mkdir(projectDir, { recursive: true })
      await mkdir(homeDir, { recursive: true })

      const result = await prepareControlPlaneStateWrite({
        command: "use",
        cwd: projectDir,
        homeDir,
        nextState: {
          activePreset: "default",
          enabled: true,
        },
      })
      const serialized = parse(result.content) as {
        settings?: {
          contextCompression?: {
            mode?: string
            engine?: string
            inlineLevel?: string
            moments?: Record<string, boolean>
            safety?: {
              allowConditional?: boolean
              requireFreshVerification?: boolean
            }
          }
        }
        compressionPresets?: Record<string, unknown>
      }

      expect(serialized.settings?.contextCompression).toEqual({
        mode: "manual",
        engine: "builtin",
        inlineLevel: "minimal",
        moments: {
          subagentHandoff: false,
          planCheckpoint: false,
          reviewCheckpoint: false,
          verificationCheckpoint: false,
          sessionResume: false,
          sourceSwitch: false,
          branchIntegration: false,
        },
        safety: {
          allowConditional: false,
          requireFreshVerification: true,
        },
      })
      expect(serialized.compressionPresets).toEqual({})
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("allows first-write global config preparation when parent directories do not exist yet", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-fresh-home-"))

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      await mkdir(projectDir, { recursive: true })
      await mkdir(homeDir, { recursive: true })

      const result = await prepareControlPlaneStateWrite({
        command: "use",
        cwd: projectDir,
        homeDir,
        nextState: {
          activePreset: "default",
          enabled: true,
        },
      })

      expect(result.path).toBe(path.join(homeDir, ".config", "oh-my-superagents", "config.jsonc"))
      expect(parse(result.content)).toEqual(expect.objectContaining({
        settings: expect.objectContaining({
          activePreset: "default",
          enabled: true,
          commandPrefix: "oms",
        }),
      }))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rejects first-write global config preparation when an existing intermediate directory is not writable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-blocked-home-"))

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      const blockedConfigDir = path.join(homeDir, ".config")
      await mkdir(projectDir, { recursive: true })
      await mkdir(blockedConfigDir, { recursive: true })
      await chmod(blockedConfigDir, 0o555)

      await expect(
        prepareControlPlaneStateWrite({
          command: "use",
          cwd: projectDir,
          homeDir,
          nextState: {
            activePreset: "default",
            enabled: true,
          },
        }),
      ).rejects.toThrow(/writ/i)
    } finally {
      await chmod(path.join(root, "home", ".config"), 0o755).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("selects the global config as the write target when homeDir is omitted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "oms-control-plane-home-"))
    const previousHome = process.env.HOME

    try {
      const projectDir = path.join(root, "workspace", "project")
      const homeDir = path.join(root, "home")
      const globalPath = path.join(homeDir, ".config", "oh-my-superagents", "config.jsonc")
      await mkdir(projectDir, { recursive: true })
      await mkdir(path.dirname(globalPath), { recursive: true })
      await writeFile(
        globalPath,
        `{
          "settings": {
            "activePreset": "default"
          },
          "presets": {
            "default": {
              "label": "Global",
              "short": "glo",
              "profiles": {
                "build": { "model": "openai/gpt-5" }
              },
              "routes": {},
              "defaultRoute": "build"
            }
          }
        }`,
      )
      process.env.HOME = homeDir

      const result = await prepareControlPlaneStateWrite({
        command: "disable",
        cwd: projectDir,
        nextState: {
          activePreset: "default",
          enabled: false,
        },
      })

      expect(result.path).toBe(globalPath)
    } finally {
      process.env.HOME = previousHome
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rewrites a legacy target using only migrated local content and required stateful fields", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "profiles": {
          "review": { "model": "anthropic/claude-sonnet-4-5" }
        },
        "routes": {
          "brainstorming": "review"
        },
        "defaultRoute": "review"
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "global",
          "commandPrefix": "team",
          "commands": {
            "use": {
              "name": "switch",
              "aliases": ["sw"]
            }
          }
        },
        "presets": {
          "global": {
            "label": "Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        commandPrefix?: string
        commands?: Record<string, unknown>
        subagentExecution?: { mode: string }
        superpowersCompatibility?: { mode: string }
      }
      presets: Record<string, unknown>
    }

    expect(result.path).toBe("/workspace/project/oh-my-superagents.config.jsonc")
    expect(serialized.settings).toEqual({
      activePreset: "default",
      enabled: true,
    })
    expect(serialized.presets).toEqual({
      default: {
        label: "Default",
        short: "def",
        description: "Migrated legacy OMS configuration",
        profiles: {
          review: { model: "anthropic/claude-sonnet-4-5" },
        },
        routes: {
          brainstorming: "review",
        },
        defaultRoute: "review",
      },
    })
    expect(serialized.settings?.commandPrefix).toBeUndefined()
    expect(serialized.settings?.commands).toBeUndefined()
    expect(serialized.settings?.superpowersCompatibility).toBeUndefined()
  })

  it("synthesizes subagentExecution when rewriting a standalone legacy target", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "profiles": {
          "review": { "model": "anthropic/claude-sonnet-4-5" }
        },
        "routes": {
          "brainstorming": "review"
        },
        "defaultRoute": "review"
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        commandPrefix?: string
        subagentExecution?: { mode: string }
        contextCompression?: {
          mode?: string
          engine?: string
          inlineLevel?: string
          moments?: Record<string, boolean>
          safety?: {
            allowConditional?: boolean
            requireFreshVerification?: boolean
          }
        }
      }
      compressionPresets?: Record<string, unknown>
    }

    expect(serialized.settings).toEqual(expect.objectContaining({
      activePreset: "default",
      enabled: true,
      commandPrefix: "oms",
      subagentExecution: { mode: "suggest" },
      contextCompression: {
        mode: "manual",
        engine: "builtin",
        inlineLevel: "minimal",
        moments: {
          subagentHandoff: false,
          planCheckpoint: false,
          reviewCheckpoint: false,
          verificationCheckpoint: false,
          sessionResume: false,
          sourceSwitch: false,
          branchIntegration: false,
        },
        safety: {
          allowConditional: false,
          requireFreshVerification: true,
        },
      },
    }))
    expect(serialized.compressionPresets).toEqual({})
  })

  it("produces the persisted next-config payload before later reconciliation concerns", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "enabled": false,
          "activePreset": "default"
        },
        "presets": {
          "default": {
            "label": "Project",
            "short": "prj",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings: { activePreset: string; enabled: boolean }
    }

    expect(serialized.settings).toEqual({
      activePreset: "default",
      enabled: true,
    })
  })

  it("fails clearly when explicit --config first-write targets a preset that only exists in other sources", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "shared"
        },
        "presets": {
          "shared": {
            "label": "Shared",
            "short": "sha",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "shared"
        },
        "presets": {
          "shared": {
            "label": "Shared Global",
            "short": "glo",
            "profiles": {
              "build": { "model": "anthropic/claude-sonnet-4-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    await expect(
      prepareControlPlaneStateWrite({
        command: "use",
        cwd: "/workspace/project",
        homeDir: "/home/tester",
        explicitPath: "/workspace/project/explicit.jsonc",
        exists: createExists(files),
        readFile: createReadFile(files),
        isWritable: createIsWritable(["/workspace/project/explicit.jsonc"]),
        nextState: {
          activePreset: "shared",
          enabled: true,
        },
      }),
    ).rejects.toThrow(/activePreset.*shared|existing preset/i)
  })

  it("preserves top-level profiles and lanes when preparing a state write", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "defaultLane": "backend",
          "laneSelection": { "mode": "suggest" }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" },
          "review": { "model": "anthropic/claude-sonnet-4-5" }
        },
        "lanes": {
          "backend": {
            "label": "Backend",
            "routes": {},
            "defaultRoute": "build"
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        defaultLane?: string
        laneSelection?: { mode?: string }
      }
      profiles?: Record<string, { model: string }>
      lanes?: Record<string, { label: string; routes: Record<string, string>; defaultRoute: string }>
    }

    expect(serialized.settings).toEqual({
      activePreset: "default",
      enabled: false,
      defaultLane: "backend",
      laneSelection: { mode: "suggest" },
    })
    expect(serialized.profiles).toEqual({
      build: { model: "openai/gpt-5" },
      review: { model: "anthropic/claude-sonnet-4-5" },
    })
    expect(serialized.lanes).toEqual({
      backend: {
        label: "Backend",
        routes: {},
        defaultRoute: "build",
      },
    })
  })

  it("preserves sourcePresets when preparing a state write", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "sourcePresets": {
          "foundation": {
            "routes": {
              "phase.plan": "gstack"
            }
          }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "sourcePreset": "foundation",
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })

    const serialized = parse(result.content) as {
      sourcePresets?: Record<string, { routes: Record<string, string> }>
    }

    expect(serialized.sourcePresets).toEqual({
      foundation: {
        routes: {
          "phase.plan": "gstack",
        },
      },
    })
  })

  it("preserves policyRules when preparing a state write", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "policyRules": [{
          "id": "frontend-verify",
          "selector": {
            "path": ["frontend/**"],
            "lifecycleStage": ["verify"]
          },
          "policy": {
            "modelPolicy": {
              "preferredProfiles": ["vision-review"]
            }
          }
        }],
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })

    const serialized = parse(result.content) as {
      policyRules?: Array<{
        id?: string
        selector?: { path?: string[]; lifecycleStage?: string[] }
        policy?: { modelPolicy?: { preferredProfiles?: string[] } }
      }>
    }

    expect(serialized.policyRules).toEqual([{
      id: "frontend-verify",
      selector: {
        path: ["frontend/**"],
        lifecycleStage: ["verify"],
      },
      policy: {
        modelPolicy: {
          preferredProfiles: ["vision-review"],
        },
      },
    }])
  })

  it("preserves authority and evidence when preparing a state write", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default"
        },
        "authority": {
          "workloadMappings": [{
            "path": ["frontend/**"],
            "workloadTags": ["frontend", "visual"]
          }],
          "policyRules": [{
            "id": "verify-vision",
            "selector": {
              "lifecycleStage": ["verify"]
            },
            "policy": {
              "modelPolicy": {
                "requiredCapabilities": ["vision-input"]
              }
            }
          }]
        },
        "evidence": {
          "detectedPaths": [{
            "path": "frontend/**",
            "suggestedTags": ["frontend", "visual"]
          }],
          "notes": ["Detected likely frontend workload"]
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })

    const serialized = parse(result.content) as {
      authority?: {
        workloadMappings?: Array<{ path?: string[]; workloadTags?: string[] }>
        policyRules?: Array<{
          id?: string
          selector?: { lifecycleStage?: string[] }
          policy?: { modelPolicy?: { requiredCapabilities?: string[] } }
        }>
      }
      evidence?: {
        detectedPaths?: Array<{ path?: string; suggestedTags?: string[] }>
        notes?: string[]
      }
    }

    expect(serialized.authority).toEqual({
      workloadMappings: [{
        path: ["frontend/**"],
        workloadTags: ["frontend", "visual"],
      }],
      policyRules: [{
        id: "verify-vision",
        selector: {
          lifecycleStage: ["verify"],
        },
        policy: {
          modelPolicy: {
            requiredCapabilities: ["vision-input"],
          },
        },
      }],
    })
    expect(serialized.evidence).toEqual({
      detectedPaths: [{
        path: "frontend/**",
        suggestedTags: ["frontend", "visual"],
      }],
      notes: ["Detected likely frontend workload"],
    })
  })

  it("preserves contextCompression settings and compressionPresets when preparing a state write", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "contextCompression": {
            "preset": "balanced",
            "mode": "auto",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true,
              "sessionResume": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "compressionPresets": {
          "balanced": {
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true,
              "branchIntegration": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "profiles": {
          "build": { "model": "openai/gpt-5" }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })

    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        contextCompression?: {
          preset?: string
          mode?: string
          engine?: string
          inlineLevel?: string
          moments?: Record<string, boolean>
          safety?: {
            allowConditional?: boolean
            requireFreshVerification?: boolean
          }
        }
      }
      compressionPresets?: Record<string, {
        mode?: string
        engine?: string
        inlineLevel?: string
        moments?: Record<string, boolean>
        safety?: {
          allowConditional?: boolean
          requireFreshVerification?: boolean
        }
      }>
    }

    expect(serialized.settings).toEqual(expect.objectContaining({
      activePreset: "default",
      enabled: false,
      contextCompression: {
        preset: "balanced",
        mode: "auto",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: {
          subagentHandoff: true,
          sessionResume: true,
        },
        safety: {
          allowConditional: false,
          requireFreshVerification: true,
        },
      },
    }))
    expect(serialized.compressionPresets).toEqual({
      balanced: {
        mode: "suggest",
        engine: "hybrid",
        inlineLevel: "standard",
        moments: {
          subagentHandoff: true,
          branchIntegration: true,
        },
        safety: {
          allowConditional: false,
          requireFreshVerification: true,
        },
      },
    })
  })

  it("preserves a cleared contextCompression preset sentinel when preparing a state write", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "contextCompression": {
            "preset": "balanced",
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "compressionPresets": {
          "balanced": {
            "mode": "suggest",
            "engine": "hybrid",
            "inlineLevel": "standard",
            "moments": {
              "subagentHandoff": true
            },
            "safety": {
              "allowConditional": false,
              "requireFreshVerification": true
            }
          }
        },
        "presets": {
          "default": {
            "label": "Default",
            "short": "def",
            "profiles": {
              "build": { "model": "openai/gpt-5" }
            },
            "routes": {},
            "defaultRoute": "build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "default",
          "contextCompression": {
            "preset": null,
            "mode": "auto"
          }
        },
        "presets": {}
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "disable",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "default",
        enabled: false,
      },
    })

    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        contextCompression?: {
          preset?: string | null
          mode?: string
          engine?: string
          inlineLevel?: string
          moments?: Record<string, boolean>
          safety?: {
            allowConditional?: boolean
            requireFreshVerification?: boolean
          }
        }
      }
    }

    expect(result.config.settings.contextCompression.preset).toBeUndefined()
    expect(serialized.settings).toEqual(expect.objectContaining({
      activePreset: "default",
      enabled: false,
      contextCompression: {
        preset: null,
        mode: "auto",
      },
    }))
  })

  it("clears a persisted settings.defaultLane when switching presets", async () => {
    const files = {
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "frontend",
          "defaultLane": "frontend",
          "laneSelection": { "mode": "suggest" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        },
        "presets": {
          "frontend": {
            "label": "Frontend",
            "short": "fe",
            "usesLanes": ["frontend"],
            "defaultLane": "frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "short": "be",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "backend",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        defaultLane?: string
        laneSelection?: { mode?: string }
      }
    }

    expect(result.config.settings.activePreset).toBe("backend")
    expect(result.config.settings.defaultLane).toBeUndefined()
    expect(serialized.settings).toEqual({
      activePreset: "backend",
      enabled: true,
      defaultLane: null,
      laneSelection: { mode: "suggest" },
    })
  })

  it("writes a null defaultLane sentinel when a stale lane is inherited from a lower-priority layer", async () => {
    const files = {
      "/home/tester/.config/oh-my-superagents/config.jsonc": `{
        "settings": {
          "activePreset": "frontend",
          "defaultLane": "frontend",
          "laneSelection": { "mode": "suggest" }
        },
        "profiles": {
          "frontend-build": { "model": "openai/gpt-5" },
          "backend-build": { "model": "gpt-5.4" }
        },
        "lanes": {
          "frontend": {
            "label": "Frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        },
        "presets": {
          "frontend": {
            "label": "Frontend",
            "short": "fe",
            "usesLanes": ["frontend"],
            "defaultLane": "frontend",
            "routes": {},
            "defaultRoute": "frontend-build"
          },
          "backend": {
            "label": "Backend",
            "short": "be",
            "usesLanes": ["backend"],
            "defaultLane": "backend",
            "routes": {},
            "defaultRoute": "backend-build"
          }
        }
      }`,
      "/workspace/project/oh-my-superagents.config.jsonc": `{
        "settings": {
          "activePreset": "frontend"
        },
        "presets": {}
      }`,
    }

    const result = await prepareControlPlaneStateWrite({
      command: "use",
      cwd: "/workspace/project",
      homeDir: "/home/tester",
      exists: createExists(files),
      readFile: createReadFile(files),
      isWritable: createIsWritable(["/workspace/project/oh-my-superagents.config.jsonc"]),
      nextState: {
        activePreset: "backend",
        enabled: true,
      },
    })
    const serialized = parse(result.content) as {
      settings?: {
        activePreset?: string
        enabled?: boolean
        defaultLane?: string
      }
    }

    expect(result.config.settings.activePreset).toBe("backend")
    expect(result.config.settings.defaultLane).toBeUndefined()
    expect(serialized.settings).toEqual({
      activePreset: "backend",
      enabled: true,
      defaultLane: null,
    })
  })
})

describe("summarizeRoutingValidation", () => {
  it("reports explicit routes, default-routed phases, unused profiles, and invalid missing-parent reuse", () => {
    const summary = summarizeRoutingValidation({
      workflow: { kind: "superpowers" },
      settings: {
        enabled: true,
        activePreset: "child",
        ...defaultControlPlaneSettings,
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      presets: {
        child: {
          label: "Child",
          short: "child",
          extends: "base",
          profiles: {
            build: { model: "openai/gpt-5" },
            strategy: { model: "anthropic/claude-sonnet-4-5" },
            unused: { model: "google/gemini-2.5-pro" },
          },
          routes: {
            brainstorming: "strategy",
          },
          defaultRoute: "build",
        },
      },
      sourcePresets: {},
      compressionPresets: {},
      profiles: {},
      lanes: {},
    }, "child")

    expect(summary.explicitRoutedPhases).toEqual(["brainstorming"])
    expect(summary.defaultRoutedPhases).toContain("requesting-code-review")
    expect(summary.unusedProfiles).toEqual(["unused"])
    expect(summary.reuseRelationship).toEqual({
      kind: "extends",
      parentPresetKey: "base",
      resolvable: false,
    })
  })

  it("reports resolvable reuse when the parent preset exists", () => {
    const summary = summarizeRoutingValidation({
      workflow: { kind: "superpowers" },
      settings: {
        enabled: true,
        activePreset: "child",
        ...defaultControlPlaneSettings,
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      presets: {
        base: {
          label: "Base",
          short: "base",
          profiles: {
            build: { model: "openai/gpt-5" },
          },
          routes: {},
          defaultRoute: "build",
        },
        child: {
          label: "Child",
          short: "child",
          extends: "base",
          profiles: {
            review: { model: "anthropic/claude-sonnet-4-5" },
          },
          routes: {
            brainstorming: "review",
          },
          defaultRoute: "build",
        },
      },
      sourcePresets: {},
      compressionPresets: {},
      profiles: {},
      lanes: {},
    }, "child")

    expect(summary.reuseRelationship).toEqual({
      kind: "extends",
      parentPresetKey: "base",
      resolvable: true,
    })
  })

  it("tracks unused top-level profiles when the preset has no local profiles", () => {
    const summary = summarizeRoutingValidation({
      workflow: { kind: "superpowers" },
      settings: {
        enabled: true,
        activePreset: "default",
        ...defaultControlPlaneSettings,
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      profiles: {
        build: { model: "openai/gpt-5" },
        strategy: { model: "anthropic/claude-sonnet-4-5" },
        unused: { model: "google/gemini-2.5-pro" },
      },
      sourcePresets: {},
      compressionPresets: {},
      lanes: {},
      presets: {
        default: {
          label: "Default",
          short: "def",
          routes: {
            brainstorming: "strategy",
          },
          defaultRoute: "build",
        },
      },
    }, "default")

    expect(summary.unusedProfiles).toEqual(["unused"])
  })

  it("treats lane-only profiles as used during routing validation", () => {
    const summary = summarizeRoutingValidation({
      workflow: { kind: "superpowers" },
      settings: {
        enabled: true,
        activePreset: "default",
        ...defaultControlPlaneSettings,
        commandPrefix: "oms",
        commands: {
          status: { name: "status", aliases: ["st"] },
          use: { name: "use", aliases: ["u"] },
          disable: { name: "off", aliases: ["o"] },
          sync: { name: "sync", aliases: ["sy"] },
          doctor: { name: "doctor", aliases: ["dr"] },
        },
        superpowersCompatibility: { mode: "warn" },
      },
      profiles: {
        build: { model: "openai/gpt-5" },
        "lane-strategy": { model: "anthropic/claude-sonnet-4-5" },
        unused: { model: "google/gemini-2.5-pro" },
      },
      sourcePresets: {},
      compressionPresets: {},
      lanes: {
        frontend: {
          label: "Frontend",
          routes: {
            brainstorming: "lane-strategy",
          },
          defaultRoute: "lane-strategy",
        },
      },
      presets: {
        default: {
          label: "Default",
          short: "def",
          usesLanes: ["frontend"],
          defaultLane: "frontend",
          routes: {},
          defaultRoute: "build",
        },
      },
    }, "default")

    expect(summary.unusedProfiles).toEqual(["unused"])
  })
})

describe("summarizeSubagentExecutionDiagnostics", () => {
  it("reports mode, available lanes, and rendered lane-scoped execute commands", () => {
    const summary = summarizeSubagentExecutionDiagnostics({
      source: {
        kind: "file",
        hasRealSource: true,
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
      },
      config: {
        workflow: { kind: "superpowers" },
        sourcePresets: {},
        compressionPresets: {},
        settings: {
          enabled: true,
          activePreset: "default",
          ...defaultControlPlaneSettings,
          commandPrefix: "oms",
          commands: {
            status: { name: "status", aliases: ["st"] },
            use: { name: "use", aliases: ["u"] },
            disable: { name: "off", aliases: ["o"] },
            sync: { name: "sync", aliases: ["sy"] },
            doctor: { name: "doctor", aliases: ["dr"] },
          },
          superpowersCompatibility: { mode: "warn" },
        },
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        lanes: {
          frontend: { label: "Frontend", routes: {}, defaultRoute: "build" },
          backend: { label: "Backend", routes: {}, defaultRoute: "build" },
        },
        presets: {
          default: {
            label: "Default",
            short: "def",
            usesLanes: ["frontend", "backend"],
            defaultLane: "backend",
            routes: {},
            defaultRoute: "build",
          },
        },
      },
      activePreset: {
        key: "default",
        preset: {
          label: "Default",
          short: "def",
          usesLanes: ["frontend", "backend"],
          defaultLane: "backend",
          routes: {},
          defaultRoute: "build",
        },
      },
      laneState: {
        allowedLanes: ["frontend", "backend"],
        defaultLane: "backend",
        effectiveLane: "backend",
        presetDefaultLane: "backend",
        runtimeLane: undefined,
        mode: "suggest",
      },
      effectiveSources: {},
    })

    expect(summary).toEqual({
      mode: "suggest",
      availableLanes: ["frontend", "backend"],
      commandsByLane: {
        frontend: "sp-execute-frontend",
        backend: "sp-execute-backend",
      },
    })
  })
})

describe("summarizeEffectiveSourceEntries", () => {
  it("returns the full effective route table while preserving canonical route ids", () => {
    const sourceEntries = summarizeEffectiveSourceEntries({
      source: {
        kind: "default",
        hasRealSource: false,
        sources: [],
      },
      config: {
        workflow: { kind: "superpowers" },
        settings: {
          enabled: true,
          activePreset: "default",
          ...defaultControlPlaneSettings,
          commandPrefix: "oms",
          commands: {
            status: { name: "status", aliases: ["st"] },
            use: { name: "use", aliases: ["u"] },
            disable: { name: "off", aliases: ["o"] },
            sync: { name: "sync", aliases: ["sy"] },
            doctor: { name: "doctor", aliases: ["dr"] },
          },
          superpowersCompatibility: { mode: "warn" },
        },
        sourcePresets: {},
        compressionPresets: {},
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        lanes: {},
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
      },
      activePreset: {
        key: "default",
        preset: {
          label: "Default",
          short: "def",
          routes: {},
          defaultRoute: "build",
        },
      },
      laneState: {
        allowedLanes: [],
        defaultLane: undefined,
        effectiveLane: undefined,
        presetDefaultLane: undefined,
        runtimeLane: undefined,
        mode: "suggest",
      },
      effectiveSources: {
        "phase.plan": "gstack",
      },
    })

    expect(sourceEntries).toEqual({
      ...defaultSuperpowersSourceEntries,
      "phase.plan": {
        canonicalRoute: "phase.plan",
        source: "gstack",
        entryName: "plan-eng-review",
      },
    })
  })
})

describe("summarizeEffectiveSourceReadiness", () => {
  it("attaches readiness results to effective source entries", async () => {
    const readiness = await summarizeEffectiveSourceReadiness({
      resolved: {
        source: {
          kind: "file",
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          workflow: { kind: "superpowers" },
          sourcePresets: {},
          compressionPresets: {},
          settings: {
            enabled: true,
            activePreset: "default",
            ...defaultControlPlaneSettings,
            commandPrefix: "oms",
            commands: {
              status: { name: "status", aliases: ["st"] },
              use: { name: "use", aliases: ["u"] },
              disable: { name: "off", aliases: ["o"] },
              sync: { name: "sync", aliases: ["sy"] },
              doctor: { name: "doctor", aliases: ["dr"] },
            },
            superpowersCompatibility: { mode: "warn" },
          },
          profiles: {
            build: { model: "openai/gpt-5" },
          },
          lanes: {},
          presets: {
            default: {
              label: "Default",
              short: "def",
              routes: {},
              defaultRoute: "build",
            },
          },
        },
        activePreset: {
          key: "default",
          preset: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
        laneState: {
          allowedLanes: [],
          defaultLane: undefined,
          effectiveLane: undefined,
          presetDefaultLane: undefined,
          runtimeLane: undefined,
          mode: "suggest",
        },
        effectiveSources: {
          "phase.plan": "gstack",
        },
      },
      evaluateReadiness: async () => ({
        support: {
          supported: true,
        },
        availability: {
          status: "not_detected",
          reason: "No gstack install could be detected.",
        },
        compatibility: null,
      }),
    })

    expect(readiness).toEqual({
      "phase.brainstorm": {
        canonicalRoute: "phase.brainstorm",
        source: "superpowers",
        entryName: "brainstorming",
        readiness: {
          support: {
            supported: true,
          },
          availability: {
            status: "not_detected",
            reason: "No gstack install could be detected.",
          },
          compatibility: null,
        },
      },
      "phase.plan": {
        canonicalRoute: "phase.plan",
        source: "gstack",
        entryName: "plan-eng-review",
        readiness: {
          support: {
            supported: true,
          },
          availability: {
            status: "not_detected",
            reason: "No gstack install could be detected.",
          },
          compatibility: null,
        },
      },
      "phase.execute": {
        canonicalRoute: "phase.execute",
        source: "superpowers",
        entryName: "subagent-driven-development",
        readiness: {
          support: {
            supported: true,
          },
          availability: {
            status: "not_detected",
            reason: "No gstack install could be detected.",
          },
          compatibility: null,
        },
      },
      "phase.review": {
        canonicalRoute: "phase.review",
        source: "superpowers",
        entryName: "requesting-code-review",
        readiness: {
          support: {
            supported: true,
          },
          availability: {
            status: "not_detected",
            reason: "No gstack install could be detected.",
          },
          compatibility: null,
        },
      },
      "phase.verify": {
        canonicalRoute: "phase.verify",
        source: "superpowers",
        entryName: "verification-before-completion",
        readiness: {
          support: {
            supported: true,
          },
          availability: {
            status: "not_detected",
            reason: "No gstack install could be detected.",
          },
          compatibility: null,
        },
      },
      "phase.visual": {
        canonicalRoute: "phase.visual",
        source: "superpowers",
        entryName: "frontend-design",
        readiness: {
          support: {
            supported: true,
          },
          availability: {
            status: "not_detected",
            reason: "No gstack install could be detected.",
          },
          compatibility: null,
        },
      },
      "phase.web-test": {
        canonicalRoute: "phase.web-test",
        source: "superpowers",
        entryName: "webapp-testing",
        readiness: {
          support: {
            supported: true,
          },
          availability: {
            status: "not_detected",
            reason: "No gstack install could be detected.",
          },
          compatibility: null,
        },
      },
    })
  })
})

describe("summarizeSourceToolRoleExplainability", () => {
  it("distinguishes workflow sources from artifact dialects and external capability scope", () => {
    const diagnostics = summarizeSourceToolRoleExplainability({
      source: {
        kind: "default",
        hasRealSource: false,
        sources: [],
      },
      config: {
        workflow: { kind: "superpowers" },
        settings: {
          enabled: true,
          activePreset: "default",
          ...defaultControlPlaneSettings,
          commandPrefix: "oms",
          commands: {
            status: { name: "status", aliases: ["st"] },
            use: { name: "use", aliases: ["u"] },
            disable: { name: "off", aliases: ["o"] },
            sync: { name: "sync", aliases: ["sy"] },
            doctor: { name: "doctor", aliases: ["dr"] },
          },
          superpowersCompatibility: { mode: "warn" },
        },
        sourcePresets: {},
        compressionPresets: {},
        profiles: {
          build: { model: "openai/gpt-5" },
        },
        lanes: {},
        presets: {
          default: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
          },
        },
      },
      activePreset: {
        key: "default",
        preset: {
          label: "Default",
          short: "def",
          routes: {},
          defaultRoute: "build",
        },
      },
      contextIndex: {
        artifacts: [
          {
            kind: "spec",
            path: "openspec/specs/auth/spec.md",
            authority: "authoritative",
            source: "external",
            lifecycleStage: "design",
          },
        ],
        warnings: [],
      },
      laneState: {
        allowedLanes: [],
        defaultLane: undefined,
        effectiveLane: undefined,
        presetDefaultLane: undefined,
        runtimeLane: undefined,
        mode: "suggest",
      },
      effectiveSources: {
        "phase.plan": "gstack",
      },
    })

    expect(diagnostics).toEqual({
      workflowSources: ["superpowers", "gstack"],
      artifactDialects: ["openspec"],
      externalCapabilityScope: {
        included: ["user-installed skills", "plugins", "MCPs", "providers"],
        excluded: ["upstream workflow-internal skills"],
      },
      lines: [
        "Workflow sources: superpowers, gstack",
        "Artifact dialects: openspec",
        "External capability policy targets user-installed skills, plugins, MCPs, and providers only.",
        "Excluded from OMS capability policy: upstream workflow-internal skills.",
      ],
    })
  })
})

describe("buildOpenCodeStatusState", () => {
  it("surfaces supported-but-unavailable effective source readiness when compatibility is absent", () => {
    const state = buildOpenCodeStatusState({
      host: "opencode",
      source: {
        kind: "file",
        hasRealSource: true,
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
      },
      enabled: true,
      compatibility: null,
      effectiveSourceReadiness: {
        "phase.plan": {
          canonicalRoute: "phase.plan",
          source: "superpowers",
          entryName: "writing-plans",
          readiness: {
            support: {
              supported: true,
            },
            availability: {
              status: "not_detected",
              reason: "No superpowers install could be detected.",
            },
            compatibility: {
              status: "not_detected",
              reason: "No superpowers install could be detected.",
            },
          },
        },
      },
      artifactSummary: {
        expected: 0,
        present: [],
        missing: [],
        stale: [],
      },
    })

    expect(state).toEqual({
      code: "upstream_not_detected",
      category: "upstream",
      reason: "No superpowers install could be detected.",
    })
  })

  it("keeps unsupported effective source readiness on the support path instead of reporting unavailability", () => {
    const state = buildOpenCodeStatusState({
      host: "opencode",
      source: {
        kind: "file",
        hasRealSource: true,
        path: "/workspace/project/oh-my-superagents.config.jsonc",
        sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
      },
      enabled: true,
      compatibility: null,
      effectiveSourceReadiness: {
        "phase.plan": {
          canonicalRoute: "phase.plan",
          source: "gstack",
          entryName: "plan-eng-review",
          readiness: {
            support: {
              supported: false,
              reasonCode: "unsupported_host_source_projection",
            },
          },
        },
      },
      artifactSummary: {
        expected: 0,
        present: [],
        missing: [],
        stale: [],
      },
    })

    expect(state).toEqual({
      code: "healthy",
      category: "oms",
      reason: "OMS is enabled and expected OpenCode artifacts are present.",
    })
  })
})

describe("buildControlPlaneExplainTrace", () => {
  it("includes the resolved source and source entry for gstack planning routes", () => {
    const trace = buildControlPlaneExplainTrace({
      cwd: "/workspace/project",
      resolved: {
        source: {
          kind: "file",
          hasRealSource: true,
          path: "/workspace/project/oh-my-superagents.config.jsonc",
          sources: ["/workspace/project/oh-my-superagents.config.jsonc"],
        },
        config: {
          workflow: { kind: "superpowers" },
          sourcePresets: {},
          compressionPresets: {},
          settings: {
            enabled: true,
            activePreset: "default",
            ...defaultControlPlaneSettings,
            commandPrefix: "oms",
            commands: {
              status: { name: "status", aliases: ["st"] },
              use: { name: "use", aliases: ["u"] },
              disable: { name: "off", aliases: ["o"] },
              sync: { name: "sync", aliases: ["sy"] },
              doctor: { name: "doctor", aliases: ["dr"] },
            },
            superpowersCompatibility: { mode: "warn" },
          },
          profiles: {
            build: { model: "openai/gpt-5" },
          },
          lanes: {},
          presets: {
            default: {
              label: "Default",
              short: "def",
              routes: {},
              defaultRoute: "build",
              sourceRoutes: {
                "phase.plan": "gstack",
              },
            },
          },
        },
        activePreset: {
          key: "default",
          preset: {
            label: "Default",
            short: "def",
            routes: {},
            defaultRoute: "build",
            sourceRoutes: {
              "phase.plan": "gstack",
            },
          },
        },
        laneState: {
          allowedLanes: [],
          defaultLane: undefined,
          effectiveLane: undefined,
          presetDefaultLane: undefined,
          runtimeLane: undefined,
          mode: "suggest",
        },
        effectiveSources: {
          "phase.plan": "gstack",
        },
      },
      phase: "writing-plans",
    })

    expect(trace.resolvedSource).toBe("gstack")
    expect(trace.sourceEntry).toEqual({
      canonicalRoute: "phase.plan",
      source: "gstack",
      entryName: "plan-eng-review",
    })
  })
})
