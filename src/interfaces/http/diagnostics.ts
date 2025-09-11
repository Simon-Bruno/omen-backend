// Diagnostics HTTP Interface
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '@shared/fastify.d';
import { authMiddleware } from '@interfaces/http/middleware/auth';
import { requireAuth } from '@interfaces/http/middleware/authorization';
import { DiagnosticsService } from '@infra/services/diagnostics';
import { ProjectDAL } from '@infra/dal/project';

interface StartDiagnosticsRequest {
  Params: {
    projectId: string;
  };
}

interface GetDiagnosticsResultRequest {
  Querystring: {
    projectId: string;
  };
}

interface GetDiagnosticsStatusRequest {
  Params: {
    runId: string;
  };
}

export async function diagnosticsRoutes(fastify: FastifyInstance): Promise<void> {
  // Get services from container
  const diagnosticsService = fastify.diagnosticsService as DiagnosticsService;

  // POST /api/diagnostics/start/:projectId
  fastify.post<StartDiagnosticsRequest>('/api/diagnostics/start/:projectId', {
    preHandler: [authMiddleware, requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            runId: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<StartDiagnosticsRequest>, reply: FastifyReply) => {
    try {
      const { projectId } = request.params;

      // Verify project belongs to user
      const project = await ProjectDAL.getProjectById(projectId);
      if (!project || project.userId !== request.userId) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Start diagnostics
      const result = await diagnosticsService.startDiagnostics(projectId);
      
      return reply.send(result);
    } catch (error) {
      fastify.log.error({ err: error }, 'Start diagnostics error:');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/diagnostics/result?projectId=...
  fastify.get<GetDiagnosticsResultRequest>('/api/diagnostics/result', {
    preHandler: [authMiddleware, requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            brand: {
              type: 'object',
              properties: {
                colors: { type: 'array', items: { type: 'string' } },
                fonts: { type: 'array', items: { type: 'string' } },
                components: { type: 'array', items: { type: 'string' } },
                voice: {
                  type: 'object',
                  properties: {
                    tone: { type: 'string' },
                    personality: { type: 'string' },
                    keyPhrases: { type: 'array', items: { type: 'string' } }
                  }
                },
                designSystem: {
                  type: 'object',
                  properties: {
                    layout: { type: 'string' },
                    spacing: { type: 'string' },
                    typography: { type: 'string' },
                    colorScheme: { type: 'string' }
                  }
                },
                brandPersonality: {
                  type: 'object',
                  properties: {
                    adjectives: { type: 'array', items: { type: 'string' } },
                    values: { type: 'array', items: { type: 'string' } },
                    targetAudience: { type: 'string' }
                  }
                },
                recommendations: {
                  type: 'object',
                  properties: {
                    strengths: { type: 'array', items: { type: 'string' } },
                    opportunities: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            },
            pages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  screenshotUrl: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<GetDiagnosticsResultRequest>, reply: FastifyReply) => {
    try {
      const { projectId } = request.query;

      // Verify project belongs to user
      const project = await ProjectDAL.getProjectById(projectId);
      if (!project || project.userId !== request.userId) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Get diagnostics result
      const result = await diagnosticsService.getDiagnosticsResult(projectId);
      
      if (!result) {
        return reply.status(404).send({ error: 'No diagnostics result found' });
      }

      return reply.send(result);
    } catch (error) {
      fastify.log.error({ err: error }, 'Get diagnostics result error:');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/diagnostics/status/:runId
  fastify.get<GetDiagnosticsStatusRequest>('/api/diagnostics/status/:runId', {
    preHandler: [authMiddleware, requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: {
          runId: { type: 'string' }
        },
        required: ['runId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'FAILED'] }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<GetDiagnosticsStatusRequest>, reply: FastifyReply) => {
    try {
      const { runId } = request.params;

      // Get diagnostics status
      const status = await diagnosticsService.getDiagnosticsStatus(runId);
      
      if (!status) {
        return reply.status(404).send({ error: 'Diagnostics run not found' });
      }

      return reply.send({ status });
    } catch (error) {
      fastify.log.error({ err: error }, 'Get diagnostics status error:');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
