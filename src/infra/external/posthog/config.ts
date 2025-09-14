/**
 * PostHog Configuration
 * 
 * Configuration for PostHog analytics integration with EU host support
 */

export interface PostHogConfig {
  apiKey: string;
  host: string;
  projectId: string;
  timeout?: number;
  retryAttempts?: number;
}

export function getPostHogConfig(): PostHogConfig {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) {
    throw new Error('POSTHOG_API_KEY environment variable is required');
  }

  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!projectId) {
    throw new Error('POSTHOG_PROJECT_ID environment variable is required');
  }

  // Default to EU host for GDPR compliance
  const host = process.env.POSTHOG_HOST || 'https://eu.posthog.com';
  
  return {
    apiKey,
    host,
    projectId,
    timeout: parseInt(process.env.POSTHOG_TIMEOUT || '10000'),
    retryAttempts: parseInt(process.env.POSTHOG_RETRY_ATTEMPTS || '3'),
  };
}
