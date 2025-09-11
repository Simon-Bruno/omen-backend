import type { FastifyInstance } from 'fastify/types/instance.js';
import crypto from 'crypto';
import { setInterval } from 'timers';
import '@shared/fastify.d';
import { authMiddleware } from '@interfaces/http/middleware/auth';
import { requireAuth } from '@interfaces/http/middleware/authorization';
import { shopify, shopifyConfig } from '@infra/external/shopify';
import { encrypt, verifyHmac } from '@infra/encryption';
import { auth0 } from '@infra/auth0';

// Simple in-memory state store for OAuth replay protection
const stateStore = new Map<string, { userId: string; timestamp: number }>();

// Clean up expired states every 10 minutes (states expire after 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    if (now - data.timestamp > 60 * 60 * 1000) { // 1 hour
      stateStore.delete(state);
    }
  }
}, 10 * 60 * 1000); // 10 minutes

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Shopify OAuth callback endpoint
   * Handles the OAuth flow: code exchange, HMAC verification, shop profile fetch, project upsert
   */
  fastify.get('/auth/shopify/callback', { preHandler: [authMiddleware, requireAuth] }, async (request, reply) => {
    try {
      const { code, shop, hmac, state } = request.query as {
        code?: string;
        shop?: string;
        hmac?: string;
        state?: string;
      };

      // Validate required parameters
      if (!code || !shop || !hmac || !state) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Missing required parameters: code, shop, hmac, state',
        });
      }

      // Validate state parameter for replay protection
      const stateData = stateStore.get(state);
      if (!stateData || stateData.userId !== request.userId) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Invalid or expired state parameter',
        });
      }

      // Remove state after validation (one-time use)
      stateStore.delete(state);

      // Validate shop domain format
      if (!shopify.validateShopDomain(shop)) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Invalid shop domain format',
        });
      }

      // Verify HMAC for security
      // Remove 'hmac' from the query string for verification
      const queryWithoutHmac = { ...(request.query as Record<string, string>) };
      delete queryWithoutHmac.hmac;
      const queryStringWithoutHmac = Object.keys(queryWithoutHmac)
        .sort()
        .map(key => `${key}=${encodeURIComponent(queryWithoutHmac[key])}`)
        .join('&');

      if (!verifyHmac(queryStringWithoutHmac, shopifyConfig.apiSecret, hmac)) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Invalid HMAC signature',
        });
      }

      // Exchange code for access token
      const tokenResponse = await shopify.exchangeCodeForToken(shop, code);
      
      // Fetch shop profile
      const shopProfile = await shopify.getShopProfile(shop, tokenResponse.access_token);
      
      // Encrypt the access token before storing
      const encryptedToken = encrypt(tokenResponse.access_token);
      
      // Bind project to user (this will create or update the project)
      const user = await auth0.bindProjectToUser(
        request.userId!,
        shopProfile.myshopifyDomain,
        encryptedToken
      );

      // Return success response
      return {
        message: 'Shopify store connected successfully',
        shop: {
          id: shopProfile.id,
          name: shopProfile.name,
          domain: shopProfile.myshopifyDomain,
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

        if (error.message.includes('Invalid shop domain')) {
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

  /**
   * Generate Shopify OAuth URL for store connection
   * This endpoint can be used by the frontend to initiate the OAuth flow
   */
  fastify.post('/auth/shopify/connect', { preHandler: [authMiddleware, requireAuth] }, async (request, reply) => {
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
      
      // Generate state parameter and store it for validation
      const state = crypto.randomBytes(16).toString('hex');
      stateStore.set(state, { userId: request.userId!, timestamp: Date.now() });
      
      // Generate OAuth URL
      const oauthUrl = shopify.generateOAuthUrl(normalizedShop, state);

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
}
