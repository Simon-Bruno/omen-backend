// Tool schemas and definitions
import { z } from 'zod';

export const getProjectInfoSchema = z.object({
  // Empty object for now, but can be extended with parameters if needed
});

export const toolSchemas = {
  get_project_info: getProjectInfoSchema,
} as const;

export type ToolSchemas = typeof toolSchemas;