import type { FastifyInstance } from 'fastify/types/instance.js';
import { healthRoutes } from './health';
import { userRoutes } from './user/index';
import { authRoutes } from './auth/index';
import { shopifyRoutes } from './shopify';
import { chatRoutes } from './chat';
import { brandSummaryRoutes } from './project/brandSummary';
import { jobRoutes } from './project/jobs';
import { projectResetRoutes } from './project/reset';
import { screenshotRoutes } from './screenshots';
import { experimentRoutes } from './experiment/index';
import { analyticsRoutes } from './analytics/index';
import { webPixelRoutes } from './shopify/web-pixel';
import betterAuthPlugin from './plugins/better-auth-plugin';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Register Better Auth plugin first
    await fastify.register(betterAuthPlugin);
    
    await fastify.register(healthRoutes);
    await fastify.register(authRoutes);
    await fastify.register(userRoutes);
    await fastify.register(shopifyRoutes);
    await fastify.register(chatRoutes);
    await fastify.register(brandSummaryRoutes);
    await fastify.register(jobRoutes);
    await fastify.register(projectResetRoutes);
    await fastify.register(screenshotRoutes);
    await fastify.register(experimentRoutes);
    await fastify.register(analyticsRoutes, { prefix: 'analytics' });
    await fastify.register(webPixelRoutes, { prefix: 'api' });
}
