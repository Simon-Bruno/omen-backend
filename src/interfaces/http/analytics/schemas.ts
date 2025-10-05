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

export const getUserJourneySchema: FastifySchema = {
  params: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' }
    },
    required: ['sessionId']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        summary: {
          type: 'object',
          properties: {
            totalEvents: { type: 'number' },
            variantsSeen: {
              type: 'array',
              items: { type: 'string' }
            },
            pagesVisited: {
              type: 'array',
              items: { type: 'string' }
            },
            eventTypes: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        journey: {
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
              properties: { 
                type: 'object',
                additionalProperties: true
              },
              timestamp: { type: 'number' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        },
        debugInfo: {
          type: 'object',
          properties: {
            serverTimestamp: { type: 'string' },
            totalEvents: { type: 'number' },
            firstEventProperties: { type: 'object' },
            serverVersion: { type: 'string' }
          }
        }
      }
    }
  }
};

export const getFunnelAnalysisSchema: FastifySchema = {
  params: {
    type: 'object',
    properties: {
      experimentId: { type: 'string' }
    },
    required: ['experimentId']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        experimentId: { type: 'string' },
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              variantId: { type: 'string' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    stepName: { type: 'string' },
                    eventType: { type: 'string' },
                    count: { type: 'number' },
                    percentage: { type: 'number' },
                    dropoffRate: { type: 'number' }
                  }
                }
              },
              totalSessions: { type: 'number' },
              conversionRate: { type: 'number' }
            }
          }
        },
        overallStats: {
          type: 'object',
          properties: {
            totalSessions: { type: 'number' },
            totalExposures: { type: 'number' },
            totalConversions: { type: 'number' },
            overallConversionRate: { type: 'number' }
          }
        }
      }
    }
  }
};

export const getConversionRatesSchema: FastifySchema = {
  params: {
    type: 'object',
    properties: {
      experimentId: { type: 'string' }
    },
    required: ['experimentId']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        conversionRates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              experimentId: { type: 'string' },
              variantId: { type: 'string' },
              sessions: { type: 'number' },
              conversions: { type: 'number' },
              conversionRate: { type: 'number' },
              averageValue: { type: 'number' },
              totalValue: { type: 'number' }
            }
          }
        }
      }
    }
  }
};

export const getExperimentSessionsSchema: FastifySchema = {
  params: {
    type: 'object',
    properties: {
      experimentId: { type: 'string' }
    },
    required: ['experimentId']
  },
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
      offset: { type: 'number', minimum: 0, default: 0 }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              eventCount: { type: 'number' }
            }
          }
        },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' }
      }
    }
  }
};