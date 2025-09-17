// Hypothesis Generation Service for Experiment Creation
import type { BrandAnalysisResult } from '@features/brand_analysis';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getAIConfig, AI_CONFIGS } from '@shared/ai-config';

export interface HypothesisGenerationRequest {
  projectId: string;
  brandAnalysis?: BrandAnalysisResult;
  homePageAnalysis?: PageAnalysis;
  productPageAnalysis?: PageAnalysis;
  focusArea?: 'conversion' | 'engagement' | 'trust' | 'navigation' | 'cta';
}

export interface PageAnalysis {
  url: string;
  screenshot: string;
  html: string;
  title?: string;
  description?: string;
  analysis?: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    keyElements: string[];
  };
}

export interface Hypothesis {
  id: string;
  title: string;
  description: string;
  hypothesis: string;
  expectedOutcome: string;
  priority: 'high' | 'medium' | 'low';
  focusArea: string;
  suggestedExperiments: SuggestedExperiment[];
  confidence: number; // 0-1
}

export interface SuggestedExperiment {
  name: string;
  description: string;
  pageUrl: string;
  elementSelector: string;
  changeType: 'text' | 'color' | 'layout' | 'cta' | 'image' | 'form';
  changeDescription: string;
  expectedImpact: string;
}

export interface HypothesisGenerationResult {
  success: boolean;
  hypotheses?: Hypothesis[];
  error?: string;
  analysis?: {
    brandInsights: string[];
    pageInsights: string[];
    opportunities: string[];
  };
}

const pageAnalysisSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()),
  keyElements: z.array(z.string()),
});

export interface HypothesisGeneratorService {
  generateHypotheses(request: HypothesisGenerationRequest): Promise<HypothesisGenerationResult>;
  analyzePage(pageData: PageAnalysis): Promise<PageAnalysis>;
}

export class HypothesisGeneratorServiceImpl implements HypothesisGeneratorService {
  private aiConfig: ReturnType<typeof getAIConfig>;

  constructor(
    private crawlerService: unknown // Will be CrawlerService type
  ) {
    this.aiConfig = getAIConfig();
  }

  async generateHypotheses(request: HypothesisGenerationRequest): Promise<HypothesisGenerationResult> {
    try {
      console.log(`[HYPOTHESIS] Generating hypotheses for project ${request.projectId}`);

      // Step 1: Analyze pages if not provided
      let homePageAnalysis = request.homePageAnalysis;
      let productPageAnalysis = request.productPageAnalysis;

      if (!homePageAnalysis || !productPageAnalysis) {
        console.log(`[HYPOTHESIS] Analyzing pages for project ${request.projectId}`);
        const pageAnalyses = await this.analyzeProjectPages(request.projectId);
        homePageAnalysis = pageAnalyses.homePage;
        productPageAnalysis = pageAnalyses.productPage;
      }

      // Step 2: Generate hypotheses using LLM
      const hypotheses = await this.generateHypothesesWithLLM({
        brandAnalysis: request.brandAnalysis,
        homePageAnalysis,
        productPageAnalysis,
        focusArea: request.focusArea,
      });

      // Step 3: Analyze insights
      const analysis = this.extractInsights(request.brandAnalysis, homePageAnalysis, productPageAnalysis);

      console.log(`[HYPOTHESIS] Generated ${hypotheses.length} hypotheses for project ${request.projectId}`);

      return {
        success: true,
        hypotheses,
        analysis,
      };
    } catch (error) {
      console.error(`[HYPOTHESIS] Failed to generate hypotheses for project ${request.projectId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate hypotheses',
      };
    }
  }

  async analyzePage(pageData: PageAnalysis): Promise<PageAnalysis> {
    try {
      const analysisPrompt = this.buildPageAnalysisPrompt(pageData);
      
      const result = await generateObject({
        model: openai(this.aiConfig.model),
        schema: pageAnalysisSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: analysisPrompt },
              { type: 'image', image: pageData.screenshot }
            ]
          }
        ],
        ...AI_CONFIGS.ANALYSIS
      });

      return {
        ...pageData,
        analysis: result.object,
      };
    } catch (error) {
      console.error(`[HYPOTHESIS] Failed to analyze page ${pageData.url}:`, error);
      return pageData; // Return original data if analysis fails
    }
  }

  private async analyzeProjectPages(_projectId: string): Promise<{
    homePage: PageAnalysis;
    productPage: PageAnalysis;
  }> {
    // TODO: Get project details and crawl pages
    // This will be implemented when we integrate with the crawler service
    throw new Error('Page analysis not yet implemented');
  }

  private async generateHypothesesWithLLM(_data: {
    brandAnalysis?: BrandAnalysisResult;
    homePageAnalysis?: PageAnalysis;
    productPageAnalysis?: PageAnalysis;
    focusArea?: string;
  }): Promise<Hypothesis[]> {
    // TODO: Use LLM service to generate hypotheses
    // const prompt = this.buildHypothesisGenerationPrompt(data);
    
    // For now, return mock data
    return this.getMockHypotheses();
  }

  private buildPageAnalysisPrompt(pageData: PageAnalysis): string {
    return `
# Page Analysis Request

## Page URL: ${pageData.url}
## Page Title: ${pageData.title || 'N/A'}
## Page Description: ${pageData.description || 'N/A'}

## HTML Content:
${pageData.html.substring(0, 5000)}...

## Screenshot:
${pageData.screenshot}

Please analyze this e-commerce page and provide insights in the following JSON format:

{
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "opportunities": ["opportunity1", "opportunity2", "opportunity3"],
  "keyElements": ["element1", "element2", "element3"]
}

Focus on:
- Conversion optimization opportunities
- User experience issues
- Visual design consistency
- Call-to-action effectiveness
- Trust signals
- Navigation clarity
- Mobile responsiveness indicators
    `.trim();
  }

  private buildHypothesisGenerationPrompt(data: {
    brandAnalysis?: BrandAnalysisResult;
    homePageAnalysis?: PageAnalysis;
    productPageAnalysis?: PageAnalysis;
    focusArea?: string;
  }): string {
    return `
# Hypothesis Generation Request

## Brand Analysis:
${data.brandAnalysis ? JSON.stringify(data.brandAnalysis, null, 2) : 'Not available'}

## Home Page Analysis:
${data.homePageAnalysis ? JSON.stringify(data.homePageAnalysis.analysis, null, 2) : 'Not available'}

## Product Page Analysis:
${data.productPageAnalysis ? JSON.stringify(data.productPageAnalysis.analysis, null, 2) : 'Not available'}

## Focus Area: ${data.focusArea || 'general'}

Generate 3-5 specific, testable hypotheses for A/B testing based on the analysis above.

Return in JSON format:
[
  {
    "id": "hyp_1",
    "title": "Clear hypothesis title",
    "description": "Detailed description of what to test",
    "hypothesis": "If we [change X], then [outcome Y] will happen because [reason Z]",
    "expectedOutcome": "Expected result and why",
    "priority": "high|medium|low",
    "focusArea": "conversion|engagement|trust|navigation|cta",
    "suggestedExperiments": [
      {
        "name": "Experiment name",
        "description": "What to test",
        "pageUrl": "/",
        "elementSelector": ".cta-button",
        "changeType": "text|color|layout|cta|image|form",
        "changeDescription": "Specific change to make",
        "expectedImpact": "Expected impact on metrics"
      }
    ],
    "confidence": 0.8
  }
]
    `.trim();
  }

  private extractInsights(
    _brandAnalysis?: BrandAnalysisResult,
    _homePageAnalysis?: PageAnalysis,
    _productPageAnalysis?: PageAnalysis
  ): {
    brandInsights: string[];
    pageInsights: string[];
    opportunities: string[];
  } {
    // TODO: Extract insights from analysis data
    return {
      brandInsights: ['Brand analysis insights will be extracted here'],
      pageInsights: ['Page analysis insights will be extracted here'],
      opportunities: ['Key opportunities will be identified here'],
    };
  }

  private getMockHypotheses(): Hypothesis[] {
    return [
      {
        id: 'hyp_1',
        title: 'Improve CTA Button Visibility',
        description: 'Test making the main CTA button more prominent to increase conversions',
        hypothesis: 'If we make the CTA button larger and use a contrasting color, then click-through rates will increase because it will be more visually prominent and attention-grabbing',
        expectedOutcome: 'Increase CTA click-through rate by 15-25%',
        priority: 'high',
        focusArea: 'cta',
        suggestedExperiments: [
          {
            name: 'CTA Button Size & Color Test',
            description: 'Test larger, more prominent CTA button',
            pageUrl: '/',
            elementSelector: '.cta-button',
            changeType: 'cta',
            changeDescription: 'Increase button size by 20% and change color to high-contrast orange',
            expectedImpact: 'Higher visibility and click-through rates',
          },
        ],
        confidence: 0.8,
      },
      {
        id: 'hyp_2',
        title: 'Add Social Proof to Product Pages',
        description: 'Test adding customer reviews and testimonials to product pages',
        hypothesis: 'If we add social proof elements like customer reviews and ratings, then conversion rates will increase because it builds trust and reduces purchase anxiety',
        expectedOutcome: 'Increase product page conversion rate by 10-20%',
        priority: 'medium',
        focusArea: 'trust',
        suggestedExperiments: [
          {
            name: 'Product Page Social Proof Test',
            description: 'Add customer reviews section to product pages',
            pageUrl: '/products',
            elementSelector: '.product-info',
            changeType: 'layout',
            changeDescription: 'Add customer reviews section above product description',
            expectedImpact: 'Increased trust and conversion rates',
          },
        ],
        confidence: 0.7,
      },
    ];
  }
}

export function createHypothesisGeneratorService(
  crawlerService: unknown
): HypothesisGeneratorService {
  return new HypothesisGeneratorServiceImpl(crawlerService);
}
