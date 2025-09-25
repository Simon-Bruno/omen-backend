import { tool } from 'ai';
import { createHypothesesSchema } from './schemas';
import { createHypothesesGenerationService, HypothesesGenerationService } from '@features/hypotheses_generation/hypotheses-generation';
import { HypothesesGenerationResult } from '@features/hypotheses_generation/hypotheses-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { getServiceConfig } from '@infra/config/services';
import { hypothesisStateManager } from '../hypothesis-state-manager';

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

    async execute(input: { projectId?: string; url?: string }): Promise<HypothesesGenerationResult> {
        // Use provided project ID or hardcoded fallback
        const url = input.url || 'https://omen-mvp.myshopify.com';
        const projectId = input.projectId || 'cmfr3xr1n0004pe2fob8jas4l';
        console.log(`[HYPOTHESES_TOOL] Generating hypotheses for ${url}`);
        
        const result = await this.generateHypotheses(url, projectId);
        
        console.log(`[HYPOTHESES_TOOL] Result structure:`, JSON.stringify(result, null, 2));
        
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
            console.log(`[HYPOTHESES_TOOL] Storing hypothesis: "${hypotheses[0].hypothesis.substring(0, 50)}..."`);
            hypothesisStateManager.setCurrentHypothesis(hypotheses[0]);
            console.log(`[HYPOTHESES_TOOL] Hypothesis stored successfully`);
        } else {
            console.log(`[HYPOTHESES_TOOL] No hypotheses to store`);
        }
        
        return result;
    }
}

export function generateHypotheses() {
    const executor = new GenerateHypothesesExecutor();

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