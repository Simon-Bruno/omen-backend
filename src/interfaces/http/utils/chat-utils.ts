import { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { UIMessagePart } from 'ai';

/**
 * Extracts text content from UIMessage parts array
 */
export function extractTextFromParts(parts: UIMessagePart[]): string {
    return parts
        .filter((part): part is UIMessagePart & { type: 'text'; text: string } =>
            part.type === 'text' && 'text' in part)
        .map(part => part.text)
        .join('');
}