// Types for variant generation
import { z } from 'zod';

// Simplified variant schema - JavaScript handles everything
export const variantSchema = z.object({
    variant_label: z.string().describe('Unique name for this variant'),
    description: z.string().describe('What this variant does'),
    rationale: z.string().describe('Why this will improve conversions'),
    javascript_code: z.string().describe('JavaScript code that implements the variant'),
    target_selector: z.string().describe('Main CSS selector this variant targets'),
    execution_timing: z.enum(['immediate', 'dom_ready']).default('dom_ready').describe('When to run the JavaScript')
});

// Legacy basic variant schema (for backwards compatibility)
export const basicVariantSchema = z.object({
    variant_label: z.string(),
    description: z.string(),
    rationale: z.string(),
    javascript_code: z.string().optional(),
    target_selector: z.string().optional()
});

export const basicVariantsResponseSchema = z.object({
    variants: basicVariantSchema.array()
});

export const variantsResponseSchema = z.object({
    variants: variantSchema.array()
});

export type BasicVariant = z.infer<typeof basicVariantSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type VariantsResponse = z.infer<typeof variantsResponseSchema>;
