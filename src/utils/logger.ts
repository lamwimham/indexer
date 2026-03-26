import pino from 'pino';
import type { Level } from 'pino';

/**
 * Create a structured logger instance
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
 * Create a child logger with additional context
 */
export function createChildLogger(
  parent: pino.Logger,
  context: Record<string, unknown>
): pino.Logger {
  return parent.child(context);
}

/**
 * Logger type export
 */
export type Logger = pino.Logger;