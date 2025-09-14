/**
 * PostHog Types
 * 
 * Type definitions for PostHog analytics integration
 */

// PostHog query response types
export interface PostHogEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
  distinct_id: string;
}

export interface PostHogQueryResponse {
  results: Record<string, unknown>[];
  hasMore: boolean;
  next?: string;
}

// Re-export shared types for convenience
export type { VariantMetrics, ExperimentStatus } from '../../../shared/types';

// PostHog query parameters
export interface PostHogQueryParams {
  projectId: string;
  experimentId: string;
  startDate: string;
  endDate: string;
  primaryKPI: string;
  guardrails?: string[];
}

// PostHog error types
export class PostHogError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PostHogError';
  }
}

export class PostHogConnectionError extends PostHogError {
  constructor(details?: unknown) {
    super(503, 'POSTHOG_CONNECTION_ERROR', 'Failed to connect to PostHog', details);
  }
}

export class PostHogQueryError extends PostHogError {
  constructor(message: string, details?: unknown) {
    super(400, 'POSTHOG_QUERY_ERROR', message, details);
  }
}

export class PostHogRateLimitError extends PostHogError {
  constructor(retryAfter?: number, details?: unknown) {
    const errorDetails = details && typeof details === 'object' ? { retryAfter, ...details } : { retryAfter, details };
    super(429, 'POSTHOG_RATE_LIMIT_ERROR', 'PostHog rate limit exceeded', errorDetails);
  }
}
