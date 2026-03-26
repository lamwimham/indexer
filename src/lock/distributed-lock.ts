import Redis from 'ioredis';
import type { Logger } from '../utils/logger.js';

/**
 * 分布式锁配置
 */
export interface LockConfig {
  redisUrl?: string;
  keyPrefix?: string;
  defaultTtl?: number;
  retryDelay?: number;
  maxRetries?: number;
}

/**
 * 锁选项
 */
export interface LockOptions {
  ttl?: number;
  retryDelay?: number;
  maxRetries?: number;
}

/**
 * 锁获取结果
 */
export interface LockResult {
  acquired: boolean;
  token?: string;
  release: () => Promise<void>;
}

/**
 * 基于 Redis 的分布式锁实现
 */
export class DistributedLock {
  private redis: Redis | null = null;
  private keyPrefix: string;
  private defaultTtl: number;
  private retryDelay: number;
  private maxRetries: number;
  private logger: Logger;
  private enabled: boolean;

  constructor(config: LockConfig, logger: Logger) {
    this.keyPrefix = config.keyPrefix ?? 'indexer:lock:';
    this.defaultTtl = config.defaultTtl ?? 30000; // 30 秒
    this.retryDelay = config.retryDelay ?? 100;
    this.maxRetries = config.maxRetries ?? 50;
    this.logger = logger.child({ component: 'distributed-lock' });
    this.enabled = !!config.redisUrl;

    if (this.enabled && config.redisUrl) {
      this.redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });

      this.redis.on('connect', () => {
        this.logger.info('Redis connected for distributed locking');
      });

      this.redis.on('error', (error) => {
        this.logger.error({ error }, 'Redis connection error');
      });
    } else {
      this.logger.warn('Redis URL not configured, distributed locking disabled');
    }
  }

  /**
   * 检查分布式锁是否启用
   */
  isEnabled(): boolean {
    return this.enabled && this.redis !== null;
  }

  /**
   * 获取锁
   */
  async acquire(key: string, options?: LockOptions): Promise<LockResult> {
    const lockKey = `${this.keyPrefix}${key}`;
    const token = this.generateToken();
    const ttl = options?.ttl ?? this.defaultTtl;

    // 如果 Redis 不可用，返回一个空操作锁
    if (!this.isEnabled() || !this.redis) {
      this.logger.trace({ key }, 'Distributed locking disabled, returning no-op lock');
      return {
        acquired: true,
        token,
        release: async () => {},
      };
    }

    const retryDelay = options?.retryDelay ?? this.retryDelay;
    const maxRetries = options?.maxRetries ?? this.maxRetries;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.redis!.set(lockKey, token, 'PX', ttl, 'NX');

        if (result === 'OK') {
          this.logger.trace({ key, token, ttl }, 'Lock acquired');
          return {
            acquired: true,
            token,
            release: () => this.release(key, token),
          };
        }

        // 锁未获取成功，等待后重试
        if (attempt < maxRetries - 1) {
          await this.sleep(retryDelay);
        }
      } catch (error) {
        this.logger.error({ error, key }, 'Error acquiring lock');
        // 出错时，返回锁未获取成功
        return {
          acquired: false,
          release: async () => {},
        };
      }
    }

    this.logger.debug({ key, attempts: maxRetries }, 'Failed to acquire lock after retries');
    return {
      acquired: false,
      release: async () => {},
    };
  }

  /**
   * 释放锁
   */
  private async release(key: string, token: string): Promise<void> {
    if (!this.isEnabled() || !this.redis) {
      return;
    }

    const lockKey = `${this.keyPrefix}${key}`;

    try {
      // 使用 Lua 脚本确保只释放自己持有的锁
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, lockKey, token);

      if (result === 1) {
        this.logger.trace({ key, token }, 'Lock released');
      } else {
        this.logger.warn({ key, token }, 'Lock was already released or expired');
      }
    } catch (error) {
      this.logger.error({ error, key }, 'Error releasing lock');
    }
  }

  /**
   * 延长锁的 TTL
   */
  async extend(key: string, token: string, ttl?: number): Promise<boolean> {
    if (!this.isEnabled() || !this.redis) {
      return true;
    }

    const lockKey = `${this.keyPrefix}${key}`;
    const newTtl = ttl ?? this.defaultTtl;

    try {
      // 使用 Lua 脚本确保只延长自己持有的锁
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, lockKey, token, newTtl);
      return result === 1;
    } catch (error) {
      this.logger.error({ error, key }, 'Error extending lock');
      return false;
    }
  }

  /**
   * 检查锁是否被持有
   */
  async isLocked(key: string): Promise<boolean> {
    if (!this.isEnabled() || !this.redis) {
      return false;
    }

    const lockKey = `${this.keyPrefix}${key}`;
    const result = await this.redis.exists(lockKey);
    return result === 1;
  }

  /**
   * 在持有锁的情况下执行函数
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T | null> {
    const lock = await this.acquire(key, options);

    if (!lock.acquired) {
      this.logger.debug({ key }, 'Could not acquire lock, skipping execution');
      return null;
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /**
   * 为此锁实例生成唯一令牌
   */
  private generateToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 睡眠辅助函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 断开与 Redis 的连接
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }
}

/**
 * 创建分布式锁实例
 */
export function createDistributedLock(
  config: LockConfig,
  logger: Logger
): DistributedLock {
  return new DistributedLock(config, logger);
}