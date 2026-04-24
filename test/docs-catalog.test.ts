import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parseOmsAuthorityDocument } from "../src/authority-config.js"
import { parseCapabilityCatalog, parseOnboardingQuestionGraph } from "../src/docs-catalog.js"

function tokenizeWritePath(path: string) {
  const tokens: Array<string | number> = []

  for (const segment of path.split(".")) {
    for (const match of segment.matchAll(/([^\[\]]+)|\[(\d+)\]/g)) {
      if (match[1]) {
        tokens.push(match[1])
        continue
      }

      tokens.push(Number(match[2]))
    }
  }

  return tokens
}

function applyWrite(target: Record<string, unknown>, path: string, value: unknown) {
  const tokens = tokenizeWritePath(path)
  let cursor: unknown = target

  for (let index = 0; index < tokens.length - 1; index++) {
    const token = tokens[index]
    const nextToken = tokens[index + 1]

    if (typeof token === "number") {
      const arrayCursor = cursor as Array<unknown>

      if (arrayCursor[token] === undefined) {
        arrayCursor[token] = typeof nextToken === "number" ? [] : {}
      }

      cursor = arrayCursor[token]
      continue
    }

    const recordCursor = cursor as Record<string, unknown>

    if (recordCursor[token] === undefined) {
      recordCursor[token] = typeof nextToken === "number" ? [] : {}
    }

    cursor = recordCursor[token]
  }

  const lastToken = tokens[tokens.length - 1]

  if (typeof lastToken === "number") {
    (cursor as Array<unknown>)[lastToken] = value
    return
  }

  ;(cursor as Record<string, unknown>)[lastToken] = value
}

function compactSparseArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== undefined).map((entry) => compactSparseArrays(entry))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, compactSparseArrays(entry)]),
    )
  }

  return value
}

function normalizePolicyRules(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value
  }

  const record = value as Record<string, unknown>

  if (Array.isArray(value)) {
    return value.map(normalizePolicyRules)
  }

  const normalized: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(record)) {
    if (key === "policyRules" && entry && typeof entry === "object" && !Array.isArray(entry)) {
      normalized[key] = Object.values(entry as Record<string, unknown>)
      continue
    }

    normalized[key] = normalizePolicyRules(entry)
  }

  return normalized
}

function materializeAuthorityFragment(
  writes: Array<{
    path: string
    value: unknown
  }>,
) {
  const authorityFragment: Record<string, unknown> = {}

  for (const write of writes) {
    applyWrite(authorityFragment, write.path, write.value)
  }

  return parseOmsAuthorityDocument(normalizePolicyRules(compactSparseArrays(authorityFragment)))
}

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

  it("accepts the shipped capability catalog artifact", () => {
    const parsed = parseCapabilityCatalog(
      JSON.parse(readFileSync(new URL("../catalogs/oms-capabilities.json", import.meta.url), "utf8")),
    )

    expect(parsed).toMatchObject({
      models: {
        "backend-text": {
          supports: ["text", "code"],
        },
      },
      tools: {
        playwright: {
          kind: "mcp",
        },
      },
    })
  })

  it("ships a schema artifact with the expected capability catalog contract", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../schemas/oms-capability-catalog.schema.json", import.meta.url), "utf8"),
    )

    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      properties: {
        models: {
          type: "object",
          propertyNames: {
            minLength: 1,
          },
        },
        tools: {
          type: "object",
          propertyNames: {
            minLength: 1,
          },
        },
      },
      $defs: {
        model: {
          properties: {
            tags: {
              items: {
                minLength: 1,
              },
            },
            supports: {
              items: {
                minLength: 1,
              },
            },
          },
        },
        tool: {
          required: ["kind"],
          properties: {
            kind: {
              enum: ["skill", "plugin", "mcp", "provider"],
            },
            tags: {
              items: {
                minLength: 1,
              },
            },
          },
        },
      },
    })
  })

  it("defaults missing top-level collections to empty records", () => {
    expect(parseCapabilityCatalog({})).toEqual({
      models: {},
      tools: {},
    })
  })

  it("defaults missing nested model collections to empty arrays", () => {
    expect(parseCapabilityCatalog({
      models: {
        "backend-text": {},
      },
    })).toEqual({
      models: {
        "backend-text": {
          tags: [],
          supports: [],
        },
      },
      tools: {},
    })
  })

  it("defaults missing nested tool tags to an empty array", () => {
    expect(parseCapabilityCatalog({
      tools: {
        playwright: {
          kind: "mcp",
        },
      },
    })).toEqual({
      models: {},
      tools: {
        playwright: {
          kind: "mcp",
          tags: [],
        },
      },
    })
  })

  it("rejects an empty model id", () => {
    expect(() => parseCapabilityCatalog({
      models: {
        "": {
          tags: ["review"],
          supports: ["text"],
        },
      },
    })).toThrow()
  })

  it("rejects an empty tool id", () => {
    expect(() => parseCapabilityCatalog({
      tools: {
        "": {
          kind: "mcp",
          tags: ["browser"],
        },
      },
    })).toThrow()
  })

  it("rejects empty strings in tags", () => {
    expect(() => parseCapabilityCatalog({
      models: {
        "vision-review": {
          tags: ["", "review"],
          supports: ["vision-input"],
        },
      },
    })).toThrow()
  })

  it("rejects empty strings in supports", () => {
    expect(() => parseCapabilityCatalog({
      models: {
        "vision-review": {
          tags: ["review"],
          supports: ["", "vision-input"],
        },
      },
    })).toThrow()
  })
})

describe("parseOnboardingQuestionGraph", () => {
  it("parses onboarding question graph nodes with config patch targets", () => {
    const parsed = parseOnboardingQuestionGraph({
      version: 1,
      questions: [
        {
          id: "frontend-vision",
          prompt: "Do verify flows need screenshots or visual review?",
          writes: [
            {
              path: "policyRules[0].policy.modelPolicy.requiredCapabilities",
              value: ["vision-input"],
            },
          ],
        },
      ],
    })

    expect(parsed.questions[0].id).toBe("frontend-vision")
  })

  it("accepts the shipped onboarding question graph artifact", () => {
    const parsed = parseOnboardingQuestionGraph(
      JSON.parse(
        readFileSync(new URL("../catalogs/oms-onboarding-question-graph.json", import.meta.url), "utf8"),
      ),
    )

    expect(parsed.version).toBe(1)
    expect(parsed.questions).toHaveLength(4)
    expect(parsed.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "frontend-visual-verification",
        writes: expect.arrayContaining([
          expect.objectContaining({
            path: "policyRules.visual-verification",
            value: expect.objectContaining({
              id: "visual-verification",
              selector: expect.objectContaining({
                lifecycleStage: ["verify"],
                workloadTags: ["frontend"],
              }),
              policy: expect.objectContaining({
                modelPolicy: expect.objectContaining({
                  requiredCapabilities: ["vision-input"],
                }),
              }),
            }),
          }),
        ]),
      }),
      expect.objectContaining({
        id: "subagent-packet-first",
      }),
      expect.objectContaining({
        id: "review-vs-build-workload",
      }),
      expect.objectContaining({
        id: "browser-external-tools",
      }),
    ]))
  })

  it("ships the browser-tools question with selector and tool policy writes", () => {
    const parsed = parseOnboardingQuestionGraph(
      JSON.parse(
        readFileSync(new URL("../catalogs/oms-onboarding-question-graph.json", import.meta.url), "utf8"),
      ),
    )

    const browserToolsQuestion = parsed.questions.find((question) => question.id === "browser-external-tools")
    const selectorWrite = browserToolsQuestion?.writes.find((write) => write.path === "policyRules.browser-tools")

    expect(browserToolsQuestion).toBeDefined()
    expect(selectorWrite).toEqual({
      path: "policyRules.browser-tools",
      value: expect.objectContaining({
        id: "browser-tools",
        selector: expect.objectContaining({
          workloadTags: ["browser"],
        }),
        policy: expect.objectContaining({
          modelPolicy: expect.objectContaining({
            requiredCapabilities: ["browser"],
          }),
        }),
      }),
    })
  })

  it("ships a schema artifact with the expected onboarding question graph contract", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../schemas/oms-onboarding-question-graph.schema.json", import.meta.url), "utf8"),
    )

    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["version", "questions"],
      properties: {
        version: {
          type: "integer",
          minimum: 1,
        },
        questions: {
          type: "array",
          items: {
            $ref: "#/$defs/question",
          },
        },
      },
      $defs: {
        question: {
          required: ["id", "prompt"],
          properties: {
            id: {
              minLength: 1,
            },
            prompt: {
              minLength: 1,
            },
            writes: {
              default: [],
              items: {
                $ref: "#/$defs/write",
              },
            },
          },
        },
        write: {
          required: ["path", "value"],
          properties: {
            path: {
              minLength: 1,
            },
            value: true,
          },
        },
      },
    })
  })

  it("defaults missing writes to an empty array", () => {
    expect(parseOnboardingQuestionGraph({
      version: 1,
      questions: [
        {
          id: "frontend-vision",
          prompt: "Do verify flows need screenshots or visual review?",
        },
      ],
    })).toEqual({
      version: 1,
      questions: [
        {
          id: "frontend-vision",
          prompt: "Do verify flows need screenshots or visual review?",
          writes: [],
        },
      ],
    })
  })

  it("rejects a non-positive version", () => {
    expect(() => parseOnboardingQuestionGraph({
      version: 0,
      questions: [],
    })).toThrow()
  })

  it("rejects an empty question id", () => {
    expect(() => parseOnboardingQuestionGraph({
      version: 1,
      questions: [
        {
          id: "",
          prompt: "Do verify flows need screenshots or visual review?",
        },
      ],
    })).toThrow()
  })

  it("rejects an empty question prompt", () => {
    expect(() => parseOnboardingQuestionGraph({
      version: 1,
      questions: [
        {
          id: "frontend-vision",
          prompt: "",
        },
      ],
    })).toThrow()
  })

  it("rejects an empty write path", () => {
    expect(() => parseOnboardingQuestionGraph({
      version: 1,
      questions: [
        {
          id: "frontend-vision",
          prompt: "Do verify flows need screenshots or visual review?",
          writes: [
            {
              path: "",
              value: ["vision-input"],
            },
          ],
        },
      ],
    })).toThrow()
  })

  it("rejects a write missing value", () => {
    expect(() => parseOnboardingQuestionGraph({
      version: 1,
      questions: [
        {
          id: "frontend-vision",
          prompt: "Do verify flows need screenshots or visual review?",
          writes: [
            {
              path: "policyRules[0].selector",
            },
          ],
        },
      ],
    })).toThrow()
  })

  it("materializes each shipped question into a valid authority fragment", () => {
    const parsed = parseOnboardingQuestionGraph(
      JSON.parse(
        readFileSync(new URL("../catalogs/oms-onboarding-question-graph.json", import.meta.url), "utf8"),
      ),
    )

    for (const question of parsed.questions) {
      const fragment = materializeAuthorityFragment(question.writes)
      expect(fragment.policyRules).toHaveLength(1)
      expect(fragment.policyRules[0]).toMatchObject({
        id: expect.any(String),
        selector: expect.any(Object),
        policy: expect.any(Object),
      })
    }
  })

  it("composes the full shipped question graph into distinct authority policy rules", () => {
    const parsed = parseOnboardingQuestionGraph(
      JSON.parse(
        readFileSync(new URL("../catalogs/oms-onboarding-question-graph.json", import.meta.url), "utf8"),
      ),
    )

    const authority = materializeAuthorityFragment(parsed.questions.flatMap((question) => question.writes))

    expect(authority.policyRules.map((rule) => rule.id).sort()).toEqual([
      "browser-tools",
      "packet-first",
      "review-heavy",
      "visual-verification",
    ])
  })
})

describe("published docs catalogs", () => {
  it("includes the shipped capability and onboarding catalogs in npm pack output", () => {
    const packOutput = execFileSync("npm", ["pack", "--json", "--dry-run"], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
    })
    const packedFiles = (JSON.parse(packOutput) as Array<{ files: Array<{ path: string }> }>)[0].files.map(
      (entry) => entry.path,
    )

    expect(packedFiles).toEqual(expect.arrayContaining([
      "catalogs/oms-capabilities.json",
      "catalogs/oms-onboarding-question-graph.json",
    ]))
  })

  it("exports shipped Task 1 and Task 2 catalogs and schemas from the package surface", () => {
    const importOutput = execFileSync(
      "node",
      [
        "--input-type=module",
        "--eval",
        `const [capabilityCatalog, onboardingCatalog, capabilitySchema, onboardingSchema] = await Promise.all([
          import("oh-my-superagents/catalogs/oms-capabilities.json", { with: { type: "json" } }),
          import("oh-my-superagents/catalogs/oms-onboarding-question-graph.json", { with: { type: "json" } }),
          import("oh-my-superagents/schemas/oms-capability-catalog.schema.json", { with: { type: "json" } }),
          import("oh-my-superagents/schemas/oms-onboarding-question-graph.schema.json", { with: { type: "json" } }),
        ])
        process.stdout.write(JSON.stringify({
          capabilityCatalogModelIds: Object.keys(capabilityCatalog.default.models),
          onboardingQuestionIds: onboardingCatalog.default.questions.map((question) => question.id),
          capabilitySchemaTitle: capabilitySchema.default.title,
          onboardingSchemaTitle: onboardingSchema.default.title,
        }))`,
      ],
      {
        cwd: new URL("../", import.meta.url),
        encoding: "utf8",
      },
    )

    expect(JSON.parse(importOutput)).toMatchObject({
      capabilityCatalogModelIds: ["backend-text", "vision-review", "fast-iteration", "planning-heavy", "multimodal-analysis"],
      onboardingQuestionIds: [
        "frontend-visual-verification",
        "subagent-packet-first",
        "review-vs-build-workload",
        "browser-external-tools",
      ],
      capabilitySchemaTitle: "OMS Capability Catalog",
      onboardingSchemaTitle: "OMS Onboarding Question Graph",
    })
  })
})
