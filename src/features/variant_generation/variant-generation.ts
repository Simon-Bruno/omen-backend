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
import { ScreenshotStorageService } from '@services/screenshot-storage';
import { DOMAnalyzerService, createDOMAnalyzer } from './dom-analyzer';
import { getAIConfig } from '@shared/ai-config';

export interface VariantGenerationService {
    generateVariants(hypothesis: Hypothesis, projectId: string): Promise<VariantGenerationResult>;
}

export interface VariantGenerationResult {
    variantsSchema: string;
}

// Factory function
export function createVariantGenerationService(
    crawler: CrawlerService,
    screenshotStorage: ScreenshotStorageService
): VariantGenerationService {
    return new VariantGenerationServiceImpl(crawler, screenshotStorage);
}

export class VariantGenerationServiceImpl implements VariantGenerationService {
    private crawlerService: CrawlerService;
    private codeGenerator: VariantCodeGenerator;
    private screenshotStorage: ScreenshotStorageService;
    private domAnalyzer: DOMAnalyzerService;
    private brandAnalysisCache: Map<string, { data: string; timestamp: number }> = new Map();
    private projectCache: Map<string, { data: any; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    constructor(crawler: CrawlerService, screenshotStorage: ScreenshotStorageService) {
        this.crawlerService = crawler;
        this.screenshotStorage = screenshotStorage;
        this.domAnalyzer = createDOMAnalyzer(crawler);
        this.codeGenerator = createVariantCodeGenerator();
    }

    private async getCachedProject(projectId: string): Promise<any> {
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

    private async getCachedBrandAnalysis(projectId: string): Promise<string> {
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

    async cleanup(): Promise<void> {
        // Close the browser to free up resources
        if (this.crawlerService && typeof this.crawlerService.close === 'function') {
            await this.crawlerService.close();
        }
    }

    async generateVariants(hypothesis: Hypothesis, projectId: string): Promise<VariantGenerationResult> {
        console.log(`[VARIANTS] Starting generation for hypothesis: ${hypothesis.hypothesis}`);
        console.log(`[VARIANTS] Using project ID: ${projectId}`);
        
        // Get project data to fetch shop domain (with caching)
        console.log(`[VARIANTS] Fetching project data for project: ${projectId}`);
        const project = await this.getCachedProject(projectId);
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

        // PARALLEL OPTIMIZATION: Run screenshot, DOM analysis, and brand analysis in parallel
        console.log(`[VARIANTS] Starting parallel operations: screenshot, DOM analysis, and brand analysis`);
        const [screenshot, injectionPoints, brandAnalysis] = await Promise.all([
            this.crawlerService.takePartialScreenshot(url, { width: 1920, height: 1080 }, true, { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }),
            this.domAnalyzer.analyzeForHypothesis(
                url, 
                hypothesis.hypothesis,
                { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
            ),
            this.getCachedBrandAnalysis(projectId)
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

        // PARALLEL OPTIMIZATION: Generate code for all variants in parallel
        console.log(`[VARIANTS] Generating code for ${response.variants.length} variants in parallel`);
        const variantsWithCode = await Promise.all(
            response.variants.map(async (variant, index) => {
                console.log(`[VARIANTS] Starting code generation for variant ${index + 1}: ${variant.variant_label}`);
                try {
                    const codeResult = await this.codeGenerator.generateCode(variant, hypothesis, brandAnalysis, toDataUrl(screenshot), injectionPoints);
                    
                    return {
                        ...variant,
                        css_code: codeResult.css_code,
                        html_code: codeResult.html_code,
                        injection_method: codeResult.injection_method,
                        target_selector: codeResult.target_selector,
                        new_element_html: codeResult.new_element_html,
                        implementation_instructions: codeResult.implementation_instructions,
                        codeResult // Store the full result for screenshot generation
                    };
                } catch (error) {
                    console.error(`[VARIANTS] Failed to generate code for variant ${variant.variant_label}:`, error);
                    // Return variant with empty code fields if generation fails
                    return {
                        ...variant,
                        css_code: '',
                        html_code: '',
                        injection_method: 'selector' as const,
                        target_selector: '',
                        new_element_html: '',
                        implementation_instructions: `Code generation failed for this variant. Please implement manually based on the description: ${variant.description}`,
                        codeResult: null
                    };
                }
            })
        );

        // PARALLEL OPTIMIZATION: Take screenshots for all variants in parallel
        console.log(`[VARIANTS] Taking screenshots for ${variantsWithCode.length} variants in parallel`);
        const variantsWithScreenshots = await Promise.all(
            variantsWithCode.map(async (variant, index) => {
                if (!variant.codeResult) {
                    return {
                        ...variant,
                        screenshot: ''
                    };
                }

                console.log(`[VARIANTS] Taking screenshot for variant ${index + 1}: ${variant.variant_label}`);
                let variantScreenshotUrl = '';
                try {
                    // Create a fresh crawler instance for each variant to avoid browser conflicts
                    const { createPlaywrightCrawler } = await import('@features/crawler');
                    const { getServiceConfig } = await import('@infra/config/services');
                    const config = getServiceConfig();
                    const freshCrawler = createPlaywrightCrawler(config.crawler);
                    
                    const variantScreenshotBase64 = await freshCrawler.takeVariantScreenshot(
                        url,
                        {
                            css_code: variant.codeResult.css_code,
                            html_code: variant.codeResult.html_code,
                            injection_method: variant.codeResult.injection_method,
                            target_selector: variant.codeResult.target_selector,
                            new_element_html: variant.codeResult.new_element_html
                        },
                        { width: 1920, height: 1080 },
                        { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain }
                    );
                    
                    // Clean up the fresh crawler
                    await freshCrawler.close();
                    
                    // Save screenshot to file and get URL
                    const filename = await this.screenshotStorage.saveScreenshot(
                        variantScreenshotBase64,
                        variant.variant_label,
                        projectId
                    );
                    variantScreenshotUrl = this.screenshotStorage.getScreenshotUrl(filename);
                    console.log(`[VARIANTS] Screenshot saved for variant ${variant.variant_label}: ${variantScreenshotUrl}`);
                } catch (screenshotError) {
                    console.error(`[VARIANTS] Failed to take screenshot for variant ${variant.variant_label}:`, screenshotError);
                    // Continue without screenshot rather than failing the entire variant
                }
                
                // Remove the temporary codeResult field and add screenshot
                const { codeResult, ...variantWithoutCodeResult } = variant;
                return {
                    ...variantWithoutCodeResult,
                    screenshot: variantScreenshotUrl
                };
            })
        );

        console.log(`[VARIANTS] All variants with code and screenshots generated successfully`);
        const result = {
            variantsSchema: JSON.stringify({ variants: variantsWithScreenshots })
        };
        console.log(`[VARIANTS] Final result: ${variantsWithScreenshots.length} variants, schema length: ${result.variantsSchema.length} chars`);
        return result;
    }

}