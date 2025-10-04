import { FastifyInstance } from 'fastify';
import { serviceContainer } from '@app/container';
import { authMiddleware } from '../middleware/auth';
import { requireAuth, requireProjectOwnership } from '../middleware/authorization';
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
    preHandler: [authMiddleware, requireAuth, requireProjectOwnership],
    handler: getExposureStatsHandler(analyticsService)
  });

  // Raw events query
  fastify.get('/events', {
    schema: getEventsSchema,
    preHandler: [authMiddleware, requireAuth, requireProjectOwnership],
    handler: getEventsHandler(analyticsService)
  });

  // Event count
  fastify.get('/events/count', {
    schema: getEventCountSchema,
    preHandler: [authMiddleware, requireAuth, requireProjectOwnership],
    handler: getEventCountHandler(analyticsService)
  });
}
