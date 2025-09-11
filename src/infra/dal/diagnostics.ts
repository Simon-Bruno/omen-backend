// Diagnostics Run Data Access Layer
import { prisma } from '@infra/prisma';
import type { DiagnosticsRun, CreateDiagnosticsRunData, UpdateDiagnosticsRunData } from './types';

export class DiagnosticsDAL {
  /**
   * Create a new diagnostics run
   */
  static async createDiagnosticsRun(data: CreateDiagnosticsRunData): Promise<DiagnosticsRun> {
    return await prisma.diagnosticsRun.create({
      data,
    });
  }

  /**
   * Get diagnostics run by ID
   */
  static async getDiagnosticsRunById(diagnosticsRunId: string): Promise<DiagnosticsRun | null> {
    return await prisma.diagnosticsRun.findUnique({
      where: { id: diagnosticsRunId },
    });
  }

  /**
   * Get all diagnostics runs for a project
   */
  static async getDiagnosticsRunsByProject(projectId: string): Promise<DiagnosticsRun[]> {
    return await prisma.diagnosticsRun.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Get diagnostics runs by project and status
   */
  static async getDiagnosticsRunsByProjectAndStatus(
    projectId: string,
    status: string
  ): Promise<DiagnosticsRun[]> {
    return await prisma.diagnosticsRun.findMany({
      where: {
        projectId,
        status: status as any, // Type assertion for enum
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Update diagnostics run status and data
   */
  static async updateStatus(data: UpdateDiagnosticsRunData): Promise<DiagnosticsRun> {
    const updateData: any = {
      status: data.status,
    };

    // Set finishedAt when completing or failing
    if ((data.status === 'COMPLETED' || data.status === 'FAILED') && data.finishedAt) {
      updateData.finishedAt = data.finishedAt;
    }

    // Update summary and pages if provided
    if (data.summary !== undefined) {
      updateData.summary = data.summary;
    }

    if (data.pages !== undefined) {
      updateData.pages = data.pages;
    }

    return await prisma.diagnosticsRun.update({
      where: { id: data.diagnosticsRunId },
      data: updateData,
    });
  }

  /**
   * Update diagnostics run summary
   */
  static async updateSummary(
    diagnosticsRunId: string,
    summary: Record<string, any>
  ): Promise<DiagnosticsRun> {
    return await prisma.diagnosticsRun.update({
      where: { id: diagnosticsRunId },
      data: { summary },
    });
  }

  /**
   * Update diagnostics run pages
   */
  static async updatePages(
    diagnosticsRunId: string,
    pages: Record<string, any>
  ): Promise<DiagnosticsRun> {
    return await prisma.diagnosticsRun.update({
      where: { id: diagnosticsRunId },
      data: { pages },
    });
  }

  /**
   * Delete diagnostics run
   */
  static async deleteDiagnosticsRun(diagnosticsRunId: string): Promise<void> {
    await prisma.diagnosticsRun.delete({
      where: { id: diagnosticsRunId },
    });
  }

  /**
   * Get diagnostics run count for a project
   */
  static async getDiagnosticsRunCount(projectId: string): Promise<number> {
    return await prisma.diagnosticsRun.count({
      where: { projectId },
    });
  }

  /**
   * Get latest diagnostics run for a project
   */
  static async getLatestDiagnosticsRun(projectId: string): Promise<DiagnosticsRun | null> {
    return await prisma.diagnosticsRun.findFirst({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Get diagnostics runs by status across all projects (admin function)
   */
  static async getDiagnosticsRunsByStatus(status: string): Promise<DiagnosticsRun[]> {
    return await prisma.diagnosticsRun.findMany({
      where: {
        status: status as any, // Type assertion for enum
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Get running diagnostics runs (for monitoring)
   */
  static async getRunningDiagnosticsRuns(): Promise<DiagnosticsRun[]> {
    return await prisma.diagnosticsRun.findMany({
      where: { status: 'PENDING' },
      orderBy: { startedAt: 'asc' },
    });
  }
}
