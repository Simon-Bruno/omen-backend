// Chat Session Data Access Layer
import { ChatSession, SessionStatus } from '@prisma/client';
import { prisma } from '../prisma';

export interface CreateChatSessionData {
  projectId: string;
  status?: SessionStatus;
}

export interface UpdateChatSessionData {
  status?: SessionStatus;
}

export interface ChatSessionWithProject extends ChatSession {
  project: {
    id: string;
    shopDomain: string;
    userId: string;
  };
}

export interface ChatSessionWithMessages extends ChatSession {
  messages: Array<{
    id: string;
    role: string;
    content: any;
    createdAt: Date;
  }>;
}

export class ChatSessionDAL {
  static async createSession(data: CreateChatSessionData): Promise<ChatSession> {
    return await prisma.chatSession.create({
      data: {
        projectId: data.projectId,
        status: data.status || 'ACTIVE',
      },
    });
  }

  static async getSessionById(sessionId: string): Promise<ChatSession | null> {
    return await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });
  }

  static async getSessionWithProject(sessionId: string): Promise<ChatSessionWithProject | null> {
    return await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        project: {
          select: {
            id: true,
            shopDomain: true,
            userId: true,
          },
        },
      },
    });
  }

  static async getSessionWithMessages(
    sessionId: string,
    messageLimit?: number
  ): Promise<ChatSessionWithMessages | null> {
    return await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          ...(messageLimit && { take: messageLimit }),
        },
      },
    });
  }

  static async getSessionsByProject(
    projectId: string,
    status?: SessionStatus,
    limit?: number,
    offset?: number
  ): Promise<ChatSession[]> {
    return await prisma.chatSession.findMany({
      where: {
        projectId,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      ...(limit && { take: limit }),
      ...(offset && { skip: offset }),
    });
  }

  static async updateSession(
    sessionId: string,
    data: UpdateChatSessionData
  ): Promise<ChatSession> {
    return await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        ...(data.status && { status: data.status }),
        updatedAt: new Date(),
      },
    });
  }

  static async closeSession(sessionId: string): Promise<ChatSession> {
    return await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        updatedAt: new Date(),
      },
    });
  }

  static async deleteSession(sessionId: string): Promise<void> {
    await prisma.chatSession.delete({
      where: { id: sessionId },
    });
  }

  static async getActiveSessionByProject(projectId: string): Promise<ChatSession | null> {
    return await prisma.chatSession.findFirst({
      where: {
        projectId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async countSessionsByProject(projectId: string): Promise<number> {
    return await prisma.chatSession.count({
      where: { projectId },
    });
  }
}
