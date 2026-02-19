# Omen Backend

AI-powered A/B testing engine for Shopify stores. Generates experiment variants using AI, crawls storefronts for brand context, and processes analytics events at scale.

## What it does

- **Variant generation** — Given a product page or component, uses Google Gemini to generate statistically sound A/B test variants with a hypothesis
- **Brand analysis** — Crawls a Shopify storefront with Playwright + Firecrawl to extract brand voice, design patterns, and conversion signals
- **Experiment management** — Full lifecycle: create, activate, pause, conclude experiments with Shopify integration
- **Analytics processing** — Dual-path event ingestion (real-time HTTP + batch via AWS SQS) with PostgreSQL storage
- **AI chat agent** — Conversational interface for experiment planning with tool-calling and multi-provider support

## Stack

| Layer | Technology |
|-------|-----------|
| HTTP server | Fastify |
| Database | PostgreSQL + Prisma ORM |
| AI | Google Gemini, Anthropic Claude (Vercel AI SDK) |
| Web crawling | Playwright, Firecrawl |
| Queue | AWS SQS |
| Storage | Cloudflare R2 |
| Analytics | PostHog |
| Auth | Better Auth |
| Deployment | Docker / Heroku |

## Architecture

```
src/
  domain/        # Business logic, agent system, core types
  features/      # Self-contained modules (variant_generation, brand_analysis, crawler, ...)
  infra/         # External integrations, DAL (Prisma), Cloudflare, SQS
  interfaces/    # Fastify HTTP routes, middleware, validation
  services/      # Background jobs, analytics processing, SQS consumer
  app/           # Container (DI), startup, config
```

See [AGENTS.md](./AGENTS.md) for full architecture details and development commands.

## Getting started

```bash
cp env.template .env
# fill in your keys

npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Or with Docker:

```bash
docker-compose up
```

## Environment

See `env.template` for all required environment variables (database, AI providers, Shopify, Cloudflare, AWS, PostHog).
