import { describe, it, expect, vi, afterEach } from 'vitest'
import { EmailPoster } from '../../src/poster'
import { formatSendSuccess, formatSendFailure } from '../../src/log'
import type { SendMailInput } from '../../src/input'

// Limits: default unlimited; explicit values still enforced.

const bigBody = '<p>' + 'x'.repeat(250_000) + '</p>'
const base = { postUrl: 'http://mock.test/hook' }

function makePoster(configOverrides: Record<string, unknown> = {}): EmailPoster {
  return new EmailPoster({ ...base, ...configOverrides })
}

/** Capture the validation error's detail (the cap errors live there, not in `message`). */
function capError(p: EmailPoster, input: { to: string; subject: string; body: string }): string {
  try {
    p.validate(input)
  } catch (e) {
    return String((e as { detail?: unknown }).detail ?? e)
  }
  throw new Error('expected validate() to throw')
}

describe('size limits', () => {
  it('accepts a 250KB body by default (no limit)', () => {
    const p = makePoster()
    expect(() => p.validate({ to: 'a@b.c', subject: 'Hi', body: bigBody })).not.toThrow()
  })

  it('accepts long subjects and addresses by default', () => {
    const p = makePoster()
    expect(() =>
      p.validate({ to: 'a'.repeat(300) + '@b.c', subject: 's'.repeat(500), body: 'b' }),
    ).not.toThrow()
  })

  it('still enforces explicitly configured caps', () => {
    const p = makePoster({ limits: { maxLenBody: 1000, maxLenSubject: 10 } })
    expect(capError(p, { to: 'a@b.c', subject: 'This subject is way too long', body: 'b' })).toMatch(
      /subject too long/,
    )
    expect(capError(p, { to: 'a@b.c', subject: 'Hi', body: bigBody })).toMatch(/body too long/)
  })

  it('mixed caps: a set one rejects while unset ones stay unlimited', () => {
    const p = makePoster({ limits: { maxLenBody: 10 } })
    expect(() => p.validate({ to: 'a@b.c', subject: 's'.repeat(999), body: 'short' })).not.toThrow()
    expect(capError(p, { to: 'a@b.c', subject: 'Hi', body: 'This body is longer than ten' })).toMatch(
      /body too long/,
    )
  })
})

describe('per-send terminal logging', () => {
  afterEach(() => vi.restoreAllMocks())

  function withMockedFetch(status = 200, body: unknown = { messageId: 'm-1' }) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('logs one success line per send by default', async () => {
    withMockedFetch()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await makePoster().send({ to: 'a@b.c', subject: 'Hi', body: 'b' })

    expect(res.messageId).toBe('m-1')
    expect(log).toHaveBeenCalledTimes(1)
    const line = log.mock.calls[0]![0] as string
    expect(line).toMatch(/^\[email-poster\] sent → to=a@b\.c subject="Hi" status=200 messageId=m-1 \(\d+ms\)$/)
    expect(err).not.toHaveBeenCalled()
  })

  it('logs a failure line (console.error) when the webhook rejects', async () => {
    withMockedFetch(500, { error: 'boom' })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const p = makePoster({ retry: { maxAttempts: 1 } })
    await expect(p.send({ to: 'a@b.c', subject: 'Hi', body: 'b' })).rejects.toThrow()

    expect(log).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalledTimes(1)
    const line = err.mock.calls[0]![0] as string
    expect(line).toContain('[email-poster] send FAILED → to=a@b.c subject="Hi"')
    expect(line).toMatch(/\(\d+ms\)$/)
  })

  it('logs a failure line for validation errors too (nothing sent)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(makePoster().send({ to: 'not-an-email', subject: 'Hi', body: 'b' })).rejects.toThrow()
    expect(err).toHaveBeenCalledTimes(1)
    expect(err.mock.calls[0]![0]).toContain('send FAILED')
  })

  it('log: false silences both lines', async () => {
    withMockedFetch()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    await makePoster({ log: false }).send({ to: 'a@b.c', subject: 'Hi', body: 'b' })
    expect(log).not.toHaveBeenCalled()

    withMockedFetch(500, { error: 'x' })
    await expect(
      makePoster({ log: false, retry: { maxAttempts: 1 } }).send({ to: 'a@b.c', subject: 'Hi', body: 'b' }),
    ).rejects.toThrow()
    expect(err).not.toHaveBeenCalled()
  })

  it('truncates long subjects and never prints the body', async () => {
    const line = formatSendSuccess(
      { to: 'a@b.c', subject: 's'.repeat(300), body: 'SECRET-BODY' },
      { messageId: 'm', status: 200, response: new Response('{}') },
      5,
    )
    expect(line).toContain('subject="' + 's'.repeat(80) + '…"')
    expect(line).not.toContain('SECRET-BODY')
  })

  it('failure formatting renders EmailPosterError code and detail', () => {
    const input: SendMailInput = { to: 'a@b.c', subject: 'Hi', body: 'b' }
    const line = formatSendFailure(input, new Error('network down'), 12)
    expect(line).toBe('[email-poster] send FAILED → to=a@b.c subject="Hi" network down (12ms)')
  })

  it('failure formatting joins multi-recipient to lists', () => {
    const line = formatSendFailure(
      { to: ['a@b.c', 'd@e.f'], subject: 'Hi', body: 'b' },
      new Error('x'),
      1,
    )
    expect(line).toContain('to=a@b.c,d@e.f')
  })
})
