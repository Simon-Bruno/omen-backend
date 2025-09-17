// Agent Domain Service - Provider-agnostic conversation management
import { getToolsConfiguration } from './tools';
import { createEcommerceAgentSystemPrompt } from './prompts';
import type {
  AgentService,
  AgentConfig,
  ChatMessage,
  LLMProvider,
} from './types';

export class AgentServiceImpl implements AgentService {

  constructor(
    private llmProvider: LLMProvider,
    private config: AgentConfig = {}
  ) {
  }

  async sendMessageStream(sessionId: string, message: string): Promise<{ stream: unknown; messageId: string }> {
    console.log(`[AGENT] Starting streaming message processing`);
    console.log(`[AGENT] User message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

    // For now, disable session management and use a default project ID
    // TODO: Re-enable session management when needed
    const projectId = 'cmfkzwyuj0001qhopskyshs91';
    console.log(`[AGENT] Using default project ID: ${projectId} (sessions disabled)`);

    // Build messages with system prompt
    const llmMessages: ChatMessage[] = [];

    // Add system prompt if configured
    if (this.config.systemPrompt) {
      llmMessages.push({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }

    // Add user message
    llmMessages.push({
      role: 'user',
      content: message,
    });

    console.log(`[AGENT] Using message format: ${llmMessages.length} messages`);

    // Prepare tools if enabled
    let llmOptions = {};
    let systemPrompt = this.config.systemPrompt;

    if (this.config.enableToolCalls) {
      const toolsConfig = getToolsConfiguration();

      // Generate dynamic system prompt based on available tools
      systemPrompt = createEcommerceAgentSystemPrompt(toolsConfig.availableTools);

      llmOptions = {
        tools: toolsConfig.tools,
      };
    }

    // Use AI SDK streaming with tools enabled
    const result = await this.llmProvider.generateStreamText(
      llmMessages,
      systemPrompt,
      llmOptions
    );

    // Create a message ID for the response
    const messageId = `msg-${Date.now()}`;

    return { stream: result, messageId };
  }
}

// Factory function
export function createAgentService(
  llmProvider: LLMProvider,
  config?: AgentConfig
): AgentService {
  return new AgentServiceImpl(llmProvider, config);
}
