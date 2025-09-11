import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify';
import { authMiddleware } from '@interfaces/http/middleware/auth';
import { requireAuth } from '@interfaces/http/middleware/authorization';

export async function userRoutes(fastify: FastifyInstance) {
    // Auth0 user info route (protected)
    fastify.get('/api/me', { preHandler: [authMiddleware, requireAuth] }, async (request, _reply) => {
        return {
            user: {
                id: request.userId,
                email: request.user?.email,
                projectId: request.projectId,
            },
        };
    });
}
