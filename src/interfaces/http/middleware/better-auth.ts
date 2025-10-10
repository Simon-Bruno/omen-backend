import type { FastifyRequest } from 'fastify/types/request.js';
import type { FastifyReply } from 'fastify/types/reply.js';
import '@shared/fastify.d';
import { auth } from '@infra/auth';
import { handleAuthError } from '@infra/errors';

/**
 * Better Auth middleware for Fastify
 * Verifies the session and attaches user context to the request
 */
export const betterAuthMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Create headers object for Better Auth (includes cookies)
    const fetchHeaders = new Headers(request.headers as HeadersInit);

    // Verify session using Better Auth
    const sessionData = await auth.api.getSession({
      headers: fetchHeaders,
    });


    if (!sessionData || !sessionData.session || !sessionData.user) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired session'
      });
    }

    // Attach user context to request
    request.user = {
      sub: sessionData.user.id,
      email: sessionData.user.email,
      email_verified: sessionData.user.emailVerified,
    };

    // Get or create user from our database
    const { userService } = await import('@infra/dal/user');
    const user = await userService.getOrCreateUser(
      sessionData.user.id,
      sessionData.user.email,
      sessionData.user.name
    );

    request.userId = user.id;

    // Get user's project ID (single project per user)
    if (user.project) {
      request.projectId = user.project.id;
    }

  } catch (error) {
    return handleAuthError(error, reply);
  }
};
