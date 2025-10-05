import { FastifyInstance } from 'fastify';
import { serviceContainer } from '@app/container';
import { betterAuthMiddleware } from '../middleware/better-auth';
import { requireProject } from '../middleware/authorization';
import {
  getExposureStatsHandler,
  getEventsHandler,
  getEventCountHandler,
  getUserJourneyHandler,
  getFunnelAnalysisHandler,
  getConversionRatesHandler,
  getExperimentSessionsHandler
} from './handlers';
import {
  getExposureStatsSchema,
  getEventsSchema,
  getEventCountSchema,
  getUserJourneySchema,
  getFunnelAnalysisSchema,
  getConversionRatesSchema,
  getExperimentSessionsSchema
} from './schemas';

export async function analyticsRoutes(fastify: FastifyInstance) {
  console.log('[ANALYTICS_ROUTES] Registering analytics routes...');
  const analyticsService = serviceContainer.getAnalyticsService();

  // Experiment exposure statistics
  fastify.get('/experiments/:experimentId/exposures', {
    schema: getExposureStatsSchema,
    preHandler: [betterAuthMiddleware, requireProject],
    handler: getExposureStatsHandler(analyticsService)
  });

  // Raw events query
  fastify.get('/events', {
    schema: getEventsSchema,
    preHandler: [betterAuthMiddleware, requireProject],
    handler: getEventsHandler(analyticsService)
  });

  // Event count
  fastify.get('/events/count', {
    schema: getEventCountSchema,
    preHandler: [betterAuthMiddleware, requireProject],
    handler: getEventCountHandler(analyticsService)
  });

  // User journey - get all events for a specific session
  fastify.get('/journey/:sessionId', {
    schema: getUserJourneySchema,
    preHandler: [betterAuthMiddleware, requireProject],
    handler: getUserJourneyHandler(analyticsService)
  });
  
  console.log('[ANALYTICS_ROUTES] Analytics routes registered successfully');

  // Funnel analysis for an experiment
  fastify.get('/funnel/:experimentId', {
    schema: getFunnelAnalysisSchema,
    preHandler: [betterAuthMiddleware, requireProject],
    handler: getFunnelAnalysisHandler(analyticsService)
  });

  // Conversion rates for an experiment
  fastify.get('/conversions/:experimentId', {
    schema: getConversionRatesSchema,
    preHandler: [betterAuthMiddleware, requireProject],
    handler: getConversionRatesHandler(analyticsService)
  });

  // Sessions for an experiment
  fastify.get('/experiments/:experimentId/sessions', {
    schema: getExperimentSessionsSchema,
    preHandler: [betterAuthMiddleware, requireProject],
    handler: getExperimentSessionsHandler(analyticsService)
  });
}
