// OpenAI LLM Service Implementation
import OpenAI from 'openai';
import type { 
  LLMService, 
  LLMResponse, 
  BrandAnalysisRequest, 
  BrandAnalysisResponse, 
  LLMOptions,
  LLMConfig 
} from './types';

export class OpenAIService implements LLMService {
  private client: OpenAI;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async analyzeBrand(request: BrandAnalysisRequest): Promise<BrandAnalysisResponse> {
    const prompt = this.buildBrandAnalysisPrompt(request);
    
    const response = await this.client.chat.completions.create({
      model: this.config.model || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert brand analyst and UX designer. Analyze the provided website content and screenshots to extract comprehensive brand insights for UX design purposes.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: this.config.temperature || 0.3,
      max_tokens: this.config.maxTokens || 2000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    try {
      return JSON.parse(content) as BrandAnalysisResponse;
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response: ${error}`);
    }
  }

  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options?.model || this.config.model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: options?.temperature || this.config.temperature || 0.7,
      max_tokens: options?.maxTokens || this.config.maxTokens || 1000,
    });

    return response.choices[0]?.message?.content || '';
  }

  private buildBrandAnalysisPrompt(request: BrandAnalysisRequest): string {
    return `
# Brand Analysis Request

## Shop Domain
${request.shopDomain}

## Home Page HTML
${request.htmlContent.homePage.substring(0, 5000)}...

## Product Pages HTML
${request.htmlContent.productPages.map((html, index) => `### Product Page ${index + 1}\n${html.substring(0, 3000)}...`).join('\n')}

## Screenshots
- Home Page: ${request.screenshots.homePage}
- Product Pages: ${request.screenshots.productPages.join(', ')}

## Analysis Requirements

Please analyze this e-commerce website and provide a comprehensive brand analysis focused on UX design. Extract:

1. **Colors** (max 6): Primary brand colors, accent colors, background colors
2. **Fonts** (max 2): Primary and secondary font families used
3. **Components**: Identify key UI components present (Hero, CTA, Trust signals, Reviews, etc.)
4. **Voice & Tone**: Analyze the copy, messaging, and communication style
5. **Design System**: Layout patterns, spacing, typography hierarchy, color scheme
6. **Brand Personality**: Adjectives that describe the brand, core values, target audience
7. **Recommendations**: Strengths and opportunities for improvement

Return your analysis as a JSON object with this exact structure:
{
  "colors": ["#color1", "#color2", ...],
  "fonts": ["font1", "font2"],
  "components": ["Hero", "CTA", "Trust", "Reviews", ...],
  "voice": {
    "tone": "description",
    "personality": "description", 
    "keyPhrases": ["phrase1", "phrase2", ...]
  },
  "designSystem": {
    "layout": "description",
    "spacing": "description",
    "typography": "description",
    "colorScheme": "description"
  },
  "brandPersonality": {
    "adjectives": ["adj1", "adj2", ...],
    "values": ["value1", "value2", ...],
    "targetAudience": "description"
  },
  "recommendations": {
    "strengths": ["strength1", "strength2", ...],
    "opportunities": ["opportunity1", "opportunity2", ...]
  }
}
`;
  }
}

// Factory function for easy instantiation
export function createOpenAIService(config: LLMConfig): OpenAIService {
  return new OpenAIService(config);
}
