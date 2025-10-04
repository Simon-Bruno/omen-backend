import { FastifyRequest, FastifyReply } from 'fastify';
import { AnalyticsService } from '@services/analytics';

export function getExposureStatsHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = request.params as { experimentId: string };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({ error: 'Project ID is required' });
    }

    try {
      const stats = await analyticsService.getExposureStats(projectId, experimentId);
      return reply.send(stats);
    } catch (error) {
      request.log.error(error, 'Failed to get exposure stats');
      return reply.status(500).send({ error: 'Failed to get exposure stats' });
    }
  };
}

export function getEventsHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      experimentId?: string;
      sessionId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({ error: 'Project ID is required' });
    }

    try {
      const analyticsQuery = {
        projectId,
        experimentId: query.experimentId,
        sessionId: query.sessionId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: query.limit || 100,
        offset: query.offset || 0,
      };

      const events = await analyticsService.getEvents(analyticsQuery);
      return reply.send(events);
    } catch (error) {
      request.log.error(error, 'Failed to get events');
      return reply.status(500).send({ error: 'Failed to get events' });
    }
  };
}

export function getEventCountHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      experimentId?: string;
      sessionId?: string;
      startDate?: string;
      endDate?: string;
    };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({ error: 'Project ID is required' });
    }

    try {
      const analyticsQuery = {
        projectId,
        experimentId: query.experimentId,
        sessionId: query.sessionId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      };

      const count = await analyticsService.getEventCount(analyticsQuery);
      return reply.send({ count });
    } catch (error) {
      request.log.error(error, 'Failed to get event count');
      return reply.status(500).send({ error: 'Failed to get event count' });
    }
  };
}
