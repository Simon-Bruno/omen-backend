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
    // Debug: Log headers and cookies
    console.log('[BETTER_AUTH] Headers:', request.headers);
    console.log('[BETTER_AUTH] Cookies:', request.headers.cookie);
    
    // Create headers object for Better Auth (includes cookies)
    const fetchHeaders = new Headers(request.headers as HeadersInit);

    // Verify session using Better Auth
    const sessionData = await auth.api.getSession({
      headers: fetchHeaders,
    });

    console.log('[BETTER_AUTH] Session data:', sessionData);

    if (!sessionData || !sessionData.session || !sessionData.user) {
      console.log('[BETTER_AUTH] No valid session found');
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
    
    console.log('[BETTER_AUTH] User data:', {
      userId: user.id,
      email: user.email,
      hasProject: !!user.project,
      projectId: user.project?.id
    });
    
    request.userId = user.id;

    // Get user's project ID (single project per user)
    if (user.project) {
      request.projectId = user.project.id;
      console.log('[BETTER_AUTH] Project ID set:', request.projectId);
    } else {
      console.log('[BETTER_AUTH] No project found for user');
    }

  } catch (error) {
    return handleAuthError(error, reply);
  }
};
