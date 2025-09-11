import type { FastifyInstance } from 'fastify/types/instance.js';
import { healthRoutes } from './health';
import { userRoutes } from './user';
import { projectRoutes } from './projects';
import { authRoutes } from './auth';
import { experimentRoutes } from './experiments';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Register all route modules
    await fastify.register(healthRoutes);
    await fastify.register(userRoutes);
    await fastify.register(projectRoutes);
    await fastify.register(authRoutes);
    await fastify.register(experimentRoutes);
}
