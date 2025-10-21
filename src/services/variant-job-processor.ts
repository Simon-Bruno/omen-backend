// @ts-nocheck
import { VariantJobDAL } from '@infra/dal';
import { createVariantGenerationService } from '@features/variant_generation/variant-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { createScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';
import { prisma } from '@infra/prisma';
import { VisualRefinementService } from '@features/variant_generation/visual-refinement';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';
import { detectPageType } from '@shared/page-types';

export class VariantJobProcessor {
    private variantGenerationService: any;
    private screenshotStorage: any;
    private visualRefinementService: VisualRefinementService;
    // REMOVED: In-memory cache causing memory issues on 512MB dynos
    // private variantIdeasCache: Map<string, any[]> = new Map();

    constructor() {
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        this.screenshotStorage = createScreenshotStorageService();
        this.variantGenerationService = createVariantGenerationService(crawler, this.screenshotStorage, prisma);
        this.visualRefinementService = new VisualRefinementService();
    }

    private async getUrlForPageType(projectId: string, pageType: string): Promise<string | null> {
        try {
            // Map page types to database pageType values (all lowercase as per PageType enum)
            const pageTypeMap: { [key: string]: string[] } = {
                'pdp': ['pdp'],
                'product': ['pdp'],
                'product page': ['pdp'],
                'product detail page': ['pdp'],
                'homepage': ['home'],
                'home page': ['home'],
                'landing page': ['home'],
                'collection': ['collection'],
                'category': ['collection'],
                'category page': ['collection'],
                'shop page': ['collection']
            };

            const normalizedPageType = pageType.toLowerCase();
            const targetTypes = pageTypeMap[normalizedPageType] || [normalizedPageType];

            // Find the first matching page type in screenshots table
            for (const targetType of targetTypes) {
                const screenshot = await prisma.screenshot.findFirst({
                    where: {
                        projectId: projectId,
                        pageType: targetType
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    select: {
                        url: true
                    }
                });

                if (screenshot?.url) {
                    console.log(`[VARIANT_JOB] Found ${targetType} URL: ${screenshot.url}`);
                    return screenshot.url;
                }
            }

            console.log(`[VARIANT_JOB] No URL found for page type: ${pageType}`);
            return null;
        } catch (error) {
            console.error(`[VARIANT_JOB] Error fetching URL for page type ${pageType}:`, error);
            return null;
        }
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

            // Use the hypothesis URL as the primary source, fallback to project domain
            let url = hypothesis.url || (project.shopDomain.startsWith('http://') || project.shopDomain.startsWith('https://')
                ? project.shopDomain
                : `https://${project.shopDomain}`);

            console.log(`[VARIANT_JOB] Using URL: ${url}`);

            // Step 1: Get/take screenshot and HTML (cached if available) - 10% progress
            const pageType = detectPageType(url);
            // Convert enum to string for backward compatibility with storage service
            const pageTypeString = pageType as string;
            const cachedData = await this.screenshotStorage.getScreenshotWithHtml(
                projectId,
                pageTypeString as 'home' | 'pdp' | 'about' | 'other',
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

                // Detect page type from project URL
                const project = await this.variantGenerationService.getCachedProject(projectId);
                const url = project.shopDomain.startsWith('http://') || project.shopDomain.startsWith('https://')
                    ? project.shopDomain
                    : `https://${project.shopDomain}`;
                const pageType = detectPageType(url);

                // Generate code for this variant using pre-computed data - 70% progress
                console.log(`[VARIANT_JOB] Generating code for variant ${variant.variant_label} for job ${jobId} (page type: ${pageType})`);

                // Use real code generation with pre-computed injection points and page type
                const codeResult = await this.variantGenerationService.codeGenerator.generateCode(
                    variant,
                    hypothesis,
                    brandAnalysis,
                    screenshot,
                    injectionPoints,
                    htmlContent,
                    pageType
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
                    // MEMORY: Do not persist large preview-only assets in job result
                    // screenshot intentionally omitted
                    // refinement_improvements intentionally omitted
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
