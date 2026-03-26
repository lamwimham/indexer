import Redis from 'ioredis';
import type { Logger } from '../utils/logger.js';

/**
 * Distributed lock configuration
 */
export interface LockConfig {
  redisUrl?: string;
  keyPrefix?: string;
  defaultTtl?: number;
  retryDelay?: number;
  maxRetries?: number;
}

/**
 * Lock options
 */
export interface LockOptions {
  ttl?: number;
  retryDelay?: number;
  maxRetries?: number;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
  acquired: boolean;
  token?: string;
  release: () => Promise<void>;
}

/**
 * Distributed lock implementation using Redis
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
    this.defaultTtl = config.defaultTtl ?? 30000; // 30 seconds
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
   * Check if distributed locking is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.redis !== null;
  }

  /**
   * Acquire a lock
   */
  async acquire(key: string, options?: LockOptions): Promise<LockResult> {
    const lockKey = `${this.keyPrefix}${key}`;
    const token = this.generateToken();
    const ttl = options?.ttl ?? this.defaultTtl;

    // If Redis is not available, return a no-op lock
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

        // Lock not acquired, wait and retry
        if (attempt < maxRetries - 1) {
          await this.sleep(retryDelay);
        }
      } catch (error) {
        this.logger.error({ error, key }, 'Error acquiring lock');
        // On error, return as if lock was not acquired
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
   * Release a lock
   */
  private async release(key: string, token: string): Promise<void> {
    if (!this.isEnabled() || !this.redis) {
      return;
    }

    const lockKey = `${this.keyPrefix}${key}`;

    try {
      // Use Lua script to ensure we only release our own lock
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
   * Extend a lock's TTL
   */
  async extend(key: string, token: string, ttl?: number): Promise<boolean> {
    if (!this.isEnabled() || !this.redis) {
      return true;
    }

    const lockKey = `${this.keyPrefix}${key}`;
    const newTtl = ttl ?? this.defaultTtl;

    try {
      // Use Lua script to ensure we only extend our own lock
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
   * Check if a lock is held
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
   * Execute a function with a lock
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
   * Generate a unique token for this lock instance
   */
  private generateToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }
}

/**
 * Create a distributed lock instance
 */
export function createDistributedLock(
  config: LockConfig,
  logger: Logger
): DistributedLock {
  return new DistributedLock(config, logger);
}