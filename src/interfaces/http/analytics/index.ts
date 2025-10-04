import { FastifyInstance } from 'fastify';
import { serviceContainer } from '@app/container';
import { betterAuthMiddleware } from '../middleware/better-auth';
import { requireProject, requireProjectOwnership } from '../middleware/authorization';
import {
  getExposureStatsHandler,
  getEventsHandler,
  getEventCountHandler
} from './handlers';
import {
  getExposureStatsSchema,
  getEventsSchema,
  getEventCountSchema
} from './schemas';

export async function analyticsRoutes(fastify: FastifyInstance) {
  const analyticsService = serviceContainer.getAnalyticsService();

  // Experiment exposure statistics
  fastify.get('/experiments/:experimentId/exposures', {
    schema: getExposureStatsSchema,
    preHandler: [betterAuthMiddleware, requireProject, requireProjectOwnership],
    handler: getExposureStatsHandler(analyticsService)
  });

  // Raw events query
  fastify.get('/events', {
    schema: getEventsSchema,
    preHandler: [betterAuthMiddleware, requireProject, requireProjectOwnership],
    handler: getEventsHandler(analyticsService)
  });

  // Event count
  fastify.get('/events/count', {
    schema: getEventCountSchema,
    preHandler: [betterAuthMiddleware, requireProject, requireProjectOwnership],
    handler: getEventCountHandler(analyticsService)
  });
}
