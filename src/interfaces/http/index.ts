import type { FastifyInstance } from 'fastify/types/instance.js';
import { healthRoutes } from './health.js';
import { userRoutes } from './user.js';
import { projectRoutes } from './projects.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Register all route modules
    await fastify.register(healthRoutes);
    await fastify.register(userRoutes);
    await fastify.register(projectRoutes);
}
