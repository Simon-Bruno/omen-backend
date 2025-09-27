// Language Analysis Service
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { getAIConfig } from '@shared/ai-config';

export interface LanguageAnalysisResult {
  voice: {
    tones: string[];
    keyPhrases: string[];
  };
  brandPersonality: {
    adjectives: string[];
    values: string[];
    targetAudience: string;
  };
  valueProposition: {
    primaryMessage: string;
    supportingBenefits: string[];
    differentiators: string[];
    proofElements: string[];
  };
  messaging: {
    headlines: string[];
    ctas: string[];
    contentThemes: string[];
    trustSignals: string[];
  };
}

const languageAnalysisSchema = z.object({
  tones: z.array(z.string()),
  keyPhrases: z.array(z.string()),
  adjectives: z.array(z.string()),
  values: z.array(z.string()),
  targetAudience: z.string(),
  primaryMessage: z.string(),
  supportingBenefits: z.array(z.string()),
  differentiators: z.array(z.string()),
  proofElements: z.array(z.string()),
  headlines: z.array(z.string()),
  ctas: z.array(z.string()),
  contentThemes: z.array(z.string()),
  trustSignals: z.array(z.string()),
});

export class LanguageAnalyzer {
  constructor() {}

  async analyzeLanguage(htmlContent: string[]): Promise<LanguageAnalysisResult> {
    // Extract text content from HTML
    const textContent = this.extractTextContent(htmlContent);
    
    const prompt = this.buildLanguageAnalysisPrompt(textContent);
    
    try {
      const aiConfig = getAIConfig();
      const result = await generateObject({
        model: google(aiConfig.model),
        schema: languageAnalysisSchema,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const data = result.object;
      return {
        voice: {
          tones: data.tones,
          keyPhrases: data.keyPhrases,
        },
        brandPersonality: {
          adjectives: data.adjectives,
          values: data.values,
          targetAudience: data.targetAudience,
        },
        valueProposition: {
          primaryMessage: data.primaryMessage,
          supportingBenefits: data.supportingBenefits,
          differentiators: data.differentiators,
          proofElements: data.proofElements,
        },
        messaging: {
          headlines: data.headlines,
          ctas: data.ctas,
          contentThemes: data.contentThemes,
          trustSignals: data.trustSignals,
        }
      };
    } catch (error) {
      throw new Error(`Failed to analyze language: ${error}`);
    }
  }

  private extractTextContent(htmlContent: string[]): string {
    const splitHtml = htmlContent.map(html => html.split("</nav>")[1]?.split("footer")[0] || html);

    let regexFinds: string[] = [];
    const regex = /(?:<(?:p|h1|h2|h3|h4|h5|h6|span|div|a|button)[^>]*>(.+)<\/(?:p|h1|h2|h3|h4|h5|h6|span|div|a|button)>.*)+/g;
    let m: RegExpExecArray | null;
    
    splitHtml.forEach((element) => {
      while ((m = regex.exec(element)) !== null) {
        const result = m[1];
        // Clean up HTML entities and extra whitespace
        const cleanText = result
          .replace(/&[a-zA-Z0-9#]+;/g, ' ') // Remove HTML entities
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (cleanText.length > 10) {
          regexFinds.push(cleanText);
        }
      }
    });

    // Filter out common e-commerce noise
    return regexFinds
      .filter(item => 
        item.length > 20 && 
        !item.toLowerCase().includes("cart") && 
        !item.toLowerCase().includes("eur") &&
        !item.toLowerCase().includes("cookie") &&
        !item.toLowerCase().includes("newsletter") &&
        !item.toLowerCase().includes("subscribe")
      )
      .join("\n");
  }

  private buildLanguageAnalysisPrompt(textContent: string): string {
    return `
# Brand Language Analysis

Please analyze the provided text content from this e-commerce store and focus on the language, messaging, and brand voice aspects.

## Analysis Focus Areas:

**Voice & Tone:**
- Identify the brand's tone of voice (professional, casual, friendly, authoritative, etc.)
- Extract key phrases and recurring language patterns
- Analyze the overall personality conveyed through language

**Brand Personality:**
- Determine brand adjectives based on language choices
- Identify core values expressed through messaging
- Determine target audience based on language and messaging cues

**Value Proposition Analysis:**
- Identify the primary brand message and value proposition
- Extract supporting benefits mentioned in the content
- Find differentiators and unique selling points
- Identify proof elements and trust signals

**Messaging Patterns:**
- Extract headlines and their patterns
- Analyze call-to-action language and patterns
- Identify recurring content themes
- Find trust signals and credibility indicators

## Text Content to Analyze:

${textContent}

Provide specific, actionable insights based on the language and messaging patterns. Focus on identifying clear voice characteristics and messaging strategies.
    `.trim();
  }
}
