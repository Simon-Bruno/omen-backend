import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema } from 'zod';

/**
 * Generic validation middleware using Zod schemas
 */
export function validateBody<T>(schema: ZodSchema<T>) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const validatedData = schema.parse(request.body);
            request.body = validatedData;
        } catch (error) {
            if (error instanceof Error) {
                return reply.status(400).send({
                    error: 'VALIDATION_ERROR',
                    message: error.message,
                });
            }
            return reply.status(400).send({
                error: 'VALIDATION_ERROR',
                message: 'Invalid request data',
            });
        }
    };
}
