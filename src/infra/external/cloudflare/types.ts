// Cloudflare Publisher Types
import type { InjectPosition } from '@prisma/client';

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  namespaceId: string;
}

export interface PublishedGoal {
  name: string;
  type: 'conversion' | 'custom';
  selector?: string | null;
  eventType?: string | null;
  customJs?: string | null;
  value?: number | null;
}

export interface PublishedExperiment {
  id: string;
  projectId: string;
  name: string;
  status: string;
  oec: string;
  traffic: Record<string, number>;
  variants: Record<string, PublishedVariant>;
  goals?: PublishedGoal[]; // Universal conversion tracking goals
  targetUrls?: string[]; // URL patterns for targeting
  targeting?: {
    match?: 'all' | 'any';
    timeoutMs?: number;
    rules: Array<
      | { type: 'selectorExists'; selector: string }
      | { type: 'selectorNotExists'; selector: string }
      | { type: 'textContains'; selector: string; text: string }
      | { type: 'attrEquals'; selector: string; attr: string; value: string }
      | { type: 'meta'; name: string; value: string; by?: 'name' | 'property' }
      | { type: 'cookie'; name: string; value: string }
      | { type: 'localStorage'; key: string; value: string }
      | { type: 'urlParam'; name: string; value: string }
    >;
  };
}

export interface PublishedVariant {
  selector: string;
  html: string;
  css: string;
  js: string; // Always included, even if empty
  position: InjectPosition;
}

export interface CloudflarePublishResult {
  success: boolean;
  experimentId: string;
  key?: string;
  error?: string;
}
