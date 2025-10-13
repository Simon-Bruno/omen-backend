// Agent Domain Service - Provider-agnostic conversation management
import { getToolsConfiguration } from './tools';
import { createEcommerceAgentSystemPrompt } from './prompts';
import { ai } from '@infra/config/langsmith';
import { stepCountIs } from 'ai';
// import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { getAIConfig, AI_CONFIGS } from '@shared/ai-config';
import { runWithContext } from './request-context';
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


  async sendMessageStream(message: string, projectId: string, conversationHistory?: any[]): Promise<{ stream: unknown; messageId: string }> {
    console.log(`[AGENT] Processing message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
    if (conversationHistory) {
      console.log(`[AGENT] Using conversation history (${conversationHistory.length} messages)`);
    }

    // Build messages with system prompt
    const llmMessages: ChatMessage[] = [];

    // Add conversation history if provided, otherwise just add the current message
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg) => {

        llmMessages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
          ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
          ...(msg.tool_results && { tool_results: msg.tool_results }),
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
      const toolsConfig = getToolsConfiguration(projectId);
      // Generate dynamic system prompt based on available tools
      systemPrompt = createEcommerceAgentSystemPrompt(toolsConfig.availableTools);

      llmOptions = {
        tools: toolsConfig.tools,
      };

      console.log(`[AGENT] Tools enabled: ${toolsConfig.availableTools.join(', ')} for project ${projectId}`);
    }

    // Convert messages to AI SDK format
    const aiMessages = llmMessages.map((msg) => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content
          .filter(block => block.type === 'text')
          .map(block => block.text || '')
          .join('');

      const aiMessage = {
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
        ...(msg.tool_calls && { toolCalls: msg.tool_calls }),
        ...(msg.tool_call_id && { toolCallId: msg.tool_call_id }),
        ...((msg as any).tool_results && { toolResults: (msg as any).tool_results }),
      };

      // Log tool results in AI messages for debugging
      if ((msg as any).tool_results && (msg as any).tool_results.length > 0) {
        const toolResults = (msg as any).tool_results;
        console.log(`[AGENT] AI Message has ${toolResults.length} tool results:`, toolResults.map((tr: any) => ({
          tool_call_id: tr.tool_call_id,
          content_length: tr.content ? tr.content.length : 0,
          has_variants: tr.content && tr.content.includes('variantsSchema') ? 'Yes' : 'No'
        })));
      }

      // Log tool calls for debugging
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        console.log(`[AGENT] AI Message has tool calls:`, msg.tool_calls.map(tc => tc.function.name).join(', '));
      }

      return aiMessage;
    });

    // Add system prompt if provided (either from config or dynamic for tools)
    if (systemPrompt) {
      // Validate system prompt length (Google has limits)
      if (systemPrompt.length > 100000) {
        console.warn(`[AGENT] System prompt is very long (${systemPrompt.length} chars), this might cause issues`);
      }
      
      aiMessages.unshift({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Use AI SDK streaming with tools enabled and limited steps to prevent multiple responses
    const streamConfig: any = {
      model: google(this.aiConfig.model),
      messages: aiMessages,
      stopWhen: stepCountIs(2), // Limit to 2 steps to prevent multiple messages after tool calls
      ...AI_CONFIGS.STREAMING
    };

    if (llmOptions.tools) {
      streamConfig.tools = llmOptions.tools;
    }

    console.log(`[AGENT] Starting stream with ${aiMessages.length} messages and ${llmOptions.tools ? Object.keys(llmOptions.tools).length : 0} tools`);
    console.log(`[AGENT] System prompt length: ${systemPrompt ? systemPrompt.length : 0} characters`);
    console.log(`[AGENT] AI Config: model=${this.aiConfig.model}, temperature=${this.aiConfig.temperature}, maxTokens=${this.aiConfig.maxTokens}`);

    try {
      // Run the AI streaming within a request context so tools can access conversation history
      const result = runWithContext(
        {
          conversationHistory,
          projectId
        },
        () => ai.streamText(streamConfig)
      );

      // Create a message ID for the response
      const messageId = `msg-${Date.now()}`;

      console.log(`[AGENT] Stream created successfully with message ID: ${messageId}`);
      return { stream: result, messageId };
    } catch (error) {
      console.error(`[AGENT] Error creating stream:`, error);
      throw new Error(`Failed to create AI stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Factory function
export function createAgentService(
  config?: AgentConfig
): AgentService {
  return new AgentServiceImpl(config);
}
