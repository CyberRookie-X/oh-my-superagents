import { z } from "zod"

const CapabilityCatalogStringSchema = z.string().min(1)

const CapabilityCatalogModelSchema = z
  .object({
    tags: z.array(CapabilityCatalogStringSchema).default([]),
    supports: z.array(CapabilityCatalogStringSchema).default([]),
  })
  .strict()

const CapabilityCatalogToolSchema = z
  .object({
    kind: z.enum(["skill", "plugin", "mcp", "provider"]),
    tags: z.array(CapabilityCatalogStringSchema).default([]),
  })
  .strict()

const OnboardingQuestionGraphWriteValueSchema = z.custom<unknown>((value) => value !== undefined)

const OnboardingQuestionGraphWriteSchema = z
  .object({
    path: CapabilityCatalogStringSchema,
    value: OnboardingQuestionGraphWriteValueSchema,
  })
  .strict()

const OnboardingQuestionGraphQuestionSchema = z
  .object({
    id: CapabilityCatalogStringSchema,
    prompt: CapabilityCatalogStringSchema,
    writes: z.array(OnboardingQuestionGraphWriteSchema).default([]),
  })
  .strict()

export const CapabilityCatalogSchema = z
  .object({
    models: z.record(CapabilityCatalogStringSchema, CapabilityCatalogModelSchema).default({}),
    tools: z.record(CapabilityCatalogStringSchema, CapabilityCatalogToolSchema).default({}),
  })
  .strict()

export const OnboardingQuestionGraphSchema = z
  .object({
    version: z.number().int().positive(),
    questions: z.array(OnboardingQuestionGraphQuestionSchema),
  })
  .strict()

export function parseCapabilityCatalog(input: unknown) {
  return CapabilityCatalogSchema.parse(input)
}

export function parseOnboardingQuestionGraph(input: unknown) {
  return OnboardingQuestionGraphSchema.parse(input)
}
