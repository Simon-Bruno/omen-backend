// Screenshot Analysis Service
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { getAIConfig } from '@shared/ai-config';

export interface ScreenshotAnalysisResult {
  visualStyle: {
    overallAesthetic: string;
    colorPalette: string[];
    typography: string;
    imagery: string;
  };
  brandElements: {
    logo: string;
    keyComponents: string[];
    layout: string;
  };
  brandPersonality: {
    adjectives: string[];
    targetAudience: string;
  };
}

const screenshotAnalysisSchema = z.object({
  overallAesthetic: z.string(),
  colorPalette: z.array(z.string()),
  typography: z.string(),
  imagery: z.string(),
  logo: z.string(),
  keyComponents: z.array(z.string()),
  layout: z.string(),
  adjectives: z.array(z.string()),
  targetAudience: z.string(),
});

export class ScreenshotAnalyzer {
  constructor() {}

  async analyzeScreenshots(screenshots: string[]): Promise<ScreenshotAnalysisResult> {
    const toDataUrl = (b64: string): string => {
      if (!b64) return '';
      if (b64.startsWith('data:')) return b64;
      return `data:image/png;base64,${b64}`;
    };

    const prompt = this.buildScreenshotAnalysisPrompt();
    
    try {
      const aiConfig = getAIConfig();
      const result = await generateObject({
        model: google(aiConfig.model, {
          apiKey: aiConfig.apiKey,
        }),
        schema: screenshotAnalysisSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...screenshots.map(screenshot => ({ 
                type: 'image' as const, 
                image: toDataUrl(screenshot) 
              }))
            ]
          }
        ]
      });

      const data = result.object;
      return {
        visualStyle: {
          overallAesthetic: data.overallAesthetic,
          colorPalette: data.colorPalette,
          typography: data.typography,
          imagery: data.imagery,
        },
        brandElements: {
          logo: data.logo,
          keyComponents: data.keyComponents,
          layout: data.layout,
        },
        brandPersonality: {
          adjectives: data.adjectives,
          targetAudience: data.targetAudience,
        }
      };
    } catch (error) {
      throw new Error(`Failed to analyze screenshots: ${error}`);
    }
  }

  private buildScreenshotAnalysisPrompt(): string {
    return `
# Visual Brand Analysis

Look at these screenshots and tell me about the brand's visual identity. Focus on what makes this brand unique visually.

## What to analyze:

**Visual Style:**
- What does the overall look and feel say about this brand?
- What are the main colors used?
- What kind of fonts/typography do you see?
- What style of images/photos are used?

**Key Brand Elements:**
- Describe the logo and branding
- What are the main visual components (headers, buttons, etc.)?
- How is the page laid out?

**Brand Personality:**
- What adjectives describe this brand's visual personality?
- Who do you think this brand is targeting based on the visuals?

Ignore any popup notifications about cookies or newsletters - focus on the main brand elements.
    `.trim();
  }
}
