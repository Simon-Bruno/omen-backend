// Variant Generation Service
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { CrawlerService } from '@features/crawler';
import { ProjectDAL } from '@infra/dal';
import { buildVariantGenerationPrompt } from './prompts';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { basicVariantsResponseSchema } from './types';
import { createVariantCodeGenerator, VariantCodeGenerator } from './code-generator';

export interface VariantGenerationService {
    generateVariants(hypothesis: Hypothesis): Promise<VariantGenerationResult>;
}

export interface VariantGenerationResult {
    variantsSchema: string;
}

// Factory function
export function createVariantGenerationService(
    crawler: CrawlerService
): VariantGenerationService {
    return new VariantGenerationServiceImpl(crawler);
}

export class VariantGenerationServiceImpl implements VariantGenerationService {
    private crawlerService: CrawlerService;
    private codeGenerator: VariantCodeGenerator;
    
    constructor(crawler: CrawlerService) {
        this.crawlerService = crawler;
        this.codeGenerator = createVariantCodeGenerator();
    }

    async generateVariants(hypothesis: Hypothesis): Promise<VariantGenerationResult> {
        console.log(`[VARIANTS] Starting generation for hypothesis: ${hypothesis.hypothesis}`);
        
        // Use hardcoded project ID like hypothesis generation
        const projectId = 'cmfr3xr1n0004pe2fob8jas4l';
        
        // Get project data to fetch shop domain
        console.log(`[VARIANTS] Fetching project data for project: ${projectId}`);
        const project = await ProjectDAL.getProjectById(projectId);
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

        console.log(`[VARIANTS] Taking screenshot for ${url}`);
        const screenshot = await this.crawlerService.takePartialScreenshot(url, { width: 1920, height: 1080 }, true, { type: 'shopify_password', password: 'reitri', shopDomain: project.shopDomain });
        console.log(`[VARIANTS] Screenshot taken, length: ${screenshot.length}`);

        console.log(`[VARIANTS] Fetching brand analysis for project: ${projectId}`);
        const brandAnalysis = await ProjectDAL.getProjectBrandAnalysis(projectId);
        console.log(`[VARIANTS] Brand analysis result:`, brandAnalysis ? `length: ${brandAnalysis.length}` : 'null');
        
        if (!brandAnalysis) {
            console.warn(`[VARIANTS] No brand analysis found for project: ${projectId}`);
            throw new Error(`No brand analysis available for project ${projectId}. Please run brand analysis first.`);
        }

        console.log(`[VARIANTS] Generating AI response with GPT-4o`);
        const object = await generateObject({
            model: openai('gpt-4o'),
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
        console.log(`[VARIANTS] AI response generated:`, JSON.stringify(response, null, 2));

        // Generate code for each variant
        console.log(`[VARIANTS] Generating code for ${response.variants.length} variants`);
        const variantsWithCode = await Promise.all(
            response.variants.map(async (variant, index) => {
                console.log(`[VARIANTS] Generating code for variant ${index + 1}: ${variant.variant_label}`);
                try {
                    const codeResult = await this.codeGenerator.generateCode(variant, hypothesis, brandAnalysis, toDataUrl(screenshot));
                    return {
                        ...variant,
                        css_code: codeResult.css_code,
                        html_code: codeResult.html_code,
                        injection_method: codeResult.injection_method,
                        target_selector: codeResult.target_selector,
                        new_element_html: codeResult.new_element_html,
                        implementation_instructions: codeResult.implementation_instructions
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
                        implementation_instructions: `Code generation failed for this variant. Please implement manually based on the description: ${variant.description}`
                    };
                }
            })
        );

        console.log(`[VARIANTS] All variants with code generated successfully`);
        return {
            variantsSchema: JSON.stringify({ variants: variantsWithCode })
        };
    }

}