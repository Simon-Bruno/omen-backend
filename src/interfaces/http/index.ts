import type { FastifyInstance } from 'fastify/types/instance.js';
import { healthRoutes } from './health';
import { userRoutes } from './user/index';
import { userRegistrationRoutes } from './user/register';
import { shopifyRoutes } from './shopify';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Register all route modules
    await fastify.register(healthRoutes);
    await fastify.register(userRoutes);
    await fastify.register(userRegistrationRoutes);
    await fastify.register(shopifyRoutes);
}
