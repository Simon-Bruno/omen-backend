// Tool schemas and definitions
import { z } from 'zod';

export const getProjectInfoSchema = z.object({
  projectId: z.string().optional().describe('The project ID to get information for. If not provided, will use a default project.')
});

export const createHypothesesSchema = z.object({
  projectId: z.string().optional().describe('The project ID to generate hypotheses for (optional, will use default if not provided)'),
  url: z.string().optional().describe('The URL to analyze (optional, defaults to omen-mvp.myshopify.com)')
});

export const createVariantsSchema = z.object({
  hypothesis: z.object({
    hypothesis: z.string().describe('The hypothesis statement to test'),
    rationale: z.string().describe('The rationale behind the hypothesis'),
    measurable_tests: z.string().describe('What can be measured to test this hypothesis'),
    success_metrics: z.string().describe('The success metrics for this hypothesis'),
    oec: z.string().describe('The Overall Evaluation Criterion (OEC)'),
    accessibility_check: z.string().describe('Accessibility considerations for this hypothesis')
  }).optional().describe('The hypothesis object to generate variants for - if not provided, will use the most recently generated hypothesis from state')
});

export const getBrandAnalysisSchema = z.object({
  projectId: z.string().optional().describe('The project ID to get brand analysis for. If not provided, will use the current project.')
});

export const toolSchemas = {
  get_project_info: getProjectInfoSchema,
  generate_hypotheses: createHypothesesSchema,
  generate_variants: createVariantsSchema,
  get_brand_analysis: getBrandAnalysisSchema,
} as const;

export type ToolSchemas = typeof toolSchemas;