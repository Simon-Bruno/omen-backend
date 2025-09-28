import { tool } from 'ai';
import { createVariantsSchema } from './schemas';
import { createVariantGenerationService, VariantGenerationService } from '@features/variant_generation/variant-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { createScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { VariantJobDAL } from '@infra/dal';
import { createVariantJobProcessor } from '@services/variant-job-processor';
import { prisma } from '@infra/prisma';

class GenerateVariantsExecutor {
    private variantGenerationService: VariantGenerationService;
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        const screenshotStorage = createScreenshotStorageService(prisma);
        this.variantGenerationService = createVariantGenerationService(crawler, screenshotStorage, prisma);
    }

    private async generateVariantJobs(hypothesis: Hypothesis): Promise<{ jobIds: string[]; projectId: string }> {
        console.log(`[VARIANTS_TOOL] Starting job-based variant generation for hypothesis: ${hypothesis.hypothesis}`);
        
        // Verify project exists
        const project = await this.variantGenerationService.getCachedProject(this.projectId);
        if (!project) {
            throw new Error(`Project not found: ${this.projectId}`);
        }

        // Create 3 jobs immediately (one for each variant)
        const jobIds: string[] = [];
        for (let i = 0; i < 3; i++) {
            const job = await VariantJobDAL.createJob({ projectId: this.projectId });
            jobIds.push(job.id);
            console.log(`[VARIANTS_TOOL] Created job ${job.id} for variant ${i + 1}`);
        }

        // Start async processing of all jobs
        // Each job will do its own AI generation, code generation, and screenshots
        const jobProcessor = createVariantJobProcessor();
        jobProcessor.processVariantJobs(
            jobIds, 
            this.projectId, 
            hypothesis
        ).catch(error => {
            console.error(`[VARIANTS_TOOL] Failed to process variant jobs:`, error);
        });

        return {
            jobIds,
            projectId: this.projectId
        };
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
            const result = await this.generateVariantJobs(hypothesis);
            console.log(`[VARIANTS_TOOL] Variant jobs created successfully: ${result.jobIds.length} jobs`);
            
            return result;
        } catch (error) {
            console.error(`[VARIANTS_TOOL] Failed to generate variant jobs:`, error);
            throw error;
        }
    }
}

export function generateVariants(projectId: string) {
    const executor = new GenerateVariantsExecutor(projectId);

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
