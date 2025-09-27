// Experiment Data Access Layer
import { prisma } from '@infra/prisma';
import type { Experiment, ExperimentWithProject, CreateExperimentData, UpdateExperimentStatusData } from './types';

export class ExperimentDAL {
  /**
   * Create a new experiment
   */
  static async createExperiment(data: CreateExperimentData): Promise<Experiment> {
    return await prisma.experiment.create({
      data,
    });
  }

  /**
   * Get experiment by ID
   */
  static async getExperimentById(experimentId: string): Promise<Experiment | null> {
    return await prisma.experiment.findUnique({
      where: { id: experimentId },
    });
  }

  /**
   * Get experiment with project details
   */
  static async getExperimentWithProject(experimentId: string): Promise<ExperimentWithProject | null> {
    return await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        project: true,
      },
    });
  }

  /**
   * Get all experiments for a project
   */
  static async getExperimentsByProject(projectId: string): Promise<Experiment[]> {
    return await prisma.experiment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get experiments by project and status
   */
  static async getExperimentsByProjectAndStatus(
    projectId: string,
    status: string
  ): Promise<Experiment[]> {
    return await prisma.experiment.findMany({
      where: {
        projectId,
        status: status as any, // Type assertion for enum
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update experiment status and related timestamps
   */
  static async updateStatus(data: UpdateExperimentStatusData): Promise<Experiment> {
    const updateData: any = {
      status: data.status,
    };

    // Set publishedAt when transitioning to RUNNING
    if (data.status === 'RUNNING' && data.publishedAt) {
      updateData.publishedAt = data.publishedAt;
    }

    // Set finishedAt when transitioning to COMPLETED
    if (data.status === 'COMPLETED' && data.finishedAt) {
      updateData.finishedAt = data.finishedAt;
    }

    return await prisma.experiment.update({
      where: { id: data.experimentId },
      data: updateData,
    });
  }


  /**
   * Update experiment name
   */
  static async updateExperimentName(
    experimentId: string,
    name: string
  ): Promise<Experiment> {
    return await prisma.experiment.update({
      where: { id: experimentId },
      data: { name },
    });
  }

  /**
   * Delete experiment
   */
  static async deleteExperiment(experimentId: string): Promise<void> {
    await prisma.experiment.delete({
      where: { id: experimentId },
    });
  }

  /**
   * Get experiment count for a project
   */
  static async getExperimentCount(projectId: string): Promise<number> {
    return await prisma.experiment.count({
      where: { projectId },
    });
  }

  /**
   * Get experiments by status across all projects (admin function)
   */
  static async getExperimentsByStatus(status: string): Promise<Experiment[]> {
    return await prisma.experiment.findMany({
      where: {
        status: status as any, // Type assertion for enum
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
