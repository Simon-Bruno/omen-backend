import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Configure Prisma with connection pool limits for memory efficiency
// On Heroku basic/hobby dynos (512MB), we need to be conservative
// Each connection consumes ~10-20MB of memory
// Optimized for 512MB dyno: 3 connections = ~30-60MB
const databaseUrl = process.env.DATABASE_URL || '';

// Build optimized connection string with all necessary parameters
const buildOptimizedUrl = (url: string): string => {
  const separator = url.includes('?') ? '&' : '?';
  const params = new URLSearchParams();

  // Only add if not already present in URL
  if (!url.includes('connection_limit')) params.append('connection_limit', '3');
  if (!url.includes('pool_timeout')) params.append('pool_timeout', '10');
  if (!url.includes('statement_timeout')) params.append('statement_timeout', '30000');
  if (!url.includes('idle_in_transaction_session_timeout')) params.append('idle_in_transaction_session_timeout', '30000');

  return params.toString() ? `${url}${separator}${params.toString()}` : url;
};

const urlWithOptimizations = buildOptimizedUrl(databaseUrl);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: urlWithOptimizations,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Add cleanup on SIGTERM for graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
});
