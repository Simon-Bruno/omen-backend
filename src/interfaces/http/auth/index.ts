import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { auth } from '@infra/auth';
import { betterAuthMiddleware } from '@interfaces/http/middleware/better-auth';

export async function authRoutes(fastify: FastifyInstance) {
  // Register Better Auth API routes
  fastify.all('/auth/*', async (request, reply) => {
    try {
      // Convert Fastify request to a format Better Auth expects
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();

      // Copy headers from Fastify request
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      });

      const betterAuthRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? JSON.stringify(request.body) : undefined,
      });

      const response = await auth.handler(betterAuthRequest);

      // Convert Response back to Fastify reply
      const responseBody = await response.text();
      reply.status(response.status);

      // Copy headers from response (including cookies)
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      return reply.send(responseBody);
    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Better Auth handler error:');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Authentication service error',
      });
    }
  });

  // Get current session using Better Auth with enhanced project data
  fastify.get('/auth/get-session', async (request, reply) => {
    try {
      const headers = new Headers();

      // Copy headers from Fastify request
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      });

      const sessionData = await auth.api.getSession({
        headers,
      });

      if (!sessionData || !sessionData.session || !sessionData.user) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'No active session',
        });
      }

      // Get user with project data from our database
      const { userService } = await import('@infra/dal/user');
      const user = await userService.getUserById(sessionData.user.id);

      if (!user) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Return enhanced session data with project information
      return reply.send({
        session: sessionData.session,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          project: user.project ? {
            id: user.project.id,
            shopDomain: user.project.shopDomain,
            brandAnalysis: user.project.brandAnalysis,
          } : null,
        },
      });
    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Get session error:');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch session information',
      });
    }
  });

  // Get current session with user details (protected)
  fastify.get('/session', { preHandler: [betterAuthMiddleware] }, async (request, reply) => {
    try {
      const { userService } = await import('@infra/dal/user');
      const user = await userService.getUserById(request.userId!);

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
          name: user.name,
          emailVerified: user.emailVerified,
          project: user.project ? {
            id: user.project.id,
            shopDomain: user.project.shopDomain,
            brandAnalysis: user.project.brandAnalysis,
          } : null,
        },
      };
    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Get session error:');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch session information',
      });
    }
  });

  // Sign out (protected)
  fastify.post('/signout', { preHandler: [betterAuthMiddleware] }, async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const fetchHeaders = new Headers(request.headers as HeadersInit);

        await auth.api.signOut({
          headers: fetchHeaders,
        });
      }

      return {
        message: 'Signed out successfully',
      };
    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Sign out error:');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to sign out',
      });
    }
  });

  // Complete registration with Shopify integration
  fastify.post('/auth/register-with-shopify', async (request, reply) => {
    try {
      const { email, password, name, shop } = request.body as {
        email: string;
        password: string;
        name: string;
        shop: string;
      };

      // Validate shop domain format
      if (!shop.endsWith('.myshopify.com')) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: 'Invalid Shopify domain format. Must end with .myshopify.com',
        });
      }

      // Check if user already exists
      const { userService } = await import('@infra/dal/user');
      const existingUser = await userService.getUserByBetterAuthId(email);
      if (existingUser) {
        return reply.status(409).send({
          error: 'CONFLICT',
          message: 'User with this email already exists',
        });
      }

      // Step 1: Create user with Better Auth using the handler to get proper cookies
      const url = new URL('/api/auth/sign-up/email', `http://${request.headers.host}`);
      const headers = new Headers();

      // Copy headers from Fastify request
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      });

      const betterAuthRequest = new Request(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password, name }),
      });

      const betterAuthResponse = await auth.handler(betterAuthRequest);
      const responseBody = await betterAuthResponse.text();

      if (!betterAuthResponse.ok) {
        return reply.status(betterAuthResponse.status).send(responseBody);
      }

      const signUpData = JSON.parse(responseBody);

      // Step 2: Create user in our database
      await userService.getOrCreateUser(
        signUpData.user.id,
        email,
        name
      );

      // Step 3: Generate Shopify OAuth URL
      const { shopifyOAuth } = await import('@infra/external/shopify');
      const { oauthUrl, state } = shopifyOAuth.generateRegistrationOAuthUrl(shop, email);

      // Copy cookies from Better Auth response
      betterAuthResponse.headers.forEach((value, key) => {
        if (key.toLowerCase().includes('cookie') || key.toLowerCase().includes('set-')) {
          reply.header(key, value);
        }
      });

      return {
        message: 'User created successfully, proceed to Shopify OAuth',
        session: signUpData.session,
        user: signUpData.user,
        oauthUrl,
        state,
        shop,
      };

    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Registration with Shopify error:');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to complete registration',
      });
    }
  });

  // Handle Shopify OAuth callback for Better Auth registration
  fastify.get('/auth/shopify/register-callback', async (request, reply) => {
    try {
      // Validate OAuth callback parameters
      const { shopify } = await import('@infra/external/shopify');
      const validation = shopify.validateCallbackParams(request.query as Record<string, string>);

      if (!validation.isValid) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: validation.error,
        });
      }

      const { code, shop, hmac, state } = validation.params!;

      // Handle OAuth callback for registration
      const { shopifyOAuth } = await import('@infra/external/shopify');
      const { shopProfile, email, encryptedToken } = await shopifyOAuth.handleRegistrationCallback(
        code, shop, hmac, state
      );

      // Find the user by email and complete the registration
      const { userService } = await import('@infra/dal/user');
      const user = await userService.getUserByEmail(email);

      if (!user) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'User not found. Please try registration again.',
        });
      }

      // Create project and bind to user
      await userService.bindProjectToUser(
        user.id,
        shopProfile.myshopify_domain,
        encryptedToken
      );

      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const successUrl = `${frontendUrl}`;

      return reply.redirect(successUrl);

    } catch (error: unknown) {
      fastify.log.error({ err: error }, 'Better Auth Shopify registration callback error:');

      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const errorUrl = `${frontendUrl}/register?error=shopify_connection_failed`;

      return reply.redirect(errorUrl);
    }
  });
}
