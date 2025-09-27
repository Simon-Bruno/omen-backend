import { FastifyInstance } from 'fastify';
import { VariantJobDAL } from '@infra/dal';
import { authMiddleware } from '../middleware/auth';
import { requireAuth, requireProjectOwnership } from '../middleware/authorization';

export async function jobRoutes(fastify: FastifyInstance) {
    // Get job status by ID
    fastify.get('/project/:projectId/jobs/:jobId', { 
        preHandler: [authMiddleware, requireAuth, requireProjectOwnership] 
    }, async (request, reply) => {
        try {
            const { projectId, jobId } = request.params as { projectId: string; jobId: string };

            // Get the job
            const job = await VariantJobDAL.getJobById(jobId);
            if (!job) {
                return reply.status(404).send({ 
                    error: 'Job not found',
                    message: `Job with ID ${jobId} not found`
                });
            }

            // Verify the job belongs to the project
            if (job.projectId !== projectId) {
                return reply.status(403).send({ 
                    error: 'Forbidden',
                    message: 'Job does not belong to this project'
                });
            }

            // Return job status
            return {
                jobId: job.id,
                status: job.status.toLowerCase(),
                result: job.result,
                error: job.error,
                progress: job.progress,
                createdAt: job.createdAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
            };

        } catch (error) {
            fastify.log.error({ err: error, jobId: (request.params as any).jobId }, 'Get job status error:');
            return reply.status(500).send({ 
                error: 'Internal server error',
                message: 'Failed to get job status'
            });
        }
    });

    // Get all jobs for a project
    fastify.get('/project/:projectId/jobs', { 
        preHandler: [authMiddleware, requireAuth, requireProjectOwnership] 
    }, async (request, reply) => {
        try {
            const { projectId } = request.params as { projectId: string };
            const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

            const jobs = await VariantJobDAL.getJobsByProject(projectId, limit, offset);

            return {
                jobs: jobs.map(job => ({
                    jobId: job.id,
                    status: job.status.toLowerCase(),
                    progress: job.progress,
                    createdAt: job.createdAt,
                    startedAt: job.startedAt,
                    completedAt: job.completedAt,
                })),
                total: jobs.length,
            };

        } catch (error) {
            fastify.log.error({ err: error, projectId: (request.params as any).projectId }, 'Get project jobs error:');
            return reply.status(500).send({ 
                error: 'Internal server error',
                message: 'Failed to get project jobs'
            });
        }
    });
}
