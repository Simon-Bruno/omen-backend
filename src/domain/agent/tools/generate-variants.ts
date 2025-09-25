import { tool } from 'ai';
import { createVariantsSchema } from './schemas';
import { createVariantGenerationService, VariantGenerationService } from '@features/variant_generation/variant-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { getServiceConfig } from '@infra/config/services';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { hypothesisStateManager } from '../hypothesis-state-manager';

class GenerateVariantsExecutor {
    private variantGenerationService: VariantGenerationService;

    constructor() {
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        this.variantGenerationService = createVariantGenerationService(crawler);
    }

    private async generateVariants(hypothesis: Hypothesis): Promise<any> {
        return await this.variantGenerationService.generateVariants(hypothesis);
    }

    async execute(input: { hypothesis?: Hypothesis }): Promise<any> {
        console.log(`[VARIANTS_TOOL] ===== VARIANT GENERATION INPUT =====`);
        console.log(`[VARIANTS_TOOL] Full input received:`, JSON.stringify(input, null, 2));
        
        // Get hypothesis from state manager (preferred) or input
        let hypothesis = hypothesisStateManager.getCurrentHypothesis();
        
        if (hypothesis) {
            console.log(`[VARIANTS_TOOL] Using hypothesis from state manager: "${hypothesis.hypothesis.substring(0, 50)}..."`);
        } else if (input.hypothesis) {
            console.log(`[VARIANTS_TOOL] Using hypothesis from input: "${input.hypothesis.hypothesis.substring(0, 50)}..."`);
            hypothesis = input.hypothesis;
        } else {
            console.log(`[VARIANTS_TOOL] No hypothesis available in state or input`);
            throw new Error('No hypothesis available. Please generate hypotheses first using the generate_hypotheses tool.');
        }
        
        console.log(`[VARIANTS_TOOL] ======================================`);
        
        try {
            const result = await this.generateVariants(hypothesis);
            console.log(`[VARIANTS_TOOL] Variants generated successfully`);
            return result;
        } catch (error) {
            console.error(`[VARIANTS_TOOL] Failed to generate variants:`, error);
            throw error;
        }
    }
}

export function generateVariants() {
    const executor = new GenerateVariantsExecutor();

    return tool({
        description: 'Generate variants for testing a hypothesis',
        inputSchema: createVariantsSchema,
        execute: async (input) => {
            try {
                const result = await executor.execute(input);
                return result;
            } catch (error) {
                console.error(`[VARIANTS_TOOL] Tool execute failed:`, error);
                throw new Error(error instanceof Error ? error.message : 'Failed to generate variants');
            }
        },
    });
}
