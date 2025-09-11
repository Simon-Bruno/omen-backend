/**
 * Cloudflare KV Configuration
 */

export interface CloudflareKVConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
  baseUrl: string;
}

export class CloudflareConfig {
  private static instance: CloudflareKVConfig;

  static getInstance(): CloudflareKVConfig {
    if (!CloudflareConfig.instance) {
      CloudflareConfig.instance = {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        namespaceId: process.env.CLOUDFLARE_KV_NAMESPACE_ID!,
        apiToken: process.env.CLOUDFLARE_API_TOKEN!,
        baseUrl: process.env.CLOUDFLARE_API_BASE_URL || 'https://api.cloudflare.com/client/v4',
      };

      // Validate required environment variables
      const requiredEnvVars = [
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_KV_NAMESPACE_ID',
        'CLOUDFLARE_API_TOKEN',
      ];

      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          throw new Error(`Missing required environment variable: ${envVar}`);
        }
      }
    }

    return CloudflareConfig.instance;
  }

  static reset(): void {
    CloudflareConfig.instance = undefined as any;
  }
}
