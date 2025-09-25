// Brand Analysis Tool
import { tool } from 'ai';
import { ProjectDAL } from '@infra/dal/project';
import type { BrandAnalysisResponse } from '@features/brand_analysis/types';
import { getBrandAnalysisSchema } from './schemas';

class GetBrandAnalysisExecutor {
  async execute(input: { projectId?: string }) {
    try {
      const { projectId } = input;
      
      // Use provided project ID or hardcoded fallback (same pattern as other tools)
      const targetProjectId = projectId || 'cmfr3xr1n0004pe2fob8jas4l';
      console.log(`[BRAND_ANALYSIS] Using project ID: ${targetProjectId}`);
      
      // Get brand analysis from database
      const brandAnalysisJson = await ProjectDAL.getProjectBrandAnalysis(targetProjectId);
      
      if (!brandAnalysisJson) {
        return {
          success: false,
          error: 'No brand analysis found for this project. Please run a brand analysis first.',
          data: null
        };
      }

      // Parse the JSON data and return it directly for the LLM to interpret
      const brandAnalysis: BrandAnalysisResponse = JSON.parse(brandAnalysisJson);
      
      return {
        success: true,
        data: brandAnalysis,
        summary: `Brand analysis retrieved successfully. Contains detailed visual style analysis, brand elements, personality insights, and language/messaging analysis.`
      };
    } catch (error) {
      console.error('Error getting brand analysis:', error);
      return {
        success: false,
        error: `Failed to retrieve brand analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: null
      };
    }
  }
}

export function createGetBrandAnalysisTool() {
  const executor = new GetBrandAnalysisExecutor();

  return tool({
    description: 'Get the brand analysis data for a project. This includes visual style, brand elements, language analysis, and messaging insights.',
    inputSchema: getBrandAnalysisSchema,
    execute: async (input) => {
      try {
        return await executor.execute(input);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to fetch brand analysis');
      }
    },
  });
}
