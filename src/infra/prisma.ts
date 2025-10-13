import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Configure Prisma with connection pool limits for memory efficiency
// On Heroku basic/hobby dynos (512MB), we need to be conservative
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Optimize connection pool for limited memory environments
  // Each connection consumes ~10-20MB of memory
  // Default is 10 for production, we reduce to 5 for basic dynos
  ...(process.env.DATABASE_URL?.includes('connection_limit') ? {} : {
    datasourceUrl: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'connection_limit=5',
  }),
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
