// Cloudflare Publisher Service
import { CloudflareConfig, PublishedExperiment, CloudflarePublishResult } from './types';

export interface CloudflarePublisher {
  publishExperiment(experiment: PublishedExperiment): Promise<CloudflarePublishResult>;
  unpublishExperiment(experimentId: string): Promise<CloudflarePublishResult>;
  getPublishedExperiments(): Promise<PublishedExperiment[]>;
}

export class CloudflarePublisherImpl implements CloudflarePublisher {
  private config: CloudflareConfig;
  private baseUrl: string;

  constructor(config: CloudflareConfig) {
    this.config = config;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`;
  }

  async publishExperiment(experiment: PublishedExperiment): Promise<CloudflarePublishResult> {
    const key = `experiment:${experiment.id}`;
    console.log(`[CLOUDFLARE_PUBLISHER] Publishing experiment ${experiment.id} to Cloudflare KV`);
    console.log(`[CLOUDFLARE_PUBLISHER] Key: ${key}`);
    console.log(`[CLOUDFLARE_PUBLISHER] Experiment data:`, {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      variantCount: Object.keys(experiment.variants).length,
      trafficDistribution: experiment.traffic
    });

    try {
      const value = JSON.stringify(experiment);
      console.log(`[CLOUDFLARE_PUBLISHER] Payload size: ${value.length} bytes`);

      const response = await fetch(`${this.baseUrl}/values/${key}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: value,
      });

      console.log(`[CLOUDFLARE_PUBLISHER] Cloudflare API response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CLOUDFLARE_PUBLISHER] Cloudflare API error response:`, errorText);
        throw new Error(`Cloudflare API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[CLOUDFLARE_PUBLISHER] Successfully published experiment ${experiment.id} to Cloudflare`);
      console.log(`[CLOUDFLARE_PUBLISHER] Cloudflare response:`, result);

      return {
        success: true,
        experimentId: experiment.id,
        key,
      };
    } catch (error) {
      console.error(`[CLOUDFLARE_PUBLISHER] Failed to publish experiment ${experiment.id}:`, error);
      console.error(`[CLOUDFLARE_PUBLISHER] Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        experimentId: experiment.id,
        key
      });
      return {
        success: false,
        experimentId: experiment.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async unpublishExperiment(experimentId: string): Promise<CloudflarePublishResult> {
    const key = `experiment:${experimentId}`;
    console.log(`[CLOUDFLARE_PUBLISHER] Unpublishing experiment ${experimentId} from Cloudflare KV`);
    console.log(`[CLOUDFLARE_PUBLISHER] Key: ${key}`);

    try {
      const response = await fetch(`${this.baseUrl}/values/${key}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
        },
      });

      console.log(`[CLOUDFLARE_PUBLISHER] Cloudflare API response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CLOUDFLARE_PUBLISHER] Cloudflare API error response:`, errorText);
        throw new Error(`Cloudflare API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[CLOUDFLARE_PUBLISHER] Successfully unpublished experiment ${experimentId} from Cloudflare`);
      console.log(`[CLOUDFLARE_PUBLISHER] Cloudflare response:`, result);

      return {
        success: true,
        experimentId,
        key,
      };
    } catch (error) {
      console.error(`[CLOUDFLARE_PUBLISHER] Failed to unpublish experiment ${experimentId}:`, error);
      console.error(`[CLOUDFLARE_PUBLISHER] Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        experimentId,
        key
      });
      return {
        success: false,
        experimentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getPublishedExperiments(): Promise<PublishedExperiment[]> {
    console.log(`[CLOUDFLARE_PUBLISHER] Fetching all published experiments from Cloudflare KV`);
    
    try {
      const response = await fetch(`${this.baseUrl}/keys?prefix=experiment:`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
        },
      });

      console.log(`[CLOUDFLARE_PUBLISHER] Keys API response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CLOUDFLARE_PUBLISHER] Cloudflare API error response:`, errorText);
        throw new Error(`Cloudflare API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`[CLOUDFLARE_PUBLISHER] Found ${data.result.length} experiment keys`);
      
      const experiments: PublishedExperiment[] = [];

      // Fetch each experiment's data
      for (const keyInfo of data.result) {
        console.log(`[CLOUDFLARE_PUBLISHER] Fetching experiment data for key: ${keyInfo.name}`);
        
        const experimentResponse = await fetch(`${this.baseUrl}/values/${keyInfo.name}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
          },
        });

        if (experimentResponse.ok) {
          const experiment = await experimentResponse.json();
          experiments.push(experiment);
          console.log(`[CLOUDFLARE_PUBLISHER] Successfully loaded experiment: ${experiment.id}`);
        } else {
          console.error(`[CLOUDFLARE_PUBLISHER] Failed to fetch experiment data for key ${keyInfo.name}: ${experimentResponse.status}`);
        }
      }

      console.log(`[CLOUDFLARE_PUBLISHER] Successfully loaded ${experiments.length} experiments from Cloudflare`);
      return experiments;
    } catch (error) {
      console.error(`[CLOUDFLARE_PUBLISHER] Failed to get published experiments:`, error);
      console.error(`[CLOUDFLARE_PUBLISHER] Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }
}

export function createCloudflarePublisher(config: CloudflareConfig): CloudflarePublisher {
  return new CloudflarePublisherImpl(config);
}
