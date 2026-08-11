/** Shared public types. Kept dependency-free to avoid import cycles. */

export interface SendOptions {
  /** Abort the in-flight request. Composed with the internal timeout signal. */
  signal?: AbortSignal
  /** Override `config.timeoutMs` for this single send. */
  timeoutMs?: number
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
