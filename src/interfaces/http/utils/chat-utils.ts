import { UIMessagePart } from 'ai';

/**
 * Extracts text content from UIMessage parts array
 */
export function extractTextFromParts(parts: UIMessagePart<any, any>[]): string {
    return parts
        .filter((part): part is UIMessagePart<any, any> & { type: 'text'; text: string } =>
            part.type === 'text' && 'text' in part)
        .map(part => part.text)
        .join('');
}