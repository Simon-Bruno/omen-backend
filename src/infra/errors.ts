import type { FastifyReply } from 'fastify/types/reply.js';
import { JsonWebTokenError, TokenExpiredError as JWTTokenExpiredError, NotBeforeError } from 'jsonwebtoken';

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

// Cloudflare KV specific errors
export class CloudflareKVError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'CloudflareKVError';
  }
}

export class KVValueWriteFailedError extends CloudflareKVError {
  constructor(experimentId: string, details?: unknown) {
    super(500, 'KV_VALUE_WRITE_FAILED', `Failed to write experiment ${experimentId} to KV store`, details);
  }
}

export class KVIndexWriteFailedError extends CloudflareKVError {
  constructor(experimentId: string, details?: unknown) {
    super(500, 'KV_INDEX_WRITE_FAILED', `Failed to update CONFIG_INDEX for experiment ${experimentId}`, details);
  }
}

export class KVConnectionError extends CloudflareKVError {
  constructor(details?: unknown) {
    super(503, 'KV_CONNECTION_ERROR', 'Failed to connect to Cloudflare KV', details);
  }
}

export class KVRateLimitError extends CloudflareKVError {
  constructor(retryAfter?: number, details?: unknown) {
    const errorDetails = details && typeof details === 'object' ? { retryAfter, ...details } : { retryAfter, details };
    super(429, 'KV_RATE_LIMIT_ERROR', 'Cloudflare KV rate limit exceeded', errorDetails);
  }
}

// PostHog specific errors
export class PostHogError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PostHogError';
  }
}

export class PostHogConnectionError extends PostHogError {
  constructor(details?: unknown) {
    super(503, 'POSTHOG_CONNECTION_ERROR', 'Failed to connect to PostHog', details);
  }
}

export class PostHogQueryError extends PostHogError {
  constructor(message: string, details?: unknown) {
    super(400, 'POSTHOG_QUERY_ERROR', message, details);
  }
}

export class PostHogRateLimitError extends PostHogError {
  constructor(retryAfter?: number, details?: unknown) {
    const errorDetails = details && typeof details === 'object' ? { retryAfter, ...details } : { retryAfter, details };
    super(429, 'POSTHOG_RATE_LIMIT_ERROR', 'PostHog rate limit exceeded', errorDetails);
  }
}

/**
 * Error handler for authentication and authorization errors
 */
export const handleAuthError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof AuthError) {
    const response: Record<string, unknown> = {
      error: error.errorCode,
      message: error.message,
    };
    
    if (error.details && typeof error.details === 'object' && error.details !== null) {
      response.details = error.details;
    }
    
    return reply.status(error.statusCode).send(response);
  }

  // Handle JWT-specific errors using built-in classes
  if (error instanceof JWTTokenExpiredError) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Token has expired. Please refresh your authentication.',
      details: {
        expiredAt: error.expiredAt,
      },
    });
  }

  if (error instanceof NotBeforeError) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Token is not yet valid.',
      details: {
        notBefore: error.date,
      },
    });
  }

  if (error instanceof JsonWebTokenError) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Invalid token. Please authenticate again.',
      details: {
        reason: error.message,
      },
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
