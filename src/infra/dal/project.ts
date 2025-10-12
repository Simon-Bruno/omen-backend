// Project Data Access Layer
import { prisma } from '@infra/prisma';
import type { Project, ProjectWithRelations } from './types';

export class ProjectDAL {
  /**
   * Get project for a specific user
   */
  static async getProjectForUser(userId: string): Promise<Project | null> {
    return await prisma.project.findUnique({
      where: { userId },
    });
  }

  /**
   * Get project with all relations (experiments, chat messages)
   */
  static async getProjectWithRelations(projectId: string): Promise<ProjectWithRelations | null> {
    return await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        experiments: {
          orderBy: { createdAt: 'desc' },
        },
        chatMessages: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Get project by ID
   */
  static async getProjectById(projectId: string): Promise<Project | null> {
    return await prisma.project.findUnique({
      where: { id: projectId },
    });
  }

  /**
   * Get project by shop domain
   */
  static async getProjectByShopDomain(shopDomain: string): Promise<Project | null> {
    return await prisma.project.findUnique({
      where: { shopDomain },
    });
  }

  /**
   * Create a new project
   */
  static async createProject(data: {
    userId: string;
    shopDomain: string;
    accessTokenEnc: string;
  }): Promise<Project> {
    return await prisma.project.create({
      data,
    });
  }

  /**
   * Update project access token
   */
  static async updateProjectAccessToken(
    projectId: string,
    accessTokenEnc: string
  ): Promise<Project> {
    return await prisma.project.update({
      where: { id: projectId },
      data: { accessTokenEnc },
    });
  }

  /**
   * Update project brand analysis
   */
  static async updateProjectBrandAnalysis(
    projectId: string,
    brandAnalysis: any
  ): Promise<Project> {
    return await prisma.project.update({
      where: { id: projectId },
      data: { brandAnalysis: brandAnalysis },
    });
  }

  /**
   * Get project brand analysis
   */
  static async getProjectBrandAnalysis(
    projectId: string
  ): Promise<string | null> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { brandAnalysis: true },
    });
    const brandAnalysis = JSON.stringify(project?.brandAnalysis) ?? null;
    console.log(`[PROJECT_BRAND_ANALYSIS] Retrieved brand analysis: ${brandAnalysis ? `${brandAnalysis.length} chars` : 'null'}`);
    return brandAnalysis;
  }

  /**
   * Update project design system
   */
  static async updateProjectDesignSystem(
    projectId: string,
    designSystem: any
  ): Promise<Project> {
    return await prisma.project.update({
      where: { id: projectId },
      data: { designSystem: designSystem },
    });
  }

  /**
   * Get project design system
   */
  static async getProjectDesignSystem(
    projectId: string
  ): Promise<any | null> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { designSystem: true },
    });
    console.log(`[PROJECT_DESIGN_SYSTEM] Retrieved design system: ${project?.designSystem ? 'available' : 'null'}`);
    return project?.designSystem ?? null;
  }

  /**
   * Delete project (cascade will handle related records)
   */
  static async deleteProject(projectId: string): Promise<void> {
    await prisma.project.delete({
      where: { id: projectId },
    });
  }

  /**
   * Check if user has a project
   */
  static async userHasProject(userId: string): Promise<boolean> {
    const project = await prisma.project.findUnique({
      where: { userId },
      select: { id: true },
    });
    return project !== null;
  }

  /**
   * Create a brand summary job
   */
  static async createBrandSummaryJob(projectId: string): Promise<{ id: string }> {
    const job = await prisma.brandSummaryJob.create({
      data: {
        projectId,
        status: 'PENDING',
        progress: 0,
      },
    });
    return { id: job.id };
  }

  /**
   * Get brand summary job status
   */
  static async getBrandSummaryJob(jobId: string) {
    return await prisma.brandSummaryJob.findUnique({
      where: { id: jobId },
    });
  }
}
