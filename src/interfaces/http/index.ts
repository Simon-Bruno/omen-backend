import type { FastifyInstance } from 'fastify/types/instance.js';
import { healthRoutes } from './health';
import { userRoutes } from './user/index';
import { userRegistrationRoutes } from './user/register';
import { shopifyRoutes } from './shopify';
import { chatRoutes } from './chat';
import { brandSummaryRoutes } from './project/brandSummary';
import { jobRoutes } from './project/jobs';
import { screenshotRoutes } from './screenshots';
import { experimentRoutes } from './experiment/index';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
    await fastify.register(healthRoutes);
    await fastify.register(userRoutes);
    await fastify.register(userRegistrationRoutes);
    await fastify.register(shopifyRoutes);
    await fastify.register(chatRoutes);
    await fastify.register(brandSummaryRoutes);
    await fastify.register(jobRoutes);
    await fastify.register(screenshotRoutes);
    await fastify.register(experimentRoutes);
}
