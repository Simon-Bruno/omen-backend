# Omen Backend

Omen is an AI-native A/B testing engine for Shopify stores. You connect a store, describe what you want to test (or let the AI suggest), and Omen handles everything: crawling the live storefront for brand context, generating experiment hypotheses, writing the variant HTML/CSS/JS, deploying to Cloudflare Workers KV at the edge, and ingesting analytics at scale via Supabase edge functions and AWS SQS.

The entire hypothesis → variant → experiment flow can be driven through a conversational chat agent backed by Google Gemini with tool-calling, or directly via the REST API.

---

## What makes it interesting

### Four-phase AI pipeline

Every experiment goes through four distinct AI-powered stages:

1. **Brand analysis** — Firecrawl scrapes the live storefront (homepage + auto-selected additional pages), and Gemini extracts a structured `BrandIntelligenceData` profile: personality words, trait scores (premium, energetic, social_proof, etc.), and hex-coded brand colors. Results are stored per-project and reused downstream.

2. **Hypothesis generation** — Playwright takes a full-page screenshot at 1920×1080, Cheerio simplifies the HTML to reduce token noise, and Gemini returns structured hypotheses (title, current problem, why-it-works rationale, baseline conversion estimate, predicted lift range). The conflict guard checks active experiments via URL-pattern overlap and CSS selector hashing before any hypothesis is accepted.

3. **Variant generation** — A `DOMAnalyzerService` identifies safe injection points from the real DOM. Gemini then generates variant descriptions (psychological triggers, visual changes), and a second model call produces self-contained IIFE JavaScript for each variant. Temperature is intentionally raised to 1.2 for diversity. The code generator enforces safety rules: no external resource loading, link preservation, try-catch wrapping, DOMContentLoaded fallback.

4. **Signal generation** — Before an experiment is published, `SignalGenerationService` proposes measurable goals (primary + mechanisms + guardrails) by running Gemini against the cleaned DOM and variant diff. For Shopify projects with live data, it switches to a data-driven path using actual event history.

### Edge deployment

Published experiments are stored as JSON blobs in **Cloudflare KV** under `experiment:{id}`. The Cloudflare Worker reads these at the CDN edge to bucket users and inject variant code — no round-trips to the origin. Publish/unpublish is a single PUT/DELETE to the KV API.

### Dual-path analytics

Analytics events take two paths depending on volume:
- **Real-time**: HTTP POST directly to the Fastify API
- **Batch**: via **AWS SQS** — the `SQSConsumerService` polls with long-polling (5s wait), processes up to 10 messages per batch, and has a 60-second timeout failsafe with backpressure (skips poll cycle if still processing)

The storage backend is Supabase with a **daily-partitioned** PostgreSQL table. Events use a compact wire format (single-character keys, numeric event types, gzip compression) for ~60% payload reduction. Aggregation runs in SQL functions (`get_funnel_analysis`, `get_purchase_stats`, `get_experiment_conversion_rate`) rather than in JavaScript.

### Conflict guard

Overlapping experiments corrupt statistical results. The `conflict_guard` module prevents this by canonicalizing CSS selectors (normalize whitespace, lowercase tags, sort class names), SHA-256 hashing them, and comparing against all active experiments on overlapping URL patterns. A reserved-target payload is injected into the hypothesis generation prompt so the LLM knows what it cannot touch.

### Conversation agent

The chat interface runs on `google('gemini-2.5-pro')` with 8 registered tools: `generate_hypotheses`, `generate_variants`, `preview_experiment`, `create_experiment`, `get_brand_analysis`, `get_brand_sources`, `get_project_info`, `get_experiment_overview`. Tool-calling is limited to 2 steps per turn (`stepCountIs(2)`) to avoid runaway multi-message responses. Conversation history is passed as full context per turn. All LLM calls are traced through **LangSmith**.

### Security

- Shopify access tokens are encrypted at rest with **AES-256-GCM** + PBKDF2 (100k iterations, SHA-512) before being stored. The `encrypt`/`decrypt` functions use random salt + IV per operation and GCM auth tags.
- Better Auth handles sessions (replacing Auth0).
- HTML and CSS injected into variants are sanitized via DOMPurify + jsdom before storage.

---

## Tech stack

| Layer | Technology |
|---|---|
| HTTP server | Fastify 5 |
| Database | PostgreSQL 15 + Prisma ORM |
| Primary AI | Google Gemini 2.5 Pro (Vercel AI SDK) |
| Secondary AI | Anthropic Claude 3.5 Sonnet (chat fallback) |
| Web crawling | Playwright, Firecrawl (`@mendable/firecrawl-js`) |
| Analytics storage | Supabase (partitioned PostgreSQL + Edge Functions) |
| Event queue | AWS SQS |
| Edge config | Cloudflare KV |
| Auth | Better Auth |
| Observability | LangSmith (LLM tracing), PostHog (product analytics) |
| Runtime | Node.js 20, tsx (dev hot-reload) |
| Deployment | Docker / Heroku (Procfile included) |

---

## Project structure

```
src/
  app/
    container.ts        # Singleton DI container — lazily instantiates all services
    server.ts           # Fastify setup
  domain/
    agent/              # Chat agent, tool definitions, state managers
    analytics/          # Analytics domain types and service interface
  features/
    brand_analysis/     # Firecrawl + Gemini brand intelligence extraction
    hypotheses_generation/  # Page crawl + Gemini hypothesis generation
    variant_generation/     # DOM analysis, variant schema generation, code generation
    signal_generation/  # Goal/signal proposal (LLM + Shopify data paths)
    crawler/            # Playwright wrapper
    conflict_guard/     # Experiment overlap detection
  infra/
    auth.ts             # Better Auth configuration
    encryption.ts       # AES-256-GCM token encryption
    dal/                # Data access layer (Prisma + Supabase analytics)
    external/
      cloudflare/       # KV publish/unpublish
      shopify/          # OAuth, GraphQL client, Web Pixel registration
      posthog/          # Product analytics
  interfaces/
    http/               # Fastify route handlers, middleware, Zod schemas
  services/
    analytics.ts        # AnalyticsService + SQSConsumerService
    experiment-publisher.ts  # Publish to Cloudflare, update DB status
    screenshot-storage.ts    # PostgreSQL-backed screenshot cache
    background-services.ts   # Startup/shutdown coordinator
    job-cleanup.ts           # Prunes stale RUNNING jobs
prisma/
  schema.prisma         # Full database schema
docs/                   # Architecture docs: pipeline, analytics, signals, selectors
```

---

## Data model (key entities)

```
User → Project (1:1, linked to Shopify store)
Project → Experiment[]
Experiment → ExperimentVariant[]   (HTML/CSS/JS per variant)
           → ExperimentGoal[]      (primary / mechanism / guardrail signals)
           → ExperimentHypothesis  (generated rationale)
           → ExperimentTraffic[]   (percentage per variant)
Project → AnalyticsEvent[]         (EXPOSURE, PAGEVIEW, CONVERSION, PURCHASE, CUSTOM)
Project → Screenshot[]             (full-page screenshots, HTML, markdown — cached with TTL)
Project → ChatMessage[]            (conversation history)
```

The `AnalyticsEvent.assignedVariants` column is `JSONB` with a GIN index for fast experiment-scoped queries. The `Screenshot` table is a content-addressed cache keyed on `(projectId, pageType, variantId, viewport, quality)`.

---

## Setup

### Local (bare metal)

```bash
# 1. Copy environment template
cp env.template .env
# Fill in DATABASE_URL, GOOGLE_API_KEY, ANTHROPIC_API_KEY,
# SHOPIFY_API_KEY/SECRET, CLOUDFLARE_*, AWS_*, SUPABASE_*, etc.

# 2. Install dependencies
npm install

# 3. Generate Prisma client and run migrations
npm run db:generate
npm run db:migrate

# 4. Start dev server (hot-reload via tsx watch)
npm run dev
# Runs on http://localhost:3000
```

### Docker (recommended)

```bash
cp env.template .env
# edit .env

docker-compose up
# API on :3001, Postgres on :5432
```

The compose file mounts `src/` and `prisma/` for live reloading and runs `prisma migrate deploy` on startup.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_API_KEY` | Gemini API key (primary AI model) |
| `ANTHROPIC_API_KEY` | Claude API key (chat fallback) |
| `FIRECRAWL_API_KEY` | Firecrawl web scraping |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Shopify OAuth |
| `ENCRYPTION_KEY` | 32-char key for AES-256-GCM token encryption |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_NAMESPACE_ID` / `CLOUDFLARE_API_TOKEN` | KV experiment storage |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `SQS_QUEUE_URL` | Analytics event queue |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Analytics storage |
| `USE_SUPABASE_ANALYTICS` | `"true"` to use Supabase, falls back to Prisma |
| `BETTER_AUTH_SECRET` | Session signing key |
| `LANGCHAIN_API_KEY` | LangSmith tracing (optional) |
| `POSTHOG_API_KEY` | PostHog product analytics (optional) |

See `env.template` for the full list with defaults.

---

## API surface

| Route prefix | Responsibility |
|---|---|
| `/auth/*` | Better Auth endpoints (session, sign-in, sign-up) |
| `/user/*` | User and project management |
| `/shopify/*` | OAuth callback, store connection |
| `/api/web-pixel/*` | Shopify Web Pixel registration |
| `/chat` | Streaming chat with the Gemini agent |
| `/project/brand-summary` | Trigger / poll brand analysis job |
| `/project/jobs` | Background job status |
| `/screenshots/*` | Screenshot retrieval |
| `/experiment/*` | Full experiment CRUD + publish/unpublish |
| `/analytics/*` | Event ingestion, funnel queries, session listing |

---

## Key scripts

```bash
npm run dev               # Hot-reload dev server
npm run build             # TypeScript compile
npm run check:all         # tsc + unused-exports + eslint
npm run db:studio         # Prisma Studio GUI
npm run db:migrate        # Run migrations (dev)
npm run db:deploy         # Apply migrations (prod)
npm run seed              # Seed database
npm run test:variants     # Integration test: full variant pipeline
npm run test:signals      # Signal generation test
```
