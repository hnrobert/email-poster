/**
 * Error model for email-poster. All failures thrown by the library are
 * `EmailPosterError` instances carrying a stable `code` for programmatic
 * handling, plus optional `status` / `detail` / `requestId`.
 */

export enum ErrorCode {
  /** The EmailPosterConfig failed Zod validation. */
  CONFIG_INVALID = 'CONFIG_INVALID',
  /** A SendMailInput failed schema or semantic validation. */
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  /** The downstream webhook returned a non-success status. */
  REQUEST_FAILED = 'REQUEST_FAILED',
  /** The request exceeded its timeout. */
  TIMEOUT = 'TIMEOUT',
  /** The caller aborted the request via AbortSignal. */
  ABORTED = 'ABORTED',
  /** All retry attempts were exhausted without success. */
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  /** The configured postUrl was rejected by the (opt-in) URL guard. */
  URL_BLOCKED = 'URL_BLOCKED',
  /** The downstream response body could not be parsed when parsing was expected. */
  PARSE_FAILED = 'PARSE_FAILED',
}

export interface EmailPosterErrorInit {
  code: ErrorCode
  status?: number
  detail?: string
  requestId?: string
  cause?: unknown
}

export class EmailPosterError extends Error {
  readonly code: ErrorCode
  readonly status?: number
  readonly detail?: string
  readonly requestId?: string

  constructor(message: string, init: EmailPosterErrorInit) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined)
    this.name = 'EmailPosterError'
    this.code = init.code
    this.status = init.status
    this.detail = init.detail
    this.requestId = init.requestId
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      ...(this.status !== undefined ? { status: this.status } : {}),
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
      ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
    }
  }
}

export function isEmailPosterError(e: unknown): e is EmailPosterError {
  return e instanceof EmailPosterError
}
