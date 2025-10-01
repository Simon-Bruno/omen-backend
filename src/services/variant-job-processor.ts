// @ts-nocheck
import { VariantJobDAL } from '@infra/dal';
import { createVariantGenerationService } from '@features/variant_generation/variant-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { createScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';
import { PrismaClient } from '@prisma/client';
import { STANDARD_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

export class VariantJobProcessor {
    private variantGenerationService: any;
    private prisma: PrismaClient;
    private screenshotStorage: any;

    constructor() {
        this.prisma = new PrismaClient();
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        this.screenshotStorage = createScreenshotStorageService(this.prisma);
        this.variantGenerationService = createVariantGenerationService(crawler, this.screenshotStorage, this.prisma);
    }

    async processVariantJob(jobId: string, projectId: string, hypothesis: any): Promise<void> {
        console.log(`[VARIANT_JOB] Starting processing for job ${jobId}`);
        
        try {
            // Update job status to running
            await VariantJobDAL.updateJob(jobId, {
                status: 'RUNNING',
                progress: 10,
                startedAt: new Date(),
            });

            // Get project data
            const project = await this.variantGenerationService.getCachedProject(projectId);
            if (!project) {
                throw new Error(`Project not found: ${projectId}`);
            }
            
            const url = `https://${project.shopDomain}`;
            console.log(`[VARIANT_JOB] Using shop domain: ${project.shopDomain}, URL: ${url}`);

            // Update progress
            await VariantJobDAL.updateJob(jobId, {
                progress: 20,
            });

            // Run the initial analysis in parallel (screenshot, DOM analysis, brand analysis)
            console.log(`[VARIANT_JOB] Starting parallel operations for job ${jobId}`);
            
            // Check for cached screenshot and HTML first
            const pageType = this.getPageType(url);
            const cachedData = await this.screenshotStorage.getScreenshotWithHtml(
                projectId, 
                pageType, 
                STANDARD_SCREENSHOT_OPTIONS
            );
            
            let screenshot: string;
            let htmlContent: string | null = null;
            
            if (cachedData.screenshot) {
                console.log(`[VARIANT_JOB] Using cached screenshot and HTML for ${pageType} page`);
                screenshot = cachedData.screenshot;
                htmlContent = cachedData.html;
            } else {
                console.log(`[VARIANT_JOB] Taking new screenshot for ${url}`);
                screenshot = await this.variantGenerationService.crawlerService.takePartialScreenshot(url, { width: 1920, height: 1080 }, true, { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain });
            }
            
            const [injectionPoints, brandAnalysis] = await Promise.all([
                // Use hardcoded selector logic (same as variant generation)
                this.variantGenerationService.domAnalyzer.analyzeWithHardcodedSelector(
                    url,
                    hypothesis.description,
                    projectId,
                    'a[href="/collections/all"]', // Hardcoded selector
                    htmlContent,
                    { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
                ),
                this.variantGenerationService.getCachedBrandAnalysis(projectId)
            ]);

            console.log(`[VARIANT_JOB] Parallel operations completed for job ${jobId}`);
            
            if (!brandAnalysis) {
                throw new Error(`No brand analysis available for project ${projectId}. Please run brand analysis first.`);
            }

            // Update progress
            await VariantJobDAL.updateJob(jobId, {
                progress: 40,
            });

            // Generate the variant description using AI
            console.log(`[VARIANT_JOB] Generating AI response for job ${jobId}`);
            const aiConfig = this.variantGenerationService.getAIConfig();
            const { generateObject } = await import('ai');
            const { google } = await import('@ai-sdk/google');
            
            const response = await generateObject({
                model: google(aiConfig.model, {
                    apiKey: aiConfig.apiKey,
                }),
                schema: this.variantGenerationService.basicVariantsResponseSchema,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: "text", text: this.variantGenerationService.buildVariantGenerationPrompt(hypothesis) },
                            { type: "text", text: brandAnalysis },
                            { type: "image", image: `data:image/png;base64,${screenshot}` }
                        ]
                    }
                ]
            });

            // Pick a random variant from the 3 generated (or use a specific one based on job index)
            const jobIndex = await this.getJobIndex(jobId, projectId);
            const variants = response.object.variants;
            const variant = variants[jobIndex % variants.length];
            
            console.log(`[VARIANT_JOB] Selected variant ${variant.variant_label} for job ${jobId}`);

            // Update progress
            await VariantJobDAL.updateJob(jobId, {
                progress: 60,
            });

            // Generate the single variant with code and screenshots
            console.log(`[VARIANT_JOB] Generating variant ${variant.variant_label} for job ${jobId}`);
            const finalVariant = await this.variantGenerationService.generateSingleVariant(
                variant,
                hypothesis,
                projectId,
                screenshot,
                injectionPoints,
                brandAnalysis
            );

            // Update job with result
            await VariantJobDAL.updateJob(jobId, {
                status: 'COMPLETED',
                progress: 100,
                result: {
                    variantsSchema: {
                        variants: [finalVariant]
                    }
                },
                completedAt: new Date(),
            });

            console.log(`[VARIANT_JOB] Successfully completed job ${jobId} for variant ${variant.variant_label}`);

        } catch (error) {
            console.error(`[VARIANT_JOB] Failed to process job ${jobId}:`, error);
            
            // Update job with error
            await VariantJobDAL.updateJob(jobId, {
                status: 'FAILED',
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                completedAt: new Date(),
            });
        }
    }

    private async getJobIndex(jobId: string, projectId: string): Promise<number> {
        // Get all jobs for this project and find the index of this job
        const jobs = await VariantJobDAL.getJobsByProject(projectId);
        const jobIndex = jobs.findIndex(job => job.id === jobId);
        return jobIndex >= 0 ? jobIndex : 0;
    }

    async processVariantJobs(jobIds: string[], projectId: string, hypothesis: any): Promise<void> {
        console.log(`[VARIANT_JOB] Starting processing for ${jobIds.length} variant jobs`);
        
        // Process all jobs in parallel with proper memory management
        const promises = jobIds.map((jobId, index) => 
            this.processVariantJobWithCleanup(jobId, projectId, hypothesis, index)
        );

        try {
            await Promise.all(promises);
            console.log(`[VARIANT_JOB] Completed processing all ${jobIds.length} variant jobs`);
        } catch (error) {
            console.error(`[VARIANT_JOB] Some variant jobs failed:`, error);
        }
    }

    private async processVariantJobWithCleanup(jobId: string, projectId: string, hypothesis: any, index: number): Promise<void> {
        console.log(`[VARIANT_JOB] Starting job ${index + 1}: ${jobId}`);
        
        // Log memory usage before processing
        this.logMemoryUsage(`Before job ${index + 1}`);
        
        try {
            await this.processVariantJob(jobId, projectId, hypothesis);
            console.log(`[VARIANT_JOB] Successfully completed job ${index + 1}: ${jobId}`);
        } catch (error) {
            console.error(`[VARIANT_JOB] Failed to process job ${index + 1}: ${jobId}`, error);
            throw error; // Re-throw to be caught by Promise.all
        } finally {
            // Force garbage collection after each job to manage memory
            this.forceGarbageCollection();
            this.logMemoryUsage(`After job ${index + 1}`);
        }
    }

    private logMemoryUsage(context: string): void {
        if (process.memoryUsage) {
            const memUsage = process.memoryUsage();
            console.log(`[MEMORY] ${context} - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        }
    }

    private forceGarbageCollection(): void {
        if (global.gc) {
            global.gc();
            console.log(`[MEMORY] Forced garbage collection`);
        }
    }


    private getPageType(url: string): 'home' | 'pdp' | 'about' | 'other' {
        const urlLower = url.toLowerCase();
        
        // Check for product pages first
        if (urlLower.includes('/products/') || urlLower.includes('/collections/')) {
            return 'pdp';
        }
        
        // Check for about pages
        if (urlLower.includes('/about')) {
            return 'about';
        }
        
        // Check for home page - this should be the most common case
        // Home page is typically just the domain or domain with trailing slash
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        
        // If no path or just a trailing slash, it's the home page
        if (!pathname || pathname === '/' || pathname === '') {
            return 'home';
        }
        
        // If path is just common home page indicators
        if (pathname === '/home' || pathname === '/index' || pathname === '/index.html') {
            return 'home';
        }
        
        return 'other';
    }

    async cleanup(): Promise<void> {
        await this.prisma.$disconnect();
    }
}

export function createVariantJobProcessor(): VariantJobProcessor {
    return new VariantJobProcessor();
}
