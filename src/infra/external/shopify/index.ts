/**
 * Shopify external service module
 * Exports all Shopify-related functionality
 */

export type { ShopifyAppConfig } from './config';
export { shopify, type ShopifyShop, type ShopifyOAuthResponse } from './service';
export { shopifyOAuth } from './oauth';