import { PrismaClient } from '@prisma/client';
import type { Logger } from '../utils/logger.js';

/**
 * Database client singleton
 */
let prisma: PrismaClient | undefined;

/**
 * Get or create Prisma client
 */
export function getDb(logger?: Logger): PrismaClient {
  if (prisma) {
    return prisma;
  }

  prisma = new PrismaClient();

  // Log queries in development
  if (logger && process.env.NODE_ENV === 'development') {
    prisma.$on('query' as never, (e: never) => {
      const queryEvent = e as { query: string; duration: number };
      logger.trace({ query: queryEvent.query, duration: queryEvent.duration }, 'Query');
    });
    prisma.$on('error' as never, (e: never) => {
      const errorEvent = e as { message: string };
      logger.error({ error: errorEvent.message }, 'Prisma error');
    });
    prisma.$on('warn' as never, (e: never) => {
      const warnEvent = e as { message: string };
      logger.warn({ message: warnEvent.message }, 'Prisma warning');
    });
  }

  return prisma;
}

/**
 * Disconnect from database
 */
export async function disconnectDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

/**
 * Health check for database connection
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const db = getDb();
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}