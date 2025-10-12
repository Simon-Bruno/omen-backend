// @ts-nocheck
// Variant Generation Service
import { google } from '@ai-sdk/google';
import { ai } from '@infra/config/langsmith';
import { CrawlerService } from '@features/crawler';
import { ProjectDAL } from '@infra/dal';
import { buildVariantGenerationPrompt, buildButtonVariantGenerationPrompt } from './prompts';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { basicVariantsResponseSchema } from './types';
import { createVariantCodeGenerator, VariantCodeGenerator } from './code-generator';
import { DOMAnalyzerService, createDOMAnalyzer } from './dom-analyzer';
import { DesignSystemExtractor } from './design-system-extractor';
import { getAIConfig, getVariantGenerationAIConfig } from '@shared/ai-config';
import type { PrismaClient } from '@prisma/client';
import { ScreenshotStorageService } from '@services/screenshot-storage';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';
// Removed design system complexity

export interface VariantGenerationService {
    generateVariants(hypothesis: Hypothesis, projectId: string, precomputedInjectionPoints?: any[]): Promise<{ variants: any[], injectionPoints: any[], screenshot: string, brandAnalysis: string, designSystem: any, htmlContent?: string }>;
    getCachedProject(projectId: string): Promise<any>;
    getCachedBrandAnalysis(projectId: string): Promise<string | null>;
    getPageType(url: string): 'home' | 'pdp' | 'about' | 'other';
    getAIConfig(): any;
    buildVariantGenerationPrompt(hypothesis: Hypothesis): string;
    basicVariantsResponseSchema: any;
    crawlerService: any;
    domAnalyzer: any;
    codeGenerator: any;
    extractDesignSystem(url: string, screenshot: string, htmlContent?: string): Promise<any>;
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
    private brandAnalysisCache: Map<string, { data: string; timestamp: number }> = new Map();
    private projectCache: Map<string, { data: any; timestamp: number }> = new Map();
    private designSystemCache: Map<string, { data: any; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes


    constructor(crawler: CrawlerService, screenshotStorage: ScreenshotStorageService) {
        this.crawlerService = crawler;
        this.screenshotStorage = screenshotStorage;
        this.domAnalyzer = createDOMAnalyzer(crawler);
        this.designSystemExtractor = new DesignSystemExtractor();
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

    private async _getCachedDesignSystem(projectId: string): Promise<any> {
        // Get design system from database instead of in-memory cache
        return await ProjectDAL.getProjectDesignSystem(projectId);
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



    async generateVariants(hypothesis: Hypothesis, projectId: string, precomputedInjectionPoints?: any[]): Promise<{ variants: any[], injectionPoints: any[], screenshot: string, brandAnalysis: string, designSystem: any, htmlContent?: string }> {
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
                    htmlContent
                );
                console.log(`[VARIANTS] Screenshot and HTML saved with ID: ${screenshotId}`);
            }
        }

        // Extract all shared data once: brand analysis, design system, injection points
        console.log(`[VARIANTS] Starting parallel operations: brand analysis, design system extraction${precomputedInjectionPoints ? '' : ', DOM analysis'}`);
        const [brandAnalysis, cachedDesignSystem] = await Promise.all([
            this._getCachedBrandAnalysis(projectId),
            this._getCachedDesignSystem(projectId)
        ]);

        // Use precomputed injection points if available, otherwise run DOM analysis
        let injectionPoints: any[];
        if (precomputedInjectionPoints && precomputedInjectionPoints.length > 0) {
            console.log(`[VARIANTS] Using precomputed injection points: ${precomputedInjectionPoints.length} points`);
            injectionPoints = precomputedInjectionPoints;
        } else {
            console.log(`[VARIANTS] Using DOM analyzer to find injection points for hypothesis`);
            injectionPoints = await this.domAnalyzer.analyzeForHypothesisWithHtml(
                project.url,
                hypothesis.description,
                projectId,
                htmlContent,
                { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
            );
        }

        // Use cached design system from database
        let designSystem = cachedDesignSystem;
        if (!designSystem) {
            console.log(`[VARIANTS] No cached design system found for project: ${projectId}`);
            console.log(`[VARIANTS] Design system should be extracted separately via brand analysis workflow`);
            // Use a fallback design system that matches the exact schema structure
            designSystem = {
                colors: {
                    primary: '#000000',
                    primary_hover: '#333333',
                    secondary: '#666666',
                    text: '#000000',
                    text_light: '#666666',
                    background: '#ffffff',
                    border: '#cccccc'
                },
                typography: {
                    font_family: 'Arial, sans-serif',
                    font_size_base: '16px',
                    font_size_large: '18px',
                    font_weight_normal: '400',
                    font_weight_bold: '600',
                    line_height: '1.5'
                },
                spacing: {
                    padding_small: '8px',
                    padding_medium: '16px',
                    padding_large: '24px',
                    margin_small: '8px',
                    margin_medium: '16px',
                    margin_large: '24px'
                },
                borders: {
                    radius_small: '4px',
                    radius_medium: '8px',
                    radius_large: '12px',
                    width: '1px'
                },
                shadows: {
                    small: '0 1px 3px rgba(0,0,0,0.1)',
                    medium: '0 4px 6px rgba(0,0,0,0.1)',
                    large: '0 10px 15px rgba(0,0,0,0.1)'
                },
                effects: {
                    transition: 'all 0.2s ease',
                    hover_transform: 'translateY(-2px)',
                    opacity_hover: '0.8'
                }
            };
            console.log(`[VARIANTS] Using fallback design system`);
        }

        console.log(`[VARIANTS] Shared data extraction completed:`);
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
        const prompt = buildVariantGenerationPrompt(hypothesis);

        console.log(`[VARIANTS] Using general prompt for variant generation`);

        const object = await ai.generateObject({
            model: google(aiConfig.model, {
                apiKey: aiConfig.apiKey,
            }),
            temperature: 1.2, // Higher temperature for more diverse responses
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

        // Return variant ideas + shared data for code generation jobs
        // This allows the caller to create separate jobs for each variant
        return {
            variants: response.variants,
            injectionPoints,
            screenshot,
            brandAnalysis,
            designSystem,
            htmlContent: htmlContent || undefined
        };
    }

    getPageType(url: string): 'home' | 'pdp' | 'about' | 'other' {
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

    async extractDesignSystem(url: string, screenshot: string, htmlContent?: string): Promise<any> {
        try {
            // Try Firecrawl first for better results
            return await this.designSystemExtractor.extractDesignSystemWithFirecrawl(url);
        } catch (error) {
            console.log(`[DESIGN_SYSTEM] Firecrawl extraction failed, falling back to screenshot analysis:`, error);
            // Fallback to screenshot analysis
            return await this.designSystemExtractor.extractDesignSystem(screenshot, htmlContent);
        }
    }
}