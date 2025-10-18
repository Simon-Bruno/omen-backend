import { FastifyInstance } from 'fastify';
import { ProjectDAL } from '@infra/dal';
import { betterAuthMiddleware } from '../middleware/better-auth';
import { requireProject } from '../middleware/authorization';
import { prisma } from '@infra/prisma';
import { JobStatus } from '@prisma/client';
import { analyzeProject } from '@features/brand_analysis';

export async function brandSummaryRoutes(fastify: FastifyInstance) {
    // Start brand summary generation
    fastify.post('/project/:projectId/brand-summary', { preHandler: [betterAuthMiddleware, requireProject] }, async (request, reply) => {
        try {
            const { projectId } = request.params as { projectId: string };

            // Verify project exists and user owns it
            const project = await ProjectDAL.getProjectById(projectId);
            if (!project) {
                return reply.status(404).send({ error: 'Project not found' });
            }

            // Check if there's already a running job for this project
            const existingJob = await prisma.brandSummaryJob.findFirst({
                where: {
                    projectId,
                    status: {
                        in: ['PENDING', 'RUNNING']
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            if (existingJob) {
                fastify.log.info({ jobId: existingJob.id, projectId }, 'Brand summary already in progress, returning existing job');
                return reply.status(200).send({
                    jobId: existingJob.id,
                    status: existingJob.status.toLowerCase(),
                    message: 'Brand summary already in progress'
                });
            }

            // Create new job
            const job = await ProjectDAL.createBrandSummaryJob(projectId);

            // Start async processing
            processBrandSummary(job.id, projectId, fastify).catch(error => {
                fastify.log.error({ err: error, jobId: job.id }, 'Brand summary failed');
                updateJobStatus(job.id, 'FAILED', undefined, undefined, error.message);
            });

            return reply.status(200).send({
                jobId: job.id,
                status: 'pending',
                message: 'Brand summary generation started'
            });
        } catch (error) {
            fastify.log.error({ err: error }, 'Start brand summary error:');
            return reply.status(500).send({ error: 'Failed to start brand summary' });
        }
    });

    // Get brand summary status
    fastify.get('/project/:projectId/brand-summary/:jobId', { preHandler: [betterAuthMiddleware, requireProject] }, async (request, reply) => {
        try {
            const { projectId, jobId } = request.params as { projectId: string; jobId: string };

            // Verify project exists and user owns it
            const project = await ProjectDAL.getProjectById(projectId);
            if (!project) {
                return reply.status(404).send({ error: 'Project not found' });
            }

            const job = await ProjectDAL.getBrandSummaryJob(jobId);
            if (!job) {
                return reply.status(404).send({ error: 'Job not found' });
            }

            return reply.status(200).send({
                jobId: job.id,
                status: job.status.toLowerCase(),
                progress: job.progress || undefined,
                result: job.result || undefined,
                error: job.error || undefined,
                createdAt: job.createdAt.toISOString(),
                completedAt: job.completedAt?.toISOString(),
            });
        } catch (error) {
            fastify.log.error({ err: error }, 'Get brand summary status error:');
            return reply.status(500).send({ error: 'Failed to get brand summary status' });
        }
    });
}

// Simple async processing function
async function processBrandSummary(jobId: string, projectId: string, fastify: FastifyInstance): Promise<void> {
    try {
        fastify.log.info({ jobId, projectId }, 'Starting brand summary processing');
        
        // Update to running
        await updateJobStatus(jobId, 'RUNNING', 10);

        // Get project
        const project = await ProjectDAL.getProjectById(projectId);
        if (!project) throw new Error('Project not found');

        fastify.log.info({ jobId, shopDomain: project.shopDomain }, 'Running brand analysis');

        // Run brand analysis
        const brandIntelligence = await analyzeProject(projectId, project.shopDomain);

        fastify.log.info({ jobId }, 'Brand analysis completed successfully');

        // Complete job
        await updateJobStatus(jobId, 'COMPLETED', 100, brandIntelligence);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fastify.log.error({ err: error, jobId, projectId }, 'Brand summary processing failed');
        await updateJobStatus(jobId, 'FAILED', undefined, undefined, errorMessage);
    }
}

// Simple job status update
async function updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number,
    result?: any, // Prisma's JsonValue type
    error?: string
): Promise<void> {
    const updateData = {
        status,
        ...(progress !== undefined && { progress }),
        ...(result !== undefined && { result }),
        ...(error !== undefined && { error }),
        ...(status === 'RUNNING' && { startedAt: new Date() }),
        ...((status === 'COMPLETED' || status === 'FAILED') && { completedAt: new Date() })
    };

    await prisma.brandSummaryJob.update({
        where: { id: jobId },
        data: updateData,
    });
}
