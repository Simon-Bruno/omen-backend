import { ManagementClient } from 'auth0';

/**
 * Auth0 Management API service
 * Handles only Auth0 operations, not our database
 */
export class Auth0Service {
  private managementClient: ManagementClient;

  constructor() {
    this.managementClient = new ManagementClient({
      domain: process.env.AUTH0_DOMAIN!,
      clientId: process.env.AUTH0_M2M_CLIENT_ID!,
      clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET!,
    });
  }

  /**
   * Create a new user in Auth0
   */
  async createUser(email: string, password?: string): Promise<{ id: string; email: string }> {
    const userData: {
      email: string;
      email_verified: boolean;
      connection: string;
      password?: string;
    } = {
      email,
      email_verified: false,
      connection: 'Username-Password-Authentication',
    };

    if (password) {
      userData.password = password;
    }

    const auth0User = await this.managementClient.users.create(userData);
    
    return {
      id: auth0User.data.user_id!,
      email: auth0User.data.email!,
    };
  }

  /**
   * Get user from Auth0 by ID
   */
  async getAuth0UserById(auth0Id: string): Promise<{ id: string; email: string } | null> {
    try {
      const auth0User = await this.managementClient.users.get({ id: auth0Id });
      
      return {
        id: auth0User.data.user_id!,
        email: auth0User.data.email!,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get user from Auth0 by email
   */
  async getAuth0UserByEmail(email: string): Promise<{ id: string; email: string } | null> {
    try {
      const users = await this.managementClient.users.getAll({
        q: `email:"${email}"`,
        search_engine: 'v3'
      });
      
      if (users.data.length > 0) {
        const user = users.data[0];
        return {
          id: user.user_id!,
          email: user.email!,
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update user in Auth0
   */
  async updateAuth0User(auth0Id: string, updates: { email?: string; email_verified?: boolean }): Promise<void> {
    await this.managementClient.users.update({ id: auth0Id }, updates);
  }

  /**
   * Delete user from Auth0
   */
  async deleteAuth0User(auth0Id: string): Promise<void> {
    await this.managementClient.users.delete({ id: auth0Id });
  }
}

export const auth0 = new Auth0Service();