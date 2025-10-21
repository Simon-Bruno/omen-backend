// @ts-nocheck 
import { tool } from 'ai';
import { createHypothesesSchema } from './schemas';
import { createHypothesesGenerationService, HypothesesGenerationService } from '@features/hypotheses_generation/hypotheses-generation';
import { HypothesesGenerationResult } from '@features/hypotheses_generation/hypotheses-generation';
import { createPlaywrightCrawler } from '@features/crawler';
import { getServiceConfig } from '@infra/config/services';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { prisma } from '@infra/prisma';

class GenerateHypothesesExecutor {
    private hypothesesGenerationService: HypothesesGenerationService;
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        this.hypothesesGenerationService = createHypothesesGenerationService(crawler, prisma);
    }

    private async generateHypotheses(url: string, projectId: string, userInput?: string): Promise<HypothesesGenerationResult> {
        return await this.hypothesesGenerationService.generateHypotheses(url, projectId, userInput);
    }

    private async getUrlForPageType(pageType: string): Promise<string | null> {
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
                        projectId: this.projectId,
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
                    console.log(`[HYPOTHESES_TOOL] Found ${targetType} URL: ${screenshot.url}`);
                    return screenshot.url;
                }
            }

            console.log(`[HYPOTHESES_TOOL] No URL found for page type: ${pageType}`);
            return null;
        } catch (error) {
            console.error(`[HYPOTHESES_TOOL] Error fetching URL for page type ${pageType}:`, error);
            return null;
        }
    }

    async execute(input: { projectId?: string; url?: string; userInput?: string; pageType?: string }): Promise<HypothesesGenerationResult> {
        // Use provided URL or fallback to homepage
        let url = input.url;
        if (!url) {
            const project = await prisma.project.findUnique({
                where: { id: this.projectId },
                select: { shopDomain: true }
            });
            if (!project) {
                throw new Error(`Project ${this.projectId} not found`);
            }
            url = project.shopDomain.startsWith('http') ? project.shopDomain : `https://${project.shopDomain}`;
            console.log(`[HYPOTHESES_TOOL] No URL provided, using homepage: ${url}`);
        }
        console.log(`[HYPOTHESES_TOOL] Generating hypotheses for ${url} with project ${this.projectId}`);

        if (input.userInput) {
            console.log(`[HYPOTHESES_TOOL] User input provided: "${input.userInput}"`);
        }

        const result = await this.generateHypotheses(url, this.projectId, input.userInput);
        
        // Parse the hypotheses from the result structure
        let hypotheses = result.hypotheses;
        if (!hypotheses && result.hypothesesSchema) {
            try {
                const parsed = JSON.parse(result.hypothesesSchema);
                hypotheses = parsed.hypotheses;
                console.log(`[HYPOTHESES_TOOL] Parsed hypotheses from schema: ${hypotheses?.length || 0}`);
            } catch (error) {
                console.error(`[HYPOTHESES_TOOL] Failed to parse hypothesesSchema:`, error);
            }
        }
        
        console.log(`[HYPOTHESES_TOOL] Result structure: ${hypotheses ? hypotheses.length : 0} hypotheses, schema: ${result.hypothesesSchema ? 'Yes' : 'No'}`);
        
        console.log(`[HYPOTHESES_TOOL] Hypotheses array length:`, hypotheses?.length || 0);
        
        // Store the first hypothesis in state manager for use by other tools
        if (hypotheses && hypotheses.length > 0) {
            console.log(`[HYPOTHESES_TOOL] Storing hypothesis: "${hypotheses[0].title}"`);
            hypothesisStateManager.setCurrentHypothesis(hypotheses[0], url);
            console.log(`[HYPOTHESES_TOOL] Hypothesis stored successfully with URL: ${url}`);
        } else {
            console.log(`[HYPOTHESES_TOOL] No hypotheses to store`);
        }
        
        // Include URL in the result for conversation history fallback
        const resultWithUrl = {
            ...result,
            hypothesisUrl: url
        };
        
        return resultWithUrl;
    }
}

export function generateHypotheses(projectId: string) {
    const executor = new GenerateHypothesesExecutor(projectId);

    return tool({
        description: 'Generate hypotheses for a given project',
        inputSchema: createHypothesesSchema,
        execute: async (input) => {
            try {
                const result = await executor.execute(input);
                return result;
            } catch (error) {
                console.error(`[HYPOTHESES_TOOL] Tool execute failed:`, error);
                throw new Error(error instanceof Error ? error.message : 'Failed to fetch generate hypotheses');
            }
        },
    });
}