import { FastifyRequest, FastifyReply } from 'fastify';
import { AnalyticsService } from '@services/analytics';

export function getExposureStatsHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = request.params as { experimentId: string };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({ 
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
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
      return reply.status(400).send({ 
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
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

      const events = await analyticsService.getEventsWithAttribution(analyticsQuery);
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
      return reply.status(400).send({ 
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
    }

    try {
      const analyticsQuery = {
        projectId,
        experimentId: query.experimentId,
        sessionId: query.sessionId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      };

      const events = await analyticsService.getEventsWithAttribution(analyticsQuery);
      const count = events.length;
      return reply.send({ count });
    } catch (error) {
      request.log.error(error, 'Failed to get event count');
      return reply.status(500).send({ error: 'Failed to get event count' });
    }
  };
}

export function getUserJourneyHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string };
    const projectId = request.projectId; // From middleware

    console.log('[ANALYTICS] getUserJourney called:', {
      sessionId,
      projectId,
      hasProjectId: !!projectId,
      hasSessionId: !!sessionId
    });

    if (!projectId) {
      console.log('[ANALYTICS] Missing projectId');
      return reply.status(400).send({ 
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
    }

    if (!sessionId) {
      console.log('[ANALYTICS] Missing sessionId');
      return reply.status(400).send({ error: 'Session ID is required' });
    }

    try {
      console.log('[ANALYTICS] Calling getUserJourney service...');
      const journey = await analyticsService.getEventsWithAttribution({
        projectId,
        sessionId,
        limit: 1000
      });
      console.log('[ANALYTICS] getUserJourney result:', { count: journey.length });
      console.log('[ANALYTICS] First event properties:', journey[0]?.properties);
      console.log('[ANALYTICS] All events properties check:');
      journey.forEach((event, index) => {
        console.log(`[ANALYTICS] Event ${index}:`, {
          eventType: event.eventType,
          hasProperties: !!event.properties,
          propertiesKeys: event.properties ? Object.keys(event.properties) : 'NO PROPERTIES',
          propertiesValue: event.properties
        });
      });

      // Create summary of the session
      const variantsSeen = new Set<string>();
      const pagesVisited = new Set<string>();
      const eventTypes = new Set<string>();

      journey.forEach(event => {
        eventTypes.add(event.eventType);
        
        if (event.eventType === 'EXPOSURE') {
          const variantKey = (event.properties as any)?.variantKey;
          if (variantKey) {
            variantsSeen.add(variantKey);
          }
        }
        
        if (event.eventType === 'PAGEVIEW') {
          const url = (event.properties as any)?.url;
          if (url) {
            pagesVisited.add(url);
          }
        }
      });

      const summary = {
        totalEvents: journey.length,
        variantsSeen: Array.from(variantsSeen),
        pagesVisited: Array.from(pagesVisited),
        eventTypes: Array.from(eventTypes)
      };

      const response = { 
        sessionId,
        summary,
        journey,
        debugInfo: {
          serverTimestamp: new Date().toISOString(),
          totalEvents: journey.length,
          firstEventProperties: journey[0]?.properties,
          serverVersion: 'v1.0.0-debug'
        }
      };
      
      console.log('[ANALYTICS] Sending response, first journey event properties:', response.journey[0]?.properties);
      console.log('[ANALYTICS] Full first journey event:', JSON.stringify(response.journey[0], null, 2));
      
      return reply.send(response);
    } catch (error) {
      console.log('[ANALYTICS] getUserJourney error:', error);
      request.log.error(error, 'Failed to get user journey');
      return reply.status(500).send({ error: 'Failed to get user journey' });
    }
  };
}

export function getFunnelAnalysisHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = request.params as { experimentId: string };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({ 
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
    }

    if (!experimentId) {
      return reply.status(400).send({ error: 'Experiment ID is required' });
    }

    try {
      const funnelAnalysis = await analyticsService.getFunnelAnalysis(projectId, experimentId);
      return reply.send(funnelAnalysis);
    } catch (error) {
      request.log.error(error, 'Failed to get funnel analysis');
      return reply.status(500).send({ error: 'Failed to get funnel analysis' });
    }
  };
}

export function getConversionRatesHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = request.params as { experimentId: string };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
    }

    if (!experimentId) {
      return reply.status(400).send({ error: 'Experiment ID is required' });
    }

    try {
      const conversionRates = await analyticsService.getConversionRates(projectId, experimentId);
      return reply.send({ conversionRates });
    } catch (error) {
      request.log.error(error, 'Failed to get conversion rates');
      return reply.status(500).send({ error: 'Failed to get conversion rates' });
    }
  };
}

export function getPurchaseStatsHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = request.params as { experimentId: string };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
    }

    if (!experimentId) {
      return reply.status(400).send({ error: 'Experiment ID is required' });
    }

    try {
      const purchaseStats = await analyticsService.getPurchaseStats(projectId, experimentId);
      return reply.send({ purchaseStats });
    } catch (error) {
      request.log.error(error, 'Failed to get purchase stats');
      return reply.status(500).send({ error: 'Failed to get purchase stats' });
    }
  };
}

export function getExperimentSessionsHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = request.params as { experimentId: string };
    const query = request.query as {
      limit?: number;
      offset?: number;
    };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to access analytics'
      });
    }

    if (!experimentId) {
      return reply.status(400).send({ error: 'Experiment ID is required' });
    }

    try {
      const limit = query.limit || 100;
      const offset = query.offset || 0;

      const result = await analyticsService.getExperimentSessions(projectId, experimentId, limit, offset);

      return reply.send({
        sessions: result.sessions,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      request.log.error(error, 'Failed to get experiment sessions');
      return reply.status(500).send({ error: 'Failed to get experiment sessions' });
    }
  };
}

export function resetExperimentEventsHandler(analyticsService: AnalyticsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = request.params as { experimentId: string };
    const projectId = request.projectId; // From middleware

    if (!projectId) {
      return reply.status(400).send({
        error: 'Project ID is required',
        message: 'User must have a project associated with their account to reset analytics'
      });
    }

    if (!experimentId) {
      return reply.status(400).send({ error: 'Experiment ID is required' });
    }

    try {
      const result = await analyticsService.resetExperimentEvents(projectId, experimentId);

      request.log.info(`Reset analytics events for experiment ${experimentId}: deleted ${result.deletedCount} events`);

      return reply.send({
        success: true,
        deletedCount: result.deletedCount,
        message: `Successfully deleted ${result.deletedCount} analytics events for experiment ${experimentId}`
      });
    } catch (error) {
      request.log.error(error, 'Failed to reset experiment events');
      return reply.status(500).send({ error: 'Failed to reset experiment events' });
    }
  };
}
