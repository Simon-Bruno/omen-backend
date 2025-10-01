import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { ExperimentDAL } from '@infra/dal/experiment';
import { VariantJobDAL } from '@infra/dal/variant-job';
import { variantStateManager } from '@domain/agent/variant-state-manager';

export async function experimentRoutes(fastify: FastifyInstance) {
    // GET /v1/experiments/:experimentId/preview
    fastify.get('/v1/experiments/:experimentId/preview', async (request, reply) => {
        try {
            const { experimentId } = request.params as { experimentId: string };
            const { variantIds } = request.query as { variantIds?: string[] };

            // Scope Resolution: Verify experiment exists and get project info
            const experiment = await ExperimentDAL.getExperimentWithProject(experimentId);
            if (!experiment) {
                fastify.log.warn({ experimentId }, 'Experiment not found');
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found'
                });
            }

            fastify.log.info({
                experimentId,
                projectId: experiment.projectId,
                experimentName: experiment.name
            }, 'Found experiment');

            // Load variants from completed jobs for this project
            const variants = await loadVariantsFromCompletedJobs(experiment.projectId);

            if (variants.length === 0) {
                return reply.status(404).send({
                    error: 'NO_VARIANTS',
                    message: 'No completed variant jobs found. Please generate variants first.'
                });
            }

            fastify.log.info({
                experimentId,
                variantCount: variants.length,
                variantLabels: variants.map(v => v.variant_label)
            }, 'Loaded variants from completed jobs');

            // Filtering: Apply variantIds filter if provided
            let filteredVariants = variants;
            if (variantIds && variantIds.length > 0) {
                const requestedLabels = new Set(variantIds);
                filteredVariants = variants.filter(v => requestedLabels.has(v.variant_label));
            }

            return {
                experimentId,
                variants: filteredVariants
            };

        } catch (error) {
            fastify.log.error({ err: error, experimentId: (request.params as any).experimentId }, 'Get experiment preview error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get experiment preview'
            });
        }
    });
}

/**
 * Load variants from completed jobs via state manager
 */
async function loadVariantsFromCompletedJobs(projectId: string) {
    try {
        // Get all completed variant jobs for this project
        const jobs = await VariantJobDAL.getJobsByProject(projectId);
        const completedJobs = jobs.filter(job => job.status === 'COMPLETED' && job.result);

        const variants = [];

        for (const job of completedJobs) {
            if (job.result?.variantsSchema?.variants) {
                variants.push(...job.result.variantsSchema.variants);
            }
        }

        return variants;
    } catch (error) {
        console.error('[EXPERIMENT_PREVIEW] Failed to load variants from completed jobs:', error);
        return [];
    }
}
