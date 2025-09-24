// Tool schemas and definitions
import { z } from 'zod';

export const getProjectInfoSchema = z.object({
  projectId: z.string().optional().describe('The project ID to get information for. If not provided, will use a default project.')
});

export const createHypothesesSchema = z.object({
  projectId: z.string().optional().describe('The project ID to generate hypotheses for (optional, will use default if not provided)'),
  url: z.string().optional().describe('The URL to analyze (optional, defaults to omen-mvp.myshopify.com)')
});

export const toolSchemas = {
  get_project_info: getProjectInfoSchema,
} as const;

export type ToolSchemas = typeof toolSchemas;