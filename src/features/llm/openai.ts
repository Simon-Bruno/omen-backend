// OpenAI Service - Single implementation for all LLM functionality
import OpenAI from 'openai';
import type {
  LLMService,
  BrandAnalysisRequest,
  BrandAnalysisResponse,
  LLMOptions,
  LLMConfig
} from '@features/llm/types';
import type {
  LLMProvider,
  ChatMessage,
  ChatCompletionResponse
} from "@domain/agent/types";

export class OpenAIService implements LLMService, LLMProvider {
  private client: OpenAI;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  // LLM Service methods (business features)
  async analyzeBrand(request: BrandAnalysisRequest): Promise<BrandAnalysisResponse> {
    const prompt = this.buildBrandAnalysisPrompt(request);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      return JSON.parse(content);
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

  // LLM Provider methods (for agents)
  async generateChatCompletion(messages: ChatMessage[], options?: LLMOptions): Promise<ChatCompletionResponse> {
    const model = options?.model || this.config.model || 'gpt-4o';
    const temperature = options?.temperature || this.config.temperature || 0.7;
    const maxTokens = options?.maxTokens || this.config.maxTokens || 1000;

    console.log(`[LLM] Starting chat completion with model: ${model}`);
    console.log(`[LLM] Parameters - Temperature: ${temperature}, Max Tokens: ${maxTokens}`);
    console.log(`[LLM] Input messages count: ${messages.length}`);

    // Log message details
    messages.forEach((msg, index) => {
      const contentPreview = msg.content.substring(0, 100);
      console.log(`[LLM] Message ${index + 1} (${msg.role}): "${contentPreview}${msg.content.length > 100 ? '...' : ''}"`);
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        console.log(`[LLM] Message ${index + 1} has ${msg.tool_calls.length} tool calls`);
      }
    });

    const startTime = Date.now();
    
    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: messages.map(msg => {
          if (msg.role === 'system') {
            return {
              role: 'system' as const,
              content: msg.content,
              ...(msg.name && { name: msg.name }),
            };
          }

          if (msg.role === 'user') {
            return {
              role: 'user' as const,
              content: msg.content,
              ...(msg.name && { name: msg.name }),
            };
          }

          if (msg.role === 'assistant') {
            return {
              role: 'assistant' as const,
              content: msg.content,
              ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
            };
          }

          if (msg.role === 'tool') {
            return {
              role: 'tool' as const,
              content: msg.content,
              tool_call_id: msg.tool_call_id!,
            };
          }

          // Fallback
          return {
            role: 'user' as const,
            content: msg.content,
          };
        }),
        temperature,
        max_tokens: maxTokens,
      });

      const apiTime = Date.now() - startTime;
      console.log(`[LLM] OpenAI API call completed in ${apiTime}ms`);

      const choice = response.choices[0];
      const message = choice?.message;

      if (response.usage) {
        console.log(`[LLM] Token usage - Prompt: ${response.usage.prompt_tokens}, Completion: ${response.usage.completion_tokens}, Total: ${response.usage.total_tokens}`);
        console.log(`[LLM] Cost estimate - Prompt: $${(response.usage.prompt_tokens * 0.00003).toFixed(6)}, Completion: $${(response.usage.completion_tokens * 0.00006).toFixed(6)}`);
      }

      const content = message?.content || '';
      console.log(`[LLM] Generated content length: ${content.length} characters`);
      console.log(`[LLM] Generated content preview: "${content.substring(0, 200)}${content.length > 200 ? '...' : ''}"`);

      if (message?.tool_calls && message.tool_calls.length > 0) {
        console.log(`[LLM] Generated ${message.tool_calls.length} tool calls`);
        message.tool_calls.forEach((tc, index) => {
          if (tc.type === 'function') {
            console.log(`[LLM] Tool call ${index + 1}: ${tc.function.name}(${tc.function.arguments})`);
          } else {
            console.log(`[LLM] Tool call ${index + 1}: ${tc.type} (custom tool call)`);
          }
        });
      }

      const result = {
        content,
        toolCalls: message?.tool_calls?.map(tc => {
          if (tc.type === 'function') {
            return {
              id: tc.id,
              type: tc.type as 'function',
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            };
          }
          return {
            id: tc.id,
            type: tc.type as 'function',
            function: {
              name: '',
              arguments: '',
            },
          };
        }),
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };

      console.log(`[LLM] Chat completion completed successfully`);
      return result;

    } catch (error) {
      const apiTime = Date.now() - startTime;
      console.error(`[LLM] OpenAI API call failed after ${apiTime}ms:`, error);
      throw error;
    }
  }

  private buildBrandAnalysisPrompt(request: BrandAnalysisRequest): string {
    return `
# Brand Analysis Request

## Shop Domain
${request.shopDomain}

## HTML Content
### Homepage
${request.htmlContent.homePage}

### Product Pages
${request.htmlContent.productPages.map((page: string, index: number) => `### Product Page ${index + 1}\n${page}`).join('\n')}

## Screenshots
### Homepage Screenshot
${request.screenshots.homePage}

### Product Page Screenshots
${request.screenshots.productPages.map((screenshot: string, index: number) => `### Product Page ${index + 1} Screenshot\n${screenshot}`).join('\n')}

Please analyze this e-commerce store and provide a comprehensive brand analysis in the following JSON format:

{
  "colors": ["color1", "color2", "color3", "color4", "color5", "color6"],
  "fonts": ["font1", "font2"],
  "components": ["Hero", "CTA", "Trust", "Reviews", "Navigation", "Footer"],
  "voice": {
    "tone": "professional|casual|friendly|authoritative",
    "personality": "description of brand personality",
    "keyPhrases": ["phrase1", "phrase2", "phrase3"]
  },
  "designSystem": {
    "layout": "description of layout approach",
    "spacing": "description of spacing patterns",
    "typography": "description of typography hierarchy",
    "colorScheme": "description of color usage"
  },
  "brandPersonality": {
    "adjectives": ["adjective1", "adjective2", "adjective3"],
    "values": ["value1", "value2", "value3"],
    "targetAudience": "description of target audience"
  },
  "recommendations": {
    "strengths": ["strength1", "strength2", "strength3"],
    "opportunities": ["opportunity1", "opportunity2", "opportunity3"]
  }
}

Focus on:
- Visual design elements and consistency
- Brand voice and messaging
- User experience patterns
- Target audience alignment
- Areas for improvement
- Strengths to build upon

Provide specific, actionable insights based on the provided content and screenshots.
    `.trim();
  }
}

// Factory functions
export function createOpenAIService(config: LLMConfig): LLMService {
  return new OpenAIService(config);
}

export function createOpenAIProvider(config: LLMConfig): LLMProvider {
  return new OpenAIService(config);
}
