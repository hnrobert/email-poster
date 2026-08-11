import { composeSignals } from './abort'
import { computeBackoff, isRetryableFailure } from './retry'
import { EmailPosterError, ErrorCode } from './errors'
import type { RetryConfig } from './config'

export interface DoPostOptions {
  timeoutMs: number
  signal?: AbortSignal
  retry: RetryConfig
  successCodes?: number[]
  requestId?: string
}

export interface DoPostResult {
  response: Response
  status: number
  requestId: string
}

export function isSuccessStatus(status: number, successCodes?: number[]): boolean {
  if (successCodes && successCodes.length > 0) return successCodes.includes(status)
  return status >= 200 && status < 300
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.clone().text()).slice(0, 200)
  } catch {
    return ''
  }
}

/** Interruptible sleep. Rejects with an AbortError if `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortErrorFrom(signal))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortErrorFrom(signal!))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function abortErrorFrom(signal: AbortSignal): Error {
  const reason = (signal as { reason?: unknown }).reason
  const e = new Error(typeof reason === 'string' ? reason : 'The operation was aborted')
  e.name = 'AbortError'
  return e
}

/**
 * POST `payload` to `url` with timeout, retry, and abort support.
 * - External abort (caller signal) → ErrorCode.ABORTED, never retried.
 * - Internal timeout → ErrorCode.TIMEOUT, retried up to `retry.maxAttempts`.
 * - Retryable HTTP status → retried with full-jitter backoff.
 * - Exhaustion → ErrorCode.RETRY_EXHAUSTED.
 */
export async function doPost(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  opts: DoPostOptions,
): Promise<DoPostResult> {
  const body = JSON.stringify(payload)
  const maxAttempts = opts.retry.maxAttempts

  // Fail fast if the caller already aborted before the first attempt.
  if (opts.signal?.aborted) {
    throw new EmailPosterError('Request aborted by caller', { code: ErrorCode.ABORTED })
  }

  let attempt = 0
  let lastFailure:
    | {
        message: string
        code: ErrorCode
        status?: number
        detail?: string
        cause?: unknown
        requestId?: string
      }
    | undefined

  while (attempt < maxAttempts) {
    attempt++
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new Error('email-poster request timeout')),
      opts.timeoutMs,
    )
    const signal = composeSignals(opts.signal, controller.signal)

    let res: Response | undefined
    let fetchError: unknown
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        ...(signal ? { signal } : {}),
      })
    } catch (e) {
      fetchError = e
    } finally {
      clearTimeout(timer)
    }

    // External abort wins — never retry.
    if (opts.signal?.aborted) {
      throw new EmailPosterError('Request aborted by caller', {
        code: ErrorCode.ABORTED,
        cause: fetchError,
      })
    }

    const requestId =
      (res?.headers.get('request-id') ?? res?.headers.get('x-request-id')) ||
      opts.requestId ||
      ''

    if (res) {
      const status = res.status
      if (isSuccessStatus(status, opts.successCodes)) {
        return { response: res, status, requestId }
      }
      const retryable = isRetryableFailure({ kind: 'status', status }, opts.retry)
      if (!retryable) {
        const detail = await safeText(res)
        throw new EmailPosterError(`Webhook returned ${status}${detail ? ': ' + detail : ''}`, {
          code: ErrorCode.REQUEST_FAILED,
          status,
          detail: detail || undefined,
          requestId,
        })
      }
      lastFailure = {
        message: `Webhook returned ${status}`,
        code: ErrorCode.REQUEST_FAILED,
        status,
        requestId,
      }
    } else {
      const timedOut = controller.signal.aborted
      lastFailure = timedOut
        ? {
            message: `Request timed out after ${opts.timeoutMs}ms`,
            code: ErrorCode.TIMEOUT,
            cause: fetchError,
            requestId,
          }
        : {
            message: 'Network error during send',
            code: ErrorCode.REQUEST_FAILED,
            cause: fetchError,
            requestId,
          }
    }

    // Backoff before the next attempt (interruptible by the external signal).
    if (attempt < maxAttempts) {
      try {
        await sleep(computeBackoff(attempt, opts.retry), opts.signal)
      } catch {
        throw new EmailPosterError('Request aborted by caller', {
          code: ErrorCode.ABORTED,
          cause: lastFailure.cause,
        })
      }
    }
  }

  const retried = maxAttempts > 1
  throw new EmailPosterError(
    retried
      ? `${lastFailure?.message ?? 'Send failed'} (retries exhausted after ${maxAttempts} attempts)`
      : (lastFailure?.message ?? 'Send failed'),
    {
      code: retried ? ErrorCode.RETRY_EXHAUSTED : (lastFailure?.code ?? ErrorCode.REQUEST_FAILED),
      status: lastFailure?.status,
      detail: lastFailure?.detail,
      cause: lastFailure?.cause,
      requestId: lastFailure?.requestId,
    },
  )
}
