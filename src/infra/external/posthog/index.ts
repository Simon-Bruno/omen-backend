/**
 * PostHog External Service Module
 * 
 * Exports PostHog service and related utilities
 */

export { PostHogService } from './service';
export { getPostHogConfig } from './config';
export type {
  PostHogQueryParams,
  PostHogQueryResponse,
  PostHogEvent,
  PostHogConfig,
} from './types';
export type { ExperimentStatus, VariantMetrics } from '../../shared/types';
export {
  PostHogError,
  PostHogConnectionError,
  PostHogQueryError,
  PostHogRateLimitError,
} from './types';
