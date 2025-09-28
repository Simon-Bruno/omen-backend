import { FastifyInstance } from 'fastify';
import { serviceContainer } from '@app/container';
import { Readable } from 'node:stream';
import { UIMessage } from 'ai';
import { authMiddleware } from './middleware/auth';
import { requireAuth } from './middleware/authorization';


export async function chatRoutes(fastify: FastifyInstance) {
    fastify.post("/chat", { preHandler: [authMiddleware, requireAuth] }, async (req, reply) => {
        const { messages } = (req.body ?? {}) as {
            messages?: UIMessage[];
        };

        console.log(`[CHAT] Processing ${messages?.length || 0} messages`);

        if (!messages || messages.length === 0) {
            return reply.code(400).send({ error: 'Messages are required' });
        }

        try {
            // Get the agent service from container (already configured with system prompt and tools)
            const agentService = serviceContainer.getAgentService();

            // Get the last user message
            const lastMessage = messages[messages.length - 1];
            if (!lastMessage || lastMessage.role !== 'user') {
                return reply.code(400).send({ error: 'Last message must be from user' });
            }

            // Extract text content from the message parts
            const parts = (lastMessage as any).parts;
            if (!parts || !Array.isArray(parts)) {
                return reply.code(400).send({ error: 'Invalid message parts format' });
            }

            const messageText = parts
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('');

            if (!messageText) {
                return reply.code(400).send({ error: 'Message content is required' });
            }

            // Convert the full conversation history to the format expected by the agent
            const conversationHistory = messages.map((msg: any) => {
                const msgParts = msg.parts || [];
                const textContent = msgParts
                    .filter((part: any) => part.type === 'text')
                    .map((part: any) => part.text)
                    .join('');
                
                return {
                    role: msg.role,
                    content: textContent,
                    // Include tool calls and results from assistant messages
                    ...(msg.role === 'assistant' && {
                        tool_calls: msgParts
                            .filter((part: any) => part.type?.startsWith('tool-'))
                            .map((part: any) => ({
                                id: part.toolCallId,
                                type: 'function',
                                function: {
                                    name: part.type.replace('tool-', ''),
                                    arguments: JSON.stringify(part.input || {})
                                }
                            })),
                        tool_call_id: msgParts
                            .filter((part: any) => part.type?.startsWith('tool-'))
                            .map((part: any) => part.toolCallId)[0],
                        // Include tool call outputs so the agent can see the results
                        tool_results: msgParts
                            .filter((part: any) => part.type?.startsWith('tool-') && part.output)
                            .map((part: any) => ({
                                tool_call_id: part.toolCallId,
                                content: JSON.stringify(part.output)
                            }))
                    })
                };
            });

            // Use the agent service streaming method with full conversation history
            // Session management is disabled for now
            console.log(`[CHAT] Calling agent service with message: "${messageText.substring(0, 100)}..." and ${conversationHistory.length} history messages`);
            const { stream } = await agentService.sendMessageStream(messageText, req.projectId!, conversationHistory);
            console.log(`[CHAT] Agent service returned stream successfully`);

            // Use AI SDK's built-in streaming response
            const res = (stream as { toUIMessageStreamResponse: () => Response }).toUIMessageStreamResponse();

            // Copy headers + stream body to Fastify
            reply.code(res.status);
            for (const [k, v] of res.headers) reply.header(k, v);
            if (res.body) {
                const nodeStream = Readable.fromWeb(res.body as any);
                return reply.send(nodeStream);
            }
            return reply.send();

        } catch (error) {
            console.error('Streaming chat error:', error);
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
}
