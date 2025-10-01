import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { VariantJobDAL } from '@infra/dal/variant-job';

export async function experimentRoutes(fastify: FastifyInstance) {
    // GET /v1/jobs/:jobId/preview - Simple job-based preview
    fastify.get('/v1/jobs/:jobId/preview', async (request, reply) => {
        try {
            const { jobId } = request.params as { jobId: string };
            const { variantIds } = request.query as { variantIds?: string[] };

            fastify.log.info({ jobId }, 'Getting preview for job');

            // Get the job and check if it's completed
            const job = await VariantJobDAL.getJobById(jobId);
            if (!job) {
                fastify.log.warn({ jobId }, 'Job not found');
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Job not found'
                });
            }

            if (job.status !== 'COMPLETED') {
                fastify.log.warn({ jobId, status: job.status }, 'Job not completed yet');
                return reply.status(400).send({
                    error: 'JOB_NOT_COMPLETED',
                    message: `Job is not completed yet. Current status: ${job.status}`
                });
            }

            if (!job.result?.variantsSchema?.variants) {
                fastify.log.warn({ jobId }, 'Job completed but no variants found');
                return reply.status(404).send({
                    error: 'NO_VARIANTS',
                    message: 'Job completed but no variants found in result'
                });
            }

            let variants = job.result.variantsSchema.variants;

            // Filter by variantIds if provided
            if (variantIds && variantIds.length > 0) {
                const requestedLabels = new Set(variantIds);
                variants = variants.filter(v => requestedLabels.has(v.variant_label));
            }

            fastify.log.info({
                jobId,
                variantCount: variants.length,
                variantLabels: variants.map(v => v.variant_label)
            }, 'Returning job preview');

            return {
                jobId,
                status: job.status,
                completedAt: job.completedAt,
                variants
            };

        } catch (error) {
            fastify.log.error({ err: error, jobId: (request.params as any).jobId }, 'Get job preview error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get job preview'
            });
        }
    });

    // GET /v1/projects/:projectId/jobs - List all jobs for a project
    fastify.get('/v1/projects/:projectId/jobs', async (request, reply) => {
        try {
            const { projectId } = request.params as { projectId: string };
            const { status } = request.query as { status?: string };

            fastify.log.info({ projectId, status }, 'Getting jobs for project');

            // Get all jobs for the project
            const jobs = await VariantJobDAL.getJobsByProject(projectId);
            
            // Filter by status if provided
            let filteredJobs = jobs;
            if (status) {
                filteredJobs = jobs.filter(job => job.status === status);
            }

            // Return job summary (without full result data)
            const jobSummaries = filteredJobs.map(job => ({
                id: job.id,
                status: job.status,
                progress: job.progress,
                createdAt: job.createdAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
                hasVariants: !!(job.result?.variantsSchema?.variants?.length),
                variantCount: job.result?.variantsSchema?.variants?.length || 0
            }));

            fastify.log.info({
                projectId,
                totalJobs: jobs.length,
                filteredJobs: filteredJobs.length,
                completedJobs: jobs.filter(j => j.status === 'COMPLETED').length
            }, 'Returning project jobs');

            return {
                projectId,
                jobs: jobSummaries
            };

        } catch (error) {
            fastify.log.error({ err: error, projectId: (request.params as any).projectId }, 'Get project jobs error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get project jobs'
            });
        }
    });

}
