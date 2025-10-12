// @ts-nocheck
import { VariantJobDAL } from '@infra/dal';
import { createVariantGenerationService } from '@features/variant_generation/variant-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { createScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';
import { prisma } from '@infra/prisma';
import { VisualRefinementService } from '@features/variant_generation/visual-refinement';

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

        // Process each job with the pre-computed data
        const jobPromises = jobIds.map(async (jobId, index) => {
            try {
                console.log(`[VARIANT_JOB] Processing job ${jobId} (variant ${index + 1})`);

                // Update job status to running
                await VariantJobDAL.updateJob(jobId, {
                    status: 'RUNNING',
                    progress: 20,
                });

                // Use the pre-generated variant idea for this job
                console.log(`[VARIANT_JOB] Using variant idea ${index + 1} for job ${jobId}`);
                const variant = variantIdeas[index] || {
                    variant_label: `Variant ${index + 1}`,
                    description: `Generated variant ${index + 1} for hypothesis: ${hypothesis.description}`,
                    rationale: `This variant tests the hypothesis through direct code generation approach ${index + 1}`
                };
                
                console.log(`[VARIANT_JOB] Processing variant: ${variant.variant_label}`);

                // Update progress
                await VariantJobDAL.updateJob(jobId, {
                    progress: 60,
                });

                // Generate code for this variant using pre-computed data
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

                // Update progress
                await VariantJobDAL.updateJob(jobId, {
                    progress: 70,
                });

                // Step 3: Apply visual refinement to the generated code
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

                // Update progress
                await VariantJobDAL.updateJob(jobId, {
                    progress: 85,
                });

                // Step 4: Validate JavaScript code
                let isValidJavaScript = false;
                if (refinedCode) {
                    try {
                        // Basic syntax check
                        new Function(refinedCode);
                        isValidJavaScript = true;
                        console.log(`[VARIANT_JOB] JavaScript validation passed for variant ${variant.variant_label}`);
                    } catch (error) {
                        console.error(`[VARIANT_JOB] JavaScript validation failed for variant ${variant.variant_label}:`, error);
                    }
                }

                // Update progress
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
