import { tool } from 'ai';
import { createVariantsSchema } from './schemas';
import { createVariantGenerationService, VariantGenerationService } from '@features/variant_generation/variant-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { createScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { variantStateManager } from '../variant-state-manager';
import { VariantJobDAL } from '@infra/dal';
import { createVariantJobProcessor } from '@services/variant-job-processor';
import { prisma } from '@infra/prisma';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

class GenerateVariantsExecutor {
    private variantGenerationService: VariantGenerationService;
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        const screenshotStorage = createScreenshotStorageService();
        this.variantGenerationService = createVariantGenerationService(crawler, screenshotStorage, prisma);
    }

    private async generateVariantJobs(hypothesis: Hypothesis): Promise<{ jobIds: string[]; projectId: string }> {
        console.log(`[VARIANTS_TOOL] Starting optimized variant generation for hypothesis: ${hypothesis.title}`);

        // Verify project exists
        const project = await this.variantGenerationService.getCachedProject(this.projectId);
        if (!project) {
            throw new Error(`Project not found: ${this.projectId}`);
        }

        console.log(`[VARIANTS_TOOL] Step 1: Running DOM analysis and variant ideas generation once...`);

        // Step 1: Do DOM analysis and variant ideas generation ONCE (not per job)
        console.log(`[VARIANTS_TOOL] Project shopDomain: ${project.shopDomain}`);

        if (!project.shopDomain) {
            throw new Error(`Project shopDomain not found for project ${this.projectId}. Please check project configuration.`);
        }

        const url = project.shopDomain.startsWith('http://') || project.shopDomain.startsWith('https://')
            ? project.shopDomain
            : `https://${project.shopDomain}`;

        console.log(`[VARIANTS_TOOL] Constructed URL: ${url}`);

        const brandAnalysis = await this.variantGenerationService.getCachedBrandAnalysis(this.projectId);
        if (!brandAnalysis) {
            throw new Error(`No brand analysis available for project ${this.projectId}. Please run brand analysis first.`);
        }

        // Get screenshot and HTML (cached if available)
        const pageType = this.variantGenerationService.getPageType(url);
        const screenshotStorage = createScreenshotStorageService();
        const cachedData = await screenshotStorage.getScreenshotWithHtml(
            this.projectId,
            pageType,
            HIGH_QUALITY_SCREENSHOT_OPTIONS
        );

        let screenshot: string;
        let htmlContent: string | null = null;

        if (cachedData.screenshot) {
            console.log(`[VARIANTS_TOOL] Using cached screenshot and HTML for ${pageType} page`);
            screenshot = cachedData.screenshot;
            htmlContent = cachedData.html;
        } else {
            console.log(`[VARIANTS_TOOL] Taking new screenshot for ${url}`);
            screenshot = await this.variantGenerationService.crawlerService.takePartialScreenshot(
                url,
                { width: 1920, height: 1080 },
                true,
                { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
            );
        }

        // Run DOM analysis once
        const injectionPoints = await this.variantGenerationService.domAnalyzer.analyzeForHypothesisWithHtml(
            url,
            hypothesis.description,
            this.projectId,
            htmlContent,
            { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
        );

        // Generate 3 different variant ideas
        console.log(`[VARIANTS_TOOL] Step 2: Generating 3 different variant ideas...`);
        const variantResult = await this.variantGenerationService.generateVariants(hypothesis, this.projectId, injectionPoints);
        const variantIdeas = variantResult.variants;
        
        console.log(`[VARIANTS_TOOL] Generated ${variantIdeas.length} variant ideas:`, variantIdeas.map(v => v.variant_label));

        console.log(`[VARIANTS_TOOL] Step 3: Creating 3 jobs with different variant ideas...`);

        // Step 3: Create 3 jobs with different variant ideas
        const jobIds: string[] = [];
        for (let i = 0; i < 3; i++) {
            const job = await VariantJobDAL.createJob({ projectId: this.projectId });
            jobIds.push(job.id);
            console.log(`[VARIANTS_TOOL] Created job ${job.id} for variant idea: ${variantIdeas[i]?.variant_label || `Variant ${i + 1}`}`);
        }

        // Step 4: Start async processing with different variant ideas
        const jobProcessor = createVariantJobProcessor();
        jobProcessor.processVariantJobsWithPrecomputedData(
            jobIds,
            this.projectId,
            hypothesis,
            injectionPoints,
            variantIdeas, // Pass the actual variant ideas instead of empty array
            screenshot,
            brandAnalysis,
            variantResult.designSystem,
            htmlContent || undefined
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
            console.log(`[VARIANTS_TOOL] Using hypothesis from state manager: "${hypothesis.title}"`);
        } else if (input.hypothesis) {
            console.log(`[VARIANTS_TOOL] Using hypothesis from input: "${input.hypothesis.title}"`);
            hypothesis = input.hypothesis;
        } else {
            console.log(`[VARIANTS_TOOL] No hypothesis available in state or input`);
            throw new Error('No hypothesis available. Please generate hypotheses first using the generate_hypotheses tool.');
        }

        console.log(`[VARIANTS_TOOL] ======================================`);

        try {
            const result = await this.generateVariantJobs(hypothesis);
            console.log(`[VARIANTS_TOOL] Variant jobs created successfully: ${result.jobIds.length} jobs`);

            // Store the job IDs in the state manager for later retrieval
            variantStateManager.setCurrentJobIds(result.jobIds);
            console.log(`[VARIANTS_TOOL] Job IDs stored in state manager:`, result.jobIds);

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
        description: 'Generate variants for testing a hypothesis. Creates variant jobs that process in the background. Returns jobIds that can be passed to create_experiment to load the specific variants from these jobs.',
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
