// Diagnostics Service - Main orchestrator
import { DiagnosticsDAL } from '@infra/dal/diagnostics';
import { ProjectDAL } from '@infra/dal/project';
import type { BrandAnalysisService } from '@features/brand_analysis';
import type { CrawlerService } from '@features/crawler';
import type { DiagnosticsStatus } from '@prisma/client';

export interface DiagnosticsService {
  startDiagnostics(projectId: string): Promise<{ runId: string }>;
  getDiagnosticsResult(projectId: string): Promise<DiagnosticsResult | null>;
  getDiagnosticsStatus(runId: string): Promise<DiagnosticsStatus | null>;
}

export interface DiagnosticsResult {
  brand: {
    colors: string[];
    fonts: string[];
    components: string[];
    voice?: {
      tone: string;
      personality: string;
      keyPhrases: string[];
    };
    designSystem: {
      layout: string;
      spacing: string;
      typography: string;
      colorScheme: string;
    };
    brandPersonality: {
      adjectives: string[];
      values: string[];
      targetAudience: string;
    };
    recommendations: {
      strengths: string[];
      opportunities: string[];
    };
  };
  pages: Array<{
    url: string;
    screenshotUrl: string;
    title?: string;
    description?: string;
  }>;
}

export class DiagnosticsServiceImpl implements DiagnosticsService {
  constructor(
    private brandAnalysisService: BrandAnalysisService,
    private crawler: CrawlerService
  ) {}

  async startDiagnostics(projectId: string): Promise<{ runId: string }> {
    // Create diagnostics run record
    const diagnosticsRun = await DiagnosticsDAL.createDiagnosticsRun({
      projectId
    });

    // Start async processing
    this.processDiagnostics(diagnosticsRun.id, projectId).catch(error => {
      console.error(`Diagnostics processing failed for run ${diagnosticsRun.id}:`, error);
      this.updateDiagnosticsStatus(diagnosticsRun.id, 'FAILED', error.message);
    });

    return { runId: diagnosticsRun.id };
  }

  async getDiagnosticsResult(projectId: string): Promise<DiagnosticsResult | null> {
    const diagnosticsRun = await DiagnosticsDAL.getLatestDiagnosticsRunByProject(projectId);
    
    if (!diagnosticsRun || diagnosticsRun.status !== 'COMPLETED' || !diagnosticsRun.summary) {
      return null;
    }

    const summary = diagnosticsRun.summary as any;
    const pages = (diagnosticsRun.pages as any) || [];

    return {
      brand: {
        colors: summary.colors || [],
        fonts: summary.fonts || [],
        components: summary.components || [],
        voice: summary.voice,
        designSystem: summary.designSystem || {},
        brandPersonality: summary.brandPersonality || {},
        recommendations: summary.recommendations || {}
      },
      pages: pages.map((page: any) => ({
        url: page.url,
        screenshotUrl: page.screenshotUrl,
        title: page.title,
        description: page.description
      }))
    };
  }

  async getDiagnosticsStatus(runId: string): Promise<DiagnosticsStatus | null> {
    const diagnosticsRun = await DiagnosticsDAL.getDiagnosticsRunById(runId);
    return diagnosticsRun?.status || null;
  }

  private async processDiagnostics(runId: string, projectId: string): Promise<void> {
    try {
      // Get project details
      const project = await ProjectDAL.getProjectById(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Perform brand analysis
      const analysisResult = await this.brandAnalysisService.analyzeProject(project.shopDomain, this.crawler);

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || 'Brand analysis failed');
      }

      // Update diagnostics run with results
      await DiagnosticsDAL.updateDiagnosticsRun({
        diagnosticsRunId: runId,
        status: 'COMPLETED',
        summary: analysisResult.brandSummary,
        pages: analysisResult.pages,
        finishedAt: new Date()
      });

      console.log(`Diagnostics completed successfully for project ${projectId}`);
    } catch (error) {
      console.error(`Diagnostics processing failed for run ${runId}:`, error);
      await this.updateDiagnosticsStatus(runId, 'FAILED', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async updateDiagnosticsStatus(
    runId: string, 
    status: DiagnosticsStatus, 
    error?: string
  ): Promise<void> {
    await DiagnosticsDAL.updateDiagnosticsRun({
      diagnosticsRunId: runId,
      status,
      finishedAt: new Date(),
      ...(error && { summary: { error } })
    });
  }
}

// Factory function
export function createDiagnosticsService(
  brandAnalysisService: BrandAnalysisService,
  crawler: CrawlerService
): DiagnosticsService {
  return new DiagnosticsServiceImpl(brandAnalysisService, crawler);
}
