import { describe, it, expect } from 'vitest'
import { computeBackoff, isRetryableFailure } from '../../src/retry'
import type { RetryConfig } from '../../src/config'

const cfg: RetryConfig = { codes: [503, 502], maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000 }

describe('isRetryableFailure', () => {
  it('status retryable iff listed', () => {
    expect(isRetryableFailure({ kind: 'status', status: 503 }, cfg)).toBe(true)
    expect(isRetryableFailure({ kind: 'status', status: 404 }, cfg)).toBe(false)
  })
  it('timeout and network always retryable', () => {
    expect(isRetryableFailure({ kind: 'timeout' }, cfg)).toBe(true)
    expect(isRetryableFailure({ kind: 'network' }, cfg)).toBe(true)
  })
})

describe('computeBackoff', () => {
  it('stays within [0, maxDelayMs]', () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      for (let i = 0; i < 20; i++) {
        const b = computeBackoff(attempt, cfg)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(cfg.maxDelayMs)
      }
    }
  })

  it('caps exponential growth', () => {
    const small: RetryConfig = { codes: [], maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 2_000 }
    expect(computeBackoff(10, small)).toBeLessThanOrEqual(2_000)
  })
})
