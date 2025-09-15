// Agent Domain Types
import type { LLMOptions } from '@features/llm';

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: 'USER' | 'AGENT' | 'TOOL' | 'SYSTEM';
  content: {
    text?: string;
    metadata?: Record<string, unknown>;
    toolCalls?: ToolCall[];
    toolCallId?: string;
  };
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatCompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  generateChatCompletion(messages: ChatMessage[], options?: LLMOptions): Promise<ChatCompletionResponse>;
}

export interface AgentConfig {
  systemPrompt?: string;
  maxContextMessages?: number;
  enableToolCalls?: boolean;
}

export interface AgentService {
  createSession(projectId: string): Promise<{ sessionId: string }>;
  sendMessage(sessionId: string, message: string): Promise<AgentMessage>;
  getSessionMessages(sessionId: string, limit?: number): Promise<AgentMessage[]>;
  closeSession(sessionId: string): Promise<void>;
  getActiveSession(projectId: string): Promise<{ sessionId: string } | null>;
}

