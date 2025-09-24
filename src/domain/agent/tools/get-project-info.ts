// Get Project Info Tool
import { tool } from 'ai';
import { createProjectInfoService, type ProjectInfoService } from '@services/project-info';
import type { ProjectInfo } from '../types';
import { getProjectInfoSchema } from './schemas';

class GetProjectInfoExecutor {
  private projectInfoService: ProjectInfoService;

  constructor() {
    this.projectInfoService = createProjectInfoService();
  }

  private async getProjectInfo(projectId: string): Promise<ProjectInfo> {
    // If using default project ID (sessions disabled), return mock data
    if (projectId != 'cmfr3xr1n0004pe2fob8jas4l') {
      return {
        id: 'default-project-id',
        shopDomain: 'example.myshopify.com',
        shopName: 'Example Store',
        shopEmail: 'admin@example.com',
        shopPlan: 'Basic',
        shopCurrency: 'USD',
        shopCountry: 'US',
        experimentsCount: 0,
        activeExperimentsCount: 0,
        lastDiagnosticsRun: undefined,
      };
    }

    return await this.projectInfoService.getProjectInfo(projectId);
  }

  async execute(input: { projectId?: string }): Promise<ProjectInfo> {
    // Hardcoded project ID for now - will be replaced with request context later
    const projectId = 'cmfr3xr1n0004pe2fob8jas4l';
    console.log(`[PROJECT_INFO] Using hardcoded project ID: ${projectId}`);
    return await this.getProjectInfo(projectId);
  }
}

export function createGetProjectInfoTool() {
  const executor = new GetProjectInfoExecutor();

  return tool({
    description: 'Get detailed information about the current project including Shopify store details and experiment statistics',
    inputSchema: getProjectInfoSchema,
    execute: async (input) => {
      try {
        return await executor.execute(input);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to fetch project information');
      }
    },
  });
}
