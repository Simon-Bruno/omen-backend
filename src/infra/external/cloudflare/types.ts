// Cloudflare Publisher Types
import type { InjectPosition } from '@prisma/client';

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  namespaceId: string;
}

export interface PublishedExperiment {
  id: string;
  projectId: string;
  name: string;
  status: string;
  oec: string;
  traffic: Record<string, number>;
  variants: Record<string, PublishedVariant>;
  targetUrls?: string[]; // URL patterns for targeting
}

export interface PublishedVariant {
  selector: string;
  html: string;
  css: string;
  js?: string;
  position: InjectPosition;
}

export interface CloudflarePublishResult {
  success: boolean;
  experimentId: string;
  key?: string;
  error?: string;
}
