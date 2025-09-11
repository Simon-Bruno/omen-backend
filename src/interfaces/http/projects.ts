import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify';
import { authMiddleware } from '@interfaces/http/middleware/auth';
import { requireAuth, requireProjectOwnership } from '@interfaces/http/middleware/authorization';

export async function projectRoutes(fastify: FastifyInstance) {
    // Project binding route (protected, for first-time setup)
    fastify.post('/api/projects/bind', { preHandler: [authMiddleware, requireAuth] }, async (request, reply) => {
        try {
            const { shopDomain, accessToken } = request.body as { shopDomain: string; accessToken: string };

            if (!shopDomain || !accessToken) {
                return reply.status(400).send({
                    error: 'BAD_REQUEST',
                    message: 'shopDomain and accessToken are required',
                });
            }

            const { auth0 } = await import('@infra/auth0');
            const user = await auth0.bindProjectToUser(request.userId!, shopDomain, accessToken);

            return {
                message: 'Project bound successfully',
                project: user.project,
            };
        } catch (error: unknown) {
            if (error instanceof Error && error.message?.includes('already has a project')) {
                return reply.status(409).send({
                    error: 'CONFLICT',
                    message: error.message,
                });
            }

            fastify.log.error({ err: error }, 'Project binding error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to bind project',
            });
        }
    });

    // Example protected route that requires project ownership
    fastify.get('/api/projects/:projectId/experiments', {
        preHandler: [authMiddleware, requireProjectOwnership]
    }, async (request, _reply) => {
        // This route is now protected and request.projectId is guaranteed to be valid
        return {
            message: `Accessing experiments for project ${request.projectId}`,
            // Add your experiment logic here
        };
    });
}
