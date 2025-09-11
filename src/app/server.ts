import 'dotenv/config';
import fastify from 'fastify';
import type { FastifyInstance } from 'fastify/types/instance.js';
import { prisma } from '@infra/prisma';
import { registerRoutes } from '@interfaces/http/index';
import { serviceContainer } from '@infra/container';

export async function createServer(): Promise<FastifyInstance> {
    const server: FastifyInstance = fastify({
        logger: process.env.NODE_ENV === 'development' ? {
            level: 'info',
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss',
                    ignore: 'pid,hostname'
                }
            }
        } : true
    });

    // Register CORS for Auth0 integration
    await server.register(import('@fastify/cors'), {
        origin: true, //TODO: Configure this properly for production
        credentials: true,
    });

    // Register services with Fastify
    server.decorate('diagnosticsService', serviceContainer.getDiagnosticsService());

    // Register all API routes
    await registerRoutes(server);

    return server;
}

export async function startServer(): Promise<void> {
    try {
        const server = await createServer();
        const port = parseInt(process.env.PORT || '3000', 10);
        const host = process.env.HOST || '0.0.0.0';

        await server.listen({ port, host });

        // Graceful shutdown
        const gracefulShutdown = async (): Promise<void> => {
            await serviceContainer.cleanup();
            await prisma.$disconnect();
            await server.close();
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
