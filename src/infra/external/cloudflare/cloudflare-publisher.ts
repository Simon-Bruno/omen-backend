/**
 * Cloudflare Publisher (KV & Index)
 * 
 * Manages pushing validated DSL to edge and managing CONFIG_INDEX.
 * Provides KV client with two-phase write semantics, idempotency, and failure handling.
 */

import fetch, { RequestInit, Response } from 'node-fetch';
import { CloudflareConfig } from './cloudflare';
import { 
  KVValueWriteFailedError, 
  KVIndexWriteFailedError, 
  KVConnectionError, 
  KVRateLimitError 
} from '../../errors';
import type { ExperimentDSL } from '@shared/types';

export interface PublishResult {
  success: boolean;
  experimentId: string;
  projectId: string;
  kvValueWritten: boolean;
  indexUpdated: boolean;
  error?: string;
  details?: unknown;
}

export interface UnpublishResult {
  success: boolean;
  experimentId: string;
  projectId: string;
  indexUpdated: boolean;
  error?: string;
  details?: unknown;
}

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => global.setTimeout(resolve, ms));

/**
 * Exponential backoff calculator
 */
const calculateBackoffDelay = (attempt: number, baseDelay: number = 1000): number => {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
};

export class CloudflarePublisher {
  private config: ReturnType<typeof CloudflareConfig.getInstance>;
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 1000;

  constructor() {
    this.config = CloudflareConfig.getInstance();
  }

  /**
   * Get headers for Cloudflare API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Build KV API URL for specific operations
   */
  private getKVUrl(key?: string): string {
    const baseUrl = `${this.config.baseUrl}/accounts/${this.config.accountId}/storage/kv/namespaces/${this.config.namespaceId}`;
    return key ? `${baseUrl}/values/${encodeURIComponent(key)}` : baseUrl;
  }

  /**
   * Make HTTP request with error handling
   */
  private async makeRequest(
    url: string, 
    options: RequestInit,
    context: string
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new KVRateLimitError(retryAfter ? parseInt(retryAfter) : undefined, {
            context,
            status: response.status,
            body: errorBody,
          });
        }

        if (response.status >= 500) {
          throw new KVConnectionError({
            context,
            status: response.status,
            body: errorBody,
          });
        }

        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      return response;
    } catch (error) {
      if (error instanceof KVRateLimitError || error instanceof KVConnectionError) {
        throw error;
      }

      // Network or other errors
      throw new KVConnectionError({
        context,
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Execute operation with retries and exponential backoff
   */
  private async withRetries<T>(
    operation: () => Promise<T>,
    context: string,
    experimentId: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on rate limit errors - let caller handle
        if (error instanceof KVRateLimitError) {
          throw error;
        }

        // Log attempt failure
        console.warn(`Cloudflare KV ${context} attempt ${attempt + 1} failed for experiment ${experimentId}:`, {
          error: error instanceof Error ? error.message : String(error),
          experimentId,
          context,
          attempt: attempt + 1,
        });

        // Don't wait after the last attempt
        if (attempt < this.maxRetries) {
          const delay = calculateBackoffDelay(attempt, this.baseRetryDelay);
          await sleep(delay);
        }
      }
    }

    // All retries exhausted
    if (!lastError) {
      throw new Error(`Operation failed without specific error details`);
    }
    
    console.error(`Cloudflare KV ${context} failed after ${this.maxRetries + 1} attempts for experiment ${experimentId}:`, {
      error: lastError.message,
      experimentId,
      context,
    });

    throw lastError;
  }

  /**
   * Put a value in KV store with retries
   */
  private async putValue(key: string, value: string, experimentId: string): Promise<void> {
    await this.withRetries(async () => {
      const url = this.getKVUrl(key);
      await this.makeRequest(url, {
        method: 'PUT',
        body: value,
        headers: {
          'Content-Type': 'application/json',
        },
      }, `put value ${key}`);
    }, 'put value', experimentId);
  }

  /**
   * Get a value from KV store
   */
  private async getValue(key: string): Promise<string | null> {
    try {
      const url = this.getKVUrl(key);
      const response = await this.makeRequest(url, {
        method: 'GET',
      }, `get value ${key}`);

      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTP 404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get current CONFIG_INDEX
   */
  private async getCurrentIndex(): Promise<string[]> {
    const indexValue = await this.getValue('CONFIG_INDEX');
    if (!indexValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(indexValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn('Failed to parse CONFIG_INDEX, treating as empty');
      return [];
    }
  }

  /**
   * Update CONFIG_INDEX idempotently
   */
  private async updateConfigIndex(
    experimentId: string, 
    action: 'add' | 'remove'
  ): Promise<void> {
    await this.withRetries(async () => {
      const currentIndex = await this.getCurrentIndex();
      const expKey = `EXP_${experimentId}`;
      
      let newIndex: string[];
      if (action === 'add') {
        // Add to index if not already present (idempotent)
        newIndex = currentIndex.includes(expKey) 
          ? currentIndex 
          : [...currentIndex, expKey];
      } else {
        // Remove from index (idempotent)
        newIndex = currentIndex.filter(key => key !== expKey);
      }

      // Only update if there's a change
      if (JSON.stringify(currentIndex) !== JSON.stringify(newIndex)) {
        const url = this.getKVUrl('CONFIG_INDEX');
        await this.makeRequest(url, {
          method: 'PUT',
          body: JSON.stringify(newIndex),
          headers: {
            'Content-Type': 'application/json',
          },
        }, `update CONFIG_INDEX (${action})`);
      }
    }, 'update CONFIG_INDEX', experimentId);
  }

  /**
   * Publish experiment to KV with two-phase write
   * Phase 1: Write EXP_<id> value
   * Phase 2: Update CONFIG_INDEX
   */
  async publishExperiment(dsl: ExperimentDSL): Promise<PublishResult> {
    const { experimentId, projectId } = dsl;
    const expKey = `EXP_${experimentId}`;
    
    // Log start of publish operation
    console.info(`Starting publish for experiment ${experimentId} (project: ${projectId})`);

    const result: PublishResult = {
      success: false,
      experimentId,
      projectId,
      kvValueWritten: false,
      indexUpdated: false,
    };

    try {
      // Phase 1: Write experiment value
      console.info(`Phase 1: Writing ${expKey} to KV store`);
      await this.putValue(expKey, JSON.stringify(dsl), experimentId);
      result.kvValueWritten = true;
      
      console.info(`Phase 1 completed: ${expKey} written to KV store`);

      // Phase 2: Update CONFIG_INDEX
      console.info(`Phase 2: Adding ${expKey} to CONFIG_INDEX`);
      await this.updateConfigIndex(experimentId, 'add');
      result.indexUpdated = true;

      console.info(`Phase 2 completed: ${expKey} added to CONFIG_INDEX`);

      result.success = true;
      
      // Log successful publish
      console.info(`Successfully published experiment ${experimentId} (project: ${projectId})`);
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Determine which phase failed and set appropriate error
      if (!result.kvValueWritten) {
        result.error = 'KV_VALUE_WRITE_FAILED';
        console.error(`Failed to write experiment ${experimentId} to KV store:`, {
          error: errorMessage,
          experimentId,
          projectId,
          phase: 'value_write',
        });
        throw new KVValueWriteFailedError(experimentId, { originalError: errorMessage });
      } else {
        result.error = 'KV_INDEX_WRITE_FAILED';
        console.error(`Failed to update CONFIG_INDEX for experiment ${experimentId}:`, {
          error: errorMessage,
          experimentId,
          projectId,
          phase: 'index_update',
        });
        throw new KVIndexWriteFailedError(experimentId, { originalError: errorMessage });
      }
    }
  }

  /**
   * Unpublish experiment from KV (remove from CONFIG_INDEX only)
   * Note: We keep the EXP_<id> value for potential republishing
   */
  async unpublishExperiment(experimentId: string, projectId: string): Promise<UnpublishResult> {
    console.info(`Starting unpublish for experiment ${experimentId} (project: ${projectId})`);

    const result: UnpublishResult = {
      success: false,
      experimentId,
      projectId,
      indexUpdated: false,
    };

    try {
      // Remove from CONFIG_INDEX
      console.info(`Removing EXP_${experimentId} from CONFIG_INDEX`);
      await this.updateConfigIndex(experimentId, 'remove');
      result.indexUpdated = true;

      result.success = true;

      // Log successful unpublish
      console.info(`Successfully unpublished experiment ${experimentId} (project: ${projectId})`);
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.error = 'KV_INDEX_WRITE_FAILED';
      
      console.error(`Failed to remove experiment ${experimentId} from CONFIG_INDEX:`, {
        error: errorMessage,
        experimentId,
        projectId,
      });

      throw new KVIndexWriteFailedError(experimentId, { originalError: errorMessage });
    }
  }

  /**
   * Get current running experiments (from CONFIG_INDEX)
   */
  async getRunningExperiments(): Promise<string[]> {
    try {
      return await this.getCurrentIndex();
    } catch (error) {
      console.error('Failed to get running experiments from CONFIG_INDEX:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new KVConnectionError({
        context: 'get running experiments',
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if experiment is currently published
   */
  async isExperimentPublished(experimentId: string): Promise<boolean> {
    try {
      const runningExperiments = await this.getRunningExperiments();
      return runningExperiments.includes(`EXP_${experimentId}`);
    } catch (error) {
      console.error(`Failed to check if experiment ${experimentId} is published:`, {
        error: error instanceof Error ? error.message : String(error),
        experimentId,
      });
      return false;
    }
  }
}
