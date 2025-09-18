import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export interface UrlSelectionResult {
    urlScheme: string
}

const urlSelectionSchema = z.object({
    home: z.string(),
    pdp: z.string(),
    about: z.string()
});

export class UrlSelector {
    constructor() { }
    
    async selectUrls(urls: string[]): Promise<UrlSelectionResult> {
        const systemText = `
        You are a professional brand analyst.
        For getting the clear picture of the brand, image and feeling of an e-commerce store we need you to analyze a collection of url's which we can then further analyze.
        You return the most useful navigation URLs for getting brand information that are stripped from an e-commerce homepage.
        From this collection you return the home page, one specific product to analyze the PDP and the about page.
        If any of the pages can't be found, return '' instead of making something up.

Rules:
- Use only internal links on the same domain as baseUrl.
- Normalize relative links to absolute using baseUrl.
- Choose the single best URL per category when possible.

Return ONLY valid JSON.`;

        // Try file-based large input using Responses API
        try {
            const result = await generateObject({
                model: openai('gpt-4o'),
                schema: urlSelectionSchema,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });

            const data = result.object;
            return {
                urlScheme: data
            };
        } catch (error) {
            throw new Error(`Failed to get urls: ${error}`);

        }
    }
}