// OpenAI Service - Single implementation for all LLM functionality
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type {
  LLMService,
  LLMOptions,
  LLMConfig
} from '@features/llm/types';
import type {
  LLMProvider,
  ChatMessage,
} from "@domain/agent/types";

/**
 * Extract text content from a message with content array format
 */
function extractTextContent(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('');
}

export class OpenAIService implements LLMService, LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;

  }

  // AI SDK Integration - StreamText with system prompt and tools support
  async generateStreamText(messages: ChatMessage[], systemPrompt?: string, options?: LLMOptions) {
    const model = options?.model || this.config.model || 'gpt-4o';
    const temperature = options?.temperature || this.config.temperature || 0.7;
    const maxTokens = options?.maxTokens || this.config.maxTokens || 1000;

    console.log(`[LLM] Starting AI SDK streamText with model: ${model}`);
    console.log(`[LLM] Parameters - Temperature: ${temperature}, Max Tokens: ${maxTokens}`);
    console.log(`[LLM] Input messages count: ${messages.length}`);
    console.log(`[LLM] System prompt: ${systemPrompt ? 'provided' : 'none'}`);

    // Convert messages to AI SDK format
    const aiMessages = messages.map(msg => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : extractTextContent(msg);

      return {
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
        ...(msg.tool_calls && { toolCalls: msg.tool_calls }),
        ...(msg.tool_call_id && { toolCallId: msg.tool_call_id }),
      };
    });

    // Add system prompt if provided
    if (systemPrompt) {
      aiMessages.unshift({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Use tools if provided
    const result = streamText({
      tools: options?.tools,
      model: openai(model),
      messages: aiMessages,
      temperature,
      // maxTokens,
    });

    return result;
  }
}

// Factory functions
export function createOpenAIService(config: LLMConfig): LLMService {
  return new OpenAIService(config);
}

export function createOpenAIProvider(config: LLMConfig): LLMProvider {
  return new OpenAIService(config);
}
