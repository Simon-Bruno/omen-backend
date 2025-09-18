import { FastifyInstance } from 'fastify';
import { serviceContainer } from '@app/container';
import { ProjectDAL } from '@infra/dal';
import { authMiddleware } from '../middleware/auth';
import { requireAuth } from '../middleware/authorization';
import { prisma } from '@infra/prisma';

export async function brandSummaryRoutes(fastify: FastifyInstance) {
    // Start brand summary generation
    fastify.post('/project/:projectId/brand-summary', { preHandler: [authMiddleware, requireAuth] }, async (request, reply) => {
        try {
            const { projectId } = request.params as { projectId: string };

            // Verify project exists and user owns it
            const project = await ProjectDAL.getProjectById(projectId);
            if (!project) {
                return reply.status(404).send({ error: 'Project not found' });
            }

            // Create job
            const job = await ProjectDAL.createBrandSummaryJob(projectId);

            // Start async processing
            processBrandSummary(job.id, projectId).catch(error => {
                console.error(`Brand summary failed for job ${job.id}:`, error);
                updateJobStatus(job.id, 'FAILED', undefined, error.message);
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
    fastify.get('/project/:projectId/brand-summary/:jobId', { preHandler: [authMiddleware, requireAuth] }, async (request, reply) => {
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
async function processBrandSummary(jobId: string, projectId: string): Promise<void> {
    try {
        // Update to processing
        await updateJobStatus(jobId, 'PROCESSING', 10);

        // Get project
        const project = await ProjectDAL.getProjectById(projectId);
        if (!project) throw new Error('Project not found');

        // Run brand analysis
        const brandAnalysisService = serviceContainer.getBrandAnalysisService();
        const result = await brandAnalysisService.analyzeProject(projectId, project.shopDomain);

        if (!result.success) {
            throw new Error(result.error || 'Brand analysis failed');
        }

        // Complete job
        await updateJobStatus(jobId, 'COMPLETED', 100, result.brandSummary ? { ...result.brandSummary } : undefined);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateJobStatus(jobId, 'FAILED', undefined, undefined, errorMessage);
    }
}

// Simple job status update
async function updateJobStatus(
    jobId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    progress?: number,
    result?: Record<string, unknown>,
    error?: string
): Promise<void> {
    const updateData: Record<string, unknown> = { status };
    if (progress !== undefined) updateData.progress = progress;
    if (result !== undefined) updateData.result = result;
    if (error !== undefined) updateData.error = error;
    if (status === 'PROCESSING') updateData.startedAt = new Date();
    if (status === 'COMPLETED' || status === 'FAILED') updateData.completedAt = new Date();

    await (prisma as any).brandSummaryJob.update({
        where: { id: jobId },
        data: updateData,
    });
}
