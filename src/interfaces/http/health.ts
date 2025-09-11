import type { FastifyInstance } from 'fastify/types/instance.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@infra/prisma';

export async function healthRoutes(fastify: FastifyInstance) {
    // Health check route (public)
    fastify.get('/healthz', async (_request: FastifyRequest, _reply: FastifyReply) => {
        return { ok: true };
    });

    // Database health check route (public)
    fastify.get('/healthz/db', async (_request: FastifyRequest, _reply: FastifyReply) => {
        try {
            await prisma.$queryRaw`SELECT 1`;
            return { ok: true, database: 'connected' };
        } catch (error) {
            fastify.log.error(error);
            return { ok: false, database: 'disconnected' };
        }
    });
}
