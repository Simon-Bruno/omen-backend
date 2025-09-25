// Agent Domain Types

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

export interface ContentBlock {
  type: 'text' | 'tool-call' | 'tool-result' | 'image';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  image?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
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


export interface AgentConfig {
  systemPrompt?: string;
  maxContextMessages?: number;
  enableToolCalls?: boolean;
  enableWelcomeFlow?: boolean;
}


export interface ProjectInfo {
  id: string;
  shopDomain: string;
  shopName?: string;
  shopEmail?: string;
  shopPlan?: string;
  shopCurrency?: string;
  shopCountry?: string;
  experimentsCount: number;
  activeExperimentsCount: number;
  lastDiagnosticsRun?: Date;
}

export interface AgentService {
  createSession(projectId: string): Promise<{ sessionId: string }>;
  sendMessageStream(sessionId: string, message: string, conversationHistory?: any[]): Promise<{ stream: unknown; messageId: string }>;
  sendMessageStreamWithHistory(sessionId: string, conversationHistory: any[]): Promise<{ stream: unknown; messageId: string }>;
  getSessionMessages(sessionId: string, limit?: number): Promise<AgentMessage[]>;
  closeSession(sessionId: string): Promise<void>;
  getActiveSession(projectId: string): Promise<{ sessionId: string } | null>;
}


