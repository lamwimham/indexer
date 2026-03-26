import { PrismaClient } from '@prisma/client';
import type { Logger } from '../utils/logger.js';

/**
 * 数据库客户端单例
 */
let prisma: PrismaClient | undefined;

/**
 * 获取或创建 Prisma 客户端
 */
export function getDb(logger?: Logger): PrismaClient {
  if (prisma) {
    return prisma;
  }

  prisma = new PrismaClient();

  // 在开发环境下记录查询日志
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
 * 断开数据库连接
 */
export async function disconnectDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

/**
 * 数据库连接健康检查
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