// @ts-nocheck 
import { tool } from 'ai';
import { createHypothesesSchema } from './schemas';
import { createHypothesesGenerationService, HypothesesGenerationService } from '@features/hypotheses_generation/hypotheses-generation';
import { HypothesesGenerationResult } from '@features/hypotheses_generation/hypotheses-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { getServiceConfig } from '@infra/config/services';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { PrismaClient } from '@prisma/client';

class GenerateHypothesesExecutor {
    private hypothesesGenerationService: HypothesesGenerationService;
    private projectId: string;
    private prisma: PrismaClient;

    constructor(projectId: string) {
        this.projectId = projectId;
        this.prisma = new PrismaClient();
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        this.hypothesesGenerationService = createHypothesesGenerationService(crawler, this.prisma);
    }

    private async generateHypotheses(url: string, projectId: string): Promise<HypothesesGenerationResult> {
        return await this.hypothesesGenerationService.generateHypotheses(url, projectId);
    }

    async execute(input: { projectId?: string; url?: string }): Promise<HypothesesGenerationResult> {
        // Use provided URL or default, and use injected project ID
        const url = input.url || 'https://omen-mvp.myshopify.com';
        console.log(`[HYPOTHESES_TOOL] Generating hypotheses for ${url} with project ${this.projectId}`);
        
        const result = await this.generateHypotheses(url, this.projectId);
        
        console.log(`[HYPOTHESES_TOOL] Result structure: ${result.hypotheses ? result.hypotheses.length : 0} hypotheses, schema: ${result.hypothesesSchema ? 'Yes' : 'No'}`);
        
        // Parse the hypotheses from the result structure
        let hypotheses = result.hypotheses;
        if (!hypotheses && result.hypothesesSchema) {
            try {
                const parsed = JSON.parse(result.hypothesesSchema);
                hypotheses = parsed.hypotheses;
                console.log(`[HYPOTHESES_TOOL] Parsed hypotheses from schema:`, hypotheses?.length || 0);
            } catch (error) {
                console.error(`[HYPOTHESES_TOOL] Failed to parse hypothesesSchema:`, error);
            }
        }
        
        console.log(`[HYPOTHESES_TOOL] Hypotheses array length:`, hypotheses?.length || 0);
        
        // Store the first hypothesis in state manager for use by other tools
        if (hypotheses && hypotheses.length > 0) {
            console.log(`[HYPOTHESES_TOOL] Storing hypothesis: "${hypotheses[0].title}"`);
            hypothesisStateManager.setCurrentHypothesis(hypotheses[0]);
            console.log(`[HYPOTHESES_TOOL] Hypothesis stored successfully`);
        } else {
            console.log(`[HYPOTHESES_TOOL] No hypotheses to store`);
        }
        
        return result;
    }

    async cleanup(): Promise<void> {
        await this.prisma.$disconnect();
    }
}

export function generateHypotheses(projectId: string) {
    const executor = new GenerateHypothesesExecutor(projectId);

    return tool({
        description: 'Generate hypotheses for a given project',
        inputSchema: createHypothesesSchema,
        execute: async (input) => {
            try {
                const result = await executor.execute(input);
                return result;
            } catch (error) {
                console.error(`[HYPOTHESES_TOOL] Tool execute failed:`, error);
                throw new Error(error instanceof Error ? error.message : 'Failed to fetch generate hypotheses');
            }
        },
    });
}