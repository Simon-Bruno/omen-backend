// Code Analysis Service
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export interface CodeAnalysisResult {
  websiteStructure: {
    informationArchitecture: string;
    contentDepth: string;
    navigationPattern: string;
  };
  designTokens: {
    colors: string[];
    fonts: string[];
    margins: string[];
  };
}

const codeAnalysisSchema = z.object({
  informationArchitecture: z.string(),
  contentDepth: z.string(),
  navigationPattern: z.string(),
  colors: z.array(z.string()),
  fonts: z.array(z.string()),
  margins: z.array(z.string()),
});

export class CodeAnalyzer {
  constructor() {}

  async analyzeCode(htmlContent: string[], urls: string[]): Promise<CodeAnalysisResult> {
    const prompt = this.buildCodeAnalysisPrompt(htmlContent, urls);
    
    try {
      const result = await generateObject({
        model: openai('gpt-4o'),
        schema: codeAnalysisSchema,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const data = result.object;
      return {
        websiteStructure: {
          informationArchitecture: data.informationArchitecture,
          contentDepth: data.contentDepth,
          navigationPattern: data.navigationPattern,
        },
        designTokens: {
          colors: data.colors,
          fonts: data.fonts,
          margins: data.margins,
        }
      };
    } catch (error) {
      throw new Error(`Failed to analyze code: ${error}`);
    }
  }

  private buildCodeAnalysisPrompt(htmlContent: string[], urls: string[]): string {
    const htmlSamples = htmlContent.map((html, index) => 
      `=== Page ${index + 1} (${urls[index] || 'Unknown URL'}) ===\n${html.substring(0, 2000)}...`
    ).join('\n\n');

    return `
# Website Structure & Design Analysis

Analyze this HTML code to understand the website structure and extract design tokens.

## What to analyze:

**Website Structure:**
- How is the information organized? (header, main content, sidebar, footer)
- What's the content depth? (shallow with few pages, deep with many categories)
- How does navigation work? (horizontal menu, vertical sidebar, breadcrumbs)

**Design Tokens:**
- What colors are used? (background, text, accent colors)
- What fonts are used? (font families, weights)
- What spacing patterns? (margins, padding values)

## HTML Content to Analyze:

${htmlSamples}

Extract both structural insights and design tokens from the code.
    `.trim();
  }
}
