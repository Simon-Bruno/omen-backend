import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { authMiddleware } from '@interfaces/http/middleware/auth';
import { requireAuth } from '@interfaces/http/middleware/authorization';
import { ExperimentDAL } from '@infra/dal/experiment';
import { validateExperimentDSL } from '@shared/validation/validator';
import { ExperimentDSLSchema } from '@shared/validation/schemas/experiment.schema';

// Rate limiting store (in production, use Redis)
const publishRateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_PUBLISHES_PER_HOUR = 5;

export async function experimentRoutes(fastify: FastifyInstance) {
    // Create experiment (draft)
    fastify.post('/api/experiments', { 
        preHandler: [authMiddleware, requireAuth] 
    }, async (request, reply) => {
        try {
            const { dsl } = request.body as { dsl: unknown };

            if (!dsl) {
                return reply.status(400).send({
                    error: 'BAD_REQUEST',
                    message: 'DSL is required',
                });
            }

            // Get user's project
            const { auth0 } = await import('@infra/auth0');
            const user = await auth0.getUserById(request.userId!);
            
            if (!user?.project) {
                return reply.status(400).send({
                    error: 'NO_PROJECT',
                    message: 'No project bound to user. Please connect a project first.',
                });
            }

            // Validate DSL structure
            const validationResult = await validateExperimentDSL(dsl);
            if (!validationResult.isValid) {
                return reply.status(400).send({
                    error: 'INVALID_DSL',
                    message: 'DSL validation failed',
                    details: validationResult.errors,
                });
            }

            // Parse and validate with Zod schema
            const schemaResult = ExperimentDSLSchema.safeParse(dsl);
            if (!schemaResult.success) {
                return reply.status(400).send({
                    error: 'INVALID_DSL_STRUCTURE',
                    message: 'DSL structure validation failed',
                    details: schemaResult.error.issues,
                });
            }

            const experimentData = schemaResult.data;

            // Create experiment in database
            const experiment = await ExperimentDAL.createExperiment({
                projectId: user.project.id,
                name: experimentData.name,
                dsl: experimentData,
            });

            return reply.status(201).send({
                id: experiment.id,
                name: experiment.name,
                status: experiment.status,
                createdAt: experiment.createdAt,
            });
        } catch (error: unknown) {
            if (error instanceof Error && error.message?.includes('already has a project')) {
                return reply.status(409).send({
                    error: 'CONFLICT',
                    message: error.message,
                });
            }

            fastify.log.error({ err: error }, 'Experiment creation error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to create experiment',
            });
        }
    });

    // Get experiment by ID
    fastify.get('/api/experiments/:id', {
        preHandler: [authMiddleware, requireAuth]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            // Get experiment with project details
            const experiment = await ExperimentDAL.getExperimentWithProject(id);
            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found',
                });
            }

            // Check ownership
            const { auth0 } = await import('@infra/auth0');
            const user = await auth0.getUserById(request.userId!);
            
            if (!user?.project || user.project.id !== experiment.projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'Access denied. You do not own this experiment.',
                });
            }

            return {
                id: experiment.id,
                name: experiment.name,
                status: experiment.status,
                dsl: experiment.dsl,
                createdAt: experiment.createdAt,
                publishedAt: experiment.publishedAt,
                finishedAt: experiment.finishedAt,
            };
        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Get experiment error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get experiment',
            });
        }
    });

    // Publish experiment
    fastify.post('/api/experiments/:id/publish', {
        preHandler: [authMiddleware, requireAuth]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            // Get experiment with project details
            const experiment = await ExperimentDAL.getExperimentWithProject(id);
            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found',
                });
            }

            // Check ownership
            const { auth0 } = await import('@infra/auth0');
            const user = await auth0.getUserById(request.userId!);
            
            if (!user?.project || user.project.id !== experiment.projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'Access denied. You do not own this experiment.',
                });
            }

            // Check if experiment is in draft status
            if (experiment.status !== 'DRAFT') {
                return reply.status(400).send({
                    error: 'INVALID_STATUS',
                    message: `Cannot publish experiment in ${experiment.status.toLowerCase()} status`,
                });
            }

            // Check rate limit
            const now = Date.now();
            const rateLimitKey = `${user.project.id}`;
            const rateLimit = publishRateLimit.get(rateLimitKey);
            
            if (rateLimit) {
                if (now < rateLimit.resetTime) {
                    if (rateLimit.count >= MAX_PUBLISHES_PER_HOUR) {
                        const remainingTime = Math.ceil((rateLimit.resetTime - now) / 1000 / 60);
                        return reply.status(429).send({
                            error: 'RATE_LIMIT_EXCEEDED',
                            message: `Too many publish requests. Try again in ${remainingTime} minutes.`,
                        });
                    }
                } else {
                    // Reset window
                    publishRateLimit.set(rateLimitKey, { count: 0, resetTime: now + RATE_LIMIT_WINDOW });
                }
            } else {
                publishRateLimit.set(rateLimitKey, { count: 0, resetTime: now + RATE_LIMIT_WINDOW });
            }

            // Validate DSL before publishing
            const validationResult = await validateExperimentDSL(experiment.dsl);
            if (!validationResult.isValid) {
                return reply.status(400).send({
                    error: 'INVALID_DSL',
                    message: 'DSL validation failed',
                    details: validationResult.errors,
                });
            }

            // TODO: Publish to Cloudflare KV
            // This would involve:
            // 1. Writing the experiment to KV with key `EXP_${id}`
            // 2. Adding the key to `CONFIG_INDEX`
            // 3. Updating the database status

            // Update experiment status
            const updatedExperiment = await ExperimentDAL.updateStatus({
                experimentId: id,
                status: 'RUNNING',
                publishedAt: new Date(),
            });

            // Update rate limit
            const currentLimit = publishRateLimit.get(rateLimitKey)!;
            publishRateLimit.set(rateLimitKey, { ...currentLimit, count: currentLimit.count + 1 });

            return {
                id: updatedExperiment.id,
                status: updatedExperiment.status,
                publishedAt: updatedExperiment.publishedAt,
                message: 'Experiment published successfully',
            };
        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Publish experiment error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to publish experiment',
            });
        }
    });

    // Pause experiment
    fastify.post('/api/experiments/:id/pause', {
        preHandler: [authMiddleware, requireAuth]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            // Get experiment with project details
            const experiment = await ExperimentDAL.getExperimentWithProject(id);
            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found',
                });
            }

            // Check ownership
            const { auth0 } = await import('@infra/auth0');
            const user = await auth0.getUserById(request.userId!);
            
            if (!user?.project || user.project.id !== experiment.projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'Access denied. You do not own this experiment.',
                });
            }

            // Check if experiment is running
            if (experiment.status !== 'RUNNING') {
                return reply.status(400).send({
                    error: 'INVALID_STATUS',
                    message: `Cannot pause experiment in ${experiment.status.toLowerCase()} status`,
                });
            }

            // TODO: Remove from Cloudflare KV CONFIG_INDEX
            // This would involve:
            // 1. Removing the experiment key from `CONFIG_INDEX`
            // 2. Updating the database status

            // Update experiment status
            const updatedExperiment = await ExperimentDAL.updateStatus({
                experimentId: id,
                status: 'PAUSED',
            });

            return {
                id: updatedExperiment.id,
                status: updatedExperiment.status,
                message: 'Experiment paused successfully',
            };
        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Pause experiment error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to pause experiment',
            });
        }
    });

    // Finish experiment
    fastify.post('/api/experiments/:id/finish', {
        preHandler: [authMiddleware, requireAuth]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            // Get experiment with project details
            const experiment = await ExperimentDAL.getExperimentWithProject(id);
            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found',
                });
            }

            // Check ownership
            const { auth0 } = await import('@infra/auth0');
            const user = await auth0.getUserById(request.userId!);
            
            if (!user?.project || user.project.id !== experiment.projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'Access denied. You do not own this experiment.',
                });
            }

            // Check if experiment is running or paused
            if (!['RUNNING', 'PAUSED'].includes(experiment.status)) {
                return reply.status(400).send({
                    error: 'INVALID_STATUS',
                    message: `Cannot finish experiment in ${experiment.status.toLowerCase()} status`,
                });
            }

            // TODO: Remove from Cloudflare KV CONFIG_INDEX
            // This would involve:
            // 1. Removing the experiment key from `CONFIG_INDEX`
            // 2. Updating the database status

            // Update experiment status
            const updatedExperiment = await ExperimentDAL.updateStatus({
                experimentId: id,
                status: 'FINISHED',
                finishedAt: new Date(),
            });

            return {
                id: updatedExperiment.id,
                status: updatedExperiment.status,
                finishedAt: updatedExperiment.finishedAt,
                message: 'Experiment finished successfully',
            };
        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Finish experiment error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to finish experiment',
            });
        }
    });

    // Get experiment status with analytics
    fastify.get('/api/experiments/:id/status', {
        preHandler: [authMiddleware, requireAuth]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            // Get experiment with project details
            const experiment = await ExperimentDAL.getExperimentWithProject(id);
            if (!experiment) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'Experiment not found',
                });
            }

            // Check ownership
            const { auth0 } = await import('@infra/auth0');
            const user = await auth0.getUserById(request.userId!);
            
            if (!user?.project || user.project.id !== experiment.projectId) {
                return reply.status(403).send({
                    error: 'FORBIDDEN',
                    message: 'Access denied. You do not own this experiment.',
                });
            }

            // Parse DSL to get traffic and KPI info
            const dsl = experiment.dsl as Record<string, unknown>;
            const traffic = (dsl.traffic as Record<string, number>) || { A: 0.5, B: 0.5 };
            const kpi = (dsl.kpi as { primary: string; secondary?: string[] }) || { primary: 'add_to_cart_click' };

            // TODO: Integrate with PostHog to get real analytics data
            // For now, return mock data structure
            const variants = Object.keys(traffic).map(variantId => ({
                id: variantId,
                sessions: Math.floor(Math.random() * 1000), // Mock data
                primary: {
                    name: kpi.primary,
                    rate: Math.random() * 0.1 // Mock conversion rate
                }
            }));

            // Calculate leader and lift
            const sortedVariants = variants.sort((a, b) => b.primary.rate - a.primary.rate);
            const leader = sortedVariants[0];
            const variantA = variants.find(v => v.id === 'A');
            const liftVsA = leader.id !== 'A' && variantA ? 
                ((leader.primary.rate - variantA.primary.rate) / variantA.primary.rate) * 100 : 0;

            return {
                state: experiment.status.toLowerCase(),
                traffic,
                variants,
                leader: leader.id,
                liftVsA: Math.round(liftVsA * 100) / 100,
                // TODO: Add guardrails data when available
                guardrails: dsl.guardrails ? {
                    lcp: 'normal',
                    js_errors: 'normal', 
                    cls: 'normal'
                } : undefined
            };
        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Get experiment status error:');
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get experiment status',
            });
        }
    });
}
