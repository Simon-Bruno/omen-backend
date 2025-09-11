# External Services

This directory contains integrations with external services and APIs. Each external service has its own subdirectory with its configuration, service implementation, and types.

## Structure

```
external/
├── shopify/
│   ├── config.ts      # Shopify API configuration
│   ├── service.ts     # Shopify API service implementation
│   ├── index.ts       # Exports for clean imports
│   └── README.md      # Service-specific documentation
└── README.md          # This file
```

## Adding New External Services

When adding a new external service:

1. Create a new directory under `external/` with the service name
2. Add `config.ts` for service-specific configuration
3. Add `service.ts` for the main service implementation
4. Add `index.ts` to export the service and types
5. Update this README with the new service

## Current Services

### Shopify
- **Purpose**: Shopify store integration and OAuth flow
- **Files**: `config.ts`, `service.ts`, `index.ts`
- **Features**: OAuth callback, shop profile fetching, token encryption
