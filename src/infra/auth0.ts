import { prisma } from './prisma';

export interface Auth0User {
  id: string;
  email: string;
  project?: {
    id: string;
    shopDomain: string;
  };
}

/**
 * Auth0 service for user management and project binding
 * Implements single project per user rule
 */
export class Auth0Service {
  /**
   * Get or create user from Auth0 payload
   * Creates user on first login
   */
  async getOrCreateUser(auth0Id: string, email: string): Promise<Auth0User> {
    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { auth0Id },
      include: { project: true },
    });

    if (!user) {
      // Create new user on first login
      user = await prisma.user.create({
        data: {
          auth0Id,
          email,
        },
        include: { project: true },
      });
    } else {
      // Update email if it has changed
      if (user.email !== email) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { email },
          include: { project: true },
        });
      }
    }

    return {
      id: user.id,
      email: user.email,
      project: user.project ? {
        id: user.project.id,
        shopDomain: user.project.shopDomain,
      } : undefined,
    };
  }

  /**
   * Bind a project to a user (single project rule)
   * This will create a new project or update the existing one
   */
  async bindProjectToUser(userId: string, shopDomain: string, accessTokenEnc: string): Promise<Auth0User> {
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

    return {
      id: user.id,
      email: user.email,
      project: {
        id: user.project!.id,
        shopDomain: user.project!.shopDomain,
      },
    };
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

export const auth0 = new Auth0Service();
