// @ts-nocheck
// Variant Generation Service
import { google } from '@ai-sdk/google';
import { ai } from '@infra/config/langsmith';
import { CrawlerService } from '@features/crawler';
import { ProjectDAL } from '@infra/dal';
import { buildVariantGenerationPrompt } from './prompts';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { basicVariantsResponseSchema } from './types';
import { createVariantCodeGenerator, VariantCodeGenerator } from './code-generator';
import { DOMAnalyzerService, createDOMAnalyzer } from './dom-analyzer';
import { getAIConfig, getVariantGenerationAIConfig } from '@shared/ai-config';
import type { PrismaClient } from '@prisma/client';
import { ScreenshotStorageService } from '@services/screenshot-storage';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

export interface VariantGenerationService {
    generateVariants(hypothesis: Hypothesis, projectId: string, precomputedInjectionPoints?: any[]): Promise<{ variants: any[], injectionPoints: any[], screenshot: string, brandAnalysis: string, htmlContent?: string }>;
    getCachedProject(projectId: string): Promise<any>;
    getCachedBrandAnalysis(projectId: string): Promise<string | null>;
    getPageType(url: string): 'home' | 'pdp' | 'about' | 'other';
    getAIConfig(): any;
    buildVariantGenerationPrompt(hypothesis: Hypothesis): string;
    basicVariantsResponseSchema: any;
    crawlerService: any;
    domAnalyzer: any;
    codeGenerator: any;
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
    // REMOVED: In-memory caches causing memory issues on 512MB dynos
    // TODO: Implement Redis caching for production
    // private brandAnalysisCache: Map<string, { data: string; timestamp: number }> = new Map();
    // private projectCache: Map<string, { data: any; timestamp: number }> = new Map();
    // private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes


    constructor(crawler: CrawlerService, screenshotStorage: ScreenshotStorageService) {
        this.crawlerService = crawler;
        this.screenshotStorage = screenshotStorage;
        this.domAnalyzer = createDOMAnalyzer(crawler);
        this.codeGenerator = createVariantCodeGenerator();
    }

    private async _getCachedProject(projectId: string): Promise<any> {
        // Direct DB fetch - caching removed to save memory
        // TODO: Add Redis caching when available
        console.log(`[VARIANTS] Fetching project data for ${projectId}`);
        const project = await ProjectDAL.getProjectById(projectId);
        return project;
    }

    private async _getCachedBrandAnalysis(projectId: string): Promise<string> {
        // Direct DB fetch - caching removed to save memory
        // TODO: Add Redis caching when available
        console.log(`[VARIANTS] Fetching brand analysis for ${projectId}`);
        const brandAnalysis = await ProjectDAL.getProjectBrandAnalysis(projectId);
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



    async generateVariants(hypothesis: Hypothesis, projectId: string, precomputedInjectionPoints?: any[]): Promise<{ variants: any[], injectionPoints: any[], screenshot: string, brandAnalysis: string, htmlContent?: string }> {
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

        // Extract all shared data once: brand analysis, injection points
        console.log(`[VARIANTS] Starting parallel operations: brand analysis,${precomputedInjectionPoints ? '' : ', DOM analysis'}`);
        const [brandAnalysis] = await Promise.all([
            this._getCachedBrandAnalysis(projectId),
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

        console.log(`[VARIANTS] Shared data extraction completed:`);
        console.log(`[VARIANTS] - Screenshot length: ${screenshot.length}`);
        console.log(`[VARIANTS] - Injection points found: ${injectionPoints.length}`);
        console.log(`[VARIANTS] - Brand analysis: ${brandAnalysis ? `length: ${brandAnalysis.length} chars` : 'null'}`);

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

        // Use brand analysis prompt
        const prompt = buildVariantGenerationPrompt(hypothesis);

        console.log(`[VARIANTS] Using brand analysis prompt for variant generation`);

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
}