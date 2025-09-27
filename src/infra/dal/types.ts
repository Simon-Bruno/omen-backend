// DAL Types and Interfaces
import type { Project, Experiment, JobStatus } from '@prisma/client';

// Re-export Prisma types for DAL use
export type { Project, Experiment, JobStatus };

export interface CreateExperimentData {
  projectId: string;
  name: string;
  oec: string;
  minDays: number;
  minSessionsPerVariant: number;
}

export interface UpdateExperimentStatusData {
  experimentId: string;
  status: JobStatus;
  publishedAt?: Date;
  finishedAt?: Date;
}

export interface ProjectWithRelations extends Project {
  experiments: Experiment[];
  chatMessages: any[];
}

export interface ExperimentWithProject extends Experiment {
  project: Project;
}
