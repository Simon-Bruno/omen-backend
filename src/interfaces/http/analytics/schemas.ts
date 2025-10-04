import { FastifySchema } from 'fastify';

export const getExposureStatsSchema: FastifySchema = {
  params: {
    type: 'object',
    properties: {
      experimentId: { type: 'string' }
    },
    required: ['experimentId']
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          experimentId: { type: 'string' },
          variantId: { type: 'string' },
          exposures: { type: 'number' },
          uniqueSessions: { type: 'number' }
        }
      }
    }
  }
};

export const getEventsSchema: FastifySchema = {
  querystring: {
    type: 'object',
    properties: {
      experimentId: { type: 'string' },
      sessionId: { type: 'string' },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      limit: { type: 'number', minimum: 1, maximum: 1000 },
      offset: { type: 'number', minimum: 0 }
    }
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          experimentId: { type: 'string' },
          eventType: { type: 'string' },
          sessionId: { type: 'string' },
          viewId: { type: 'string' },
          properties: { type: 'object' },
          timestamp: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};

export const getEventCountSchema: FastifySchema = {
  querystring: {
    type: 'object',
    properties: {
      experimentId: { type: 'string' },
      sessionId: { type: 'string' },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        count: { type: 'number' }
      }
    }
  }
};