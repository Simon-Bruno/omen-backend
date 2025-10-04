import { FastifyInstance } from 'fastify';
import { ProjectDAL } from '@infra/dal';
import { betterAuthMiddleware } from '../middleware/better-auth';
import { requireProject, requireProjectOwnership } from '../middleware/authorization';
import { prisma } from '@infra/prisma';
import { createCloudflarePublisher } from '@infra/external/cloudflare/cloudflare-publisher';
import { createExperimentPublisherService } from '@services/experiment-publisher';
import { getServiceConfig } from '@infra/config/services';

export async function projectResetRoutes(fastify: FastifyInstance) {
    // Reset project: clear brand analysis, delete all experiments, unpublish from Cloudflare, and remove all related data
    fastify.post('/project/:projectId/reset', { 
        preHandler: [betterAuthMiddleware, requireProject, requireProjectOwnership]
    }, async (request, reply) => {
        try {
            const { projectId } = request.params as { projectId: string };

            // Verify project exists and user owns it (already verified by requireProjectOwnership middleware)
            const project = await ProjectDAL.getProjectById(projectId);
            if (!project) {
                return reply.status(404).send({ 
                    error: 'Project not found',
                    message: `Project with ID ${projectId} not found`
                });
            }

            // Get all experiments for this project before deletion
            const experiments = await prisma.experiment.findMany({
                where: { projectId },
                select: { id: true, status: true }
            });

            // Unpublish all running experiments from Cloudflare
            const cloudflareUnpublishResults: Array<{
                experimentId: string;
                success: boolean;
                error?: string;
            }> = [];
            if (experiments.length > 0) {
                try {
                    const config = getServiceConfig();
                    const cloudflarePublisher = createCloudflarePublisher(config.cloudflare);
                    const experimentPublisher = createExperimentPublisherService(cloudflarePublisher);

                    for (const experiment of experiments) {
                        if (experiment.status === 'RUNNING') {
                            fastify.log.info({ experimentId: experiment.id }, 'Unpublishing experiment from Cloudflare');
                            const result = await experimentPublisher.unpublishExperiment(experiment.id);
                            cloudflareUnpublishResults.push({
                                experimentId: experiment.id,
                                success: result.success,
                                error: result.error
                            });
                        }
                    }
                } catch (error) {
                    fastify.log.error({ err: error }, 'Error unpublishing experiments from Cloudflare');
                    // Continue with database cleanup even if Cloudflare unpublish fails
                }
            }

            // Start a transaction to ensure atomicity
            await prisma.$transaction(async (tx) => {
                // 1. Clear brand analysis by setting it to null
                await tx.project.update({
                    where: { id: projectId },
                    data: { brandAnalysis: null as any }
                });

                // 2. Delete all experiments for this project (cascades to related tables)
                const deletedExperiments = await tx.experiment.deleteMany({
                    where: { projectId }
                });

                // 3. Delete all screenshots for this project
                const deletedScreenshots = await tx.screenshot.deleteMany({
                    where: { projectId }
                });

                // 4. Delete all variant jobs for this project
                const deletedVariantJobs = await tx.variantJob.deleteMany({
                    where: { projectId }
                });

                // 5. Delete all chat messages for this project
                const deletedChatMessages = await tx.chatMessage.deleteMany({
                    where: { projectId }
                });

                // 6. Delete all brand summary jobs for this project
                const deletedBrandSummaryJobs = await tx.brandSummaryJob.deleteMany({
                    where: { projectId }
                });

                fastify.log.info({ 
                    projectId, 
                    deletedExperiments: deletedExperiments.count,
                    deletedScreenshots: deletedScreenshots.count,
                    deletedVariantJobs: deletedVariantJobs.count,
                    deletedChatMessages: deletedChatMessages.count,
                    deletedBrandSummaryJobs: deletedBrandSummaryJobs.count,
                    cloudflareUnpublishResults
                }, 'Project reset completed');
            });

            return reply.status(200).send({
                success: true,
                message: 'Project reset successfully',
                projectId,
                resetData: {
                    brandAnalysis: 'cleared',
                    experiments: 'deleted',
                    screenshots: 'removed',
                    variantJobs: 'deleted',
                    chatMessages: 'deleted',
                    brandSummaryJobs: 'deleted',
                    cloudflareUnpublishResults
                }
            });

        } catch (error) {
            fastify.log.error({ 
                err: error, 
                projectId: (request.params as any).projectId 
            }, 'Project reset error:');
            
            return reply.status(500).send({ 
                error: 'Internal server error',
                message: 'Failed to reset project'
            });
        }
    });

    // Get project reset status (optional - shows what would be reset)
    fastify.get('/project/:projectId/reset/status', { 
        preHandler: [betterAuthMiddleware, requireProject, requireProjectOwnership] 
    }, async (request, reply) => {
        try {
            const { projectId } = request.params as { projectId: string };

            // Get project info
            const project = await ProjectDAL.getProjectById(projectId);
            if (!project) {
                return reply.status(404).send({ 
                    error: 'Project not found',
                    message: `Project with ID ${projectId} not found`
                });
            }

            // Count various data types
            const [screenshotCount, experimentCount, variantJobCount, chatMessageCount, brandSummaryJobCount] = await Promise.all([
                prisma.screenshot.count({ where: { projectId } }),
                prisma.experiment.count({ where: { projectId } }),
                prisma.variantJob.count({ where: { projectId } }),
                prisma.chatMessage.count({ where: { projectId } }),
                prisma.brandSummaryJob.count({ where: { projectId } })
            ]);

            // Get running experiments count
            const runningExperimentCount = await prisma.experiment.count({
                where: { 
                    projectId,
                    status: 'RUNNING'
                }
            });

            // Check if brand analysis exists
            const hasBrandAnalysis = project.brandAnalysis !== null;

            return reply.status(200).send({
                projectId,
                resetStatus: {
                    hasBrandAnalysis,
                    screenshotCount,
                    experimentCount,
                    runningExperimentCount,
                    variantJobCount,
                    chatMessageCount,
                    brandSummaryJobCount,
                    canReset: hasBrandAnalysis || screenshotCount > 0 || experimentCount > 0 || variantJobCount > 0 || chatMessageCount > 0 || brandSummaryJobCount > 0
                }
            });

        } catch (error) {
            fastify.log.error({ 
                err: error, 
                projectId: (request.params as any).projectId 
            }, 'Get reset status error:');
            
            return reply.status(500).send({ 
                error: 'Internal server error',
                message: 'Failed to get reset status'
            });
        }
    });
}
