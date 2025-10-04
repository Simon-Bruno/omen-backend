/**
 * Fastify Type Augmentation
 * 
 * This file extends Fastify's built-in types to include our custom properties.
 * This is the proper way to extend FastifyRequest in TypeScript.
 */

import 'fastify';
import type { DiagnosticsService } from '../domain/analytics/diagnostics';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string; // Auth0 user ID
      email: string;
      email_verified: boolean;
      project?: {
        id: string;
        shopDomain: string;
        brandAnalysis: any;
      } | null;
    };
    userId?: string; // Our internal user ID
    projectId?: string; // User's project ID
  }

  interface FastifyInstance {
    diagnosticsService: DiagnosticsService;
  }
}
