import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { betterAuthMiddleware } from '@interfaces/http/middleware/better-auth';
import { requireAuth } from '@interfaces/http/middleware/authorization';
import { userService } from '@infra/dal/user';

export async function userRoutes(fastify: FastifyInstance) {

    /**
     * Get user by ID
     */
    fastify.get('/:userId', { preHandler: [betterAuthMiddleware, requireAuth] }, async (request, reply) => {
        try {
            const { userId } = request.params as { userId: string };

            const user = await userService.getUserById(userId);

            if (!user) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'User not found',
                });
            }

            return {
                user: {
                    id: user.id,
                    email: user.email,
                    projectId: user.project?.id,
                },
                project: user.project ? {
                    id: user.project.id,
                    shopDomain: user.project.shopDomain,
                } : null,
            };

        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Get user error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to fetch user information',
            });
        }
    });

    /**
     * Update user email
     */
    fastify.patch('/:userId', { preHandler: [betterAuthMiddleware, requireAuth] }, async (request, reply) => {
        try {
            const { userId } = request.params as { userId: string };
            const { email } = request.body as { email: string };

            if (!email) {
                return reply.status(400).send({
                    error: 'BAD_REQUEST',
                    message: 'Email is required',
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return reply.status(400).send({
                    error: 'BAD_REQUEST',
                    message: 'Invalid email format',
                });
            }

            const user = await userService.updateUserEmail(userId, email);

            return {
                message: 'User updated successfully',
                user: {
                    id: user.id,
                    email: user.email,
                    projectId: user.project?.id,
                },
            };

        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Update user error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to update user',
            });
        }
    });

    /**
     * Delete user
     */
    fastify.delete('/:userId', { preHandler: [betterAuthMiddleware, requireAuth] }, async (request, reply) => {
        try {
            const { userId } = request.params as { userId: string };

            await userService.deleteUser(userId);

            return {
                message: 'User deleted successfully',
            };

        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Delete user error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to delete user',
            });
        }
    });
}
