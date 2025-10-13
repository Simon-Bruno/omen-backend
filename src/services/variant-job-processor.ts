// @ts-nocheck
import { VariantJobDAL } from '@infra/dal';
import { createVariantGenerationService } from '@features/variant_generation/variant-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { createScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';
import { prisma } from '@infra/prisma';
import { VisualRefinementService } from '@features/variant_generation/visual-refinement';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

export class VariantJobProcessor {
    private variantGenerationService: any;
    private screenshotStorage: any;
    private visualRefinementService: VisualRefinementService;
    private variantIdeasCache: Map<string, any[]> = new Map();

    constructor() {
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        this.screenshotStorage = createScreenshotStorageService();
        this.variantGenerationService = createVariantGenerationService(crawler, this.screenshotStorage, prisma);
        this.visualRefinementService = new VisualRefinementService();
    }


    private async getJobIndex(jobId: string, projectId: string): Promise<number> {
        // Get all jobs for this project and find the index of this job
        const jobs = await VariantJobDAL.getJobsByProject(projectId);
        const jobIndex = jobs.findIndex(job => job.id === jobId);
        return jobIndex >= 0 ? jobIndex : 0;
    }

    // REMOVED: processVariantJobs and processVariantJobWithCleanup - unused functions from old architecture

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

    // New method that handles all processing in background
    async processVariantJobsInBackground(
        jobIds: string[],
        projectId: string,
        hypothesis: any
    ): Promise<void> {
        console.log(`[VARIANT_JOB] Starting background processing for ${jobIds.length} jobs`);

        try {
            // Update all jobs to RUNNING status at start
            await Promise.all(jobIds.map(jobId => 
                VariantJobDAL.updateJob(jobId, {
                    status: 'RUNNING',
                    progress: 5,
                    startedAt: new Date()
                })
            ));

            // Get project data
            const project = await this.variantGenerationService.getCachedProject(projectId);
            if (!project) {
                throw new Error(`Project not found: ${projectId}`);
            }

            const url = project.shopDomain.startsWith('http://') || project.shopDomain.startsWith('https://')
                ? project.shopDomain
                : `https://${project.shopDomain}`;

            console.log(`[VARIANT_JOB] Using URL: ${url}`);

            // Step 1: Get/take screenshot and HTML (cached if available) - 10% progress
            const pageType = this.getPageType(url);
            const cachedData = await this.screenshotStorage.getScreenshotWithHtml(
                projectId,
                pageType,
                HIGH_QUALITY_SCREENSHOT_OPTIONS
            );

            let screenshot: string;
            let htmlContent: string | null = null;

            if (cachedData.screenshot) {
                console.log(`[VARIANT_JOB] Using cached screenshot and HTML`);
                screenshot = cachedData.screenshot;
                htmlContent = cachedData.html;
            } else {
                console.log(`[VARIANT_JOB] Taking new screenshot for ${url}`);
                screenshot = await this.variantGenerationService.crawlerService.takePartialScreenshot(
                    url,
                    { width: 1920, height: 1080 },
                    true,
                    { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
                );
            }

            await Promise.all(jobIds.map(jobId => 
                VariantJobDAL.updateJob(jobId, { progress: 10 })
            ));

            // Step 2: Run DOM analysis - 30% progress
            console.log(`[VARIANT_JOB] Running DOM analysis`);
            const injectionPoints = await this.variantGenerationService.domAnalyzer.analyzeForHypothesisWithHtml(
                url,
                hypothesis.description,
                projectId,
                htmlContent,
                { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
            );

            console.log(`[VARIANT_JOB] DOM analysis complete, found ${injectionPoints?.length || 0} injection points`);

            await Promise.all(jobIds.map(jobId => 
                VariantJobDAL.updateJob(jobId, { progress: 30 })
            ));

            // Step 3: Get brand analysis
            const brandAnalysis = await this.variantGenerationService.getCachedBrandAnalysis(projectId);
            if (!brandAnalysis) {
                throw new Error(`No brand analysis available for project ${projectId}`);
            }

            // Step 4: Generate variant ideas - 50% progress
            console.log(`[VARIANT_JOB] Generating variant ideas`);
            const variantResult = await this.variantGenerationService.generateVariants(
                hypothesis,
                projectId,
                injectionPoints
            );
            const variantIdeas = variantResult.variants;

            console.log(`[VARIANT_JOB] Generated ${variantIdeas.length} variant ideas:`, 
                variantIdeas.map(v => v.variant_label));

            await Promise.all(jobIds.map(jobId => 
                VariantJobDAL.updateJob(jobId, { progress: 50 })
            ));

            // Step 5: Process jobs with precomputed data (50% -> 100%)
            await this.processVariantJobsWithPrecomputedData(
                jobIds,
                projectId,
                hypothesis,
                injectionPoints,
                variantIdeas,
                screenshot,
                brandAnalysis,
                htmlContent || undefined
            );

        } catch (error) {
            console.error(`[VARIANT_JOB] Background processing failed:`, error);
            // Mark all jobs as failed
            for (const jobId of jobIds) {
                await VariantJobDAL.updateJob(jobId, {
                    status: 'FAILED',
                    error: error instanceof Error ? error.message : 'Background processing failed'
                });
            }
        }
    }

    // New method that accepts pre-computed data to avoid redundant analysis
    async processVariantJobsWithPrecomputedData(
        jobIds: string[],
        projectId: string,
        hypothesis: any,
        injectionPoints: any[],
        variantIdeas: any[],
        screenshot: string,
        brandAnalysis: string,
        htmlContent?: string
    ): Promise<void> {
        console.log(`[VARIANT_JOB] Processing ${jobIds.length} jobs with pre-computed data for hypothesis: ${hypothesis.title}`);

        // Process each job with the pre-computed data (starting at 50%)
        const jobPromises = jobIds.map(async (jobId, index) => {
            try {
                console.log(`[VARIANT_JOB] Processing job ${jobId} (variant ${index + 1})`);

                // Use the pre-generated variant idea for this job
                console.log(`[VARIANT_JOB] Using variant idea ${index + 1} for job ${jobId}`);
                const variant = variantIdeas[index] || {
                    variant_label: `Variant ${index + 1}`,
                    description: `Generated variant ${index + 1} for hypothesis: ${hypothesis.description}`,
                    rationale: `This variant tests the hypothesis through direct code generation approach ${index + 1}`
                };
                
                console.log(`[VARIANT_JOB] Processing variant: ${variant.variant_label}`);

                // Generate code for this variant using pre-computed data - 70% progress
                console.log(`[VARIANT_JOB] Generating code for variant ${variant.variant_label} for job ${jobId}`);
                
                // Use real code generation with pre-computed injection points
                const codeResult = await this.variantGenerationService.codeGenerator.generateCode(
                    variant,
                    hypothesis,
                    brandAnalysis,
                    screenshot,
                    injectionPoints,
                    htmlContent
                );

                await VariantJobDAL.updateJob(jobId, {
                    progress: 70,
                });

                // Apply visual refinement to the generated code - 85% progress
                let refinedCode = codeResult?.javascript_code || '';
                let refinementImprovements: string[] = [];
                
                if (refinedCode) {
                    console.log(`[VARIANT_JOB] Applying visual refinement to variant ${variant.variant_label}`);
                    try {
                        const refinementResult = await this.visualRefinementService.refineVariantCode(
                            refinedCode,
                            codeResult?.description || variant.description,
                            screenshot
                        );
                        refinedCode = refinementResult.javascript_code;
                        refinementImprovements = refinementResult.improvements;
                        console.log(`[VARIANT_JOB] Refinement completed with ${refinementImprovements.length} improvements`);
                    } catch (error) {
                        console.error(`[VARIANT_JOB] Visual refinement failed for variant ${variant.variant_label}:`, error);
                        // Continue with original code if refinement fails
                    }
                }

                await VariantJobDAL.updateJob(jobId, {
                    progress: 85,
                });

                // Validate JavaScript code - 95% progress
                let isValidJavaScript = false;
                if (refinedCode) {
                    try {
                        // Basic syntax check - wrap in strict mode to catch more issues
                        new Function(`'use strict'; ${refinedCode}`);
                        isValidJavaScript = true;
                        console.log(`[VARIANT_JOB] JavaScript validation passed for variant ${variant.variant_label}`);
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        console.error(`[VARIANT_JOB] JavaScript validation failed for variant ${variant.variant_label}: ${errorMessage}`);
                        
                        // Log the problematic code for debugging (first 200 chars)
                        console.error(`[VARIANT_JOB] Problematic code preview: ${refinedCode.slice(0, 200)}...`);
                        
                        // Mark as invalid but don't fail the entire job
                        isValidJavaScript = false;
                    }
                }

                await VariantJobDAL.updateJob(jobId, {
                    progress: 95,
                });

                // Create the final variant object with code integrated
                const finalVariant = {
                    ...variant,
                    // Use the enhanced variant data from code generation if available
                    variant_label: codeResult?.variant_label || variant.variant_label,
                    description: codeResult?.description || variant.description,
                    rationale: codeResult?.rationale || variant.rationale,
                    javascript_code: refinedCode,
                    execution_timing: codeResult?.execution_timing || 'dom_ready',
                    target_selector: codeResult?.target_selector || '',
                    implementation_instructions: codeResult?.implementation_instructions || variant.description,
                    screenshot: screenshot,
                    refinement_improvements: refinementImprovements,
                    is_valid_javascript: isValidJavaScript
                };

                // Store the result in the same format as the original job processor
                await VariantJobDAL.updateJob(jobId, {
                    status: 'COMPLETED',
                    progress: 100,
                    result: {
                        variantsSchema: {
                            variants: [finalVariant]
                        }
                    },
                    completedAt: new Date()
                });

                console.log(`[VARIANT_JOB] Completed job ${jobId} for variant ${variant.variant_label}`);
            } catch (error) {
                console.error(`[VARIANT_JOB] Failed to process job ${jobId}:`, error);
                await VariantJobDAL.updateJob(jobId, {
                    status: 'FAILED',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Wait for all jobs to complete
        await Promise.all(jobPromises);
        console.log(`[VARIANT_JOB] All ${jobIds.length} jobs completed`);
    }

    async cleanup(): Promise<void> {
        await this.prisma.$disconnect();
    }
}

export function createVariantJobProcessor(): VariantJobProcessor {
    return new VariantJobProcessor();
}
