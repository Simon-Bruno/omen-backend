// Agent Domain Service - Provider-agnostic conversation management
import { getToolsConfiguration } from './tools';
import { createEcommerceAgentSystemPrompt } from './prompts';
import { streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getAIConfig, AI_CONFIGS } from '@shared/ai-config';
import type {
  AgentService,
  AgentConfig,
  ChatMessage,
} from './types';

export class AgentServiceImpl implements AgentService {
  private aiConfig: ReturnType<typeof getAIConfig>;

  constructor(
    private config: AgentConfig = {}
  ) {
    this.aiConfig = getAIConfig();
  }


  async sendMessageStream(sessionId: string, message: string, conversationHistory?: any[]): Promise<{ stream: unknown; messageId: string }> {
    console.log(`[AGENT] Processing message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
    if (conversationHistory) {
      console.log(`[AGENT] Using conversation history (${conversationHistory.length} messages)`);
    }

    // Build messages with system prompt
    const llmMessages: ChatMessage[] = [];

    // Add system prompt if configured
    if (this.config.systemPrompt) {
      llmMessages.push({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }

    // Add conversation history if provided, otherwise just add the current message
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg) => {
        llmMessages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
          ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
        });
      });
    } else {
      // Add user message if no conversation history
      llmMessages.push({
        role: 'user',
        content: message,
      });
    }

    // Prepare tools if enabled
    let llmOptions: { tools?: any } = {};
    let systemPrompt = this.config.systemPrompt;

    if (this.config.enableToolCalls) {
      const toolsConfig = getToolsConfiguration();
      // Generate dynamic system prompt based on available tools
      systemPrompt = createEcommerceAgentSystemPrompt(toolsConfig.availableTools);

      llmOptions = {
        tools: toolsConfig.tools,
      };
      
      console.log(`[AGENT] Tools enabled: ${toolsConfig.availableTools.join(', ')}`);
    }

    // Convert messages to AI SDK format
    const aiMessages = llmMessages.map(msg => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content
          .filter(block => block.type === 'text')
          .map(block => block.text || '')
          .join('');

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

    // Use AI SDK streaming with tools enabled and multi-step calls
    const streamConfig: any = {
      model: openai(this.aiConfig.model),
      messages: aiMessages,
      stopWhen: stepCountIs(5), // Allow up to 5 steps for multi-step tool calls
      ...AI_CONFIGS.STREAMING
    };

    if (llmOptions.tools) {
      streamConfig.tools = llmOptions.tools;
    }

    const result = streamText(streamConfig);

    // Create a message ID for the response
    const messageId = `msg-${Date.now()}`;

    return { stream: result, messageId };
  }
}

// Factory function
export function createAgentService(
  config?: AgentConfig
): AgentService {
  return new AgentServiceImpl(config);
}
