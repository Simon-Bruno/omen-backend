import { FastifyInstance } from 'fastify';
import { serviceContainer } from '@app/container';
import { Readable } from 'node:stream';
import { UIMessage } from 'ai';


export async function chatRoutes(fastify: FastifyInstance) {
    fastify.post("/chat", async (req, reply) => {
        const { messages } = (req.body ?? {}) as {
            messages?: UIMessage[];
            // projectId?: string;
        };

        // if (!projectId) {
        //     return reply.code(400).send({ error: 'Project ID is required' });
        // }

        console.log('🔍 Messages:', messages);

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

            console.log('🔍 Last message:', lastMessage);
            console.log('🔍 Last message role:', lastMessage.role);
            console.log('🔍 Last message parts:', lastMessage.parts);

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

            // Use the agent service streaming method (includes system prompt and tools)
            // Session management is disabled for now
            const { stream } = await agentService.sendMessageStream('no-session', messageText);

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
