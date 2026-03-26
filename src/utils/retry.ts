import type { Logger } from './logger.js';

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟时间（毫秒） */
  initialDelay: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 退避乘数 */
  backoffMultiplier: number;
  /** 是否对特定错误进行重试 */
  shouldRetry?: (error: Error) => boolean;
  /** 用于记录重试消息的日志器 */
  logger?: Logger;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * 使用指数退避重试执行函数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 检查是否应该重试此错误
      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // 检查是否已耗尽重试次数
      if (attempt > opts.maxRetries) {
        opts.logger?.error({ error: lastError, attempts: attempt }, 'All retry attempts exhausted');
        throw lastError;
      }

      opts.logger?.warn(
        { error: lastError, attempt, nextDelay: delay },
        `Attempt ${attempt} failed, retrying in ${delay}ms`
      );

      // 等待后进行下一次尝试
      await sleep(delay);

      // 使用指数退避计算下一次延迟
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * 休眠指定时长
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 检查是否为速率限制错误
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    message.includes('exceeded')
  );
}

/**
 * 检查是否为网络错误
 */
export function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('enotfound')
  );
}

/**
 * 检查错误是否可重试
 */
export function isRetryableError(error: Error): boolean {
  return isRateLimitError(error) || isNetworkError(error);
}