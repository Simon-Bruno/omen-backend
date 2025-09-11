# Shopify External Service

This module handles all Shopify-related functionality including OAuth flow, API calls, and shop profile management.

## Files

- **`config.ts`**: Shopify API configuration and environment variable validation
- **`service.ts`**: Main Shopify service with API methods and utilities
- **`index.ts`**: Clean exports for the service and types

## Features

### OAuth Flow
- Generate OAuth URLs for store authorization
- Handle OAuth callbacks with HMAC validation
- Exchange authorization codes for access tokens

### Shop Management
- Fetch shop profile information
- Validate and normalize shop domains
- Store encrypted access tokens

### API Integration
- Shopify Admin API integration
- Error handling for API failures
- Type-safe API responses

## Usage

```typescript
import { shopify, shopifyConfig } from '@infra/external/shopify';

// Generate OAuth URL
const oauthUrl = shopify.generateOAuthUrl('shop-name.myshopify.com', state);

// Exchange code for token
const tokenResponse = await shopify.exchangeCodeForToken(shop, code);

// Fetch shop profile
const shopProfile = await shopify.getShopProfile(shop, accessToken);
```

## Configuration

Required environment variables:
- `SHOPIFY_API_KEY`: Shopify app API key
- `SHOPIFY_API_SECRET`: Shopify app secret
- `SHOPIFY_SCOPES`: Required permissions (comma-separated)
- `SHOPIFY_REDIRECT_URI`: OAuth callback URL
- `ENCRYPTION_KEY`: 32-character encryption key for token storage
