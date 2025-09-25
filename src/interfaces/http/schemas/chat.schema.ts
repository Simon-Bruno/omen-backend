import { z } from 'zod';

/**
 * Schema for UIMessage parts
 */
const UIMessagePartSchema = z.object({
    type: z.literal('text'),
    text: z.string(),
});

/**
 * Schema for UIMessage
 */
const UIMessageSchema = z.object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(UIMessagePartSchema).min(1, 'Message must have at least one part'),
});

/**
 * Schema for chat request body
 */
export const ChatRequestSchema = z.object({
    messages: z.array(UIMessageSchema).min(1, 'At least one message is required'),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
