// @ts-nocheck 
// Brand Analysis Tool
import { tool } from 'ai';
import { ProjectDAL } from '@infra/dal/project';
import type { BrandIntelligenceData } from '@features/brand_analysis/types';
import { getBrandAnalysisSchema } from './schemas';

class GetBrandAnalysisExecutor {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async execute(input: { projectId?: string }) {
    try {
      console.log(`[BRAND_ANALYSIS] Using project ID: ${this.projectId}`);
      
      // Get brand analysis from database
      const brandAnalysisJson = await ProjectDAL.getProjectBrandAnalysis(this.projectId);

      console.log(`[BRAND_ANALYSIS] Brand analysis JSON: ${brandAnalysisJson}`);
      
      if (!brandAnalysisJson) {
        return {
          success: false,
          error: 'No brand analysis found for this project. Please run a brand analysis first.',
          data: null
        };
      }

      // Parse the JSON data and return it directly for the LLM to interpret
      const brandAnalysis: BrandIntelligenceData = JSON.parse(brandAnalysisJson);
      
      return {
        success: true,
        data: brandAnalysis,
        message: `Here's your brand analysis! Feel free to ask any questions about the insights, or let's start generating experiments to optimize your store.`
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

export function createGetBrandAnalysisTool(projectId: string) {
  const executor = new GetBrandAnalysisExecutor(projectId);

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
