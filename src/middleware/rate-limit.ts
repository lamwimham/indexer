import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Logger } from '../utils/logger.js';

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  enabled: boolean;
  max: number;
  timeWindow: string;
  whitelist: string[];
  skipOnError: boolean;
}

/**
 * 默认速率限制配置
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  enabled: true,
  max: 100,
  timeWindow: '1 minute',
  whitelist: [],
  skipOnError: true,
};

/**
 * 注册速率限制插件
 */
export async function registerRateLimit(
  fastify: FastifyInstance,
  config: Partial<RateLimitConfig> = {},
  logger: Logger
): Promise<void> {
  const finalConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    logger.info('Rate limiting disabled');
    return;
  }

  await fastify.register(rateLimit, {
    max: finalConfig.max,
    timeWindow: finalConfig.timeWindow,
    skipOnError: finalConfig.skipOnError,
    allowList: (req) => {
      // 白名单特定 IP
      const ip = req.ip;
      return finalConfig.whitelist.includes(ip);
    },
    keyGenerator: (req) => {
      // 如果存在 API 密钥则使用，否则使用 IP
      const apiKey = req.headers['x-api-key'];
      if (typeof apiKey === 'string') {
        return `apikey:${apiKey}`;
      }
      return req.ip;
    },
    errorResponseBuilder: (req, context) => {
      logger.warn({ ip: req.ip, url: req.url }, 'Rate limit exceeded');
      return {
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: context.ttl,
      };
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  logger.info({ max: finalConfig.max, window: finalConfig.timeWindow }, 'Rate limiting enabled');
}

/**
 * 敏感端点的更严格速率限制
 */
export async function registerStrictRateLimit(
  fastify: FastifyInstance,
  logger: Logger
): Promise<void> {
  await fastify.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
    skipOnError: true,
    errorResponseBuilder: (req, context) => {
      logger.warn({ ip: req.ip, url: req.url }, 'Strict rate limit exceeded');
      return {
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded for sensitive endpoint. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: context.ttl,
      };
    },
  });
}