// @ts-nocheck
// Brand Sources Tool - Get stored page content for reference
import { tool } from 'ai';
import { prisma } from '@infra/prisma';
import { getBrandAnalysisSchema } from './schemas';

class GetBrandSourcesExecutor {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async execute(input: { projectId?: string }) {
    try {
      console.log(`[BRAND_SOURCES] Using project ID: ${this.projectId}`);
      
      // Get screenshots with markdown content from database
      const screenshots = await prisma.screenshot.findMany({
        where: {
          projectId: this.projectId,
          markdownContent: { not: null }
        },
        select: {
          pageType: true,
          url: true,
          markdownContent: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      console.log(`[BRAND_SOURCES] Found ${screenshots.length} screenshots with markdown content`);
      
      if (screenshots.length === 0) {
        return {
          success: false,
          error: 'No page sources found for this project. Please run a brand analysis first.',
          data: null
        };
      }

      // Map to the expected format (markdown only)
      const markdownSources = screenshots.map(screenshot => ({
        pageType: screenshot.pageType,
        url: screenshot.url,
        markdown: screenshot.markdownContent
      }));
      
      return {
        success: true,
        data: markdownSources,
        message: `Retrieved ${markdownSources.length} page markdown sources for reference. Use this content to answer questions about what informed the analysis.`
      };
    } catch (error) {
      console.error('Error getting brand sources:', error);
      return {
        success: false,
        error: `Failed to retrieve brand sources: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: null
      };
    }
  }
}

export function createGetBrandSourcesTool(projectId: string) {
  const executor = new GetBrandSourcesExecutor(projectId);

  return tool({
    description: 'Get the stored page content (HTML/markdown) that was used for brand analysis. Use this to reference specific content when explaining analysis results.',
    inputSchema: getBrandAnalysisSchema,
    execute: async (input) => {
      try {
        return await executor.execute(input);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to fetch brand sources');
      }
    },
  });
}
