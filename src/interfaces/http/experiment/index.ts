import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { VariantJobDAL } from '@infra/dal/variant-job';
import { ExperimentDAL } from '@infra/dal/experiment';
import { betterAuthMiddleware } from '../middleware/better-auth';
import { requireProject } from '../middleware/authorization';
import { z } from 'zod';
import { prisma } from '@infra/prisma';
import { createExperimentPublisherService } from '@services/experiment-publisher';
import { createCloudflarePublisher } from '@infra/external/cloudflare';
import { getServiceConfig } from '@infra/config/services';

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
                variants = variants.filter((v: any) => requestedLabels.has(v.variant_label));
            }

            fastify.log.info({
                jobId,
                variantCount: variants.length,
                variantLabels: variants.map((v: any) => v.variant_label)
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

    // GET /experiments - Get all experiments for a project
    fastify.get('/experiments', {
        preHandler: [betterAuthMiddleware, requireProject],
        schema: {
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            status: { type: 'string' },
                            oec: { type: 'string' },
                            minDays: { type: 'number' },
                            minSessionsPerVariant: { type: 'number' },
                            targetUrls: { type: 'object' },
                            createdAt: { type: 'string', format: 'date-time' },
                            publishedAt: { type: 'string', format: 'date-time' },
                            finishedAt: { type: 'string', format: 'date-time' }
                        }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        message: { type: 'string' }
                    }
                },
                500: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const projectId = request.projectId;

            if (!projectId) {
                return reply.status(400).send({
                    error: 'Project ID is required',
                    message: 'User must have a project associated with their account to access experiments'
                });
            }

            const experiments = await ExperimentDAL.getExperimentsByProject(projectId);
            return reply.send(experiments);
        } catch (error) {
            request.log.error(error, 'Failed to get experiments');
            return reply.status(500).send({ error: 'Failed to get experiments' });
        }
    });

    // POST /experiments - Create a new experiment manually
    const domTargetingRule = z.discriminatedUnion('type', [
        z.object({ type: z.literal('selectorExists'), selector: z.string().min(1) }),
        z.object({ type: z.literal('selectorNotExists'), selector: z.string().min(1) }),
        z.object({ type: z.literal('textContains'), selector: z.string().min(1), text: z.string().min(1) }),
        z.object({ type: z.literal('attrEquals'), selector: z.string().min(1), attr: z.string().min(1), value: z.string() }),
        z.object({ type: z.literal('meta'), name: z.string().min(1), value: z.string(), by: z.enum(['name', 'property']).optional() }),
        z.object({ type: z.literal('cookie'), name: z.string().min(1), value: z.string() }),
        z.object({ type: z.literal('localStorage'), key: z.string().min(1), value: z.string() }),
        z.object({ type: z.literal('urlParam'), name: z.string().min(1), value: z.string() })
    ]);

    const domTargetingSchema = z.object({
        match: z.enum(['all', 'any']).optional().default('all'),
        timeoutMs: z.number().int().min(0).max(10000).optional().default(1500),
        rules: z.array(domTargetingRule).min(1)
    }).optional();

    const createExperimentSchema = z.object({
        name: z.string().min(1, 'Name is required'),
        oec: z.string().min(1, 'Overall Evaluation Criterion (OEC) is required'),
        minDays: z.number().int().positive('Minimum days must be positive').default(7),
        minSessionsPerVariant: z.number().int().positive('Minimum sessions per variant must be positive').default(1000),
        targetUrls: z.array(z.string()).optional(),
        targeting: domTargetingSchema,
        hypothesis: z.object({
            hypothesis: z.string().min(1, 'Hypothesis statement is required'),
            rationale: z.string().min(1, 'Rationale is required'),
            primaryKpi: z.string().min(1, 'Primary KPI is required')
        }),
        variants: z.array(z.object({
            variantId: z.string().min(1, 'Variant ID is required (e.g., A, B, C)'),
            selector: z.string().optional(),
            html: z.string().default(''),
            css: z.string().optional(),
            js: z.string().optional(),
            position: z.enum(['INNER', 'OUTER', 'BEFORE', 'AFTER', 'APPEND', 'PREPEND']).default('INNER')
        })).min(1, 'At least one variant is required'),
        trafficDistribution: z.record(z.string(), z.number().min(0).max(1))
            .optional()
            .refine((traffic) => {
                if (!traffic) return true;
                const sum = Object.values(traffic).reduce((acc, val) => acc + val, 0);
                return Math.abs(sum - 1.0) <= 0.005; // ±0.5% tolerance
            }, {
                message: 'Traffic distribution must sum to 1.0 (±0.5%)'
            })
    });

    fastify.post('/experiments', {
        preHandler: [betterAuthMiddleware, requireProject]
    }, async (request, reply) => {
        try {
            const projectId = request.projectId;

            if (!projectId) {
                return reply.status(400).send({
                    error: 'Project ID is required',
                    message: 'User must have a project associated with their account to create experiments'
                });
            }

            // Validate request body
            const validationResult = createExperimentSchema.safeParse(request.body);

            if (!validationResult.success) {
                return reply.status(400).send({
                    error: 'VALIDATION_ERROR',
                    message: 'Invalid request body',
                    details: validationResult.error.errors
                });
            }

            const data = validationResult.data;

            // Create experiment
            const experiment = await ExperimentDAL.createExperiment({
                projectId,
                name: data.name,
                oec: data.oec,
                minDays: data.minDays,
                minSessionsPerVariant: data.minSessionsPerVariant,
                targetUrls: data.targetUrls || null
            });
                data: {
                    experimentId: experiment.id,
                    hypothesis: data.hypothesis.hypothesis,
                    rationale: data.hypothesis.rationale,
                    primaryKpi: data.hypothesis.primaryKpi
                }
            });

            // Calculate traffic distribution
            let trafficDistribution: Record<string, number>;

            if (data.trafficDistribution) {
                trafficDistribution = data.trafficDistribution;
            } else {
                // Auto-generate equal distribution including control
                const totalVariants = data.variants.length + 1; // +1 for control
                const percentagePerVariant = 1.0 / totalVariants;

                trafficDistribution = { control: percentagePerVariant };
                data.variants.forEach(v => {
                    trafficDistribution[v.variantId] = percentagePerVariant;
                });
            }

            // Create traffic distribution
            for (const [variantId, percentage] of Object.entries(trafficDistribution)) {
                await prisma.experimentTraffic.create({
                    data: {
                        experimentId: experiment.id,
                        variantId,
                        percentage
                    }
                });
            }

            // Create variants
            for (const variant of data.variants) {
                await prisma.experimentVariant.create({
                    data: {
                        experimentId: experiment.id,
                        variantId: variant.variantId,
                        selector: variant.selector || 'body',
                        html: variant.html,
                        css: variant.css || '',
                        js: variant.js || '',
                        position: variant.position
                    }
                });
            }

            // Fetch complete experiment with relations
            const completeExperiment = await prisma.experiment.findUnique({
                where: { id: experiment.id },
                include: {
                    hypothesis: true,
                    traffic: true,
                    variants: true
                }
            });

            fastify.log.info({ experimentId: experiment.id }, 'Experiment created successfully');

            return reply.status(201).send({
                success: true,
                experiment: completeExperiment
            });

        } catch (error) {
            fastify.log.error({ err: error }, 'Failed to create experiment');

            if (error instanceof Error) {
                return reply.status(500).send({
                    error: 'INTERNAL_ERROR',
                    message: error.message
                });
            }

            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to create experiment'
            });
        }
    });

    // GET /experiments/:id - Get a single experiment with all relations
    fastify.get('/experiments/:id', {
        preHandler: [betterAuthMiddleware, requireProject]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const projectId = request.projectId;

            if (!projectId) {
                return reply.status(400).send({
                    error: 'Project ID is required',
                    message: 'User must have a project associated with their account'
                });
            }

            const experiment = await prisma.experiment.findUnique({
                where: { id },
                include: {
                    hypothesis: true,
                    traffic: true,
                    variants: true
                }
            });

            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found'
                });
            }

            // Verify experiment belongs to user's project
            if (experiment.projectId !== projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'You do not have access to this experiment'
                });
            }

            return reply.send(experiment);

        } catch (error) {
            fastify.log.error({ err: error }, 'Failed to get experiment');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get experiment'
            });
        }
    });

    // PATCH /experiments/:id/status - Update experiment status (start, pause, resume, complete)
    const updateStatusSchema = z.object({
        action: z.enum(['start', 'pause', 'resume', 'complete'], {
            errorMap: () => ({ message: 'Action must be one of: start, pause, resume, complete' })
        })
    });

    fastify.patch('/experiments/:id/status', {
        preHandler: [betterAuthMiddleware, requireProject]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const projectId = request.projectId;

            if (!projectId) {
                return reply.status(400).send({
                    error: 'Project ID is required',
                    message: 'User must have a project associated with their account'
                });
            }

            // Validate request body
            const validationResult = updateStatusSchema.safeParse(request.body);

            if (!validationResult.success) {
                return reply.status(400).send({
                    error: 'VALIDATION_ERROR',
                    message: 'Invalid request body',
                    details: validationResult.error.errors
                });
            }

            const { action } = validationResult.data;

            // Get experiment
            const experiment = await ExperimentDAL.getExperimentById(id);

            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found'
                });
            }

            // Verify ownership
            if (experiment.projectId !== projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'You do not have access to this experiment'
                });
            }

            // Initialize publisher
            const config = getServiceConfig();
            const cloudflarePublisher = createCloudflarePublisher(config.cloudflare);
            const experimentPublisher = createExperimentPublisherService(cloudflarePublisher);

            // Handle state transitions
            let updatedExperiment;

            switch (action) {
                case 'start':
                    // Can only start DRAFT experiments
                    if (experiment.status !== 'DRAFT') {
                        return reply.status(400).send({
                            error: 'INVALID_STATE_TRANSITION',
                            message: `Cannot start experiment in ${experiment.status} status. Only DRAFT experiments can be started.`
                        });
                    }

                    // Publish to Cloudflare
                    const publishResult = await experimentPublisher.publishExperiment(id);

                    if (!publishResult.success) {
                        return reply.status(500).send({
                            error: 'PUBLISH_FAILED',
                            message: `Failed to publish experiment: ${publishResult.error}`
                        });
                    }

                    // Get updated experiment
                    updatedExperiment = await ExperimentDAL.getExperimentById(id);
                    fastify.log.info({ experimentId: id }, 'Experiment started successfully');
                    break;

                case 'pause':
                    // Can only pause RUNNING experiments
                    if (experiment.status !== 'RUNNING') {
                        return reply.status(400).send({
                            error: 'INVALID_STATE_TRANSITION',
                            message: `Cannot pause experiment in ${experiment.status} status. Only RUNNING experiments can be paused.`
                        });
                    }

                    // Unpublish from Cloudflare (stops serving variants)
                    const pauseUnpublishResult = await experimentPublisher.unpublishExperiment(id, 'PAUSED');

                    if (!pauseUnpublishResult.success) {
                        return reply.status(500).send({
                            error: 'UNPUBLISH_FAILED',
                            message: `Failed to pause experiment: ${pauseUnpublishResult.error}`
                        });
                    }

                    // Get updated experiment (status already set to PAUSED by unpublishExperiment)
                    updatedExperiment = await ExperimentDAL.getExperimentById(id);

                    fastify.log.info({ experimentId: id }, 'Experiment paused successfully (unpublished from Cloudflare)');
                    break;

                case 'resume':
                    // Can only resume PAUSED experiments
                    if (experiment.status !== 'PAUSED') {
                        return reply.status(400).send({
                            error: 'INVALID_STATE_TRANSITION',
                            message: `Cannot resume experiment in ${experiment.status} status. Only PAUSED experiments can be resumed.`
                        });
                    }

                    // Re-publish to Cloudflare (starts serving variants again)
                    const resumePublishResult = await experimentPublisher.publishExperiment(id);

                    if (!resumePublishResult.success) {
                        return reply.status(500).send({
                            error: 'PUBLISH_FAILED',
                            message: `Failed to resume experiment: ${resumePublishResult.error}`
                        });
                    }

                    // Get updated experiment (status already set to RUNNING by publishExperiment)
                    updatedExperiment = await ExperimentDAL.getExperimentById(id);

                    fastify.log.info({ experimentId: id }, 'Experiment resumed successfully (re-published to Cloudflare)');
                    break;

                case 'complete':
                    // Can complete RUNNING or PAUSED experiments
                    if (experiment.status !== 'RUNNING' && experiment.status !== 'PAUSED') {
                        return reply.status(400).send({
                            error: 'INVALID_STATE_TRANSITION',
                            message: `Cannot complete experiment in ${experiment.status} status. Only RUNNING or PAUSED experiments can be completed.`
                        });
                    }

                    // Unpublish from Cloudflare
                    const unpublishResult = await experimentPublisher.unpublishExperiment(id);

                    if (!unpublishResult.success) {
                        fastify.log.warn({ experimentId: id, error: unpublishResult.error }, 'Failed to unpublish, but marking as completed anyway');
                    }

                    updatedExperiment = await ExperimentDAL.updateStatus({
                        experimentId: id,
                        status: 'COMPLETED',
                        finishedAt: new Date()
                    });

                    fastify.log.info({ experimentId: id }, 'Experiment completed successfully');
                    break;
            }

            return reply.send({
                success: true,
                experiment: updatedExperiment
            });

        } catch (error) {
            fastify.log.error({ err: error }, 'Failed to update experiment status');

            if (error instanceof Error) {
                return reply.status(500).send({
                    error: 'INTERNAL_ERROR',
                    message: error.message
                });
            }

            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to update experiment status'
            });
        }
    });

    // DELETE /experiments/:id - Delete an experiment
    fastify.delete('/experiments/:id', {
        preHandler: [betterAuthMiddleware, requireProject]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const projectId = request.projectId;

            if (!projectId) {
                return reply.status(400).send({
                    error: 'Project ID is required',
                    message: 'User must have a project associated with their account'
                });
            }

            // Get experiment
            const experiment = await ExperimentDAL.getExperimentById(id);

            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found'
                });
            }

            // Verify ownership
            if (experiment.projectId !== projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'You do not have access to this experiment'
                });
            }

            // Can't delete RUNNING experiments - must pause/complete first
            if (experiment.status === 'RUNNING') {
                return reply.status(400).send({
                    error: 'INVALID_STATE',
                    message: 'Cannot delete a RUNNING experiment. Please pause or complete it first.'
                });
            }

            // If experiment is published, unpublish it first
            if (experiment.status !== 'DRAFT') {
                const config = getServiceConfig();
                const cloudflarePublisher = createCloudflarePublisher(config.cloudflare);
                const experimentPublisher = createExperimentPublisherService(cloudflarePublisher);

                await experimentPublisher.unpublishExperiment(id);
                fastify.log.info({ experimentId: id }, 'Unpublished experiment before deletion');
            }

            // Delete experiment (cascades to hypothesis, traffic, variants via Prisma)
            await ExperimentDAL.deleteExperiment(id);

            fastify.log.info({ experimentId: id }, 'Experiment deleted successfully');

            return reply.send({
                success: true,
                message: 'Experiment deleted successfully'
            });

        } catch (error) {
            fastify.log.error({ err: error }, 'Failed to delete experiment');

            if (error instanceof Error) {
                return reply.status(500).send({
                    error: 'INTERNAL_ERROR',
                    message: error.message
                });
            }

            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to delete experiment'
            });
        }
    });

}
