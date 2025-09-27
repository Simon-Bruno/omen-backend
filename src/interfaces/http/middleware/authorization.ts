import type { FastifyRequest } from 'fastify/types/request.js';
import type { FastifyReply } from 'fastify/types/reply.js';
import '@shared/fastify.d';
import type { ProjectParams, ProjectBody } from '@shared/types';

/**
 * Authorization guard middleware
 * Ensures all protected routes require projectId ownership
 */
export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.userId) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  // If no projectId in request context, user needs to bind a project first
  if (!request.projectId) {
    return reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'No project bound to user. Please connect a project first.'
    });
  }
};

/**
 * Authorization guard for project-specific operations
 * Ensures user owns the specified project
 */
export const requireProjectOwnership = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.userId) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  // Extract projectId from route params or body
  const projectId = (request.params as ProjectParams)?.projectId || (request.body as ProjectBody)?.projectId;

  if (!projectId) {
    return reply.status(400).send({
      error: 'BAD_REQUEST',
      message: 'Project ID is required'
    });
  }

  // Check if user owns this project
  const { userService } = await import('@infra/dal/user');
  const ownsProject = await userService.userOwnsProject(request.userId, projectId);

  if (!ownsProject) {
    return reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Access denied. You do not own this project.'
    });
  }

  // Attach projectId to request context for downstream handlers
  request.projectId = projectId;
};

/**
 * Optional project ownership check
 * Used for routes that can work with or without a specific project
 */
export const optionalProjectOwnership = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.userId) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  const projectId = (request.params as ProjectParams)?.projectId || (request.body as ProjectBody)?.projectId;

  if (projectId) {
    const { userService } = await import('@infra/dal/user');
    const ownsProject = await userService.userOwnsProject(request.userId, projectId);

    if (!ownsProject) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Access denied. You do not own this project.'
      });
    }

    request.projectId = projectId;
  }
};
