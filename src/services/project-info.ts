// Project Information Service
import { ProjectDAL } from '@infra/dal';
import { shopify } from '@infra/external/shopify';
import type { ProjectInfo } from '@domain/agent';

export interface ProjectInfoService {
  getProjectInfo(projectId: string): Promise<ProjectInfo>;
}

export class ProjectInfoServiceImpl implements ProjectInfoService {
  async getProjectInfo(projectId: string): Promise<ProjectInfo> {
    // Get project with relations
    const project = await ProjectDAL.getProjectWithRelations(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Get Shopify store information
    let shopInfo: {
      name?: string;
      email?: string;
      planName?: string;
      currency?: string;
      country?: string;
    } = {};

    try {
      const shopProfile = await shopify.getShopProfileWithEncryptedToken(
        project.shopDomain,
        project.accessTokenEnc
      );
      shopInfo = {
        name: shopProfile.name,
        email: shopProfile.email,
        planName: shopProfile.planName,
        currency: shopProfile.currency,
        country: shopProfile.country,
      };
    } catch (error) {
      console.warn(`[PROJECT_INFO] Failed to fetch Shopify store info for ${project.shopDomain}:`, error);
      // Continue without shop info if API call fails
    }

    // Count experiments by status
    const experimentsCount = project.experiments.length;
    const activeExperimentsCount = project.experiments.filter(
      exp => exp.status === 'RUNNING'
    ).length;

    return {
      id: project.id,
      shopDomain: project.shopDomain,
      shopName: shopInfo.name,
      shopEmail: shopInfo.email,
      shopPlan: shopInfo.planName,
      shopCurrency: shopInfo.currency,
      shopCountry: shopInfo.country,
      experimentsCount,
      activeExperimentsCount,
    };
  }
}

export function createProjectInfoService(): ProjectInfoService {
  return new ProjectInfoServiceImpl();
}
