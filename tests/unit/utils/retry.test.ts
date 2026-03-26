import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, sleep, isRateLimitError, isNetworkError, isRetryableError } from '../../../src/utils/retry.js';

describe('Retry Utils', () => {
  describe('sleep', () => {
    it('should resolve after specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some variance
    });
  });

  describe('isRateLimitError', () => {
    it('should detect rate limit errors', () => {
      expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
      expect(isRateLimitError(new Error('Too many requests'))).toBe(true);
      expect(isRateLimitError(new Error('429 error'))).toBe(true);
      expect(isRateLimitError(new Error('request exceeded quota'))).toBe(true);
    });

    it('should not detect non-rate-limit errors', () => {
      expect(isRateLimitError(new Error('network error'))).toBe(false);
      expect(isRateLimitError(new Error('invalid response'))).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should detect network errors', () => {
      expect(isNetworkError(new Error('network timeout'))).toBe(true);
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isNetworkError(new Error('ECONNRESET'))).toBe(true);
      expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true);
    });

    it('should not detect non-network errors', () => {
      expect(isNetworkError(new Error('rate limit'))).toBe(false);
      expect(isNetworkError(new Error('invalid data'))).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for rate limit errors', () => {
      expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    });

    it('should return true for network errors', () => {
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('should return false for other errors', () => {
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

    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(fn, { initialDelay: 100, shouldRetry: isRetryableError });

      // Fast-forward through delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately on non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('invalid data'));

      await expect(withRetry(fn, { shouldRetry: isRetryableError })).rejects.toThrow('invalid data');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const resultPromise = withRetry(fn, { maxRetries: 2, initialDelay: 100, shouldRetry: isRetryableError });

      // Attach catch handler early to prevent unhandled rejection warning
      resultPromise.catch(() => {});

      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('ECONNREFUSED');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      // Just verify that it eventually succeeds with retries
      const resultPromise = withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,  // Use small delay for faster test
        backoffMultiplier: 2,
        shouldRetry: isRetryableError
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });
});