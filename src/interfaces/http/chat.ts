
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { serviceContainer } from '@app/container';
import type { AgentMessage } from '@domain/agent';

// Request/Response schemas - using JSON Schema directly in Fastify

// Response types
interface CreateSessionResponse {
    sessionId: string;
}

interface SendMessageResponse {
    message: {
        id: string;
        sessionId: string;
        role: 'USER' | 'AGENT' | 'TOOL' | 'SYSTEM';
        content: {
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
        createdAt: string;
    };
}

interface GetMessagesResponse {
    messages: Array<{
        id: string;
        sessionId: string;
        role: 'USER' | 'AGENT' | 'TOOL' | 'SYSTEM';
        content: {
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
        createdAt: string;
    }>;
}


export async function chatRoutes(fastify: FastifyInstance) {
    // Create or get active chat session
    fastify.post<{
        Params: { projectId: string };
        Reply: CreateSessionResponse;
    }>('/projects/:projectId/chat/sessions', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    projectId: { type: 'string' }
                },
                required: ['projectId']
            },
            body: {
                type: 'object',
                properties: {},
                additionalProperties: false
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string' },
                    },
                },
            },
        },
    }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
        const { projectId } = request.params;
        const requestId = request.id;

        fastify.log.info({
            requestId,
            projectId,
            action: 'create_chat_session'
        }, 'Creating chat session');

        try {
            const agentService = serviceContainer.getAgentService();

            const result = await agentService.createSession(projectId);

            fastify.log.info({
                requestId,
                projectId,
                sessionId: result.sessionId,
                action: 'create_chat_session_success'
            }, 'Chat session created successfully');

            return reply.code(200).send(result);
        } catch (error: unknown) {
            fastify.log.error({
                err: error,
                requestId,
                projectId,
                action: 'create_chat_session_error'
            }, 'Error creating chat session:');
            return reply.code(500).send({ error: 'Failed to create chat session' });
        }
    });

    // Send message to chat session
    fastify.post<{
        Params: { sessionId: string };
        Body: { message: string };
        Reply: SendMessageResponse;
    }>('/chat/sessions/:sessionId/messages', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' }
                },
                required: ['sessionId']
            },
            body: {
                type: 'object',
                properties: {
                    message: { type: 'string', minLength: 1, maxLength: 10000 }
                },
                required: ['message']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                sessionId: { type: 'string' },
                                role: { type: 'string', enum: ['USER', 'AGENT', 'TOOL', 'SYSTEM'] },
                                content: {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string' },
                                        metadata: { type: 'object' },
                                        toolCalls: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    id: { type: 'string' },
                                                    type: { type: 'string' },
                                                    function: {
                                                        type: 'object',
                                                        properties: {
                                                            name: { type: 'string' },
                                                            arguments: { type: 'string' }
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        toolCallId: { type: 'string' }
                                    }
                                },
                                createdAt: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request: FastifyRequest<{
        Params: { sessionId: string };
        Body: { message: string };
    }>, reply: FastifyReply) => {
        const { sessionId } = request.params;
        const { message } = request.body;
        const requestId = request.id;

        fastify.log.info({
            requestId,
            sessionId,
            messageLength: message.length,
            messagePreview: message.substring(0, 100),
            action: 'send_message'
        }, 'Sending message to chat session');

        try {
            const agentService = serviceContainer.getAgentService();

            const startTime = Date.now();
            const agentMessage = await agentService.sendMessage(sessionId, message);

            console.log(`[HTTP] Agent message: ${JSON.stringify(agentMessage)}`);


            const processingTime = Date.now() - startTime;

            fastify.log.info({
                requestId,
                sessionId,
                messageId: agentMessage.id,
                processingTime,
                responseLength: agentMessage.content.text?.length || 0,
                hasToolCalls: !!(agentMessage.content.toolCalls && agentMessage.content.toolCalls.length > 0),
                toolCallsCount: agentMessage.content.toolCalls?.length || 0,
                action: 'send_message_success'
            }, 'Message sent successfully');

            const finalMessage = {
                ...agentMessage,
                createdAt: agentMessage.createdAt.toISOString(),
            };

            console.log(`[HTTP] Final Message: ${JSON.stringify(finalMessage)}`);

            return reply.code(200).send({
                message: finalMessage,
            });
        } catch (error: unknown) {
            fastify.log.error({
                err: error,
                requestId,
                sessionId,
                action: 'send_message_error'
            }, 'Error sending message:');

            if (error instanceof Error && error.message.includes('not found')) {
                return reply.code(404).send({ error: 'Session not found' });
            }
            return reply.code(500).send({ error: 'Failed to send message' });
        }
    });

    // Get messages from chat session
    fastify.get<{
        Params: { sessionId: string };
        Querystring: { limit?: number };
        Reply: GetMessagesResponse;
    }>('/chat/sessions/:sessionId/messages', {
    }, async (request: FastifyRequest<{
        Params: { sessionId: string };
        Querystring: { limit?: number };
    }>, reply: FastifyReply) => {
        try {
            const { sessionId } = request.params;
            const { limit } = request.query;

            // Convert limit to number if provided
            const numericLimit = limit ? parseInt(limit.toString(), 10) : undefined;

            console.log(`[HTTP] Getting messages for session: ${sessionId}, limit: ${numericLimit}`);

            const agentService = serviceContainer.getAgentService();

            const messages = await agentService.getSessionMessages(sessionId, numericLimit);

            console.log(`[HTTP] Raw messages from service: ${JSON.stringify(messages, null, 2)}`);
            console.log(`[HTTP] Messages count: ${messages.length}`);

            const formattedMessages = messages.map((msg: AgentMessage) => ({
                ...msg,
                createdAt: msg.createdAt.toISOString(),
            }));

            console.log(`[HTTP] Formatted messages: ${JSON.stringify(formattedMessages, null, 2)}`);

            const response = {
                messages: formattedMessages,
            };

            console.log(`[HTTP] Final response being sent: ${JSON.stringify(response, null, 2)}`);

            return reply.code(200).send(response);
        } catch (error: unknown) {
            console.error(`[HTTP] Error getting messages:`, error);
            fastify.log.error({ err: error }, 'Error getting messages:');
            return reply.code(500).send({ error: 'Failed to get messages' });
        }
    });

    // Close chat session
    fastify.delete<{
        Params: { sessionId: string };
    }>('/chat/sessions/:sessionId', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' }
                },
                required: ['sessionId']
            },
            response: {
                204: { type: 'null' },
            },
        },
    }, async (request: FastifyRequest<{
        Params: { sessionId: string };
    }>, reply: FastifyReply) => {
        try {
            const { sessionId } = request.params;
            const agentService = serviceContainer.getAgentService();

            await agentService.closeSession(sessionId);

            return reply.code(204).send();
        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'Error closing session:');
            return reply.code(500).send({ error: 'Failed to close session' });
        }
    });

    // Get active session for project
    fastify.get<{
        Params: { projectId: string };
        Reply: CreateSessionResponse | { sessionId: null };
    }>('/projects/:projectId/chat/sessions/active', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    projectId: { type: 'string' }
                },
                required: ['projectId']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        sessionId: { type: ['string', 'null'] },
                    },
                },
            },
        },
    }, async (request: FastifyRequest<{
        Params: { projectId: string };
    }>, reply: FastifyReply) => {
        const { projectId } = request.params;
        const requestId = request.id;

        fastify.log.info({
            requestId,
            projectId,
            action: 'get_active_session'
        }, 'Getting active session for project');

        try {
            const agentService = serviceContainer.getAgentService();

            const result = await agentService.getActiveSession(projectId);

            fastify.log.info({
                requestId,
                projectId,
                sessionId: result?.sessionId || null,
                hasActiveSession: !!result,
                action: 'get_active_session_success'
            }, 'Active session retrieved');

            return reply.code(200).send(result || { sessionId: null });
        } catch (error: unknown) {
            fastify.log.error({
                err: error,
                requestId,
                projectId,
                action: 'get_active_session_error'
            }, 'Error getting active session:');
            return reply.code(500).send({ error: 'Failed to get active session' });
        }
    });
}
