/**
 * Shopify configuration module
 * Supports per-shop app credentials with a hardcoded registry.
 * Falls back to environment variables when a shop-specific entry is not found.
 */

export interface ShopifyAppConfig {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  scopes: string;
}

// Shared defaults used across all shops unless overridden per-shop
export const sharedShopifyDefaults = {
  redirectUri: process.env.SHOPIFY_REDIRECT_URI || 'http://localhost:3001/auth/shopify/callback',
  scopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_orders,write_orders,write_themes,read_themes',
};

// Optional: Hardcoded per-shop registry (preferred when set)
export type PerShopEntry = {
  apiKey: string;
  apiSecret: string;
  redirectUri?: string;
  scopes?: string;
};

export const shopifyAppRegistry: Record<string, PerShopEntry> = {
  // Example:
  // 'qr0qpe-1c.myshopify.com': {
  //   apiKey: 'shpka_xxx',
  //   apiSecret: 'shpss_xxx',
  //   // redirectUri and scopes will default to sharedShopifyDefaults if omitted
  // },
  'qr0qpe-1c.myshopify.com': {
    apiKey: 'e22bc3cca51ee40b2a18a499a3ae1f62',
    apiSecret: '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',
  },
};

// Default app config from environment variables (optional if registry fully covers all shops)
export const defaultShopifyConfig: ShopifyAppConfig | null = (process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET && sharedShopifyDefaults.redirectUri)
  ? {
      apiKey: process.env.SHOPIFY_API_KEY!,
      apiSecret: process.env.SHOPIFY_API_SECRET!,
      redirectUri: sharedShopifyDefaults.redirectUri,
      scopes: sharedShopifyDefaults.scopes,
    }
  : null;

export const encryptionKey = process.env.ENCRYPTION_KEY!;

/**
 * Resolve app configuration for a given shop domain.
 * Prefers exact registry match; otherwise falls back to default env-based config.
 */
export function getShopifyConfigForShop(shopDomain: string): ShopifyAppConfig {
  // 1) Hardcoded registry takes precedence when present
  const registryEntry = shopifyAppRegistry[shopDomain];
  if (registryEntry) {
    console.log(`[SHOPIFY_CONFIG] Using code registry credentials for shop: ${shopDomain}`);
    return {
      apiKey: registryEntry.apiKey,
      apiSecret: registryEntry.apiSecret,
      redirectUri: registryEntry.redirectUri || sharedShopifyDefaults.redirectUri,
      scopes: registryEntry.scopes || sharedShopifyDefaults.scopes,
    };
  }

  // Try per-shop environment variables e.g. SHOPIFY_API_KEY_<slug>
  // slug is the subdomain before .myshopify.com, e.g., qr0qpe-1c from qr0qpe-1c.myshopify.com
  const slug = getShopSlug(shopDomain);
  if (slug) {
    const candidates = buildEnvKeyCandidates(slug);
    const keyVarName = candidates.keys.find(name => process.env[name]);
    const secretVarName = candidates.secrets.find(name => process.env[name]);

    console.log(`[SHOPIFY_CONFIG] Checking env keys: ${candidates.keys.join(', ')}`);
    console.log(`[SHOPIFY_CONFIG] Checking env secrets: ${candidates.secrets.join(', ')}`);

    const keyEnv = keyVarName ? process.env[keyVarName] : undefined;
    const secretEnv = secretVarName ? process.env[secretVarName] : undefined;

    if (keyEnv && secretEnv) {
      console.log(`[SHOPIFY_CONFIG] Using per-shop env credentials for slug: ${slug} (key: ${keyVarName}, secret: ${secretVarName})`);
      return {
        apiKey: keyEnv,
        apiSecret: secretEnv,
        redirectUri: sharedShopifyDefaults.redirectUri,
        scopes: sharedShopifyDefaults.scopes,
      };
    }
    console.log(`[SHOPIFY_CONFIG] No per-shop env credentials found for slug: ${slug}. Falling back...`);
  }
  if (defaultShopifyConfig) {
    console.log(`[SHOPIFY_CONFIG] Using default/global Shopify app credentials from env.`);
    return defaultShopifyConfig;
  }
  throw new Error(`No Shopify app configuration available for shop: ${shopDomain}`);
}

function getShopSlug(shopDomain: string): string | null {
  const lower = shopDomain.toLowerCase();
  const suffix = '.myshopify.com';
  if (lower.endsWith(suffix)) {
    const base = lower.substring(0, lower.length - suffix.length);
    // Ensure base looks like a valid slug (letters, digits, hyphens)
    return /^[a-z0-9-]+$/.test(base) ? base : null;
  }
  return null;
}

function buildEnvKeyCandidates(slug: string): { keys: string[]; secrets: string[] } {
  // Heroku and most env systems disallow hyphens in variable names.
  const lower = slug.toLowerCase();
  const upper = slug.toUpperCase();
  const lowerUnderscore = lower.replace(/-/g, '_');
  const upperUnderscore = upper.replace(/-/g, '_');

  const keys = [
    `SHOPIFY_API_KEY_${lower}`,
    `SHOPIFY_API_KEY_${upper}`,
    `SHOPIFY_API_KEY_${lowerUnderscore}`,
    `SHOPIFY_API_KEY_${upperUnderscore}`,
  ];
  const secrets = [
    `SHOPIFY_API_SECRET_${lower}`,
    `SHOPIFY_API_SECRET_${upper}`,
    `SHOPIFY_API_SECRET_${lowerUnderscore}`,
    `SHOPIFY_API_SECRET_${upperUnderscore}`,
  ];

  return { keys, secrets };
}

// Validate required environment variables (only ENCRYPTION_KEY is strictly required)
if (!process.env.ENCRYPTION_KEY) {
  throw new Error('Missing required environment variable: ENCRYPTION_KEY');
}

// Validate encryption key length (should be 32 or 64 characters for AES-256)
if (encryptionKey.length !== 32 && encryptionKey.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be exactly 32 or 64 characters long for AES-256 encryption');
}
