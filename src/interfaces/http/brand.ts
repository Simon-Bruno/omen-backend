// Create the routes for the brand model web crawling
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { serviceContainer } from '@infra/container';
import type { BrandAnalysisResult } from '@infra/services/brand-analysis';

export async function brandRoutes(fastify: FastifyInstance) {

    fastify.get<{
        Querystring: { shopDomain?: string };
        Reply: BrandAnalysisResult;
    }>('/brand', {
    }, async (request: FastifyRequest<{
        Querystring: { shopDomain?: string };
    }>, reply: FastifyReply) => {
        try {
            const { shopDomain } = request.query;
            
            console.log("Brand route hit");
            if(!shopDomain) {
                return reply.code(400).send({ error: 'Shop domain is required' });
            }
            const brandAnalysisService = serviceContainer.getBrandAnalysisService();
            const result = await brandAnalysisService.analyzeProject(shopDomain);
            return reply.status(200).send(result);
        } catch (error: unknown) {
            console.error(`[HTTP] Error getting brand info:`, error);
            fastify.log.error({ err: error }, 'Error getting brand info:');
            return reply.code(500).send({ error: 'Failed to get brand info' });
        }
    });
}

