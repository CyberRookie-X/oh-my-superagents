import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { parseCapabilityCatalog, parseOnboardingQuestionGraph } from "../src/docs-catalog.ts"

type CapabilityCatalog = ReturnType<typeof parseCapabilityCatalog>
type OnboardingQuestionGraph = ReturnType<typeof parseOnboardingQuestionGraph>

type JsonSchema = {
  title?: string
  properties?: Record<string, unknown>
  $defs?: Record<string, unknown>
  required?: Array<string>
}

const repoRootUrl = new URL("../", import.meta.url)
const capabilityCatalogUrl = new URL("../catalogs/oms-capabilities.json", import.meta.url)
const onboardingQuestionGraphUrl = new URL("../catalogs/oms-onboarding-question-graph.json", import.meta.url)
const capabilitySchemaUrl = new URL("../schemas/oms-capability-catalog.schema.json", import.meta.url)
const onboardingSchemaUrl = new URL("../schemas/oms-onboarding-question-graph.schema.json", import.meta.url)
const aiDocsUrl = new URL("../docs/ai/", import.meta.url)

async function readJson<T>(fileUrl: URL) {
  return JSON.parse(await readFile(fileUrl, "utf8")) as T
}

function formatList(values: Array<string>) {
  return values.length > 0 ? values.join(", ") : "none"
}

function formatJson(value: unknown) {
  return JSON.stringify(value)
}

function renderSchemaSummary(label: string, path: string, schema: JsonSchema) {
  return [
    `## ${label}`,
    `- Source: \`${path}\``,
    `- Title: ${schema.title ?? "untitled"}`,
    `- Required top-level fields: ${formatList(schema.required ?? [])}`,
    `- Top-level properties: ${formatList(Object.keys(schema.properties ?? {}))}`,
    `- Definitions: ${formatList(Object.keys(schema.$defs ?? {}))}`,
  ]
}

function resolveOutputDirectory() {
  const configuredOutputDirectory = process.env.OMS_AI_DOCS_OUTPUT_DIR

  return configuredOutputDirectory ? path.resolve(configuredOutputDirectory) : aiDocsUrl
}

function resolveOutputFile(outputDirectory: string | URL, fileName: string) {
  return typeof outputDirectory === "string"
    ? path.join(outputDirectory, fileName)
    : new URL(fileName, outputDirectory)
}

function renderCapabilityCatalog(capabilityCatalog: CapabilityCatalog, capabilitySchema: JsonSchema) {
  const modelIds = Object.keys(capabilityCatalog.models).sort()
  const toolIds = Object.keys(capabilityCatalog.tools).sort()
  const lines = [
    "# OMS Capability Catalog",
    "",
    "Generated from `catalogs/oms-capabilities.json` and `schemas/oms-capability-catalog.schema.json`. Treat the catalog and schema as the authoritative sources.",
    "",
    `This digest summarizes ${modelIds.length} model entries and ${toolIds.length} tool entries.`,
    "",
    ...renderSchemaSummary(
      "Contract",
      "schemas/oms-capability-catalog.schema.json",
      capabilitySchema,
    ),
    "",
    "## Models",
    "",
  ]

  for (const modelId of modelIds) {
    const model = capabilityCatalog.models[modelId]
    lines.push(
      `### ${modelId}`,
      `- Tags: ${formatList(model.tags)}`,
      `- Supports: ${formatList(model.supports)}`,
      "",
    )
  }

  lines.push("## Tools", "")

  for (const toolId of toolIds) {
    const tool = capabilityCatalog.tools[toolId]
    lines.push(
      `### ${toolId}`,
      `- Kind: ${tool.kind}`,
      `- Tags: ${formatList(tool.tags)}`,
      "",
    )
  }

  return `${lines.join("\n").trimEnd()}\n`
}

function renderWriteBlock(
  heading: string,
  writes: Array<{
    path: string
    value: unknown
  }>,
) {
  if (writes.length === 0) {
    return [`#### ${heading}`, "- none"]
  }

  return [
    `#### ${heading}`,
    ...writes.map((write) => `- \`${write.path}\` => \`${formatJson(write.value)}\``),
  ]
}

function renderPlaybooks(questionGraph: OnboardingQuestionGraph, onboardingSchema: JsonSchema) {
  const lines = [
    "# OMS Onboarding Playbooks",
    "",
    "Generated from `catalogs/oms-onboarding-question-graph.json` and `schemas/oms-onboarding-question-graph.schema.json`. Treat the question graph and schema as the authoritative sources.",
    "",
    `This digest summarizes question graph version ${questionGraph.version} with ${questionGraph.questions.length} onboarding prompts.`,
    "",
    ...renderSchemaSummary(
      "Contract",
      "schemas/oms-onboarding-question-graph.schema.json",
      onboardingSchema,
    ),
    "",
    "## Playbooks",
    "",
  ]

  for (const question of questionGraph.questions) {
    const idWrites = question.writes.filter((write) => write.path.endsWith(".id"))
    const selectorWrites = question.writes.filter((write) => write.path.includes(".selector"))
    const policyWrites = question.writes.filter((write) => write.path.includes(".policy."))
    const otherWrites = question.writes.filter((write) => (
      !idWrites.includes(write) &&
      !selectorWrites.includes(write) &&
      !policyWrites.includes(write)
    ))

    lines.push(
      `### ${question.id}`,
      `- Prompt: ${question.prompt}`,
      `- Total writes: ${question.writes.length}`,
      "",
      ...renderWriteBlock("Rule IDs", idWrites),
      "",
      ...renderWriteBlock("Selector Writes", selectorWrites),
      "",
      ...renderWriteBlock("Policy Writes", policyWrites),
      "",
      ...renderWriteBlock("Other Writes", otherWrites),
      "",
    )
  }

  return `${lines.join("\n").trimEnd()}\n`
}

function buildShortLlmIndex(capabilityCatalog: CapabilityCatalog, questionGraph: OnboardingQuestionGraph) {
  return [
    "# OMS AI Docs Index",
    "",
    "Generated from stable OMS catalogs and schemas. Use the JSON catalogs and schemas as the source of truth.",
    "",
    `- docs/ai/oms-capability-catalog.md: digest of ${Object.keys(capabilityCatalog.models).length} models and ${Object.keys(capabilityCatalog.tools).length} tools.`,
    `- docs/ai/oms-onboarding-playbooks.md: digest of onboarding question graph version ${questionGraph.version} with ${questionGraph.questions.length} prompts.`,
    "- catalogs/oms-capabilities.json: authoritative machine-readable capability catalog.",
    "- catalogs/oms-onboarding-question-graph.json: authoritative machine-readable onboarding question graph.",
    "- schemas/oms-capability-catalog.schema.json: capability catalog contract.",
    "- schemas/oms-onboarding-question-graph.schema.json: onboarding question graph contract.",
  ].join("\n") + "\n"
}

function buildFullLlmReference(
  capabilityCatalog: CapabilityCatalog,
  questionGraph: OnboardingQuestionGraph,
  capabilitySchema: JsonSchema,
  onboardingSchema: JsonSchema,
) {
  const lines = [
    "# OMS Full AI Reference",
    "",
    "Generated from stable OMS catalogs and schemas. Use the JSON catalogs and schemas as the source of truth.",
    "",
    ...renderSchemaSummary(
      "Capability Catalog Contract",
      "schemas/oms-capability-catalog.schema.json",
      capabilitySchema,
    ),
    "",
    ...renderSchemaSummary(
      "Onboarding Question Graph Contract",
      "schemas/oms-onboarding-question-graph.schema.json",
      onboardingSchema,
    ),
    "",
    "## Capability Models",
    ...Object.keys(capabilityCatalog.models)
      .sort()
      .flatMap((modelId) => {
        const model = capabilityCatalog.models[modelId]

        return [
          `- ${modelId}: tags=${formatList(model.tags)}; supports=${formatList(model.supports)}`,
        ]
      }),
    "",
    "## Capability Tools",
    ...Object.keys(capabilityCatalog.tools)
      .sort()
      .flatMap((toolId) => {
        const tool = capabilityCatalog.tools[toolId]

        return [`- ${toolId}: kind=${tool.kind}; tags=${formatList(tool.tags)}`]
      }),
    "",
    "## Onboarding Questions",
  ]

  for (const question of questionGraph.questions) {
    lines.push(`### ${question.id}`, question.prompt)

    for (const write of question.writes) {
      lines.push(`- ${write.path} => ${formatJson(write.value)}`)
    }

    lines.push("")
  }

  return `${lines.join("\n").trimEnd()}\n`
}

async function main() {
  const capabilityCatalog = parseCapabilityCatalog(await readJson(capabilityCatalogUrl))
  const questionGraph = parseOnboardingQuestionGraph(await readJson(onboardingQuestionGraphUrl))
  const capabilitySchema = await readJson<JsonSchema>(capabilitySchemaUrl)
  const onboardingSchema = await readJson<JsonSchema>(onboardingSchemaUrl)
  const outputDirectory = resolveOutputDirectory()

  await mkdir(outputDirectory, { recursive: true })
  await writeFile(
    resolveOutputFile(outputDirectory, "oms-capability-catalog.md"),
    renderCapabilityCatalog(capabilityCatalog, capabilitySchema),
  )
  await writeFile(
    resolveOutputFile(outputDirectory, "oms-onboarding-playbooks.md"),
    renderPlaybooks(questionGraph, onboardingSchema),
  )
  await writeFile(
    resolveOutputFile(outputDirectory, "llms.txt"),
    buildShortLlmIndex(capabilityCatalog, questionGraph),
  )
  await writeFile(
    resolveOutputFile(outputDirectory, "llms-full.txt"),
    buildFullLlmReference(capabilityCatalog, questionGraph, capabilitySchema, onboardingSchema),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
