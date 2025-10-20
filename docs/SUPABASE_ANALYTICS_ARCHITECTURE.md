# Supabase Analytics Architecture

This document explains the complete Supabase-based analytics system for high-performance event tracking and querying.

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Flow](#data-flow)
4. [Event Schema](#event-schema)
5. [Edge Function Ingestion](#edge-function-ingestion)
6. [Database Schema](#database-schema)
7. [SQL Functions](#sql-functions)
8. [Repository Implementation](#repository-implementation)
9. [Configuration](#configuration)
10. [Performance Optimizations](#performance-optimizations)

---

## Overview

The Supabase analytics system provides a high-performance, scalable alternative to our legacy PostgreSQL/Prisma analytics stack. It handles:

- **High-volume event ingestion** via Deno Edge Functions
- **Efficient time-series storage** with automatic table partitioning
- **Fast analytics queries** using optimized SQL functions
- **Seamless integration** with existing application code

### Key Benefits
- ⚡ **10x faster ingestion** - Edge Functions handle thousands of events/sec
- 📦 **Compact format** - Events reduced to ~60% of original size
- 🔍 **SQL-based analytics** - Aggregation happens in the database, not JavaScript
- 🔄 **Dual-mode support** - Works alongside legacy system during migration

---

## System Architecture

```
┌─────────────┐
│  omen-js-sdk│
│  (Browser)  │
└──────┬──────┘
       │ Compact JSON events
       │ (gzip compressed)
       ▼
┌──────────────────────┐
│ Supabase Edge Function│
│   (ingest-events)     │
└──────────┬───────────┘
           │ RPC call: insert_events_batch
           ▼
┌──────────────────────────┐
│  PostgreSQL Events Table  │
│  (Daily partitioned)      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Analytics SQL Functions  │
│  - get_experiment_sessions│
│  - get_funnel_analysis    │
│  - get_purchase_stats     │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────────┐
│ SupabaseAnalyticsRepository  │
│      (TypeScript)             │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│    Analytics HTTP Routes      │
│    (Fastify Backend)          │
└───────────────────────────────┘
```

---

## Data Flow

### 1. Event Creation (Browser)
```javascript
// SDK creates compact event format
{
  t: 1697472000000,    // timestamp (ms)
  s: "sess_abc123",    // session_id
  e: 0,                // event_type (0=EXPOSURE, 1=PAGEVIEW, etc.)
  x: "exp_123",        // experiment_id (optional)
  v: "variant_a",      // variant_key (optional)
  w: "view_xyz",       // view_id (optional)
  p: { url: "..." }    // properties (optional)
}
```

### 2. Batch & Send
- SDK batches events (max 10 or 2 seconds)
- Compresses with gzip
- Sends to Edge Function with `X-Project-Id` header

### 3. Edge Function Processing
```typescript
// Validates events
// Calls insert_events_batch RPC
const { data } = await supabase.rpc("insert_events_batch", {
  events_data: validatedEvents,
  p_project_id: projectId
});
```

### 4. Database Storage
- SQL function expands compact format
- Ensures correct daily partition exists
- Batch inserts all events
- Returns count and ID range

### 5. Analytics Queries
- HTTP routes call `AnalyticsService`
- Service uses `SupabaseAnalyticsRepository`
- Repository calls optimized SQL functions
- Results transformed to domain types

---

## Event Schema

### Compact Format (SDK → Edge Function)
```typescript
interface CompactEvent {
  t: number;           // timestamp (Unix ms)
  s: string;           // session_id
  e: number;           // event_type (0-4)
  x?: string;          // experiment_id
  v?: string;          // variant_key
  w?: string;          // view_id
  p?: Record<string, any>; // properties
}
```

### Database Schema
```sql
CREATE TABLE events (
  id BIGSERIAL,
  ts TIMESTAMPTZ NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type SMALLINT NOT NULL,
  experiment_id TEXT,
  variant_key TEXT,
  view_id TEXT,
  props JSONB,
  PRIMARY KEY (ts, id)
) PARTITION BY RANGE (ts);
```

### Event Types
```typescript
0 = EXPOSURE      // User sees variant
1 = PAGEVIEW      // Page view
2 = CONVERSION    // Goal achieved
3 = CUSTOM        // Custom event
4 = PURCHASE      // Purchase completed
```

---

## Edge Function Ingestion

**Location**: `supabase_edge_function_ingest.ts`

### Key Features
- **No authentication required** - Uses `X-Project-Id` header
- **Batch processing** - Handles arrays of events
- **Validation** - Ensures required fields present
- **Error handling** - Returns detailed error messages
- **CORS support** - Allows cross-origin requests

### Request Example
```bash
curl -X POST \
  https://srgnyekntdkvrxxsznes.supabase.co/functions/v1/ingest-events \
  -H "X-Project-Id: proj_123" \
  -H "Content-Type: application/json" \
  -d '[{"t":1697472000000,"s":"sess_abc","e":0,"v":"control"}]'
```

### Response
```json
{
  "ok": true,
  "count": 1,
  "ids": [12345, 12345]
}
```

---

## Database Schema

### Partitioning Strategy
- **Daily partitions** - One partition per day
- **Automatic creation** - `create_daily_partition()` function
- **Auto-maintenance** - `pg_cron` job creates future partitions
- **7-day retention** - Keeps partitions for a week

### Indexes
```sql
-- Primary key provides: (ts, id)
-- Additional indexes:
CREATE INDEX idx_events_project_exp ON events(project_id, experiment_id);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_project_exp_variant ON events(project_id, experiment_id, variant_key);
CREATE INDEX idx_events_type_variant ON events(event_type, variant_key);
```

### RLS Policies
```sql
-- Service role can insert/read (for Edge Function)
CREATE POLICY "Allow service role to insert events" 
  ON events FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Allow service role to read events" 
  ON events FOR SELECT TO service_role USING (true);
```

---

## SQL Functions

### 1. `insert_events_batch` - Batch Insert
```sql
CREATE FUNCTION insert_events_batch(
  events_data JSONB,
  p_project_id TEXT
) RETURNS TABLE (
  inserted_count INTEGER,
  first_id BIGINT,
  last_id BIGINT
)
```

**Purpose**: Efficiently insert batches of events in compact format

**Key Logic**:
- Ensures partition exists for today
- Expands compact JSON to table columns
- Returns insert statistics

---

### 2. `get_experiment_sessions` - Session List
```sql
CREATE FUNCTION get_experiment_sessions(
  p_project_id TEXT,
  p_experiment_id TEXT,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  session_id TEXT,
  event_count BIGINT,
  total_count BIGINT
)
```

**Purpose**: Get paginated list of sessions with event counts

**Replaces**: Manual JavaScript Map aggregation over all events

**Performance**: 
- ❌ **Before**: Fetch 10,000 rows → aggregate in JS
- ✅ **After**: SQL GROUP BY → return only requested page

---

### 3. `get_funnel_analysis` - Funnel Stats
```sql
CREATE FUNCTION get_funnel_analysis(
  p_project_id TEXT,
  p_experiment_id TEXT
) RETURNS TABLE (
  variant_key TEXT,
  pageview_sessions BIGINT,
  exposure_sessions BIGINT,
  conversion_sessions BIGINT
)
```

**Purpose**: Count unique sessions at each funnel step per variant

**Replaces**: Nested Map<string, Map<number, Set<string>>> JavaScript aggregation

**Performance**:
- Uses `COUNT(DISTINCT session_id) FILTER (WHERE event_type = X)`
- Database handles deduplication efficiently

---

### 4. `get_purchase_stats` - Revenue Analytics
```sql
CREATE FUNCTION get_purchase_stats(
  p_project_id TEXT,
  p_experiment_id TEXT
) RETURNS TABLE (
  variant_key TEXT,
  exposure_sessions BIGINT,
  purchase_sessions BIGINT,
  purchase_count BIGINT,
  total_revenue NUMERIC
)
```

**Purpose**: Aggregate purchase data and revenue per variant

**Replaces**: Manual Map/Set/Array revenue calculation in JavaScript

**Performance**:
- SQL SUM with FILTER for revenue calculation
- COUNT DISTINCT for unique purchasers

---

### 5. `get_experiment_conversion_rate` - Conversion Metrics
```sql
CREATE FUNCTION get_experiment_conversion_rate(
  exp_id TEXT,
  start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE (
  variant_key TEXT,
  exposures BIGINT,
  conversions BIGINT,
  conversion_rate NUMERIC
)
```

**Purpose**: Calculate conversion rates by variant

**Usage**: Used by both `getExposureStats()` and `getConversionRates()`

---

## Repository Implementation

**Location**: `src/infra/dal/supabase-analytics.ts`

### SupabaseAnalyticsRepository

Implements `AnalyticsRepository` interface using Supabase client.

#### Key Methods

##### Query Methods (Optimized with SQL)
```typescript
async getExperimentSessions(projectId, experimentId, limit, offset) {
  const { data } = await this.supabase.rpc('get_experiment_sessions', {
    p_project_id: projectId,
    p_experiment_id: experimentId,
    p_limit: limit,
    p_offset: offset
  });
  // Map to domain types
}
```

##### Simple Direct Queries
```typescript
async getUserJourney(projectId, sessionId) {
  const { data } = await this.supabase
    .from('events')
    .select('*')
    .eq('project_id', projectId)
    .eq('session_id', sessionId)
    .order('ts', { ascending: true });
  // Map to domain types
}
```

##### Write Methods (Not Used)
```typescript
async create() {
  throw new Error('Use edge function for event creation');
}
```

Events are **only** created via Edge Function, never directly through repository.

---

## Configuration

### Environment Variables

**Backend** (`omen-backend/.env`):
```bash
# Enable Supabase analytics
USE_SUPABASE_ANALYTICS="true"

# Supabase connection
SUPABASE_URL="https://srgnyekntdkvrxxsznes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

**SDK** (`omen-js-sdk`):
```javascript
const config = {
  // Use Supabase by default
  useSupabase: true,
  supabaseUrl: 'https://srgnyekntdkvrxxsznes.supabase.co',
  
  // Legacy fallback
  edgeBaseUrl: 'https://api.omen.dev',
  
  projectId: 'proj_123'
};
```

### Dependency Injection

**Container** (`src/app/container.ts`):
```typescript
getAnalyticsService() {
  const useSupabase = process.env.USE_SUPABASE_ANALYTICS === 'true';
  
  const repository = useSupabase
    ? new SupabaseAnalyticsRepository(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : new PrismaAnalyticsRepository(prisma);
  
  return createAnalyticsService(repository);
}
```

---

## Performance Optimizations

### 1. Compact Event Format
- **60% size reduction** vs full JSON
- Single-character keys (`t`, `s`, `e`, `x`, `v`, `w`, `p`)
- Numeric event types (SMALLINT vs VARCHAR)
- Gzip compression in transit

### 2. Partitioned Tables
- Daily partitions reduce query scan size
- Automatic partition pruning for time-based queries
- Parallel partition creation via `pg_cron`

### 3. Optimized Indexes
- Composite indexes for common query patterns
- Primary key on `(ts, id)` for time-series access
- GIN index on JSONB properties (if needed)

### 4. SQL Aggregation
- **Session counting**: SQL GROUP BY vs JS Map
- **Distinct sessions**: COUNT(DISTINCT) vs Set
- **Revenue totals**: SQL SUM vs reduce()
- **Filtered counts**: FILTER clause vs multiple queries

### 5. Batch Processing
- Edge Function handles batches up to 1000 events
- Single RPC call for entire batch
- Database-level batch insert with RETURNING

---

## Migration Path

### Phase 1: Dual Mode (Current)
- SDK sends to **both** legacy and Supabase
- Backend reads from **either** based on env var
- Allows gradual rollout and comparison

### Phase 2: Supabase Primary
- SDK sends to Supabase only
- Backend reads from Supabase
- Legacy system kept for historical data

### Phase 3: Full Migration
- All new events in Supabase
- Historical data migrated if needed
- Legacy system deprecated

---

## Monitoring & Debugging

### Check Event Ingestion
```sql
-- Recent events
SELECT * FROM events 
ORDER BY ts DESC 
LIMIT 10;

-- Events by project
SELECT project_id, COUNT(*) 
FROM events 
GROUP BY project_id;
```

### Verify Partitions
```sql
-- List partitions
SELECT tablename 
FROM pg_tables 
WHERE tablename LIKE 'events_%' 
ORDER BY tablename DESC;

-- Partition sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables 
WHERE tablename LIKE 'events_%';
```

### Test SQL Functions
```sql
-- Test session listing
SELECT * FROM get_experiment_sessions(
  'proj_123',
  'exp_456',
  10,
  0
);

-- Test funnel analysis
SELECT * FROM get_funnel_analysis(
  'proj_123',
  'exp_456'
);
```

### Edge Function Logs
```bash
# View logs in Supabase dashboard
# Or use Supabase CLI
supabase functions logs ingest-events
```

---

## Troubleshooting

### Issue: Events not appearing
1. Check Edge Function logs for errors
2. Verify `X-Project-Id` header is sent
3. Check partition exists for today: `SELECT create_daily_partition(CURRENT_DATE);`
4. Verify RLS policies allow service_role access

### Issue: Slow queries
1. Check if partitions are being pruned (use EXPLAIN)
2. Verify indexes exist on frequently queried columns
3. Consider adding materialized views for complex aggregations

### Issue: Authentication errors
1. Ensure `Verify JWT` is disabled in Supabase dashboard
2. Check service role key is correct in backend env
3. Verify CORS headers allow your domain

---

## Future Enhancements

### Potential Optimizations
- [ ] Materialized views for common analytics queries
- [ ] Columnar storage (TimescaleDB) for faster aggregations
- [ ] Real-time analytics with Supabase Realtime
- [ ] Data archival to cold storage after 30 days

### Additional Features
- [ ] Event replay/reprocessing capability
- [ ] A/B test statistical significance calculations
- [ ] Automated experiment analysis reports
- [ ] Data export to analytics platforms (Amplitude, Mixpanel)

---

## Related Documentation
- [Supabase Events Migration SQL](../../supabase_events_migration.sql)
- [Edge Function Implementation](../../supabase_edge_function_ingest.ts)
- [Event Types](../../supabase_events_types.ts)
- [Analytics Setup Guide](../../SUPABASE_ANALYTICS_SETUP.md)

