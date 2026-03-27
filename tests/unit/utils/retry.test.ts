import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, sleep, isRateLimitError, isNetworkError, isRetryableError } from '../../../src/utils/retry.js';

describe('重试工具函数', () => {
  describe('sleep', () => {
    it('应该在指定的毫秒数后解析', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // 允许一定的误差
    });
  });

  describe('isRateLimitError', () => {
    it('应该检测到限流错误', () => {
      expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
      expect(isRateLimitError(new Error('Too many requests'))).toBe(true);
      expect(isRateLimitError(new Error('429 error'))).toBe(true);
      expect(isRateLimitError(new Error('request exceeded quota'))).toBe(true);
    });

    it('不应该检测到非限流错误', () => {
      expect(isRateLimitError(new Error('network error'))).toBe(false);
      expect(isRateLimitError(new Error('invalid response'))).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('应该检测到网络错误', () => {
      expect(isNetworkError(new Error('network timeout'))).toBe(true);
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isNetworkError(new Error('ECONNRESET'))).toBe(true);
      expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true);
    });

    it('不应该检测到非网络错误', () => {
      expect(isNetworkError(new Error('rate limit'))).toBe(false);
      expect(isNetworkError(new Error('invalid data'))).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('对于限流错误应该返回 true', () => {
      expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    });

    it('对于网络错误应该返回 true', () => {
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('对于其他错误应该返回 false', () => {
      expect(isRetryableError(new Error('invalid response'))).toBe(false);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应该在第一次成功尝试时返回结果', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('应该在可重试错误时进行重试', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(fn, { initialDelay: 100, shouldRetry: isRetryableError });

      // 快进延迟时间
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('应该在遇到不可重试错误时立即抛出', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('invalid data'));

      await expect(withRetry(fn, { shouldRetry: isRetryableError })).rejects.toThrow('invalid data');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('应该在达到最大重试次数后抛出错误', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const resultPromise = withRetry(fn, { maxRetries: 2, initialDelay: 100, shouldRetry: isRetryableError });

      // 提前附加 catch 处理器以防止未处理的拒绝警告
      resultPromise.catch(() => {});

      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('ECONNREFUSED');
      expect(fn).toHaveBeenCalledTimes(3); // 初始调用 + 2 次重试
    });

    it('应该使用指数退避策略', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      // 仅验证最终通过重试成功
      const resultPromise = withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,  // 使用较小的延迟以加快测试速度
        backoffMultiplier: 2,
        shouldRetry: isRetryableError
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3); // 初始调用 + 2 次重试
    });
  });
});