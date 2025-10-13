# Analytics Scalability Plan

## Problem
- **Current**: 32k events causing 619MB memory usage → OOM crash
- **Goal**: Scale to millions of events without memory issues

## Root Causes
1. ❌ Loading entire datasets into memory
2. ❌ Logging massive arrays (32k+ items)
3. ❌ JSONB field extraction without proper indexes
4. ❌ No aggregation pre-computation

## Solutions (Priority Order)

### ✅ PHASE 1: Immediate Fixes (DONE)
- [x] Use database-level aggregation with CTEs
- [x] Remove excessive logging
- [x] Single efficient SQL query instead of loading all events

**Impact**: Reduced memory from 619MB to ~100MB

---

### 🔧 PHASE 2: Database Optimizations (CRITICAL)

#### 2.1 Add JSONB Indexes for `variantKey`

**Why**: JSONB field extraction `properties->>'variantKey'` is slow without indexes

**Migration**:
```sql
-- Create functional index on variantKey extraction
CREATE INDEX CONCURRENTLY idx_analytics_events_variant_key 
ON analytics_events ((properties->>'variantKey'))
WHERE event_type = 'EXPOSURE';

-- Create GIN index for general JSONB queries
CREATE INDEX CONCURRENTLY idx_analytics_events_properties_gin 
ON analytics_events USING GIN (properties);

-- Create composite index for funnel queries
CREATE INDEX CONCURRENTLY idx_analytics_events_funnel 
ON analytics_events (project_id, experiment_id, event_type, session_id)
WHERE event_type IN ('PAGEVIEW', 'EXPOSURE', 'CONVERSION');
```

**Expected Impact**: 10-50x faster query performance

---

#### 2.2 Extract `variantKey` to Dedicated Column (RECOMMENDED)

**Why**: Querying JSONB is always slower than native columns

**Schema Change**:
```prisma
model AnalyticsEvent {
  id           String    @id @default(cuid())
  projectId    String
  experimentId String?
  eventType    EventType @default(EXPOSURE)
  sessionId    String
  viewId       String?
  variantKey   String?   // ← NEW: Extracted from properties
  properties   Json
  timestamp    BigInt
  createdAt    DateTime  @default(now())

  // Relations
  project    Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  experiment Experiment? @relation(fields: [experimentId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([projectId, eventType])
  @@index([eventType, timestamp])
  @@index([sessionId])
  @@index([experimentId])
  @@index([sessionId, eventType])
  @@index([experimentId, variantKey, eventType]) // ← NEW: For fast variant analytics
  @@map("analytics_events")
}
```

**Migration**:
```sql
-- 1. Add column
ALTER TABLE analytics_events ADD COLUMN variant_key TEXT;

-- 2. Backfill existing data (do in batches)
UPDATE analytics_events 
SET variant_key = properties->>'variantKey'
WHERE event_type = 'EXPOSURE' AND properties ? 'variantKey';

-- 3. Create indexes
CREATE INDEX CONCURRENTLY idx_analytics_events_experiment_variant 
ON analytics_events (experiment_id, variant_key, event_type)
WHERE variant_key IS NOT NULL;
```

**Updated Query** (simpler & faster):
```typescript
const variantStats = await this.prisma.$queryRaw`
  WITH exposure_variants AS (
    SELECT DISTINCT session_id, variant_key
    FROM analytics_events
    WHERE project_id = ${projectId}
      AND experiment_id = ${experimentId}
      AND event_type = 'EXPOSURE'
      AND variant_key IS NOT NULL
  )
  SELECT 
    ev.variant_key,
    ae.event_type,
    COUNT(DISTINCT ae.session_id)::bigint as unique_sessions
  FROM exposure_variants ev
  INNER JOIN analytics_events ae ON ae.session_id = ev.session_id
  WHERE ae.project_id = ${projectId}
    AND ae.event_type IN ('PAGEVIEW', 'EXPOSURE', 'CONVERSION')
  GROUP BY ev.variant_key, ae.event_type
`;
```

**Expected Impact**: 2-5x faster queries, cleaner code

---

### 🚀 PHASE 3: Pre-Aggregated Analytics Tables (SCALABLE)

**Why**: Real-time aggregation doesn't scale to millions of events

**Architecture**: Use **materialized views** or **rollup tables**

#### Option A: Materialized Views (Simple)

```sql
-- Create materialized view for experiment analytics
CREATE MATERIALIZED VIEW experiment_variant_stats AS
SELECT 
  experiment_id,
  variant_key,
  event_type,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(*) as total_events,
  DATE_TRUNC('hour', TIMESTAMP 'epoch' + timestamp * INTERVAL '1 second') as hour_bucket
FROM analytics_events
WHERE experiment_id IS NOT NULL
  AND variant_key IS NOT NULL
GROUP BY experiment_id, variant_key, event_type, hour_bucket;

-- Create index on the view
CREATE INDEX ON experiment_variant_stats (experiment_id, variant_key);

-- Refresh periodically (every 5 minutes)
REFRESH MATERIALIZED VIEW CONCURRENTLY experiment_variant_stats;
```

**Query becomes**:
```typescript
const variantStats = await this.prisma.$queryRaw`
  SELECT 
    variant_key,
    event_type,
    SUM(unique_sessions)::bigint as unique_sessions
  FROM experiment_variant_stats
  WHERE experiment_id = ${experimentId}
  GROUP BY variant_key, event_type
`;
```

**Expected Impact**: 100-1000x faster, handles billions of events

---

#### Option B: Dedicated Rollup Tables (More Control)

**Schema**:
```prisma
model ExperimentAnalyticsSummary {
  id                String   @id @default(cuid())
  experimentId      String
  variantKey        String
  date              DateTime @db.Date
  hour              Int      // 0-23
  pageviewSessions  Int      @default(0)
  exposureSessions  Int      @default(0)
  conversionSessions Int     @default(0)
  totalPageviews    Int      @default(0)
  totalExposures    Int      @default(0)
  totalConversions  Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([experimentId, variantKey, date, hour])
  @@index([experimentId, variantKey])
  @@map("experiment_analytics_summary")
}
```

**Background Job** (runs every hour):
```typescript
// Aggregate last hour's events into summary table
await prisma.$executeRaw`
  INSERT INTO experiment_analytics_summary (
    experiment_id, variant_key, date, hour,
    pageview_sessions, exposure_sessions, conversion_sessions,
    total_pageviews, total_exposures, total_conversions
  )
  SELECT 
    experiment_id,
    variant_key,
    DATE(TIMESTAMP 'epoch' + timestamp * INTERVAL '1 second') as date,
    EXTRACT(HOUR FROM TIMESTAMP 'epoch' + timestamp * INTERVAL '1 second')::int as hour,
    COUNT(DISTINCT CASE WHEN event_type = 'PAGEVIEW' THEN session_id END) as pageview_sessions,
    COUNT(DISTINCT CASE WHEN event_type = 'EXPOSURE' THEN session_id END) as exposure_sessions,
    COUNT(DISTINCT CASE WHEN event_type = 'CONVERSION' THEN session_id END) as conversion_sessions,
    COUNT(CASE WHEN event_type = 'PAGEVIEW' THEN 1 END) as total_pageviews,
    COUNT(CASE WHEN event_type = 'EXPOSURE' THEN 1 END) as total_exposures,
    COUNT(CASE WHEN event_type = 'CONVERSION' THEN 1 END) as total_conversions
  FROM analytics_events
  WHERE timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '1 hour')
    AND experiment_id IS NOT NULL
    AND variant_key IS NOT NULL
  GROUP BY experiment_id, variant_key, date, hour
  ON CONFLICT (experiment_id, variant_key, date, hour)
  DO UPDATE SET
    pageview_sessions = EXCLUDED.pageview_sessions,
    exposure_sessions = EXCLUDED.exposure_sessions,
    conversion_sessions = EXCLUDED.conversion_sessions,
    total_pageviews = EXCLUDED.total_pageviews,
    total_exposures = EXCLUDED.total_exposures,
    total_conversions = EXCLUDED.total_conversions,
    updated_at = NOW()
`;
```

**Query becomes trivial**:
```typescript
const variantStats = await prisma.experimentAnalyticsSummary.groupBy({
  by: ['variantKey'],
  where: { experimentId },
  _sum: {
    pageviewSessions: true,
    exposureSessions: true,
    conversionSessions: true,
  },
});
```

**Expected Impact**: 
- Instant queries (no aggregation)
- Scales to billions of events
- 1-hour data freshness delay

---

### 📊 PHASE 4: Time-Series Partitioning (ENTERPRISE SCALE)

**Why**: For 10M+ events/day, partition by time for better performance

```sql
-- Convert to partitioned table
CREATE TABLE analytics_events_partitioned (
  LIKE analytics_events INCLUDING ALL
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE analytics_events_2024_10 
PARTITION OF analytics_events_partitioned
FOR VALUES FROM (EXTRACT(EPOCH FROM '2024-10-01'::timestamp)::bigint) 
TO (EXTRACT(EPOCH FROM '2024-11-01'::timestamp)::bigint);

-- Automatically create future partitions
CREATE EXTENSION IF NOT EXISTS pg_partman;
```

---

## Recommendation

### **Start with Phase 2.2 (Extract variantKey)**
- ✅ Immediate 2-5x performance improvement
- ✅ Simple migration, backward compatible
- ✅ Sets foundation for future scaling
- ✅ No architecture changes needed

### **Then add Phase 3.B (Rollup Tables)** when:
- You have > 1M events total
- Queries take > 2 seconds
- You can tolerate 1-hour delay

### **Consider Phase 4** when:
- You have > 10M events/month
- Storage costs become significant
- You need historical data retention policies

---

## Migration Priority

1. **NOW**: Extract `variantKey` to column (Phase 2.2)
2. **Week 1**: Add JSONB indexes (Phase 2.1)
3. **Month 1**: Implement rollup tables (Phase 3.B)
4. **Month 3**: Add partitioning if needed (Phase 4)

---

## Performance Targets

| Metric | Current | After Phase 2 | After Phase 3 |
|--------|---------|---------------|---------------|
| Query Time | 7-26s | <2s | <100ms |
| Memory Usage | 619MB | <100MB | <50MB |
| Max Events | 100k | 1M | 1B |
| Data Delay | Real-time | Real-time | 1 hour |

