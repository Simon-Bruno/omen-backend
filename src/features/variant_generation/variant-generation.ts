// @ts-nocheck 
// Variant Generation Service
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { CrawlerService } from '@features/crawler';
import { ProjectDAL } from '@infra/dal';
import { buildVariantGenerationPrompt } from './prompts';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { basicVariantsResponseSchema } from './types';
import { createVariantCodeGenerator, VariantCodeGenerator } from './code-generator';
import { DOMAnalyzerService, createDOMAnalyzer } from './dom-analyzer';
import { getAIConfig } from '@shared/ai-config';
import { PrismaClient } from '@prisma/client';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { STANDARD_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

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
    private brandAnalysisCache: Map<string, { data: string; timestamp: number }> = new Map();
    private projectCache: Map<string, { data: any; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    // Hardcoded element focus configuration - matches hypothesis generation
    private readonly HARDCODE_ELEMENT_FOCUS = true;
    private readonly TARGET_ELEMENT = {
        selector: 'a[href="/collections/all"]',
        description: 'Shop all button/link',
        html: '<a href="/collections/all">Shop all</a>'
    };
    
    constructor(crawler: CrawlerService, screenshotStorage: ScreenshotStorageService, prisma: PrismaClient) {
        this.crawlerService = crawler;
        this.screenshotStorage = screenshotStorage;
        this.domAnalyzer = createDOMAnalyzer(crawler, prisma);
        this.codeGenerator = createVariantCodeGenerator();
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

    buildVariantGenerationPrompt(hypothesis: Hypothesis): string {
        return buildVariantGenerationPrompt(hypothesis);
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
        
        const url = `https://${project.shopDomain}`;
        
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
                codeResult = await this.codeGenerator.generateCode(variant, hypothesis, brandAnalysis, toDataUrl(screenshot), injectionPoints);
            } catch (error) {
                console.error(`[VARIANTS] Failed to generate code for variant ${variant.variant_label}:`, error);
                codeResult = null;
            }
            
            // Take screenshot for this variant
            let variantScreenshotUrl = '';
            if (codeResult) {
                try {
                    console.log(`[VARIANTS] Taking screenshot for variant: ${variant.variant_label}`);
                    const variantScreenshotBase64 = await crawler.takeVariantScreenshot(
                        url,
                        {
                            css_code: codeResult.css_code,
                            html_code: codeResult.html_code,
                            injection_method: codeResult.injection_method,
                            target_selector: codeResult.target_selector,
                            new_element_html: codeResult.new_element_html
                        },
                        { width: 1920, height: 1080 },
                        { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
                    );
                    
                    // Save screenshot to database and get the screenshot ID
                    const variantId = `variant-${variant.variant_label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${Date.now()}`;
                    const screenshotId = await this.screenshotStorage.saveScreenshot(
                        projectId,
                        'other', // Variant screenshots are categorized as 'other'
                        url,
                        STANDARD_SCREENSHOT_OPTIONS,
                        variantScreenshotBase64,
                        undefined, // No HTML content for variant screenshots
                        variantId // Unique variant ID to prevent duplicates
                    );
                    
                    // Generate a proper URL for the screenshot
                    variantScreenshotUrl = `/api/screenshots/db/${screenshotId}`;
                    console.log(`[VARIANTS] Screenshot saved for variant ${variant.variant_label}: ${variantScreenshotUrl}`);
                } catch (screenshotError) {
                    console.error(`[VARIANTS] Failed to take screenshot for variant ${variant.variant_label}:`, screenshotError);
                    // Continue without screenshot rather than failing the entire variant
                }
            }
            
            // Create the final variant object
            const finalVariant = {
                ...variant,
                css_code: codeResult?.css_code || '',
                html_code: codeResult?.html_code || '',
                injection_method: codeResult?.injection_method || 'selector' as const,
                target_selector: codeResult?.target_selector || '',
                new_element_html: codeResult?.new_element_html || '',
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
        
        const url = `https://${project.shopDomain}`;
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
            STANDARD_SCREENSHOT_OPTIONS
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
                    STANDARD_SCREENSHOT_OPTIONS,
                    screenshot,
                    htmlContent ? htmlContent.substring(0, 50000) : undefined // Limit HTML size for storage
                );
                console.log(`[VARIANTS] Screenshot and HTML saved with ID: ${screenshotId}`);
            }
        }

        // PARALLEL OPTIMIZATION: Run DOM analysis and brand analysis in parallel
        console.log(`[VARIANTS] Starting parallel operations: DOM analysis and brand analysis`);
        
        if (this.HARDCODE_ELEMENT_FOCUS) {
            console.log(`[VARIANTS] HARDCODED ELEMENT FOCUS ENABLED - Using hardcoded selector: ${this.TARGET_ELEMENT.selector}`);
        }
        
        const [injectionPoints, brandAnalysis] = await Promise.all([
            // Use hardcoded selector if enabled, otherwise use normal analysis
            this.HARDCODE_ELEMENT_FOCUS 
                ? this.domAnalyzer.analyzeWithHardcodedSelector(
                    url,
                    hypothesis.description,
                    projectId,
                    this.TARGET_ELEMENT.selector,
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
            this._getCachedBrandAnalysis(projectId)
        ]);

        console.log(`[VARIANTS] Parallel operations completed:`);
        console.log(`[VARIANTS] - Screenshot length: ${screenshot.length}`);
        console.log(`[VARIANTS] - Injection points found: ${injectionPoints.length}`);
        console.log(`[VARIANTS] - Brand analysis: ${brandAnalysis ? `length: ${brandAnalysis.length} chars` : 'null'}`);
        
        if (!brandAnalysis) {
            console.warn(`[VARIANTS] No brand analysis found for project: ${projectId}`);
            throw new Error(`No brand analysis available for project ${projectId}. Please run brand analysis first.`);
        }

        console.log(`[VARIANTS] Generating AI response with Google Gemini`);
        const aiConfig = getAIConfig();
        const object = await generateObject({
            model: google(aiConfig.model, {
                apiKey: aiConfig.apiKey,
            }),
            schema: basicVariantsResponseSchema,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: "text", text: buildVariantGenerationPrompt(hypothesis) },
                        { type: "text", text: brandAnalysis },
                        { type: "image", image: toDataUrl(screenshot) }
                    ]
                }
            ]
        });
        const response = object.object;
        console.log(`[VARIANTS] AI response generated: ${response.variants.length} variants`);

        // SEQUENTIAL PROCESSING: Generate code and take screenshots for each variant one by one
        console.log(`[VARIANTS] Processing ${response.variants.length} variants sequentially`);
        const variantsWithScreenshots = [];
        
        // Initialize a single crawler instance for all variants to reuse browser
        const { createPlaywrightCrawler } = await import('@features/crawler');
        const { getServiceConfig } = await import('@infra/config/services');
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        
        try {
            for (let index = 0; index < response.variants.length; index++) {
                const variant = response.variants[index];
                console.log(`[VARIANTS] Processing variant ${index + 1}/${response.variants.length}: ${variant.variant_label}`);
                
                // Generate code for this variant
                let codeResult;
                try {
                    console.log(`[VARIANTS] Generating code for variant ${index + 1}: ${variant.variant_label}`);
                    codeResult = await this.codeGenerator.generateCode(variant, hypothesis, brandAnalysis, toDataUrl(screenshot), injectionPoints);
                } catch (error) {
                    console.error(`[VARIANTS] Failed to generate code for variant ${variant.variant_label}:`, error);
                    codeResult = null;
                }
                
                // Take screenshot for this variant using the shared crawler instance
                let variantScreenshotUrl = '';
                if (codeResult) {
                    try {
                        console.log(`[VARIANTS] Taking screenshot for variant ${index + 1}: ${variant.variant_label}`);
                        const variantScreenshotBase64 = await crawler.takeVariantScreenshot(
                            url,
                            {
                                css_code: codeResult.css_code,
                                html_code: codeResult.html_code,
                                injection_method: codeResult.injection_method,
                                target_selector: codeResult.target_selector,
                                new_element_html: codeResult.new_element_html
                            },
                            { width: 1920, height: 1080 },
                            { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
                        );
                        
                        // Save screenshot to database and get URL
                        const screenshotId = await this.screenshotStorage.saveScreenshot(
                            projectId,
                            'other', // Variant screenshots are categorized as 'other'
                            url,
                            STANDARD_SCREENSHOT_OPTIONS,
                            variantScreenshotBase64,
                            undefined, // No HTML content for variant screenshots
                            `variant-${index + 1}-${variant.variant_label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}` // Unique variant ID
                        );
                        variantScreenshotUrl = `/api/screenshots/db/${screenshotId}`;
                        console.log(`[VARIANTS] Screenshot saved for variant ${variant.variant_label}: ${variantScreenshotUrl}`);
                    } catch (screenshotError) {
                        console.error(`[VARIANTS] Failed to take screenshot for variant ${variant.variant_label}:`, screenshotError);
                        // Continue without screenshot rather than failing the entire variant
                    }
                }
                
                // Create the final variant object
                const finalVariant = {
                    ...variant,
                    css_code: codeResult?.css_code || '',
                    html_code: codeResult?.html_code || '',
                    injection_method: codeResult?.injection_method || 'selector' as const,
                    target_selector: codeResult?.target_selector || '',
                    new_element_html: codeResult?.new_element_html || '',
                    implementation_instructions: codeResult?.implementation_instructions || `Code generation failed for this variant. Please implement manually based on the description: ${variant.description}`,
                    screenshot: variantScreenshotUrl
                };
                
                variantsWithScreenshots.push(finalVariant);
                console.log(`[VARIANTS] Completed variant ${index + 1}/${response.variants.length}: ${variant.variant_label}`);
            }
        } finally {
            // Clean up the crawler
            await crawler.close();
        }

        console.log(`[VARIANTS] All variants with code and screenshots generated successfully`);
        const result = {
            variantsSchema: JSON.stringify({ variants: variantsWithScreenshots })
        };
        console.log(`[VARIANTS] Final result: ${variantsWithScreenshots.length} variants, schema length: ${result.variantsSchema.length} chars`);
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