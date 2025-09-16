// LLM Service Types
import type { ChatMessage } from '@domain/agent/types';
import type { ToolSet } from 'ai';

export interface LLMService {
  generateStreamText(messages: ChatMessage[], systemPrompt?: string, options?: LLMOptions): Promise<unknown>;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  tools?: ToolSet;
  toolChoice?: 'auto' | 'none' | 'required';
  onToolCall?: (toolCall: any) => Promise<any>;
}

export interface LLMConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
