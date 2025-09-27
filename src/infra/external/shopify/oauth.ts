import { shopify } from './service';
import { encrypt } from '../../encryption';
import { setInterval } from 'timers';

/**
 * Shopify OAuth service for handling OAuth flows
 * Includes state management for replay protection
 */
export class ShopifyOAuthService {
  private stateStore = new Map<string, { userId?: string; email?: string; timestamp: number }>();

  constructor() {
    // Clean up expired states every 10 minutes (states expire after 1 hour)
    setInterval(() => {
      const now = Date.now();
      for (const [state, data] of this.stateStore.entries()) {
        if (now - data.timestamp > 60 * 60 * 1000) { // 1 hour
          this.stateStore.delete(state);
        }
      }
    }, 10 * 60 * 1000); // 10 minutes
  }

  /**
   * Store state with user ID (for authenticated flows)
   */
  private setUserState(state: string, userId: string): void {
    this.stateStore.set(state, { userId, timestamp: Date.now() });
  }

  /**
   * Store state with email (for registration flows)
   */
  private setEmailState(state: string, email: string): void {
    this.stateStore.set(state, { email, timestamp: Date.now() });
  }

  /**
   * Get state data
   */
  private getState(state: string): { userId?: string; email?: string; timestamp: number } | undefined {
    return this.stateStore.get(state);
  }

  /**
   * Remove state (one-time use)
   */
  private removeState(state: string): void {
    this.stateStore.delete(state);
  }
  /**
   * Generate OAuth URL for shop connection
   */
  generateOAuthUrl(shop: string, state: string): string {
    return shopify.generateOAuthUrl(shop, state);
  }

  /**
   * Handle OAuth callback for authenticated users
   */
  async handleAuthenticatedCallback(
    code: string,
    shop: string,
    _hmac: string,
    state: string,
    userId: string
  ) {
    // Validate state parameter for replay protection
    const stateData = this.getState(state);
    if (!stateData || stateData.userId !== userId) {
      throw new Error('Invalid or expired state parameter');
    }

    // Remove state after validation (one-time use)
    this.removeState(state);

    // Validate OAuth parameters
    const validation = shopify.validateCallbackParams({ code, shop, hmac, state });
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Exchange code for access token
    const tokenResponse = await shopify.exchangeCodeForToken(shop, code);
    
    // Fetch shop profile
    const shopProfile = await shopify.getShopProfile(shop, tokenResponse.access_token);
    
    // Encrypt the access token before storing
    const encryptedToken = encrypt(tokenResponse.access_token);

    return {
      shopProfile,
      encryptedToken,
    };
  }

  /**
   * Handle OAuth callback for registration flow
   */
  async handleRegistrationCallback(
    code: string,
    shop: string,
    _hmac: string,
    state: string
  ) {
    // Validate state parameter for replay protection
    const stateData = this.getState(state);
    if (!stateData?.email) {
      throw new Error('Invalid or expired state parameter');
    }

    // Remove state after validation (one-time use)
    this.removeState(state);

    // OAuth parameters are already validated in the route handler

    // Exchange code for access token
    const tokenResponse = await shopify.exchangeCodeForToken(shop, code);
    
    // Fetch shop profile
    const shopProfile = await shopify.getShopProfile(shop, tokenResponse.access_token);
    
    // Encrypt the access token before storing
    const encryptedToken = encrypt(tokenResponse.access_token);

    return {
      shopProfile,
      encryptedToken,
      email: stateData.email,
    };
  }

  /**
   * Generate state and OAuth URL for authenticated users
   */
  generateAuthenticatedOAuthUrl(shop: string, userId: string): { oauthUrl: string; state: string } {
    const state = this.generateState();
    this.setUserState(state, userId);
    const oauthUrl = this.generateOAuthUrl(shop, state);
    
    return { oauthUrl, state };
  }

  /**
   * Generate state and OAuth URL for registration flow
   */
  generateRegistrationOAuthUrl(shop: string, email: string): { oauthUrl: string; state: string } {
    const state = this.generateState();
    this.setEmailState(state, email);
    const oauthUrl = this.generateOAuthUrl(shop, state);
    
    return { oauthUrl, state };
  }

  private generateState(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
  }
}

export const shopifyOAuth = new ShopifyOAuthService();
