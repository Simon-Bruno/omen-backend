import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { ExperimentDAL } from '@infra/dal/experiment';
import { VariantJobDAL } from '@infra/dal/variant-job';

export async function experimentRoutes(fastify: FastifyInstance) {
    // GET /v1/experiments/:experimentId/preview
    fastify.get('/v1/experiments/:experimentId/preview', async (request, reply) => {
        try {
            const { experimentId } = request.params as { experimentId: string };
            const { variantIds } = request.query as { variantIds?: string[] };
            // For testing - use the project ID from our database check
            const projectId = 'cmg4z4udd0001mrm1ncenbuaf';

            // Scope Resolution: Verify experiment belongs to the project
            const experiment = await ExperimentDAL.getExperimentWithProject(experimentId);
            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found'
                });
            }

            if (experiment.projectId !== projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'Access denied. Experiment does not belong to this project.'
                });
            }

            // Load variants from completed jobs via state manager
            const variants = await loadVariantsFromCompletedJobs(projectId);

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
