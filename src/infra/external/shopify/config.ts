/**
 * Shopify configuration module
 * Handles Shopify API configuration and validation
 */

export const shopifyConfig = {
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecret: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_orders,write_orders, write_themes, read_themes',
  redirectUri: process.env.SHOPIFY_REDIRECT_URI!,
  encryptionKey: process.env.ENCRYPTION_KEY!,
};

// Validate required environment variables
const requiredEnvVars = [
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
  'SHOPIFY_REDIRECT_URI',
  'ENCRYPTION_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Validate encryption key length (should be 32 or 64 characters for AES-256)
if (shopifyConfig.encryptionKey.length !== 32 && shopifyConfig.encryptionKey.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be exactly 32 or 64 characters long for AES-256 encryption');
}
