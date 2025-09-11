import type { FastifyRequest } from 'fastify/types/request.js';
import type { FastifyReply } from 'fastify/types/reply.js';
import '@shared/fastify';
import { auth0Config } from '@infra/config/auth0';
import { handleAuthError } from '@infra/errors';
import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

// FastifyRequest types are extended in @shared/fastify.d.ts

// Create JWKS client
const client = jwksClient({
  jwksUri: auth0Config.jwksUri,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

/**
 * Get signing key for JWT verification
 */
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Auth0 JWT verification middleware for Fastify
 * Verifies the JWT token and attaches user context to the request
 */
export const authMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Extract the Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        error: 'UNAUTHORIZED', 
        message: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the JWT token
    const payload = await new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(token, getKey, {
        audience: auth0Config.audience,
        issuer: auth0Config.issuer,
        algorithms: ['RS256'],
      }, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded as JwtPayload);
        }
      });
    });

    if (!payload || typeof payload !== 'object') {
      return reply.status(401).send({ 
        error: 'UNAUTHORIZED', 
        message: 'Invalid token payload' 
      });
    }

    // Attach user context to request
    request.user = {
      sub: payload.sub as string,
      email: (payload.email as string) || '',
      email_verified: (payload.email_verified as boolean) || false,
    };

    // Get or create user in our database
    const { auth0 } = await import('@infra/auth0');
    const user = await auth0.getOrCreateUser(payload.sub as string, payload.email as string);
    request.userId = user.id;

    // Get user's project ID (single project per user)
    if (user.project) {
      request.projectId = user.project.id;
    }

  } catch (error) {
    return handleAuthError(error, reply);
  }
};
