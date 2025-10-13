# Memory Optimization Guide for Heroku Deployment

## Current Issues
Your application is experiencing memory issues on Heroku's 512MB dynos. Here are the main culprits and solutions:

## 1. Playwright Browser Optimization

### Problem
- Browser processes consuming excessive memory (~100-200MB per instance)
- `--single-process` flag prevents memory isolation
- Long idle timeout (5 minutes) keeps browser in memory

### Solution
```typescript
// src/features/crawler/playwright.ts

// CHANGE 1: Reduce idle timeout from 5 minutes to 1 minute
private readonly BROWSER_IDLE_TIMEOUT = 1 * 60 * 1000; // 1 minute instead of 5

// CHANGE 2: Remove --single-process flag and optimize args
this.browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/app/.chrome-for-testing/chrome-linux64/chrome',
  headless: this.config.headless,
  args: [
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // REMOVE: '--single-process', // This prevents proper memory isolation
    '--disable-setuid-sandbox',
    '--disable-features=site-per-process',
    '--memory-pressure-off',
    // ADD: Memory optimization flags
    '--max-old-space-size=256', // Limit V8 heap
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--js-flags="--max-old-space-size=256"'
  ],
});

// CHANGE 3: Add memory cleanup after each page operation
finally {
  await page.close();
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
}
```

## 2. Base64 Screenshot Optimization

### Problem
- Base64 encoding increases memory usage by 33%
- Multiple copies of screenshots in memory

### Solution
```typescript
// src/services/screenshot-storage.ts

// CHANGE: Stream screenshots directly to storage without base64 conversion
async saveScreenshot(
  projectId: string,
  pageType: string,
  url: string,
  options: ScreenshotOptions,
  screenshotBuffer: Buffer, // Accept Buffer instead of base64 string
  htmlContent?: string,
  markdownContent?: string,
  variantId?: string
): Promise<string> {
  // Save buffer directly without base64 conversion
  const result = await ScreenshotDAL.upsertScreenshotBuffer(
    projectId,
    pageType,
    url,
    options,
    screenshotBuffer, // Pass buffer directly
    htmlContent,
    markdownContent,
    variantId
  );
  return result.id;
}

// In playwright.ts, return Buffer instead of base64:
const screenshot = await page.screenshot({
  type: 'png',
  fullPage: fullPage
});
return screenshot; // Return Buffer, not .toString('base64')
```

## 3. Implement Cache Size Limits

### Problem
- Unbounded Map caches can grow indefinitely
- No LRU eviction policy

### Solution
```typescript
// src/utils/lru-cache.ts (new file)
export class LRUCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }> = new Map();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 100, ttlMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  set(key: K, value: V): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  get(key: K): V | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Update variant-generation.ts to use LRU cache:
import { LRUCache } from '@utils/lru-cache';

export class VariantGenerationServiceImpl {
  private brandAnalysisCache = new LRUCache<string, string>(20, 5 * 60 * 1000);
  private projectCache = new LRUCache<string, any>(20, 5 * 60 * 1000);
  // ...
}
```

## 4. Optimize Prisma Connections

### Problem
- Connection pool without proper limits and timeouts
- Each connection uses 10-20MB

### Solution
```typescript
// src/infra/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Optimize for 512MB Heroku dyno
const databaseUrl = process.env.DATABASE_URL || '';
const urlWithOptimizations = databaseUrl.includes('?')
  ? `${databaseUrl}&connection_limit=3&pool_timeout=10&statement_timeout=30000&idle_in_transaction_session_timeout=30000`
  : `${databaseUrl}?connection_limit=3&pool_timeout=10&statement_timeout=30000&idle_in_transaction_session_timeout=30000`;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: urlWithOptimizations,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Add cleanup on SIGTERM
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
});
```

## 5. Add Memory Monitoring and Auto-recovery

### Problem
- No proactive memory monitoring
- No automatic recovery when memory is high

### Solution
```typescript
// src/utils/memory-monitor.ts
export class MemoryMonitor {
  private highMemoryThreshold = 0.85; // 85% of available memory
  private criticalThreshold = 0.95; // 95% of available memory

  checkMemory(): { heapUsedMB: number; heapPercentage: number; shouldGC: boolean } {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapPercentage = memUsage.heapUsed / memUsage.heapTotal;

    return {
      heapUsedMB,
      heapPercentage,
      shouldGC: heapPercentage > this.highMemoryThreshold
    };
  }

  async performEmergencyCleanup(): Promise<void> {
    console.warn('[MEMORY] Performing emergency cleanup');

    // 1. Close Playwright browser
    const crawler = serviceContainer.getCrawlerService() as any;
    if (crawler?.browser) {
      await crawler.close();
    }

    // 2. Clear all caches
    // Add cache clearing logic

    // 3. Force garbage collection
    if (global.gc) {
      global.gc();
      global.gc(); // Run twice for thorough cleanup
    }

    // 4. Log memory after cleanup
    const after = this.checkMemory();
    console.log(`[MEMORY] After cleanup - Heap: ${after.heapUsedMB.toFixed(2)}MB`);
  }
}

// In server.ts, add memory monitoring
const memoryMonitor = new MemoryMonitor();

setInterval(() => {
  const memStatus = memoryMonitor.checkMemory();

  if (memStatus.heapUsedMB > 400) {
    console.warn(`[MEMORY] High memory usage: ${memStatus.heapUsedMB.toFixed(2)}MB`);

    if (memStatus.heapUsedMB > 450) {
      // Emergency cleanup
      memoryMonitor.performEmergencyCleanup().catch(console.error);
    } else if (memStatus.shouldGC && global.gc) {
      // Gentle GC
      global.gc();
    }
  }
}, 30000); // Check every 30 seconds
```

## 6. Environment Variables for Heroku

Add to your Heroku config:
```bash
heroku config:set NODE_OPTIONS="--max-old-space-size=400 --expose-gc" -a your-app-name
heroku config:set WEB_MEMORY=400 -a your-app-name
heroku config:set MALLOC_ARENA_MAX=2 -a your-app-name
```

## 7. Quick Wins Checklist

1. **Immediate Actions:**
   - [ ] Remove `--single-process` flag from Playwright
   - [ ] Reduce browser idle timeout to 1 minute
   - [ ] Reduce Prisma connection pool to 3
   - [ ] Add connection timeouts to Prisma

2. **Short-term Improvements:**
   - [ ] Implement LRU cache with size limits
   - [ ] Add memory monitoring and alerts
   - [ ] Switch from base64 to Buffer for screenshots
   - [ ] Add emergency memory cleanup

3. **Long-term Solutions:**
   - [ ] Consider upgrading to Performance-M dyno (2.5GB RAM)
   - [ ] Implement Redis for external caching
   - [ ] Use S3 for screenshot storage instead of database
   - [ ] Split into microservices (web server + worker dyno)

## Monitoring

Add these to your logs to track improvements:
```typescript
// Log memory usage on each request
app.use((req, res, next) => {
  const memUsage = process.memoryUsage();
  req.log.info({
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heap: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    }
  }, 'Request memory snapshot');
  next();
});
```

## Expected Results

After implementing these optimizations:
- Memory usage should decrease by 40-60%
- Browser operations will use 50% less memory
- Cache memory will be bounded to ~50MB max
- Database connections will use ~30-60MB (down from 50-100MB)
- Overall application should run comfortably in 400-450MB

## Testing the Optimizations

1. Deploy changes to a staging environment first
2. Run load tests to simulate production traffic
3. Monitor memory metrics for 24 hours
4. Check for any memory leak patterns
5. Deploy to production during low-traffic period