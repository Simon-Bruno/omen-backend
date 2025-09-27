// @ts-nocheck 
// Get Project Info Tool
import { tool } from 'ai';
import { createProjectInfoService, type ProjectInfoService } from '@services/project-info';
import type { ProjectInfo } from '../types';
import { getProjectInfoSchema } from './schemas';

class GetProjectInfoExecutor {
  private projectInfoService: ProjectInfoService;
  private projectId: string;

  constructor(projectId: string) {
    this.projectInfoService = createProjectInfoService();
    this.projectId = projectId;
  }

  private async getProjectInfo(projectId: string): Promise<ProjectInfo> {
    return await this.projectInfoService.getProjectInfo(projectId);
  }

  async execute(input: { projectId?: string }): Promise<ProjectInfo> {
    console.log(`[PROJECT_INFO] Using project ID: ${this.projectId}`);
    return await this.getProjectInfo(this.projectId);
  }
}

export function createGetProjectInfoTool(projectId: string) {
  const executor = new GetProjectInfoExecutor(projectId);

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
