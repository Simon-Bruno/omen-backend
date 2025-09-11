// DAL Types and Interfaces
import type { Project, Experiment, DiagnosticsRun, ExperimentStatus, DiagnosticsStatus } from '@prisma/client';

// Re-export Prisma types for DAL use
export type { Project, Experiment, DiagnosticsRun, ExperimentStatus, DiagnosticsStatus };

export interface CreateExperimentData {
  projectId: string;
  name: string;
  dsl: Record<string, any>;
}

export interface UpdateExperimentStatusData {
  experimentId: string;
  status: ExperimentStatus;
  publishedAt?: Date;
  finishedAt?: Date;
}

export interface CreateDiagnosticsRunData {
  projectId: string;
}

export interface UpdateDiagnosticsRunData {
  diagnosticsRunId: string;
  status: DiagnosticsStatus;
  summary?: Record<string, any>;
  pages?: Record<string, any>;
  finishedAt?: Date;
}

export interface ProjectWithRelations extends Project {
  experiments: Experiment[];
  diagnosticsRuns: DiagnosticsRun[];
}

export interface ExperimentWithProject extends Experiment {
  project: Project;
}
