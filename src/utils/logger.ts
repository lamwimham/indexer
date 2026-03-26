import pino from 'pino';
import type { Level } from 'pino';

/**
 * 创建结构化日志实例
 */
export function createLogger(level: Level = 'info', name = 'indexer') {
  const isDev = process.env.NODE_ENV !== 'production';

  return pino({
    name,
    level,
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/**
 * 创建带有额外上下文的子日志器
 */
export function createChildLogger(
  parent: pino.Logger,
  context: Record<string, unknown>
): pino.Logger {
  return parent.child(context);
}

/**
 * 日志器类型导出
 */
export type Logger = pino.Logger;