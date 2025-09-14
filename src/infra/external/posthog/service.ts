/**
 * PostHog Service
 * 
 * Service for querying PostHog analytics data for experiment status
 */

import { PostHog } from 'posthog-node';
import fetch from 'node-fetch';
import { getPostHogConfig } from './config';
import type {
  PostHogQueryParams,
  PostHogQueryResponse,
  PostHogEvent,
} from './types';
import type { ExperimentStatus, VariantMetrics } from '../../../shared/types';
import {
  PostHogConnectionError,
  PostHogQueryError,
  PostHogRateLimitError,
} from '../../errors';

export class PostHogService {
  private client: PostHog;
  private config: ReturnType<typeof getPostHogConfig>;

  constructor() {
    this.config = getPostHogConfig();
    this.client = new PostHog(this.config.apiKey, {
      host: this.config.host,
    });
  }

  /**
   * Query PostHog for experiment analytics data
   */
  async queryExperimentMetrics(params: PostHogQueryParams): Promise<ExperimentStatus> {
    try {
      const { projectId, experimentId, startDate, endDate, primaryKPI, guardrails = [] } = params;
      const configProjectId = this.config.projectId;

      // Query pageviews for denominator
      const pageviewEvents = await this.queryEvents({
        projectId: configProjectId,
        experimentId,
        startDate,
        endDate,
        eventName: '$pageview',
        properties: {
          experimentId,
          projectId,
        },
      });

      // Query primary KPI events
      const primaryKPIEvents = await this.queryEvents({
        projectId: configProjectId,
        experimentId,
        startDate,
        endDate,
        eventName: primaryKPI,
        properties: {
          experimentId,
          projectId,
        },
      });

      // Query guardrail events if specified
      const guardrailEvents = guardrails.length > 0 
        ? await this.queryGuardrailEvents({
            projectId: configProjectId,
            experimentId,
            startDate,
            endDate,
            guardrails,
          })
        : {};

      // Aggregate metrics by variant
      const variantMetrics = this.aggregateVariantMetrics(
        pageviewEvents,
        primaryKPIEvents,
        guardrailEvents,
        primaryKPI
      );

      // Calculate traffic distribution (this would come from experiment DSL)
      const traffic = this.calculateTrafficDistribution(variantMetrics);

      // Find leader and calculate lift vs A
      const leader = this.findLeader(variantMetrics);
      const liftVsA = this.calculateLiftVsA(variantMetrics);

      return {
        state: 'running', // This would come from experiment status
        traffic,
        variants: variantMetrics,
        leader,
        liftVsA,
        meta: {
          timeframe: {
            start: startDate,
            end: endDate,
          },
          denominator: 'pageviews',
          totalSessions: pageviewEvents.length,
        },
      };
    } catch (error) {
      if (error instanceof PostHogConnectionError || error instanceof PostHogQueryError || error instanceof PostHogRateLimitError) {
        throw error;
      }
      
      if (error && typeof error === 'object' && 'message' in error) {
        const message = typeof error.message === 'string' ? error.message : 'Unknown PostHog error';
        throw new PostHogConnectionError({ originalError: message });
      }
      
      throw new PostHogConnectionError();
    }
  }

  /**
   * Query PostHog events using the Query API
   */
  private async queryEvents(params: {
    projectId: string;
    experimentId: string;
    startDate: string;
    endDate: string;
    eventName: string;
    properties: Record<string, unknown>;
  }): Promise<PostHogEvent[]> {
    const { projectId, experimentId, startDate, endDate, eventName, properties } = params;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= (this.config.retryAttempts || 3); attempt++) {
      try {
        // Build HogQL query for events
        const whereConditions = [
          `event = '${eventName}'`,
          `properties.experimentId = '${experimentId}'`,
          `properties.projectId = '${projectId}'`,
          `timestamp >= '${startDate}'`,
          `timestamp <= '${endDate}'`
        ];

        // Add additional property filters
        for (const [key, value] of Object.entries(properties)) {
          if (key !== 'experimentId' && key !== 'projectId') {
            whereConditions.push(`properties.${key} = '${value}'`);
          }
        }

        const hogqlQuery = `
          SELECT 
            event,
            properties,
            timestamp,
            distinct_id
          FROM events 
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY timestamp DESC
          LIMIT 10000
        `;

        const response = await this.executeQuery(projectId, {
          kind: 'HogQLQuery',
          query: hogqlQuery
        });

        // Transform PostHog response to our event format
        const events: PostHogEvent[] = response.results?.map((row: Record<string, unknown>) => ({
          event: row.event as string,
          properties: (row.properties as Record<string, unknown>) || {},
          timestamp: row.timestamp as string,
          distinct_id: row.distinct_id as string
        })) || [];

        return events;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < (this.config.retryAttempts || 3)) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => global.setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        
        // Handle specific error types
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as Record<string, unknown>).status;
          if (status === 429) {
            const headers = (error as Record<string, unknown>).headers as Record<string, unknown> | undefined;
            const retryAfter = headers?.['retry-after'];
            throw new PostHogRateLimitError(parseInt(String(retryAfter)), error);
          }
          if (typeof status === 'number' && status >= 400 && status < 500) {
            throw new PostHogQueryError(`PostHog query failed: ${lastError.message}`, error);
          }
        }
        
        throw new PostHogConnectionError({ originalError: lastError.message });
      }
    }
    
    throw new PostHogConnectionError({ originalError: lastError?.message });
  }

  /**
   * Execute a PostHog Query API request
   */
  private async executeQuery(projectId: string, query: { kind: string; query: string }): Promise<PostHogQueryResponse> {
    const url = `${this.config.host}/api/projects/${projectId}/query/`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`PostHog API error: ${response.status} ${response.statusText}`);
      (error as Error & { status: number; headers: Record<string, string>; data: unknown }).status = response.status;
      (error as Error & { status: number; headers: Record<string, string>; data: unknown }).headers = Object.fromEntries(response.headers.entries());
      (error as Error & { status: number; headers: Record<string, string>; data: unknown }).data = errorData;
      throw error;
    }

    const data = await response.json() as Record<string, unknown>;
    
    // Handle query status
    if (data.query_status === 'error') {
      throw new PostHogQueryError(`PostHog query error: ${data.error || 'Unknown error'}`, data);
    }

    return {
      results: (data.results as Record<string, unknown>[]) || [],
      hasMore: (data.hasMore as boolean) || false,
      next: data.next as string | undefined
    };
  }

  /**
   * Query guardrail events
   */
  private async queryGuardrailEvents(params: {
    projectId: string;
    experimentId: string;
    startDate: string;
    endDate: string;
    guardrails: string[];
  }): Promise<Record<string, PostHogEvent[]>> {
    const { experimentId, startDate, endDate, guardrails } = params;
    const configProjectId = this.config.projectId;
    const results: Record<string, PostHogEvent[]> = {};

    for (const guardrail of guardrails) {
      try {
        const events = await this.queryEvents({
          projectId: configProjectId,
          experimentId,
          startDate,
          endDate,
          eventName: guardrail,
          properties: {
            experimentId,
            projectId: params.projectId, // Keep the original projectId for filtering
          },
        });
        results[guardrail] = events;
      } catch (error) {
        // Log error but continue with other guardrails
        console.warn(`Failed to query guardrail ${guardrail}:`, error);
        results[guardrail] = [];
      }
    }

    return results;
  }

  /**
   * Aggregate metrics by variant
   */
  private aggregateVariantMetrics(
    pageviewEvents: PostHogEvent[],
    primaryKPIEvents: PostHogEvent[],
    guardrailEvents: Record<string, PostHogEvent[]>,
    primaryKPI: string
  ): VariantMetrics[] {
    const variantMap = new Map<string, {
      sessions: Set<string>;
      primaryKPICount: number;
      guardrails: Record<string, number>;
    }>();

    // Process pageview events for sessions
    for (const event of pageviewEvents) {
      const variantId = event.properties.variantId as string;
      const distinctId = event.distinct_id;
      
        if (variantId && distinctId) {
          if (!variantMap.has(variantId)) {
            variantMap.set(variantId, {
              sessions: new Set(),
              primaryKPICount: 0,
              guardrails: {},
            });
          }
          
          const variantData = variantMap.get(variantId);
          if (variantData) {
            variantData.sessions.add(distinctId);
          }
        }
    }

    // Process primary KPI events
    for (const event of primaryKPIEvents) {
      const variantId = event.properties.variantId as string;
      
      if (variantId && variantMap.has(variantId)) {
        const variantData = variantMap.get(variantId);
        if (variantData) {
          variantData.primaryKPICount++;
        }
      }
    }

    // Process guardrail events
    for (const [guardrail, events] of Object.entries(guardrailEvents)) {
      for (const event of events) {
        const variantId = event.properties.variantId as string;
        
        if (variantId && variantMap.has(variantId)) {
          const variant = variantMap.get(variantId);
          if (variant) {
            variant.guardrails[guardrail] = (variant.guardrails[guardrail] || 0) + 1;
          }
        }
      }
    }

    // Convert to VariantMetrics array
    const metrics: VariantMetrics[] = [];
    
    for (const [variantId, data] of variantMap.entries()) {
      const sessions = data.sessions.size;
      const primaryKPICount = data.primaryKPICount;
      const rate = sessions > 0 ? primaryKPICount / sessions : 0;

      const guardrails = this.calculateGuardrailLabels(data.guardrails, sessions);

      metrics.push({
        variantId,
        sessions,
        primaryKPI: {
          name: primaryKPI,
          count: primaryKPICount,
          rate,
        },
        guardrails: Object.keys(guardrails).length > 0 ? guardrails : undefined,
      });
    }

    return metrics.sort((a, b) => a.variantId.localeCompare(b.variantId));
  }

  /**
   * Calculate guardrail labels based on thresholds
   */
  private calculateGuardrailLabels(
    guardrailCounts: Record<string, number>,
    sessions: number
  ): Record<string, 'normal' | 'elevated'> {
    const labels: Record<string, 'normal' | 'elevated'> = {};
    
    for (const [guardrail, count] of Object.entries(guardrailCounts)) {
      // Simple threshold logic - in production, you'd want more sophisticated analysis
      const rate = sessions > 0 ? count / sessions : 0;
      
      switch (guardrail) {
        case 'lcp':
          // LCP > 2.5s is considered elevated
          labels.lcp = rate > 0.1 ? 'elevated' : 'normal';
          break;
        case 'js_errors':
          // JS error rate > 1% is considered elevated
          labels.jsErrors = rate > 0.01 ? 'elevated' : 'normal';
          break;
        case 'cls':
          // CLS > 0.1 is considered elevated
          labels.cls = rate > 0.1 ? 'elevated' : 'normal';
          break;
      }
    }
    
    return labels;
  }

  /**
   * Calculate traffic distribution from variant metrics
   */
  private calculateTrafficDistribution(metrics: VariantMetrics[]): Record<string, number> {
    const totalSessions = metrics.reduce((sum, m) => sum + m.sessions, 0);
    
    if (totalSessions === 0) {
      return {};
    }

    const distribution: Record<string, number> = {};
    for (const metric of metrics) {
      distribution[metric.variantId] = metric.sessions / totalSessions;
    }

    return distribution;
  }

  /**
   * Find the leading variant
   */
  private findLeader(metrics: VariantMetrics[]): string | undefined {
    if (metrics.length === 0) return undefined;

    return metrics.reduce((leader, current) => 
      current.primaryKPI.rate > leader.primaryKPI.rate ? current : leader
    ).variantId;
  }

  /**
   * Calculate lift vs variant A
   */
  private calculateLiftVsA(metrics: VariantMetrics[]): number | undefined {
    const variantA = metrics.find(m => m.variantId === 'A');
    if (!variantA || variantA.primaryKPI.rate === 0) return undefined;

    const otherVariants = metrics.filter(m => m.variantId !== 'A');
    if (otherVariants.length === 0) return undefined;

    // Calculate average lift of other variants vs A
    const totalLift = otherVariants.reduce((sum, variant) => {
      const lift = ((variant.primaryKPI.rate - variantA.primaryKPI.rate) / variantA.primaryKPI.rate) * 100;
      return sum + lift;
    }, 0);

    return totalLift / otherVariants.length;
  }

  /**
   * Close the PostHog client
   */
  async close(): Promise<void> {
    await this.client.shutdown();
  }
}
