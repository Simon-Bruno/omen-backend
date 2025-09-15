import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { authMiddleware } from '@interfaces/http/middleware/auth';
import { requireAuth } from '@interfaces/http/middleware/authorization';
import { shopifyOAuth, shopify } from '@infra/external/shopify';
import { userService } from '@infra/services/user';

export async function shopifyRoutes(fastify: FastifyInstance) {
  /**
   * Generate Shopify OAuth URL for store connection (for authenticated users)
   */
  fastify.post('/auth/shopify/connect', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { shop } = request.body as { shop: string };

      if (!shop) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Shop domain is required',
        });
      }

      // Normalize shop domain
      const normalizedShop = shopify.normalizeShopDomain(shop);
      
      // Generate OAuth URL
      const { oauthUrl, state } = shopifyOAuth.generateAuthenticatedOAuthUrl(normalizedShop, request.userId!);

      return {
        oauthUrl,
        state,
        shop: normalizedShop,
      };

    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Shopify connect URL generation error:');

      if (error instanceof Error && error.message.includes('Invalid shop domain')) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: error.message,
        });
      }

      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to generate Shopify OAuth URL',
      });
    }
  });

  /**
   * Shopify OAuth callback endpoint (for authenticated users)
   */
  fastify.get('/auth/shopify/callback', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      // Validate OAuth callback parameters
      const validation = shopify.validateCallbackParams(request.query as Record<string, string>);
      
      if (!validation.isValid) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: validation.error,
        });
      }

      const { code, shop, hmac, state } = validation.params!;

      // Handle OAuth callback
      const { shopProfile, encryptedToken } = await shopifyOAuth.handleAuthenticatedCallback(
        code, shop, hmac, state, request.userId!
      );
      
      // Bind project to user
      const user = await userService.bindProjectToUser(
        request.userId!,
        shopProfile.myshopify_domain,
        encryptedToken
      );

      // Return success response
      return {
        message: 'Shopify store connected successfully',
        shop: {
          id: shopProfile.id,
          name: shopProfile.name,
          domain: shopProfile.myshopify_domain,
          email: shopProfile.email,
          planName: shopProfile.planName,
          currency: shopProfile.currency,
          timezone: shopProfile.timezone,
          country: shopProfile.country,
        },
        project: user.project,
      };

    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Shopify OAuth callback error:');

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('already has a project')) {
          return reply.status(409).send({
            error: 'CONFLICT',
            message: error.message,
          });
        }

        if (error.message.includes('Invalid or expired state parameter')) {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: error.message,
          });
        }

        if (error.message.includes('Failed to exchange code')) {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: 'Invalid authorization code or shop domain',
          });
        }

        if (error.message.includes('Failed to fetch shop profile')) {
          return reply.status(400).send({
            error: 'BAD_REQUEST',
            message: 'Failed to fetch shop information. Please check your permissions.',
          });
        }
      }

      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to connect Shopify store',
      });
    }
  });
}
