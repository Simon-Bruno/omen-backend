# AGENTS.md

This file provides guidance to Agents when working with code in this repository.

## Important

- Be as lean as possible with your code, the user really wants elegancy in their code
- Respect file structureA 


## Common Commands

### Development
- The user already has the platform running with docker, on port 3001. You don't need to turn it on yourself.

### Code Quality
- `npm run lint` - Run ESLint on source files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run check:types` - Run TypeScript type checking
- `npm run check:unused` - Check for unused exports
- `npm run check:all` - Run all checks (types, unused exports, lint)

### Database
-- If you need to check contents of the database locally, query the database in docker with prisma, such as: `docker exec omen-backend-postgres-1 psql -U postgres -d omen_db -c "SELECT \"projectId\", \"experimentId\", \"sessionId\", \"viewId\", properties, \"createdAt\" FROM analytics_events WHERE \"eventType\" = 'PAGEVIEW' ORDER BY \"createdAt\" DESC LIMIT 10;"`
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run database migrations in development
- `npm run db:deploy` - Deploy migrations to production
- `npm run db:studio` - Open Prisma Studio GUI
- `npm run seed` - Run database seeding
- `npm run seed:reset` - Reset and reseed database

## Architecture Overview

This is a Node.js TypeScript backend for an e-commerce optimization platform that generates AI-powered A/B test variants for Shopify stores.

### Core Architecture Pattern
The codebase follows a layered architecture with clear separation of concerns:

**Domain Layer** (`src/domain/`): Business logic and core entities
- Agent system for chat interactions
- Analytics domain services
- Core business rules and types

**Features Layer** (`src/features/`): Self-contained feature modules
- `brand_analysis/`: Analyzes e-commerce sites using Firecrawl
- `variant_generation/`: Creates A/B test variants using AI
- `hypotheses_generation/`: Generates experiment hypotheses
- `crawler/`: Web crawling with Playwright
- `conflict_guard/`: Prevents conflicting experiments

**Infrastructure Layer** (`src/infra/`): External integrations and data access
- `dal/`: Data Access Layer with Prisma
- `external/`: External service integrations (Cloudflare, AWS SQS)
- `config/`: Service configuration management

**Interface Layer** (`src/interfaces/`): HTTP API endpoints using Fastify
- Authentication middleware (Better Auth)
- Route handlers and validation schemas
- API versioning and documentation

**Services Layer** (`src/services/`): Application services and orchestration
- Background job management
- Screenshot services
- Analytics processing
- SQS message processing

### Key Technologies
- **Framework**: Fastify (high-performance HTTP server)
- **Database**: PostgreSQL with Prisma ORM
- **AI/ML**: Google Gemini, OpenAI (AI SDK)
- **Authentication**: Better Auth (replacing Auth0)
- **Web Crawling**: Playwright, Firecrawl
- **Message Queue**: AWS SQS
- **Analytics**: PostHog integration
- **Image Storage**: Cloudflare R2

### Dependency Injection
The application uses a custom service container (`src/app/container.ts`) for dependency injection. Services are lazily loaded and cached as singletons. The container manages cleanup and resource disposal.

### Path Mapping
TypeScript paths are configured in `tsconfig.json` for clean imports:
- `@app/*` → `src/app/*`
- `@config/*` → `src/config/*`
- `@domain/*` → `src/domain/*`
- `@features/*` → `src/features/*`
- `@infra/*` → `src/infra/*`
- `@interfaces/*` → `src/interfaces/*`
- `@services/*` → `src/services/*`
- `@shared/*` → `src/shared/*`

### Database Schema
The Prisma schema (`prisma/schema.prisma`) defines the core entities:
- **User**: Authentication and user management
- **Project**: Shopify store connections and configurations
- **Experiment**: A/B test definitions and targeting
- **Screenshot**: Visual assets for experiments
- **AnalyticsEvent**: Event tracking for experiments
- **ChatMessage**: Agent conversation history

### Background Services
The application runs several background services:
- **Job Cleanup**: Removes stale background jobs
- **SQS Consumer**: Processes analytics events from queue
- **Background Services Manager**: Coordinates service lifecycle

## Development Notes

### Environment Setup
The application requires a `.env` file with configuration for:
- Database connection (PostgreSQL)
- AI providers (Google Gemini, OpenAI)
- External services (PostHog, Cloudflare, AWS SQS)
- Authentication (Better Auth)
- Shopify API credentials

### AI Integration
The codebase heavily uses the Vercel AI SDK for LLM interactions. Different features use different AI providers optimized for their use case:
- Brand analysis: Firecrawl + Google Gemini
- Variant generation: Google Gemini with structured output
- Chat agent: Multi-provider support with tool calling

### Web Crawling Strategy
The crawler service supports multiple strategies:
- Playwright for dynamic content and screenshots
- Firecrawl for content extraction and analysis
- Smart screenshot strategies for optimal visual capture

### Analytics Architecture
Event tracking uses a dual approach:
- Real-time events via HTTP API
- Batch processing via AWS SQS for high-volume events
- PostgreSQL for storage with optimized queries for analytics

### Security Considerations
- Better Auth handles authentication with session management
- Project-level authorization middleware
- Environment variables for all sensitive configuration
- SQL injection protection via Prisma's type-safe queries