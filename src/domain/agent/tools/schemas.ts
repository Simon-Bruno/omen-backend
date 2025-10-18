// @ts-nocheck 
// Tool schemas and definitions
import { z } from 'zod';

export const getProjectInfoSchema = z.object({
  projectId: z.string().optional().describe('The project ID to get information for. If not provided, will use a default project.')
});

export const createHypothesesSchema = z.object({
  projectId: z.string().optional().describe('The project ID to generate hypotheses for (optional, will use default if not provided)'),
  url: z.string().optional().describe('The URL to analyze (optional, defaults to the project\'s website URL)'),
  userInput: z.string().optional().describe('Optional user-provided hypothesis idea or direction. When provided, the AI will use this as the primary direction and refine it into a proper hypothesis.'),
  pageType: z.string().optional().describe('The page type to analyze (e.g., "PDP", "homepage", "collection"). When provided, the system will automatically select the appropriate URL from the brand analysis data.')
});

export const createVariantsSchema = z.object({
  hypothesis: z.object({
    title: z.string().describe('The hypothesis title'),
    description: z.string().describe('The hypothesis description'),
    primary_outcome: z.string().describe('The primary outcome metric'),
    current_problem: z.string().describe('The current problem being addressed'),
    why_it_works: z.array(z.object({
      reason: z.string()
    })).describe('Reasons why this hypothesis should work'),
    baseline_performance: z.number().describe('Current baseline performance as percentage'),
    predicted_lift_range: z.object({
      min: z.number(),
      max: z.number()
    }).describe('Predicted lift range as decimals')
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