import { prisma } from '@infra/prisma';
import type { User as PrismaUser, Project } from '@prisma/client';

// Use Prisma-generated types as the source of truth
export type User = PrismaUser & {
  project?: Pick<Project, 'id' | 'shopDomain' | 'brandAnalysis'>;
};

/**
 * User service for database operations
 * Handles all user-related database logic
 */
export class UserService {
  /**
   * Get user by Better Auth ID
   */
  async getUserByBetterAuthId(betterAuthId: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id: betterAuthId },
      include: { project: true },
    });

    return user as User | null;
  }

  /**
   * Get or create user from Better Auth payload
   * Creates user on first login
   */
  async getOrCreateUser(betterAuthId: string, email: string, name: string): Promise<User> {
    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { id: betterAuthId },
      include: { project: true },
    });

    if (!user) {
      // Create new user on first login
      user = await prisma.user.create({
        data: {
          id: betterAuthId,
          email,
          name,
        },
        include: { project: true },
      });
    } else {
      // Update user data if it has changed
      const updates: any = {};
      if (user.email !== email) updates.email = email;
      if (user.name !== name) updates.name = name;

      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
          include: { project: true },
        });
      }
    }

    return user as User;
  }

  /**
   * Get user by Auth0 ID (DEPRECATED - for migration purposes)
   */
  async getUserByAuth0Id(auth0Id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { auth0Id },
      include: { project: true },
    });

    return user as User | null;
  }

  /**
   * Get user by ID with project details
   */
  async getUserById(userId: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { project: true },
    });

    return user as User | null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { project: true },
    });

    return user as User | null;
  }

  /**
   * Update user email
   */
  async updateUserEmail(userId: string, email: string): Promise<User> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { email },
      include: { project: true },
    });

    return user as User;
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    await prisma.user.delete({
      where: { id: userId },
    });
  }

  /**
   * Bind a project to a user (single project rule)
   * This will create a new project or update the existing one
   */
  async bindProjectToUser(userId: string, shopDomain: string, accessTokenEnc: string): Promise<User> {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { project: true },
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    // If user already has a project, update it; otherwise create a new one
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        project: existingUser.project
          ? {
              update: {
                shopDomain,
                accessTokenEnc,
              },
            }
          : {
              create: {
                shopDomain,
                accessTokenEnc,
              },
            },
      },
      include: { project: true },
    });

    return user as User;
  }

  /**
   * Get user's project ID
   */
  async getUserProjectId(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { project: { select: { id: true } } },
    });

    return user?.project?.id || null;
  }

  /**
   * Check if user owns a specific project
   */
  async userOwnsProject(userId: string, projectId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { 
        id: userId,
        project: { id: projectId },
      },
      select: { id: true },
    });

    return !!user;
  }
}

export const userService = new UserService();
