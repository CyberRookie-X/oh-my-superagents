import { z } from "zod"
import { PolicyRuleSchema } from "./config.js"

const OmsInventoryModelSchema = z
  .object({
    model: z.string().min(1),
    capabilities: z.array(z.string().min(1)).default([]),
    maxContextWindow: z.number().int().positive().optional(),
  })
  .strict()

const OmsInventoryToolSchema = z
  .object({
    kind: z.enum(["skill", "plugin", "mcp", "provider"]),
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict()

const OmsWorkloadMappingSchema = z
  .object({
    path: z.array(z.string().min(1)).min(1),
    workloadTags: z.array(z.string().min(1)).min(1),
  })
  .strict()

const OmsDetectedPathSchema = z
  .object({
    path: z.string().min(1),
    suggestedTags: z.array(z.string().min(1)).default([]),
  })
  .strict()

export const OmsInventorySchema = z
  .object({
    models: z.record(z.string().min(1), OmsInventoryModelSchema).default({}),
    tools: z.record(z.string().min(1), OmsInventoryToolSchema).default({}),
  })
  .strict()

export const OmsAuthoritySchema = z
  .object({
    workloadMappings: z.array(OmsWorkloadMappingSchema).default([]),
    policyRules: z.array(PolicyRuleSchema).default([]),
  })
  .strict()

export const OmsEvidenceSchema = z
  .object({
    detectedPaths: z.array(OmsDetectedPathSchema).default([]),
    notes: z.array(z.string().min(1)).default([]),
  })
  .strict()

export type OmsInventoryDocument = z.infer<typeof OmsInventorySchema>
export type OmsAuthorityDocument = z.infer<typeof OmsAuthoritySchema>
export type OmsEvidenceDocument = z.infer<typeof OmsEvidenceSchema>

export function parseOmsInventoryDocument(input: unknown): OmsInventoryDocument {
  return OmsInventorySchema.parse(input)
}

export function parseOmsAuthorityDocument(input: unknown): OmsAuthorityDocument {
  return OmsAuthoritySchema.parse(input)
}

export function parseOmsEvidenceDocument(input: unknown): OmsEvidenceDocument {
  return OmsEvidenceSchema.parse(input)
}
