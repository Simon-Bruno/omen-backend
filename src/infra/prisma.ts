import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Configure Prisma with connection pool limits for memory efficiency
// On Heroku basic/hobby dynos (512MB), we need to be conservative
// Each connection consumes ~10-20MB of memory
// Default is 10 for production, we reduce to 5 for basic dynos
const databaseUrl = process.env.DATABASE_URL || '';
const urlWithConnectionLimit = databaseUrl.includes('connection_limit') 
  ? databaseUrl 
  : databaseUrl + (databaseUrl.includes('?') ? '&' : '?') + 'connection_limit=5';

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: urlWithConnectionLimit,
    },
  },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
