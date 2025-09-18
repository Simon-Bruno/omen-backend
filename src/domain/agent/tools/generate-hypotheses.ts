import { tool } from 'ai';
import { createHypothesesSchema } from './schemas';
import { createHypothesesGenerationService, HypothesesGenerationService } from '@features/hypotheses_generation/hypotheses-generation';
import { HypothesesGenerationResult } from '@features/hypotheses_generation/hypotheses-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { getServiceConfig } from '@infra/config/services';

class GenerateHypothesesExecutor {
    private hypothesesGenerationService: HypothesesGenerationService;

    constructor() {
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        this.hypothesesGenerationService = createHypothesesGenerationService(crawler);
    }

    private async generateHypotheses(url: string, projectId: string): Promise<HypothesesGenerationResult> {
        return await this.hypothesesGenerationService.generateHypotheses(url, projectId);
    }

    async execute(): Promise<HypothesesGenerationResult> {
        // For now, use a default URL and project ID
        // TODO: Extract URL from user message context
        const url = 'https://omen-mvp.myshopify.com'; // Default URL
        const projectId = 'cmfpgdkja0001k54ww1jpe3vr';
        console.log(`[HYPOTHESES_TOOL] Using URL: ${url}, Project ID: ${projectId}`);
        return await this.generateHypotheses(url, projectId);
    }
}

export function generateHypotheses() {
    const executor = new GenerateHypothesesExecutor();

    return tool({
        description: 'Generate hypotheses for a given project',
        inputSchema: createHypothesesSchema,
        execute: async () => {
            try {
                const result = await executor.execute();
                return result;
            } catch (error) {
                console.error(`[HYPOTHESES_TOOL] Tool execute failed:`, error);
                throw new Error(error instanceof Error ? error.message : 'Failed to fetch generate hypotheses');
            }
        },
    });
}