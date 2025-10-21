// Types for variant generation
import { z } from 'zod';

// Simplified variant schema - JavaScript handles everything
export const variantSchema = z.object({
    variant_label: z.string().describe('Unique name for this variant'),
    description: z.string().describe('What this variant does'),
    rationale: z.string().describe('Why this will improve conversions'),
    javascript_code: z.string().describe('JavaScript code that implements the variant'),
    target_selector: z.string().describe('Main CSS selector this variant targets'),
    execution_timing: z.enum(['immediate', 'dom_ready']).default('dom_ready').describe('When to run the JavaScript'),
    variant_index: z.number().describe('Index of this variant in the job'),
    job_id: z.string().describe('ID of the job that generated this variant'),
});

// Basic variant schema for UX planning only (no implementation details)
export const basicVariantSchema = z.object({
    variant_label: z.string().describe('Unique name for this variant'),
    description: z.string().describe('Detailed UX description of what this variant does'),
    rationale: z.string().describe('Why this variant will improve conversions'),
    ux_approach: z.string().describe('Specific UX strategy and user interaction design'),
    visual_style: z.string().describe('Visual design approach and styling direction'),
    placement_strategy: z.string().describe('Where and how the variant should be placed on the page'),
    responsive_considerations: z.string().optional().describe('How this variant will work across different screen sizes and devices')
});

export const basicVariantsResponseSchema = z.object({
    variants: basicVariantSchema.array().min(3).max(3).describe('Exactly 3 variant ideas with different approaches')
});

export const variantsResponseSchema = z.object({
    variants: variantSchema.array()
});

// Responsive design validation schema
export const responsiveDesignSchema = z.object({
    mobile_compatibility: z.boolean().describe('Whether the variant works on mobile devices (375px)'),
    tablet_compatibility: z.boolean().describe('Whether the variant works on tablet devices (768px)'),
    desktop_compatibility: z.boolean().describe('Whether the variant works on desktop devices (1920px)'),
    text_wrapping_issues: z.array(z.string()).describe('Any text wrapping or overflow issues identified'),
    touch_target_compliance: z.boolean().describe('Whether touch targets meet 44px minimum requirement'),
    font_scaling_appropriate: z.boolean().describe('Whether font sizes scale appropriately across devices'),
    media_queries_included: z.boolean().describe('Whether responsive media queries are included')
});

export type BasicVariant = z.infer<typeof basicVariantSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type VariantsResponse = z.infer<typeof variantsResponseSchema>;
export type ResponsiveDesign = z.infer<typeof responsiveDesignSchema>;
