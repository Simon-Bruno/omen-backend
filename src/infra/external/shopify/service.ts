import { shopifyConfig } from './config';
import { decrypt, verifyHmac } from '../../encryption';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';

/**
 * Shopify service for API calls and shop profile management
 */

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  planName: string;
  currency: string;
  timezone: string;
  country: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyOAuthResponse {
  access_token: string;
  scope: string;
}

export class ShopifyService {
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(shop: string, code: string): Promise<ShopifyOAuthResponse> {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: shopifyConfig.apiKey,
        client_secret: shopifyConfig.apiSecret,
        code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for token: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<ShopifyOAuthResponse>;
  }

  /**
   * Fetch shop profile information
   */
  async getShopProfile(shop: string, accessToken: string): Promise<ShopifyShop> {
    const response = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch shop profile: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { shop: ShopifyShop };
    return data.shop;
  }

  /**
   * Get shop profile using encrypted token from database
   */
  async getShopProfileWithEncryptedToken(shop: string, encryptedToken: string): Promise<ShopifyShop> {
    const accessToken = decrypt(encryptedToken);
    return this.getShopProfile(shop, accessToken);
  }

  /**
   * Generate Shopify OAuth URL
   */
  generateOAuthUrl(shop: string, state: string): string {
    const params = new URLSearchParams({
      client_id: shopifyConfig.apiKey,
      scope: "read_themes, write_themes",
      redirect_uri: shopifyConfig.redirectUri,
      state,
    });

    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Validate shop domain format
   */
  validateShopDomain(shop: string): boolean {
    // Shopify shop domains should be in format: shop-name.myshopify.com
    const shopifyDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    return shopifyDomainRegex.test(shop);
  }

  /**
   * Normalize shop domain to ensure it has .myshopify.com suffix
   */
  normalizeShopDomain(shop: string): string {
    // If it's just the shop name, add .myshopify.com
    if (!shop.includes('.')) {
      return `${shop}.myshopify.com`;
    }

    // If it already has .myshopify.com, return as is
    if (shop.endsWith('.myshopify.com')) {
      return shop;
    }

    // If it's a custom domain, we can't normalize it
    throw new Error('Invalid shop domain format. Expected format: shop-name or shop-name.myshopify.com');
  }

  /**
   * Verify HMAC signature for OAuth callback
   */
  verifyHmacSignature(queryParams: Record<string, string>, hmac: string): boolean {
    const queryWithoutHmac = { ...queryParams };
    delete queryWithoutHmac.hmac;

    const queryStringWithoutHmac = Object.keys(queryWithoutHmac)
      .sort()
      .map(key => `${key}=${encodeURIComponent(queryWithoutHmac[key])}`)
      .join('&');

    return verifyHmac(queryStringWithoutHmac, shopifyConfig.apiSecret, hmac);
  }

  /**
   * Validate OAuth callback parameters
   */
  validateCallbackParams(query: Record<string, string>): {
    isValid: boolean;
    error?: string;
    params?: {
      code: string;
      shop: string;
      hmac: string;
      state: string;
    };
  } {
    const { code, shop, hmac, state } = query;

    if (!code || !shop || !hmac || !state) {
      return {
        isValid: false,
        error: 'Missing required parameters: code, shop, hmac, state',
      };
    }

    if (!this.validateShopDomain(shop)) {
      return {
        isValid: false,
        error: 'Invalid shop domain format',
      };
    }

    if (!this.verifyHmacSignature(query, hmac)) {
      return {
        isValid: false,
        error: 'Invalid HMAC signature',
      };
    }

    return {
      isValid: true,
      params: { code, shop, hmac, state },
    };
  }
}

export const shopify = new ShopifyService();
