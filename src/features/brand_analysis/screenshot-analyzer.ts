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

    // Validate screenshots before processing
    const validScreenshots = screenshots.filter(screenshot => {
      if (!screenshot || screenshot.trim() === '') {
        console.warn('[SCREENSHOT_ANALYZER] Skipping empty screenshot');
        return false;
      }
      
      // Check if it's a valid base64 string
      try {
        const base64Data = screenshot.startsWith('data:') 
          ? screenshot.split(',')[1] 
          : screenshot;
        
        // Basic base64 validation
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
          console.warn('[SCREENSHOT_ANALYZER] Skipping invalid base64 screenshot');
          return false;
        }
        
        // Check minimum length (very small images are likely corrupted)
        if (base64Data.length < 100) {
          console.warn('[SCREENSHOT_ANALYZER] Skipping screenshot that appears too small/corrupted');
          return false;
        }
        
        return true;
      } catch (error) {
        console.warn('[SCREENSHOT_ANALYZER] Error validating screenshot:', error);
        return false;
      }
    });

    if (validScreenshots.length === 0) {
      throw new Error('No valid screenshots available for analysis. All screenshots appear to be empty or corrupted.');
    }

    console.log(`[SCREENSHOT_ANALYZER] Processing ${validScreenshots.length} valid screenshots out of ${screenshots.length} total`);

    const prompt = this.buildScreenshotAnalysisPrompt();
    
    try {
      const aiConfig = getAIConfig();
      
      // Debug logging
      console.log('[SCREENSHOT_ANALYZER] AI Config:', {
        model: aiConfig.model,
        apiKeyLength: aiConfig.apiKey ? aiConfig.apiKey.length : 0,
        apiKeyPrefix: aiConfig.apiKey ? aiConfig.apiKey.substring(0, 10) + '...' : 'undefined',
        hasApiKey: !!aiConfig.apiKey
      });
      
      // Validate AI config
      if (!aiConfig.apiKey) {
        console.error('[SCREENSHOT_ANALYZER] Google API key is not configured. Available env vars:', {
          GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? 'set' : 'not set',
          GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'set' : 'not set'
        });
        throw new Error('Google API key is not configured');
      }
      
      if (!aiConfig.model) {
        throw new Error('Google model is not configured');
      }

      // Set the environment variable for Google SDK if not already set
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && aiConfig.apiKey) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = aiConfig.apiKey;
        console.log('[SCREENSHOT_ANALYZER] Set GOOGLE_GENERATIVE_AI_API_KEY environment variable');
      }

      const result = await generateObject({
        model: google(aiConfig.model),
        schema: screenshotAnalysisSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...validScreenshots.map(screenshot => ({ 
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
      console.error('[SCREENSHOT_ANALYZER] Analysis failed:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('Unable to process input image')) {
          throw new Error(`Failed to analyze screenshots: The AI service cannot process the provided images. This may be due to corrupted screenshot data or unsupported image format. Original error: ${error.message}`);
        } else if (error.message.includes('API key')) {
          throw new Error(`Failed to analyze screenshots: Google API configuration error. Please check your API key. Original error: ${error.message}`);
        } else if (error.message.includes('quota') || error.message.includes('limit')) {
          throw new Error(`Failed to analyze screenshots: API quota exceeded or rate limited. Please try again later. Original error: ${error.message}`);
        }
      }
      
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
