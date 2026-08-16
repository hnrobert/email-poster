/**
 * Default per-send terminal logging (`config.log`, default true). One line per
 * send — success via `console.log`, failure via `console.error` — so outbound
 * mail is never silent in a consuming app's terminal. Bodies are never printed;
 * the subject is truncated. The CLI passes `log: false` because it prints its
 * own result lines.
 */
import type { SendMailInput } from './input'
import type { SendResult } from './types'
import { isEmailPosterError } from './errors'

/** Cap the echoed subject so log lines stay one terminal line. */
const MAX_SUBJECT_CHARS = 80

function describeInput(input: SendMailInput): string {
  // Runs before schema parsing (the logging wrapper wraps the whole send), so
  // be defensive: fields may be missing/mistyped on an invalid input.
  const rawTo = input.to
  const to = (Array.isArray(rawTo) ? rawTo.join(',') : String(rawTo ?? ''))
  const subject = String(input.subject ?? '')
  const shown = subject.length > MAX_SUBJECT_CHARS
    ? `${subject.slice(0, MAX_SUBJECT_CHARS)}…`
    : subject
  return `to=${to} subject="${shown}"`
}

/** `[email-poster] sent → …` — the success line. */
export function formatSendSuccess(input: SendMailInput, result: SendResult, elapsedMs: number): string {
  return (
    `[email-poster] sent → ${describeInput(input)} status=${result.status}` +
    ` messageId=${result.messageId} (${elapsedMs}ms)`
  )
}

/** `[email-poster] send FAILED → …` — the failure line for any thrown error. */
export function formatSendFailure(input: SendMailInput, error: unknown, elapsedMs: number): string {
  let cause: string
  if (isEmailPosterError(error)) {
    cause = `code=${error.code}`
    if (error.status !== undefined) cause += ` status=${error.status}`
    if (error.detail) cause += ` (${error.detail})`
  } else {
    cause = error instanceof Error ? error.message : String(error)
  }
  return `[email-poster] send FAILED → ${describeInput(input)} ${cause} (${elapsedMs}ms)`
}
