import type { FastifyReply } from 'fastify/types/reply.js';

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Authentication required', details?: unknown) {
    super(401, 'UNAUTHORIZED', message, details);
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = 'Access denied', details?: unknown) {
    super(403, 'FORBIDDEN', message, details);
  }
}

export class TokenExpiredError extends UnauthorizedError {
  constructor() {
    super('Token has expired. Please refresh your authentication.');
  }
}

export class InvalidTokenError extends UnauthorizedError {
  constructor() {
    super('Invalid token. Please authenticate again.');
  }
}

export class MissingTokenError extends UnauthorizedError {
  constructor() {
    super('No authentication token provided.');
  }
}

export class ProjectNotBoundError extends ForbiddenError {
  constructor() {
    super('No project bound to user. Please connect a project first.');
  }
}

export class ProjectOwnershipError extends ForbiddenError {
  constructor(projectId?: string) {
    super(
      projectId 
        ? `Access denied. You do not own project ${projectId}.`
        : 'Access denied. You do not own this project.'
    );
  }
}

/**
 * Error handler for authentication and authorization errors
 */
export const handleAuthError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof AuthError) {
    return reply.status(error.statusCode).send({
      error: error.errorCode,
      message: error.message,
      ...(error.details && typeof error.details === 'object' && { details: error.details }),
    });
  }

  // Handle JWT-specific errors
  if (error && typeof error === 'object' && 'name' in error && error.name === 'UnauthorizedError') {
    const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : '';
    if (errorMessage.includes('jwt expired')) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Token has expired. Please refresh your authentication.',
      });
    }
    
    if (errorMessage.includes('jwt malformed') || errorMessage.includes('invalid token')) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid token. Please authenticate again.',
      });
    }

    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication failed.',
    });
  }

  // Handle JWKS errors
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.includes('JWKS')) {
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Authentication service temporarily unavailable.',
    });
  }

  // Generic error fallback
  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  });
};
