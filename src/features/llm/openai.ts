// OpenAI Service - Single implementation for all LLM functionality
import OpenAI from 'openai';
import { JSDOM } from 'jsdom';
import type {
  LLMService,
  BrandAnalysisRequest,
  BrandAnalysisResponse,
  LLMOptions,
  LLMConfig,
  ExtractNavLinksRequest,
  ExtractNavLinksResponse
} from '@features/llm/types';
import type {
  LLMProvider,
  ChatMessage,
  ChatCompletionResponse
} from "@domain/agent/types";
import { fstat } from 'fs';
import fs from "fs";
import { encode } from 'punycode';

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
    // Ensure screenshots are proper data URLs
    const toDataUrl = (b64: string): string => {
      if (!b64) return '';
      if (b64.startsWith('data:')) return b64;
      // Default to PNG
      return `data:image/png;base64,${b64}`;
    };
    
    const splitHtml = request.pages.html.map(html => html.split("</nav>")[1].split("footer")[0]);

    var regexFinds: string[] = [];
    const regex = /(?:<(?:p|h5|h6)[^>]*>(.+)<\/(?:p|h5|h6|\/)>.*)+/g;
    let m: RegExpExecArray | null;
    splitHtml.forEach((element, index) => {
      while ((m = regex.exec(element)) !== null) {
        const result = m[1];
        regexFinds.push(result);
      }
    });
    
    regexFinds = regexFinds.filter(item => item.length > 20 && !item.includes("cart") && !item.includes("EUR"));

    const prompt = this.buildBrandAnalysisPrompt(regexFinds.join("\n"));
      try {
        const response = await this.client.responses.create({
          model: this.config.model || 'gpt-4o',
          input: [
            {
              role: 'user',
              content: [
                { type: "input_text", text: prompt },
                { type: 'input_image', image_url: toDataUrl(request.pages.screenshot[0]), detail: "auto" },
                { type: 'input_image', image_url: toDataUrl(request.pages.screenshot[1]), detail: "auto" },
                { type: 'input_image', image_url: toDataUrl(request.pages.screenshot[2]), detail: "auto" }
              ]
            }
          ],
          temperature: this.config.temperature || 0.7,
          max_output_tokens: this.config.maxTokens || 4000,
        });

        const content = response.output_text;
        if (!content) {
          throw new Error('No response content from OpenAI');
        }
        console.log(content);
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse OpenAI response: ${error}`);
      }
    
  }

  async extractNavLinks(request: ExtractNavLinksRequest): Promise<ExtractNavLinksResponse> {
    // Extract only the <body> content
    const systemText = `You return the most useful navigation URLs for getting brand information that are stripped from an e-commerce homepage.
    The pages we are looking for are the home page, the main products page and the about page.
Return strict JSON only, no markdown, matching this TypeScript type exactly:
{
  "home?": string,
  "products?": string,
  "about?": string
}

Rules:
- Use only internal links on the same domain as baseUrl.
- Normalize relative links to absolute using baseUrl.
- Choose the single best URL per category when possible.

Return ONLY valid JSON.`;

    // Try file-based large input using Responses API
    try {
      const response = await this.client.responses.create({
        model: this.config.model || 'gpt-4o-mini',
        text: {
          format: {
            "type": "json_schema",
            "name": "useful_urls",
            "strict": true,
            "schema": {
              "type": "object",
              "properties": {
                "home": {
                  "type": "string"
                },
                "products": {
                  "type": "string"
                },
                "about": {
                  "type": "string"
                }
              },
              "required": ["home", "products", "about"],
              "additionalProperties": false
            }
          }
        },
        input: [
          {
            role: 'system',
            content: [
              { type: 'input_text', text: systemText }
            ]
          },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: `Here is the list with urls: ${request.foundUrls}` },
            ]
          }
        ],
        temperature: this.config.temperature || 0.2,
        max_output_tokens: this.config.maxTokens || 1000,
      });
      console.log(response);
      var content = response.output_text;
      console.log("Filtered links response:", content)
      const parsed = JSON.parse(content || '{}');
      if (!Array.isArray(parsed.other)) parsed.other = [];
      return parsed as ExtractNavLinksResponse;
    } catch (err) {
      console.error(err);
      return {
        home: request.foundUrls[0],
        products: undefined,
        about: undefined
      };
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

  private buildBrandAnalysisPrompt(additionalInfo: string): string {
    return `
# Brand Analysis Request
Please analyze the attached images and provided context for this e-commerce store and provide a comprehensive brand analysis in the following JSON format:
Keep in mind that there might be notification popups about newsletters or cookies on the site, ignore these as much as possible except when looking at the global style of the site.
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

The provided pages, which are a Home page, Products page and About page, of which you can find screenshots attached.
Use the provided images to get a good sense of the brand colors and brand looks.
Below you will find the context regarding the quotes and motivation of this brand:

${additionalInfo}
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
