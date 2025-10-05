/**
 * Zod Schemas for Experiment DSL Validation
 * 
 * Type-safe schema validation using Zod
 */

import { z } from 'zod';

// Base types
export const ExperimentStatusSchema = z.enum(['draft', 'running', 'paused', 'finished']);
export const VariantIdSchema = z.enum(['A', 'B', 'C']);
export const RenderPositionSchema = z.enum(['inner', 'outer', 'before', 'after', 'append', 'prepend']);
export const ApplyModeSchema = z.enum(['first', 'all']);

// Match configuration
export const ExperimentMatchSchema = z.object({
  host: z.string().optional(),
  path: z.string().min(1, 'Path is required')
});

// Traffic distribution with tolerance validation
export const ExperimentTrafficSchema = z.object({
  A: z.number().min(0).max(1),
  B: z.number().min(0).max(1),
  C: z.number().min(0).max(1)
}).refine(
  (traffic) => {
    const sum = traffic.A + traffic.B + traffic.C;
    return Math.abs(sum - 1.0) <= 0.005; // ±0.5% tolerance
  },
  {
    message: 'Traffic distribution must sum to 1.0 (±0.5%)',
    path: ['traffic']
  }
);

// Assignment configuration
export const ExperimentAssignmentSchema = z.object({
  cookieName: z.string()
    .min(1, 'Cookie name is required')
    .max(50, 'Cookie name must be 50 characters or less')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Cookie name must contain only alphanumeric characters, hyphens, and underscores'),
  ttlDays: z.number().positive('TTL must be positive')
});

// Runtime configuration
export const ExperimentRuntimeSchema = z.object({
  minDays: z.number().positive('Minimum days must be positive'),
  minSessionsPerVariant: z.number().positive('Minimum sessions per variant must be positive'),
  endAt: z.string().datetime().optional()
});

// Analytics configuration
export const ExperimentAnalyticsSchema = z.object({
  posthog: z.object({
    enabled: z.boolean(),
    host: z.enum(['app.posthog.com', 'eu.posthog.com', 'us.posthog.com'], {
      message: 'Invalid PostHog host'
    })
  }),
  eventProps: z.array(z.string()).min(1, 'At least one event property is required')
});

// KPI configuration
export const ExperimentKPISchema = z.object({
  primary: z.string().min(1, 'Primary KPI is required'),
  secondary: z.array(z.string()).optional()
});

// Guardrails configuration
export const ExperimentGuardrailsSchema = z.object({
  watch: z.array(z.enum(['lcp', 'js_errors', 'cls'])).optional()
});

// Variant render configuration
export const VariantRenderSchema = z.object({
  position: RenderPositionSchema,
  html: z.string()
    .min(1, 'HTML content is required')
    .max(5 * 1024, 'HTML content exceeds 5KB limit'), // 5KB limit
  css: z.string()
    .max(10 * 1024, 'CSS content exceeds 10KB limit') // 10KB limit
    .optional(),
  oncePerResponse: z.boolean().optional().default(true)
});

// Variant configuration
export const VariantSchema = z.object({
  mode: z.literal('render'),
  render: VariantRenderSchema
});

// Target configuration
export const ExperimentTargetSchema = z.object({
  selector: z.string()
    .min(1, 'Selector is required')
    .refine(
      (selector) => !selector.includes('{') && !selector.includes('}') && !selector.includes(';'),
      'Invalid CSS selector syntax'
    ),
  apply: ApplyModeSchema.default('first'),
  variants: z.record(VariantIdSchema, VariantSchema)
    .refine(
      (variants) => Object.keys(variants).length >= 1,
      'At least one variant is required'
    )
    .refine(
      (variants) => Object.keys(variants).length <= 3,
      'Maximum 3 variants allowed'
    )
});

// Main experiment schema
export const ExperimentDSLSchema = z.object({
  experimentId: z.string().min(1, 'Experiment ID is required'),
  projectId: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Name is required'),
  status: ExperimentStatusSchema,
  match: ExperimentMatchSchema,
  traffic: ExperimentTrafficSchema,
  assignment: ExperimentAssignmentSchema,
  targets: z.array(ExperimentTargetSchema)
    .min(1, 'At least one target is required')
    .max(3, 'Maximum 3 targets allowed'),
  kpi: ExperimentKPISchema,
  runtime: ExperimentRuntimeSchema,
  analytics: ExperimentAnalyticsSchema,
  guardrails: ExperimentGuardrailsSchema.optional()
}).refine(
  (experiment) => {
    // Check total DSL size (100KB limit)
    const dslString = JSON.stringify(experiment);
    const sizeKB = Buffer.byteLength(dslString, 'utf8') / 1024;
    return sizeKB <= 100;
  },
  {
    message: 'DSL exceeds 100KB limit',
    path: ['dsl']
  }
).refine(
  (experiment) => {
    // Check total CSS size across all variants (10KB limit)
    let totalCSSSize = 0;
    for (const target of experiment.targets) {
      for (const variant of Object.values(target.variants)) {
        if (variant.render.css) {
          totalCSSSize += Buffer.byteLength(variant.render.css, 'utf8');
        }
      }
    }
    return totalCSSSize <= 10 * 1024; // 10KB
  },
  {
    message: 'Total CSS size exceeds 10KB limit',
    path: ['css']
  }
);

// Type inference
export type ExperimentDSL = z.infer<typeof ExperimentDSLSchema>;
export type ExperimentMatch = z.infer<typeof ExperimentMatchSchema>;
export type ExperimentTraffic = z.infer<typeof ExperimentTrafficSchema>;
export type ExperimentAssignment = z.infer<typeof ExperimentAssignmentSchema>;
export type ExperimentRuntime = z.infer<typeof ExperimentRuntimeSchema>;
export type ExperimentAnalytics = z.infer<typeof ExperimentAnalyticsSchema>;
export type ExperimentKPI = z.infer<typeof ExperimentKPISchema>;
export type ExperimentGuardrails = z.infer<typeof ExperimentGuardrailsSchema>;
export type VariantRender = z.infer<typeof VariantRenderSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type ExperimentTarget = z.infer<typeof ExperimentTargetSchema>;
