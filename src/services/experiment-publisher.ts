/**
 * Experiment Publisher Service
 * 
 * High-level service that integrates Cloudflare Publisher with experiment management.
 * Used by the experiments API endpoints.
 */

import { CloudflarePublisher } from '@infra/external/cloudflare';
import { ExperimentDAL } from '@infra/dal/experiment';
import type { ExperimentDSL } from '@shared/types';
import type { PublishResult, UnpublishResult } from '@infra/external/cloudflare';

export interface ExperimentPublishResult {
  success: boolean;
  experimentId: string;
  projectId: string;
  databaseUpdated: boolean;
  kvPublished: boolean;
  error?: string;
  details?: unknown;
}

export interface ExperimentUnpublishResult {
  success: boolean;
  experimentId: string;
  projectId: string;
  databaseUpdated: boolean;
  kvUnpublished: boolean;
  error?: string;
  details?: unknown;
}

export class ExperimentPublisherService {
  private cloudflarePublisher: CloudflarePublisher;

  constructor() {
    this.cloudflarePublisher = new CloudflarePublisher();
  }

  /**
   * Publish experiment: Update database status and push to Cloudflare KV
   */
  async publishExperiment(dsl: ExperimentDSL): Promise<ExperimentPublishResult> {
    const { experimentId, projectId } = dsl;
    
    const result: ExperimentPublishResult = {
      success: false,
      experimentId,
      projectId,
      databaseUpdated: false,
      kvPublished: false,
    };

    try {
      // Step 1: Publish to Cloudflare KV first (most likely to fail)
      const kvResult: PublishResult = await this.cloudflarePublisher.publishExperiment(dsl);
      result.kvPublished = kvResult.success;

      if (!kvResult.success) {
        result.error = kvResult.error;
        result.details = kvResult.details;
        return result;
      }

      // Step 2: Update database status to RUNNING
      await ExperimentDAL.updateStatus({
        experimentId,
        status: 'RUNNING',
        publishedAt: new Date(),
      });
      result.databaseUpdated = true;

      result.success = true;
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If KV succeeded but database failed, we should log this for manual cleanup
      if (result.kvPublished && !result.databaseUpdated) {
        console.error(`CRITICAL: Experiment ${experimentId} published to KV but database update failed. Manual cleanup required.`, {
          experimentId,
          projectId,
          error: errorMessage,
        });
        result.error = 'DATABASE_UPDATE_FAILED_AFTER_KV_PUBLISH';
      } else {
        result.error = errorMessage;
      }
      
      result.details = { originalError: errorMessage };
      return result;
    }
  }

  /**
   * Pause experiment: Update database status and remove from Cloudflare KV index
   */
  async pauseExperiment(experimentId: string, projectId: string): Promise<ExperimentUnpublishResult> {
    const result: ExperimentUnpublishResult = {
      success: false,
      experimentId,
      projectId,
      databaseUpdated: false,
      kvUnpublished: false,
    };

    try {
      // Step 1: Remove from Cloudflare KV index first
      const kvResult: UnpublishResult = await this.cloudflarePublisher.unpublishExperiment(experimentId, projectId);
      result.kvUnpublished = kvResult.success;

      if (!kvResult.success) {
        result.error = kvResult.error;
        result.details = kvResult.details;
        return result;
      }

      // Step 2: Update database status to PAUSED
      await ExperimentDAL.updateStatus({
        experimentId,
        status: 'PAUSED',
      });
      result.databaseUpdated = true;

      result.success = true;
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If KV succeeded but database failed, log for manual cleanup
      if (result.kvUnpublished && !result.databaseUpdated) {
        console.error(`CRITICAL: Experiment ${experimentId} unpublished from KV but database update failed. Manual cleanup required.`, {
          experimentId,
          projectId,
          error: errorMessage,
        });
        result.error = 'DATABASE_UPDATE_FAILED_AFTER_KV_UNPUBLISH';
      } else {
        result.error = errorMessage;
      }
      
      result.details = { originalError: errorMessage };
      return result;
    }
  }

  /**
   * Finish experiment: Update database status and remove from Cloudflare KV index
   */
  async finishExperiment(experimentId: string, projectId: string): Promise<ExperimentUnpublishResult> {
    const result: ExperimentUnpublishResult = {
      success: false,
      experimentId,
      projectId,
      databaseUpdated: false,
      kvUnpublished: false,
    };

    try {
      // Step 1: Remove from Cloudflare KV index first
      const kvResult: UnpublishResult = await this.cloudflarePublisher.unpublishExperiment(experimentId, projectId);
      result.kvUnpublished = kvResult.success;

      if (!kvResult.success) {
        result.error = kvResult.error;
        result.details = kvResult.details;
        return result;
      }

      // Step 2: Update database status to FINISHED
      await ExperimentDAL.updateStatus({
        experimentId,
        status: 'COMPLETED',
        finishedAt: new Date(),
      });
      result.databaseUpdated = true;

      result.success = true;
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If KV succeeded but database failed, log for manual cleanup
      if (result.kvUnpublished && !result.databaseUpdated) {
        console.error(`CRITICAL: Experiment ${experimentId} finished in KV but database update failed. Manual cleanup required.`, {
          experimentId,
          projectId,
          error: errorMessage,
        });
        result.error = 'DATABASE_UPDATE_FAILED_AFTER_KV_FINISH';
      } else {
        result.error = errorMessage;
      }
      
      result.details = { originalError: errorMessage };
      return result;
    }
  }

  /**
   * Get current running experiments from KV
   */
  async getRunningExperiments(): Promise<string[]> {
    try {
      return await this.cloudflarePublisher.getRunningExperiments();
    } catch (error) {
      console.error('Failed to get running experiments from KV:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if experiment is currently published to KV
   */
  async isExperimentPublished(experimentId: string): Promise<boolean> {
    try {
      return await this.cloudflarePublisher.isExperimentPublished(experimentId);
    } catch (error) {
      console.error(`Failed to check if experiment ${experimentId} is published:`, {
        error: error instanceof Error ? error.message : String(error),
        experimentId,
      });
      return false;
    }
  }
}
