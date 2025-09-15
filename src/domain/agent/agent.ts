// Agent Domain Service - Provider-agnostic conversation management
import { ChatSessionDAL, ChatMessageDAL } from '@infra/dal';
import type {
  AgentService,
  AgentMessage,
  AgentConfig,
  ChatMessage,
  LLMProvider
} from './types';
import { MessageRole, ChatMessage as PrismaChatMessage } from '@prisma/client';

export class AgentServiceImpl implements AgentService {
  constructor(
    private llmProvider: LLMProvider,
    private config: AgentConfig = {}
  ) { }

  async createSession(projectId: string): Promise<{ sessionId: string }> {
    console.log(`[AGENT] Creating session for project ${projectId}`);

    // Check if there's already an active session
    const existingSession = await ChatSessionDAL.getActiveSessionByProject(projectId);
    if (existingSession) {
      console.log(`[AGENT] Found existing active session ${existingSession.id} for project ${projectId}`);
      return { sessionId: existingSession.id };
    }

    console.log(`[AGENT] No active session found, creating new session for project ${projectId}`);

    // Create new session
    const session = await ChatSessionDAL.createSession({
      projectId,
      status: 'ACTIVE',
    });

    console.log(`[AGENT] New session created with ID: ${session.id}`);

    // Add system message if configured
    if (this.config.systemPrompt) {
      console.log(`[AGENT] Adding system prompt to session ${session.id}`);
      await ChatMessageDAL.createMessage({
        sessionId: session.id,
        role: 'SYSTEM',
        content: {
          text: this.config.systemPrompt,
        },
      });
      console.log(`[AGENT] System message added to session ${session.id}`);
    } else {
      console.log(`[AGENT] No system prompt configured for session ${session.id}`);
    }

    console.log(`[AGENT] Session creation completed for project ${projectId}`);
    return { sessionId: session.id };
  }

  async sendMessage(sessionId: string, message: string): Promise<AgentMessage> {
    console.log(`[AGENT] Starting message processing for session ${sessionId}`);
    console.log(`[AGENT] User message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

    // Verify session exists and is active
    const session = await ChatSessionDAL.getSessionById(sessionId);
    if (!session || session.status !== 'ACTIVE') {
      console.error(`[AGENT] Session ${sessionId} not found or not active`);
      throw new Error('Session not found or not active');
    }

    console.log(`[AGENT] Session ${sessionId} verified as active for project ${session.projectId}`);

    // Save user message
    const userMessage = await ChatMessageDAL.createMessage({
      sessionId,
      role: 'USER',
      content: {
        text: message,
      },
    });

    console.log(`[AGENT] User message saved with ID: ${userMessage.id}`);

    // Get conversation history
    const messages = await this.getConversationHistory(sessionId);
    console.log(`[AGENT] Retrieved ${messages.length} messages from conversation history`);

    // Convert to LLM provider format
    const llmMessages: ChatMessage[] = messages.map(msg => {
      const content = msg.content as {
        text?: string;
        toolCalls?: Array<{
          id: string;
          type: string;
          function: {
            name: string;
            arguments: string;
          };
        }>;
        toolCallId?: string;
      };

      return {
        role: this.mapRoleToLLM(msg.role),
        content: content?.text || '',
        name: msg.role === 'TOOL' ? 'tool' : undefined,
        tool_calls: content?.toolCalls?.map(tc => ({
          id: tc.id,
          type: tc.type as 'function',
          function: tc.function,
        })),
        tool_call_id: content?.toolCallId,
      };
    });

    console.log(`[AGENT] Converted to LLM format: ${llmMessages.length} messages`);
    console.log(`[AGENT] Message roles: ${llmMessages.map(m => m.role).join(', ')}`);

    // Generate response
    console.log(`[AGENT] Calling LLM provider for response generation...`);
    const startTime = Date.now();

    const response = await this.llmProvider.generateChatCompletion(llmMessages);

    const generationTime = Date.now() - startTime;
    console.log(`[AGENT] LLM response generated in ${generationTime}ms`);
    console.log(`[AGENT] Response content: "${response.content.substring(0, 200)}${response.content.length > 200 ? '...' : ''}"`);

    if (response.usage) {
      console.log(`[AGENT] Token usage - Prompt: ${response.usage.promptTokens}, Completion: ${response.usage.completionTokens}, Total: ${response.usage.totalTokens}`);
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log(`[AGENT] Tool calls generated: ${response.toolCalls.length}`);
      response.toolCalls.forEach((tc, index) => {
        console.log(`[AGENT] Tool call ${index + 1}: ${tc.function.name}(${tc.function.arguments})`);
      });
    }

    // Save agent response
    const agentMessage = await ChatMessageDAL.createMessage({
      sessionId,
      role: 'AGENT',
      content: {
        text: response.content,
        toolCalls: response.toolCalls,
        metadata: {
          usage: response.usage,
          generationTime,
        },
      },
    });

    console.log(`[AGENT] Agent message saved with ID: ${agentMessage.id}`);
    console.log(`[AGENT] Message processing completed for session ${sessionId}`);

    return this.mapToAgentMessage(agentMessage);
  }

  async getSessionMessages(sessionId: string, limit?: number): Promise<AgentMessage[]> {
    const messages = await ChatMessageDAL.getMessagesBySession(sessionId, limit);
    return messages.map(this.mapToAgentMessage);
  }

  async closeSession(sessionId: string): Promise<void> {
    await ChatSessionDAL.closeSession(sessionId);
  }

  async getActiveSession(projectId: string): Promise<{ sessionId: string } | null> {
    const session = await ChatSessionDAL.getActiveSessionByProject(projectId);
    return session ? { sessionId: session.id } : null;
  }

  private async getConversationHistory(sessionId: string): Promise<PrismaChatMessage[]> {
    const maxMessages = this.config.maxContextMessages || 20;
    const messages = await ChatMessageDAL.getLatestMessagesBySession(sessionId, maxMessages);
    return messages.reverse(); // Return in chronological order
  }

  private mapRoleToLLM(role: MessageRole): 'system' | 'user' | 'assistant' | 'tool' {
    switch (role) {
      case 'SYSTEM':
        return 'system';
      case 'USER':
        return 'user';
      case 'AGENT':
        return 'assistant';
      case 'TOOL':
        return 'tool';
      default:
        return 'user';
    }
  }

  private mapToAgentMessage(message: PrismaChatMessage): AgentMessage {
    const content = message.content as {
      text?: string;
      metadata?: Record<string, unknown>;
      toolCalls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
      toolCallId?: string;
    };

    // Build content object, only including defined values
    const contentObj: AgentMessage['content'] = {};
    
    if (content?.text !== undefined) {
      contentObj.text = content.text;
    }
    
    if (content?.metadata !== undefined) {
      contentObj.metadata = content.metadata;
    }
    
    if (content?.toolCalls !== undefined && content.toolCalls.length > 0) {
      contentObj.toolCalls = content.toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type as 'function',
        function: tc.function,
      }));
    }
    
    if (content?.toolCallId !== undefined) {
      contentObj.toolCallId = content.toolCallId;
    }

    const agentMessage: AgentMessage = {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: contentObj,
      createdAt: message.createdAt,
    };

    return agentMessage;
  }
}

// Factory function
export function createAgentService(
  llmProvider: LLMProvider,
  config?: AgentConfig
): AgentService {
  return new AgentServiceImpl(llmProvider, config);
}
