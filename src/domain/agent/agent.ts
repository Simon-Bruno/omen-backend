// Agent Domain Service - Provider-agnostic conversation management
import { ChatSessionDAL, ChatMessageDAL } from '@infra/dal';
import { createProjectInfoService, type ProjectInfoService } from '@services/project-info';
import { createAgentToolsService, type AgentToolsService, AGENT_TOOLS } from './tools';
import type {
  AgentService,
  AgentMessage,
  AgentConfig,
  ChatMessage,
  LLMProvider,
  AgentState,
  AgentStateData,
  ProjectInfo
} from './types';
import { MessageRole, ChatMessage as PrismaChatMessage } from '@prisma/client';

export class AgentServiceImpl implements AgentService {
  private projectInfoService: ProjectInfoService;
  private toolsService: AgentToolsService;
  private agentStates = new Map<string, AgentStateData>();

  constructor(
    private llmProvider: LLMProvider,
    private config: AgentConfig = {}
  ) {
    this.projectInfoService = createProjectInfoService();
    this.toolsService = createAgentToolsService(
      this.getProjectInfo.bind(this),
      this.getExperiments.bind(this),
      this.createExperiment.bind(this),
      this.runDiagnostics.bind(this),
      this.getExperimentResults.bind(this)
    );
  }

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

    // Initialize agent state
    this.agentStates.set(session.id, {
      state: 'welcome',
      lastStateChange: new Date(),
    });

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

    // Add welcome flow if enabled
    if (this.config.enableWelcomeFlow) {
      console.log(`[AGENT] Adding welcome flow to session ${session.id}`);
      await this.addWelcomeMessage(session.id, projectId);
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
    const llmMessages: ChatMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
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

      if (msg.role === 'TOOL') {
        // Always include tool messages - let OpenAI validate them
        llmMessages.push({
          role: 'tool' as const,
          content: content?.text || '',
          tool_call_id: content?.toolCallId,
        });
      } else {
        llmMessages.push({
          role: this.mapRoleToLLM(msg.role),
          content: content?.text || '',
          tool_calls: content?.toolCalls?.map(tc => ({
            id: tc.id,
            type: tc.type as 'function',
            function: tc.function,
          })),
          tool_call_id: content?.toolCallId,
        });
      }
    }

    console.log(`[AGENT] Converted to LLM format: ${llmMessages.length} messages`);


    console.log(`[AGENT] LLM messages: ${JSON.stringify(llmMessages)}`);

    console.log(`[AGENT] Message roles: ${llmMessages.map(m => m.role).join(', ')}`);

    // Generate response with tools if enabled
    console.log(`[AGENT] Calling LLM provider for response generation...`);
    const startTime = Date.now();

    let llmOptions = {};
    if (this.config.enableToolCalls) {
      llmOptions = {
        tools: AGENT_TOOLS.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
      };
    }

    const response = await this.llmProvider.generateChatCompletion(llmMessages, llmOptions);

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

      // Execute tool calls
      const toolResults = await this.executeToolCalls(sessionId, response.toolCalls);

      // Save the assistant message with tool calls FIRST
      await ChatMessageDAL.createMessage({
        sessionId,
        role: 'AGENT',
        content: {
          text: response.content,
          toolCalls: response.toolCalls,
          metadata: {
            usage: response.usage,
            generationTime,
            toolCallsExecuted: toolResults.length,
          },
        },
      });

      // Save tool results as separate messages AFTER the assistant message
      for (const toolResult of toolResults) {
        await ChatMessageDAL.createMessage({
          sessionId,
          role: 'TOOL',
          content: {
            text: JSON.stringify(toolResult.result),
            toolCallId: toolResult.toolCallId,
          },
        });
      }

      // Generate follow-up response with tool results
      const followUpMessages = [...llmMessages, {
        role: 'assistant' as const,
        content: response.content,
        tool_calls: response.toolCalls,
      }];

      // Add tool result messages
      for (const toolResult of toolResults) {
        followUpMessages.push({
          role: 'tool' as const,
          content: JSON.stringify(toolResult.result),
          tool_call_id: toolResult.toolCallId,
        });
      }

      const followUpResponse = await this.llmProvider.generateChatCompletion(followUpMessages, llmOptions);

      // Save the final response
      const agentMessage = await ChatMessageDAL.createMessage({
        sessionId,
        role: 'AGENT',
        content: {
          text: followUpResponse.content,
          toolCalls: followUpResponse.toolCalls,
          metadata: {
            usage: followUpResponse.usage,
            generationTime: Date.now() - startTime,
            toolCallsExecuted: toolResults.length,
          },
        },
      });

      console.log(`[AGENT] Agent message with tool results saved with ID: ${agentMessage.id}`);
      console.log(`[AGENT] Message processing completed for session ${sessionId}`);

      return this.mapToAgentMessage(agentMessage);
    } else {
      // No tool calls, save regular response
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

  async getAgentState(sessionId: string): Promise<AgentStateData> {
    const state = this.agentStates.get(sessionId);
    if (!state) {
      // Initialize default state if not found
      const defaultState: AgentStateData = {
        state: 'active',
        lastStateChange: new Date(),
      };
      this.agentStates.set(sessionId, defaultState);
      return defaultState;
    }
    return state;
  }

  async setAgentState(sessionId: string, state: AgentState): Promise<void> {
    const currentState = this.agentStates.get(sessionId);
    if (currentState) {
      currentState.state = state;
      currentState.lastStateChange = new Date();
    } else {
      this.agentStates.set(sessionId, {
        state,
        lastStateChange: new Date(),
      });
    }
  }

  async getProjectInfo(projectId: string): Promise<ProjectInfo> {
    return this.projectInfoService.getProjectInfo(projectId);
  }

  private async executeToolCalls(sessionId: string, toolCalls: unknown[]): Promise<Array<{ toolCallId: string; result: unknown }>> {
    const results = [];

    // Get project ID from session
    const session = await ChatSessionDAL.getSessionById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    const projectId = session.projectId;

    for (const toolCall of toolCalls) {
      try {
        const call = toolCall as { id: string; function: { name: string; arguments: string } };

        const args = JSON.parse(call.function.arguments);
        const result = await this.toolsService.executeTool(call.function.name, args, projectId);

        results.push({
          toolCallId: call.id,
          result: {
            success: result.success,
            data: result.data,
            error: result.error,
          },
        });
      } catch (error) {
        const call = toolCall as { id: string };


        results.push({
          toolCallId: call.id,
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
          },
        });
      }
    }

    return results;
  }


  // Placeholder methods for tools service
  private async getExperiments(_projectId: string, _filters?: unknown): Promise<unknown[]> {
    // TODO: Implement experiment listing
    return [];
  }

  private async createExperiment(_projectId: string, data: unknown): Promise<unknown> {
    // TODO: Implement experiment creation
    return { id: 'placeholder', data };
  }

  private async runDiagnostics(_projectId: string, _options?: unknown): Promise<unknown> {
    // TODO: Implement diagnostics running
    return { id: 'placeholder', status: 'pending' };
  }

  private async getExperimentResults(experimentId: string): Promise<unknown> {
    // TODO: Implement experiment results retrieval
    return { id: experimentId, results: 'placeholder' };
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

  private async addWelcomeMessage(sessionId: string, projectId: string): Promise<void> {
    try {
      // Get project information
      const projectInfo = await this.getProjectInfo(projectId);

      // Update agent state with project info
      const state = this.agentStates.get(sessionId);
      if (state) {
        state.projectInfo = projectInfo;
      }

      // Generate welcome message
      const welcomeMessage = this.generateWelcomeMessage(projectInfo);

      // Save welcome message
      await ChatMessageDAL.createMessage({
        sessionId,
        role: 'AGENT',
        content: {
          text: welcomeMessage,
          metadata: {
            isWelcomeMessage: true,
            projectInfo,
          },
        },
      });

      console.log(`[AGENT] Welcome message added to session ${sessionId}`);
    } catch (error) {
      console.error(`[AGENT] Failed to add welcome message to session ${sessionId}:`, error);
      // Continue without welcome message if it fails
    }
  }

  private generateWelcomeMessage(projectInfo: ProjectInfo): string {
    const { shopName, shopDomain, shopPlan, shopCurrency, shopCountry, experimentsCount, activeExperimentsCount, lastDiagnosticsRun } = projectInfo;

    let message = `👋 Welcome to your e-commerce optimization assistant!\n\n`;

    // Store information
    message += `**Your Store Information:**\n`;
    message += `🏪 Store: ${shopName || shopDomain}\n`;
    if (shopPlan) message += `📋 Plan: ${shopPlan}\n`;
    if (shopCurrency) message += `💰 Currency: ${shopCurrency}\n`;
    if (shopCountry) message += `🌍 Country: ${shopCountry}\n`;
    message += `\n`;

    // Experiments summary
    message += `**Your Experiments:**\n`;
    message += `📊 Total experiments: ${experimentsCount}\n`;
    message += `🚀 Active experiments: ${activeExperimentsCount}\n`;
    if (lastDiagnosticsRun) {
      const lastRun = new Date(lastDiagnosticsRun).toLocaleDateString();
      message += `🔍 Last diagnostics run: ${lastRun}\n`;
    }
    message += `\n`;

    // Call to action
    message += `**What would you like to do today?**\n`;
    message += `• 🧪 Create a new experiment\n`;
    message += `• 📈 Review existing experiments\n`;
    message += `• 🔍 Run store diagnostics\n`;
    message += `• 📊 Analyze performance metrics\n`;
    message += `• 💡 Get optimization suggestions\n\n`;
    message += `Just let me know what you'd like to work on!`;

    return message;
  }
}

// Factory function
export function createAgentService(
  llmProvider: LLMProvider,
  config?: AgentConfig
): AgentService {
  return new AgentServiceImpl(llmProvider, config);
}
