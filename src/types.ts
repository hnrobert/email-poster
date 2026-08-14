/** Shared public types. Kept dependency-free to avoid import cycles. */

export interface SendOptions {
  /** Abort the in-flight request. Composed with the internal timeout signal. */
  signal?: AbortSignal
  /** Override `config.timeoutMs` for this single send. */
  timeoutMs?: number
  /**
   * Notified after every HTTP attempt — the successful attempt and each failed
   * retry. Useful for verbose/debug logging of the retry journey. Never throws.
   */
  onAttempt?: (info: AttemptInfo) => void
}

/**
 * Snapshot of a single HTTP attempt within the retry loop, passed to
 * `SendOptions.onAttempt`. `ok` attempts terminate the send; `retryable`
 * attempts are followed by a `backoffMs` wait and another attempt.
 */
export interface AttemptInfo {
  /** 1-based attempt number within the retry sequence. */
  attempt: number
  /** Maximum attempts configured for this send. */
  maxAttempts: number
  /** True if this attempt succeeded (status in the success range). */
  ok: boolean
  /** True if another attempt will follow this one. */
  retryable: boolean
  /** HTTP status code returned, if a response was received. */
  status?: number
  /** Backoff in ms before the next attempt (present iff `retryable`). */
  backoffMs?: number
  /** Classification of a non-success attempt. */
  errorKind?: 'status' | 'timeout' | 'network' | 'aborted'
  /** Short human description (e.g. "Webhook returned 503"). */
  message?: string
  /** Request id echoed from response headers, if any. */
  requestId?: string
}

export interface SendResult {
  /** Best-effort message id: parsed from the downstream response, else synthesized. */
  messageId: string
  /** HTTP status returned by the downstream webhook. */
  status: number
  /** The raw fetch Response (body already consumed for messageId parsing if enabled). */
  response: Response
  /** Request id echoed from response headers (request-id / x-request-id), if any. */
  requestId?: string
}
