// Chat Message Data Access Layer
import { ChatMessage, MessageRole, Prisma } from '@prisma/client';
import { prisma } from '../prisma';


export interface CreateChatMessageData {
    sessionId: string;
    role: MessageRole;
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
}

export interface UpdateChatMessageData {
    content?: {
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
}

export interface ChatMessageWithSession extends ChatMessage {
    session: {
        id: string;
        projectId: string;
        status: string;
    };
}

export class ChatMessageDAL {
    static async createMessage(data: CreateChatMessageData): Promise<ChatMessage> {
        // Clean up content object to remove undefined values
        const cleanContent: Record<string, unknown> = {};
        
        if (data.content.text !== undefined) {
            cleanContent.text = data.content.text;
        }
        
        if (data.content.metadata !== undefined) {
            cleanContent.metadata = data.content.metadata;
        }
        
        if (data.content.toolCalls !== undefined && data.content.toolCalls.length > 0) {
            cleanContent.toolCalls = data.content.toolCalls;
        }
        
        if (data.content.toolCallId !== undefined) {
            cleanContent.toolCallId = data.content.toolCallId;
        }
        
        return await prisma.chatMessage.create({
            data: {
                sessionId: data.sessionId,
                role: data.role,
                content: cleanContent as Prisma.InputJsonValue,
            },
        });
    }

    static async getMessagesBySession(
        sessionId: string,
        limit?: number,
        offset?: number
    ): Promise<ChatMessage[]> {
        return await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' },
            ...(limit && { take: limit }),
            ...(offset && { skip: offset }),
        });
    }

    static async getMessagesBySessionWithSession(
        sessionId: string,
        limit?: number,
        offset?: number
    ): Promise<ChatMessageWithSession[]> {
        return await prisma.chatMessage.findMany({
            where: { sessionId },
            include: {
                session: {
                    select: {
                        id: true,
                        projectId: true,
                        status: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
            ...(limit && { take: limit }),
            ...(offset && { skip: offset }),
        });
    }

    static async updateMessage(
        messageId: string,
        data: UpdateChatMessageData
    ): Promise<ChatMessage> {
        return await prisma.chatMessage.update({
            where: { id: messageId },
            data: {
                ...(data.content && { content: data.content as Prisma.InputJsonValue }),
            },
        });
    }

    static async deleteMessage(messageId: string): Promise<void> {
        await prisma.chatMessage.delete({
            where: { id: messageId },
        });
    }

    static async getMessageById(messageId: string): Promise<ChatMessage | null> {
        return await prisma.chatMessage.findUnique({
            where: { id: messageId },
        });
    }

    static async getLatestMessagesBySession(
        sessionId: string,
        count: number = 10
    ): Promise<ChatMessage[]> {
        return await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: count,
        });
    }

    static async countMessagesBySession(sessionId: string): Promise<number> {
        return await prisma.chatMessage.count({
            where: { sessionId },
        });
    }
}
