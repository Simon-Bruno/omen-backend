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

    // Get store information (only for Shopify stores)
    let shopInfo: {
      name?: string;
      email?: string;
      planName?: string;
      currency?: string;
      country?: string;
    } = {};

    // Only fetch Shopify data if this is a Shopify store
    if (project.isShopify && project.accessTokenEnc) {
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
    } else if (!project.isShopify) {
      // For non-Shopify stores, use generic info
      shopInfo = {
        name: project.shopDomain, // Use domain as name for non-Shopify stores
        // Other fields remain undefined for non-Shopify stores
      };
    }

    // Count experiments by status
    const experimentsCount = project.experiments.length;
    const activeExperimentsCount = project.experiments.filter(
      exp => exp.status === 'RUNNING'
    ).length;

    return {
      id: project.id,
      shopDomain: project.shopDomain,
      isShopify: project.isShopify,
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
