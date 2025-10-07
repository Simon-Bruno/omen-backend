// @ts-nocheck
// Variant Generation Service
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { CrawlerService } from '@features/crawler';
import { ProjectDAL } from '@infra/dal';
import { buildVariantGenerationPrompt, buildButtonVariantGenerationPrompt } from './prompts';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { basicVariantsResponseSchema } from './types';
import { createVariantCodeGenerator, VariantCodeGenerator } from './code-generator';
import { DOMAnalyzerService, createDOMAnalyzer } from './dom-analyzer';
import { getAIConfig, getVariantGenerationAIConfig } from '@shared/ai-config';
import type { PrismaClient } from '@prisma/client';
import { ScreenshotStorageService } from '@services/screenshot-storage';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';
import { DEMO_CONDITION, getDemoSelector } from '@shared/demo-config';
import { DesignSystemExtractor } from './design-system-extractor';
import { VisualRefinementService } from './visual-refinement';

export interface VariantGenerationService {
    generateVariants(hypothesis: Hypothesis, projectId: string): Promise<VariantGenerationResult>;
    generateSingleVariant(variant: any, hypothesis: Hypothesis, projectId: string, screenshot: string, injectionPoints: any[], brandAnalysis: string): Promise<any>;
    getCachedProject(projectId: string): Promise<any>;
    getCachedBrandAnalysis(projectId: string): Promise<string | null>;
    getAIConfig(): any;
    buildVariantGenerationPrompt(hypothesis: Hypothesis): string;
    basicVariantsResponseSchema: any;
    crawlerService: any;
    domAnalyzer: any;
}

export interface VariantGenerationResult {
    variantsSchema: string;
}

// Factory function
export function createVariantGenerationService(
    crawler: CrawlerService,
    screenshotStorage: ScreenshotStorageService,
    prisma: PrismaClient
): VariantGenerationService {
    return new VariantGenerationServiceImpl(crawler, screenshotStorage, prisma);
}

export class VariantGenerationServiceImpl implements VariantGenerationService {
    private crawlerService: CrawlerService;
    private codeGenerator: VariantCodeGenerator;
    private screenshotStorage: ScreenshotStorageService;
    private domAnalyzer: DOMAnalyzerService;
    private designSystemExtractor: DesignSystemExtractor;
    private visualRefinement: VisualRefinementService;
    private brandAnalysisCache: Map<string, { data: string; timestamp: number }> = new Map();
    private projectCache: Map<string, { data: any; timestamp: number }> = new Map();
    private designSystemCache: Map<string, { data: any; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes


    constructor(crawler: CrawlerService, screenshotStorage: ScreenshotStorageService) {
        this.crawlerService = crawler;
        this.screenshotStorage = screenshotStorage;
        this.domAnalyzer = createDOMAnalyzer(crawler);
        this.codeGenerator = createVariantCodeGenerator();
        this.designSystemExtractor = new DesignSystemExtractor();
        this.visualRefinement = new VisualRefinementService();
    }

    private async _getCachedProject(projectId: string): Promise<any> {
        const cached = this.projectCache.get(projectId);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            console.log(`[VARIANTS] Using cached project data for ${projectId}`);
            return cached.data;
        }

        console.log(`[VARIANTS] Fetching fresh project data for ${projectId}`);
        const project = await ProjectDAL.getProjectById(projectId);
        if (project) {
            this.projectCache.set(projectId, { data: project, timestamp: Date.now() });
        }
        return project;
    }

    private async _getCachedBrandAnalysis(projectId: string): Promise<string> {
        const cached = this.brandAnalysisCache.get(projectId);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            console.log(`[VARIANTS] Using cached brand analysis for ${projectId}`);
            return cached.data;
        }

        console.log(`[VARIANTS] Fetching fresh brand analysis for ${projectId}`);
        const brandAnalysis = await ProjectDAL.getProjectBrandAnalysis(projectId);
        if (brandAnalysis) {
            this.brandAnalysisCache.set(projectId, { data: brandAnalysis, timestamp: Date.now() });
        }
        return brandAnalysis;
    }

    // Public methods for external access
    async getCachedProject(projectId: string): Promise<any> {
        return this._getCachedProject(projectId);
    }

    async getCachedBrandAnalysis(projectId: string): Promise<string | null> {
        return this._getCachedBrandAnalysis(projectId);
    }

    getAIConfig(): any {
        return getAIConfig();
    }

    buildVariantGenerationPrompt(hypothesis: Hypothesis, variantIndex?: number): string {
        return DEMO_CONDITION
            ? buildButtonVariantGenerationPrompt(hypothesis, variantIndex)
            : buildVariantGenerationPrompt(hypothesis);
    }

    get basicVariantsResponseSchema() {
        return basicVariantsResponseSchema;
    }

    get crawlerService() {
        return this.crawlerService;
    }

    get domAnalyzer() {
        return this.domAnalyzer;
    }

    async cleanup(): Promise<void> {
        // Close the browser to free up resources
        if (this.crawlerService && typeof this.crawlerService.close === 'function') {
            await this.crawlerService.close();
        }
    }

    async generateSingleVariant(variant: any, hypothesis: Hypothesis, projectId: string, screenshot: string, injectionPoints: any[], brandAnalysis: string): Promise<any> {
        console.log(`[VARIANTS] Starting single variant generation: ${variant.variant_label}`);

        const toDataUrl = (b64: string): string => {
            if (!b64) return '';
            if (b64.startsWith('data:')) return b64;
            return `data:image/png;base64,${b64}`;
        };

        // Compress screenshot to reduce token usage
        const compressScreenshot = (b64: string): string => {
            if (!b64) return '';
            // For now, just return the original - compression would require image processing
            // TODO: Implement actual image compression (resize to smaller dimensions, reduce quality)
            return b64;
        };

        // Get project data for shop domain
        const project = await this._getCachedProject(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }

        // Handle both Shopify domains and full URLs
        const url = project.shopDomain.startsWith('http://') || project.shopDomain.startsWith('https://')
            ? project.shopDomain
            : `https://${project.shopDomain}`;

        // Initialize crawler for this variant
        const { createPlaywrightCrawler } = await import('@features/crawler');
        const { getServiceConfig } = await import('@infra/config/services');
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);

        try {
            // Generate code for this variant
            let codeResult;
            try {
                console.log(`[VARIANTS] Generating code for variant: ${variant.variant_label}`);
                // We need to get HTML content for this variant - for now pass null
                codeResult = await this.codeGenerator.generateCode(variant, hypothesis, brandAnalysis, toDataUrl(screenshot), injectionPoints, null);
            } catch (error) {
                console.error(`[VARIANTS] Failed to generate code for variant ${variant.variant_label}:`, error);
                codeResult = null;
            }

            // Skip screenshot for variants - takeVariantScreenshot method was removed
            // Variants now use JavaScript code instead of CSS/HTML injection
            let variantScreenshotUrl = '';

            // Create the final variant object with JavaScript code
            const finalVariant = {
                ...variant,
                javascript_code: codeResult?.javascript_code || '',
                target_selector: codeResult?.target_selector || '',
                execution_timing: codeResult?.execution_timing || 'dom_ready' as const,
                implementation_instructions: codeResult?.implementation_instructions || `Code generation failed for this variant. Please implement manually based on the description: ${variant.description}`,
                screenshot: variantScreenshotUrl
            };

            console.log(`[VARIANTS] Completed single variant: ${variant.variant_label}`);
            return finalVariant;

        } finally {
            // Clean up the crawler
            await crawler.close();
        }
    }

    async generateVariants(hypothesis: Hypothesis, projectId: string): Promise<VariantGenerationResult> {
        console.log(`[VARIANTS] Starting generation for hypothesis: ${hypothesis.title}`);
        console.log(`[VARIANTS] Using project ID: ${projectId}`);

        // Get project data to fetch shop domain (with caching)
        console.log(`[VARIANTS] Fetching project data for project: ${projectId}`);
        const project = await this._getCachedProject(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }

        // Handle both Shopify domains and full URLs
        const url = project.shopDomain.startsWith('http://') || project.shopDomain.startsWith('https://')
            ? project.shopDomain
            : `https://${project.shopDomain}`;
        console.log(`[VARIANTS] Using shop domain: ${project.shopDomain}, URL: ${url}`);

        const toDataUrl = (b64: string): string => {
            if (!b64) return '';
            if (b64.startsWith('data:')) return b64;
            return `data:image/png;base64,${b64}`;
        };

        // Check storage first for base screenshot and HTML (reuse from brand analysis or DOM analysis)
        const pageType = this.getPageType(url);
        const cachedData = await this.screenshotStorage.getScreenshotWithHtml(
            projectId,
            pageType,
            HIGH_QUALITY_SCREENSHOT_OPTIONS
        );

        let screenshot: string;
        let htmlContent: string | null = null;

        if (cachedData.screenshot) {
            console.log(`[VARIANTS] Using stored screenshot and HTML for ${pageType} page`);
            screenshot = cachedData.screenshot;
            htmlContent = cachedData.html;
        } else {
            console.log(`[VARIANTS] Taking new screenshot and HTML for ${url}`);
            const crawlResult = await this.crawlerService.crawlPage(url, {
                viewport: { width: 1920, height: 1080 },
                waitFor: 3000,
                screenshot: { fullPage: true, quality: 80 },
                authentication: { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
            });

            screenshot = crawlResult.screenshot || '';
            htmlContent = crawlResult.html || null;

            // Store the new screenshot and HTML
            if (screenshot) {
                const screenshotId = await this.screenshotStorage.saveScreenshot(
                    projectId,
                    pageType,
                    url,
                    HIGH_QUALITY_SCREENSHOT_OPTIONS,
                    screenshot,
                    htmlContent ? htmlContent.substring(0, 50000) : undefined // Limit HTML size for storage
                );
                console.log(`[VARIANTS] Screenshot and HTML saved with ID: ${screenshotId}`);
            }
        }

        // PARALLEL OPTIMIZATION: Extract design system along with DOM analysis and brand analysis
        console.log(`[VARIANTS] Starting parallel operations: DOM analysis, brand analysis, and design system extraction`);

        if (DEMO_CONDITION) {
            console.log(`[VARIANTS] DEMO MODE ENABLED - Using demo selector: ${getDemoSelector('variants')}`);
        }

        // Try to get cached design system first
        let designSystem = null;
        const cachedDesignSystem = this.designSystemCache.get(projectId);
        if (cachedDesignSystem && Date.now() - cachedDesignSystem.timestamp < this.CACHE_TTL) {
            console.log(`[VARIANTS] Using cached design system for ${projectId}`);
            designSystem = cachedDesignSystem.data;
        }

        const [injectionPoints, brandAnalysis, extractedDesignSystem] = await Promise.all([
            // Use demo selector if enabled, otherwise use normal analysis
            DEMO_CONDITION
                ? this.domAnalyzer.analyzeWithHardcodedSelector(
                    url,
                    hypothesis.description,
                    projectId,
                    getDemoSelector('variants'),
                    htmlContent,
                    { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
                )
                : this.domAnalyzer.analyzeForHypothesisWithHtml(
                    url,
                    hypothesis.description,
                    projectId,
                    htmlContent, // Pass the HTML we already have
                    { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
                ),
            this._getCachedBrandAnalysis(projectId),
            // Extract design system if not cached
            designSystem ? Promise.resolve(null) : this.designSystemExtractor.extractDesignSystem(screenshot, htmlContent)
        ]);

        // Use extracted design system or cached one
        if (extractedDesignSystem) {
            designSystem = extractedDesignSystem;
            // Cache it for future use
            this.designSystemCache.set(projectId, { data: designSystem, timestamp: Date.now() });
            console.log(`[VARIANTS] Design system extracted and cached`);
        }

        // Set design system in code generator
        this.codeGenerator.setDesignSystem(designSystem);

        console.log(`[VARIANTS] Parallel operations completed:`);
        console.log(`[VARIANTS] - Screenshot length: ${screenshot.length}`);
        console.log(`[VARIANTS] - Injection points found: ${injectionPoints.length}`);
        console.log(`[VARIANTS] - Brand analysis: ${brandAnalysis ? `length: ${brandAnalysis.length} chars` : 'null'}`);
        console.log(`[VARIANTS] - Design system: ${designSystem ? 'extracted' : 'not available'}`);

        // Log the injection points for debugging
        if (injectionPoints.length > 0) {
            console.log(`[VARIANTS] Injection points:`);
            injectionPoints.slice(0, 3).forEach((point, i) => {
                console.log(`  ${i + 1}. Selector: ${point.selector || 'N/A'}`);
                console.log(`     Confidence: ${point.confidence || 0}`);
                console.log(`     Type: ${point.elementType || point.type || 'unknown'}`);
            });
        }

        if (!brandAnalysis) {
            console.warn(`[VARIANTS] No brand analysis found for project: ${projectId}`);
            throw new Error(`No brand analysis available for project ${projectId}. Please run brand analysis first.`);
        }

        console.log(`[VARIANTS] Generating variant ideas with Google Gemini 2.5 Pro`);
        const aiConfig = getVariantGenerationAIConfig();

        // Use button-specific prompt when in demo mode (targeting button/link)
        const prompt = DEMO_CONDITION
            ? buildButtonVariantGenerationPrompt(hypothesis)
            : buildVariantGenerationPrompt(hypothesis, designSystem);

        console.log(`[VARIANTS] Using ${DEMO_CONDITION ? 'button-specific (demo mode)' : 'general'} prompt`);

        const object = await generateObject({
            model: google(aiConfig.model, {
                apiKey: aiConfig.apiKey,
            }),
            schema: basicVariantsResponseSchema,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: "text", text: prompt },
                        { type: "text", text: brandAnalysis },
                        { type: "image", image: toDataUrl(screenshot) }
                    ]
                }
            ]
        });
        const response = object.object;
        console.log(`[VARIANTS] AI response generated: ${response.variants.length} variant ideas`);

        // For testing, only use the first variant
        const variantsToProcess = process.env.TEST_MODE === 'true' ? response.variants.slice(0, 1) : response.variants;

        // PARALLEL PROCESSING: Generate JavaScript code for each variant
        console.log(`[VARIANTS] Generating JavaScript code for ${variantsToProcess.length} variants${process.env.TEST_MODE === 'true' ? ' (TEST MODE - limited to 1)' : ''}`);

        const variantsWithCode = await Promise.all(
            variantsToProcess.map(async (variant, index) => {
                console.log(`[VARIANTS] Processing variant ${index + 1}/${variantsToProcess.length}: ${variant.variant_label}`);

                // Generate JavaScript code for this variant
                let codeResult;
                try {
                    console.log(`[VARIANTS] Generating JavaScript for: ${variant.variant_label}`);
                    codeResult = await this.codeGenerator.generateCode(variant, hypothesis, brandAnalysis, toDataUrl(screenshot), injectionPoints, htmlContent);

                    // STAGE 2: Visual refinement if design system is available
                    if (designSystem && codeResult?.javascript_code) {
                        console.log(`[VARIANTS] Applying visual refinement for: ${variant.variant_label}`);
                        try {
                            const refinedResult = await this.visualRefinement.refineVariantCode(
                                codeResult.javascript_code,
                                variant.description,
                                designSystem,
                                toDataUrl(screenshot)
                            );

                            if (refinedResult.javascript_code && refinedResult.javascript_code !== codeResult.javascript_code) {
                                console.log(`[VARIANTS] Visual refinement applied successfully`);
                                console.log(`[VARIANTS] Improvements: ${refinedResult.improvements.slice(0, 3).join(', ')}`);
                                codeResult.javascript_code = refinedResult.javascript_code;
                            }
                        } catch (refineError) {
                            console.warn(`[VARIANTS] Visual refinement failed, using original code:`, refineError);
                        }
                    }

                    // Validate that the selector exists in the cleaned HTML (same as used for detection)
                    if (htmlContent && codeResult?.target_selector) {
                        try {
                            // Clean the HTML the same way the DOM analyzer does
                            const cheerio = require('cheerio');
                            const $ = cheerio.load(htmlContent);

                            // Remove script tags, style tags, and comments (same as DOM analyzer)
                            $('script').remove();
                            $('style').remove();
                            $('noscript').remove();
                            $('link[rel="stylesheet"]').remove();

                            // Now check if selector exists in cleaned HTML
                            const elements = $(codeResult.target_selector);

                            if (elements.length === 0) {
                                console.warn(`[VARIANTS] Selector not found in cleaned HTML: ${codeResult.target_selector}`);
                            } else {
                                console.log(`[VARIANTS] Selector validated in cleaned HTML: ${codeResult.target_selector} (${elements.length} matches)`);
                            }
                        } catch (selectorError) {
                            console.warn(`[VARIANTS] Invalid selector: ${codeResult.target_selector}`, selectorError);
                        }
                    }
                } catch (error) {
                    console.error(`[VARIANTS] Failed to generate code for variant ${variant.variant_label}:`, error);
                    codeResult = null;
                }

                // Create the final variant object with JavaScript code
                const finalVariant = {
                    ...variant,
                    javascript_code: codeResult?.javascript_code || '',
                    execution_timing: codeResult?.execution_timing || 'dom_ready',
                    target_selector: codeResult?.target_selector || '',
                    implementation_instructions: codeResult?.implementation_instructions || variant.description
                };

                return finalVariant;
            })
        );

        console.log(`[VARIANTS] All variants with JavaScript code generated successfully`);
        const result = {
            variantsSchema: JSON.stringify({ variants: variantsWithCode })
        };
        console.log(`[VARIANTS] Final result: ${variantsWithCode.length} variants, schema length: ${result.variantsSchema.length} chars`);
        return result;
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
}