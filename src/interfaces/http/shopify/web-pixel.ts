import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { betterAuthMiddleware } from '@interfaces/http/middleware/better-auth';
import { createWebPixelWithEncryptedToken } from '@infra/external/shopify/web-pixel';

export async function webPixelRoutes(fastify: FastifyInstance) {
  // Create web pixel for current user's Shopify store
  fastify.post('/web-pixel/create', { preHandler: [betterAuthMiddleware] }, async (request, reply) => {
    try {
      const { userService } = await import('@infra/dal/user');
      const user = await userService.getUserById(request.userId!);

      if (!user) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (!user.project?.isShopify || !user.project?.accessTokenEnc) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'User does not have a Shopify store connected',
        });
      }

      const result = await createWebPixelWithEncryptedToken(
        user.project.shopDomain,
        user.project.accessTokenEnc
      );

      if (result.success) {
        return reply.send({
          message: 'Web pixel created successfully',
          webPixelId: result.webPixelId,
        });
      } else {
        return reply.status(500).send({
          error: 'WEB_PIXEL_CREATION_FAILED',
          message: result.error,
        });
      }
    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Web pixel creation error:');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create web pixel',
      });
    }
  });

  // Get web pixel status (placeholder for future implementation)
  fastify.get('/web-pixel/status', { preHandler: [betterAuthMiddleware] }, async (request, reply) => {
    try {
      const { userService } = await import('@infra/dal/user');
      const user = await userService.getUserById(request.userId!);

      if (!user) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (!user.project?.isShopify) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'User does not have a Shopify store connected',
        });
      }

      // For now, just return that the store is connected
      // In the future, we could query the actual web pixel status
      return reply.send({
        message: 'Web pixel status check not implemented yet',
        storeConnected: true,
        shopDomain: user.project.shopDomain,
      });
    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Web pixel status error:');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to check web pixel status',
      });
    }
  });
}
