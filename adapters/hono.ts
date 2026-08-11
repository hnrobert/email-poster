/**
 * email-poster/adapters/hono — Hono handler factory (framework-agnostic shape).
 * @license Apache-2.0
 *
 * `createMailRoute(poster)` returns a handler structurally compatible with a
 * Hono route handler: `app.post('/mail', createMailRoute(poster))`. It needs no
 * `hono` import here — a Hono `Context` satisfies {@link MailContext}.
 */
import { EmailPoster } from '../src/poster'
import type { EmailPosterConfigInput } from '../src/config'
import { isEmailPosterError, ErrorCode } from '../src/errors'
import type { SendMailInput } from '../src/input'
import type { SendOptions, SendResult } from '../src/types'

/** Structural subset of a Hono `Context` for the mail route. */
export interface MailContext {
  req: { json(): Promise<unknown> }
  body?: unknown
  json(data: unknown, status?: number): Response
}
export type MailHandler = (c: MailContext) => Promise<Response> | Response

/** Construct a poster from config (handy in framework setup). */
export function emailPoster(config: EmailPosterConfigInput): EmailPoster {
  return new EmailPoster(config)
}

/**
 * Returns a POST handler that reads a {@link SendMailInput} body and sends it.
 * Success → `200 {ok,messageId,status}`; validation/SSRF → `400`; otherwise `502`.
 */
export function createMailRoute(poster: EmailPoster): MailHandler {
  return async (c) => {
    let input: unknown
    try {
      input = await c.req.json()
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }
    try {
      const res: SendResult = await poster.send(input as SendMailInput)
      return c.json({ ok: true, messageId: res.messageId, status: res.status })
    } catch (e) {
      const code = isEmailPosterError(e) ? e.code : undefined
      const status =
        code === ErrorCode.VALIDATION_FAILED || code === ErrorCode.URL_BLOCKED ? 400 : 502
      return c.json(
        { ok: false, error: e instanceof Error ? e.message : String(e), code },
        status,
      )
    }
  }
}

/** Convenience: build a poster and its mail route in one call. */
export function createMailApp(
  config: EmailPosterConfigInput,
  opts: { send?: SendOptions } = {},
): { poster: EmailPoster; send: (input: SendMailInput) => Promise<SendResult>; route: MailHandler } {
  const poster = new EmailPoster(config)
  return {
    poster,
    send: (input) => poster.send(input, opts.send),
    route: createMailRoute(poster),
  }
}
