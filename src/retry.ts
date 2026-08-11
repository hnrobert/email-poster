import type { RetryConfig } from './config'

export type RetryableFailure =
  | { kind: 'status'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network' }

/** Timeouts and network errors are always retryable; HTTP statuses only if listed. */
export function isRetryableFailure(f: RetryableFailure, cfg: RetryConfig): boolean {
  if (f.kind === 'status') return cfg.codes.includes(f.status)
  return true
}

/**
 * Full-jitter exponential backoff for the wait BEFORE attempt `attempt + 1`.
 * `attempt` is 1-based (the attempt that just failed).
 */
export function computeBackoff(attempt: number, cfg: RetryConfig): number {
  const expo = cfg.baseDelayMs * 2 ** (attempt - 1)
  const capped = Math.min(expo, cfg.maxDelayMs)
  return Math.floor(Math.random() * (capped + 1))
}
