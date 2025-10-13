import 'dotenv/config';
import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@infra/prisma';
import { registerRoutes } from '@interfaces/http/index';
import { serviceContainer } from '@app/container';
import { createJobCleanupService } from '@services/job-cleanup';
import { backgroundServicesManager } from '@services/background-services';

function logMemoryUsage(): void {
    const usage = process.memoryUsage();
    const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
    
    console.log('[MEMORY] Usage:', {
        rss: `${formatMB(usage.rss)}MB`,
        heapTotal: `${formatMB(usage.heapTotal)}MB`,
        heapUsed: `${formatMB(usage.heapUsed)}MB`,
        external: `${formatMB(usage.external)}MB`,
    });

    // Log warning if heap usage is high (>400MB on 512MB dyno)
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 400) {
        console.warn('[MEMORY] WARNING: High memory usage detected!');
    }
}

export async function createServer(): Promise<{ server: FastifyInstance; httpServer: any }> {
    // Create Fastify instance
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
    await server.register(registerRoutes, { prefix: '/api' });

    // Get the underlying HTTP server from Fastify
    const httpServer = server.server;

    return { server, httpServer };
}

export async function startServer(): Promise<void> {
    try {
        const { server } = await createServer();
        const port = parseInt(process.env.PORT || '3000', 10);
        const host = process.env.HOST || '0.0.0.0';

        // Start the Fastify server
        await server.listen({ port, host });

        // Log initial memory usage
        logMemoryUsage();

        // Start job cleanup service
        const jobCleanupService = createJobCleanupService();
        jobCleanupService.startCleanup();

        // Start background services (SQS Consumer, etc.)
        await backgroundServicesManager.start();

        // Start memory monitoring (every 2 minutes)
        setInterval(() => {
            logMemoryUsage();
        }, 2 * 60 * 1000);

        // Graceful shutdown
        const gracefulShutdown = async (): Promise<void> => {
            jobCleanupService.stopCleanup();
            await backgroundServicesManager.stop();
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
