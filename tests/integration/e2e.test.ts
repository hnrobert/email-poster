import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmailPoster } from '../../src/poster'
import { ErrorCode } from '../../src/errors'
import type { SendMailInput } from '../../src/input'
import type { AttemptInfo } from '../../src/types'

type FetchMock = ReturnType<typeof vi.fn>

function jsonRes(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function hanging(): (url: string, init?: RequestInit) => Promise<Response> {
  // Mirrors real fetch: reject immediately if the signal is already aborted.
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const sig = init?.signal
      const abort = (): void => {
        const e = new Error('aborted')
        e.name = 'AbortError'
        reject(e)
      }
      if (sig?.aborted) {
        abort()
        return
      }
      sig?.addEventListener('abort', abort, { once: true })
    })
}

describe('EmailPoster.send (e2e, mocked fetch)', () => {
  let fetchMock: FetchMock

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch') as unknown as FetchMock
  })
  afterEach(() => vi.restoreAllMocks())

  function lastBody(): Record<string, unknown> {
    const last = fetchMock.mock.calls.at(-1)
    const init = (last?.[1] as { body?: string } | undefined) ?? undefined
    return init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {}
  }
  function lastHeaders(): Record<string, string> {
    const last = fetchMock.mock.calls.at(-1)
    return ((last?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>
  }

  it('posts smtogo payload and parses messageId from response', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'msg-1' }))
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await mail.send({ to: 'a@b.c', subject: 'Hi', body: '<b>x</b>' })
    expect(res.messageId).toBe('msg-1')
    expect(res.status).toBe(200)
    expect(lastBody()).toEqual({ from: 'f@x.com', to: 'a@b.c', subject: 'Hi', html: '<b>x</b>' })
    expect(lastHeaders()['Content-Type']).toBe('application/json')
    expect(lastHeaders()['Authorization']).toBe('Bearer t')
  })

  it('posts custom_example payload, synthesizes messageId when no id', async () => {
    fetchMock.mockResolvedValue(jsonRes({ ok: true }))
    const mail = new EmailPoster({ postUrl: 'https://x.com', preset: 'custom_example' })
    const res = await mail.send({ to: 'a@b.c', subject: 'Hi', body: 'b' })
    expect(res.messageId).toMatch(/^<post-/)
    expect(lastBody()).toEqual({ email: 'a@b.c', subject: 'Hi', content: 'b' })
  })

  it('retries on 503 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(jsonRes({ id: 'ok' }))
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      retry: { codes: [503], maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    })
    const res = await mail.send({ to: 'a@b.c', subject: 's', body: 'b' })
    expect(res.messageId).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('exhausts retries → RETRY_EXHAUSTED', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      retry: { codes: [503], maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
    })
    await expect(
      mail.send({ to: 'a@b.c', subject: 's', body: 'b' }),
    ).rejects.toMatchObject({ code: ErrorCode.RETRY_EXHAUSTED, status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('onAttempt fires per attempt (retry then success)', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(jsonRes({ id: 'ok' }))
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      retry: { codes: [503], maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    })
    const calls: AttemptInfo[] = []
    const res = await mail.send(
      { to: 'a@b.c', subject: 's', body: 'b' },
      { onAttempt: (i) => calls.push(i) },
    )
    expect(res.messageId).toBe('ok')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      attempt: 1,
      ok: false,
      retryable: true,
      status: 503,
      errorKind: 'status',
      message: 'Webhook returned 503',
    })
    expect(calls[0]!.backoffMs).toBe(0) // baseDelayMs 0
    expect(calls[1]).toMatchObject({ attempt: 2, ok: true, retryable: false, status: 200 })
  })

  it('onAttempt fires once for a non-retryable failure (before the throw)', async () => {
    fetchMock.mockResolvedValue(new Response('bad', { status: 400 }))
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      retry: { codes: [503], maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    })
    const calls: AttemptInfo[] = []
    await expect(
      mail.send({ to: 'a@b.c', subject: 's', body: 'b' }, { onAttempt: (i) => calls.push(i) }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_FAILED, status: 400 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      attempt: 1,
      ok: false,
      retryable: false,
      status: 400,
      errorKind: 'status',
    })
  })

  it('non-retryable 400 → REQUEST_FAILED immediately (no retry)', async () => {
    fetchMock.mockResolvedValue(new Response('bad', { status: 400 }))
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      retry: { codes: [503], maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    })
    await expect(
      mail.send({ to: 'a@b.c', subject: 's', body: 'b' }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_FAILED, status: 400 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('timeout (single attempt) → TIMEOUT', async () => {
    fetchMock.mockImplementation(hanging())
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      timeoutMs: 20,
      retry: { codes: [503], maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    })
    await expect(
      mail.send({ to: 'a@b.c', subject: 's', body: 'b' }),
    ).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })
  })

  it('external AbortSignal → ABORTED', async () => {
    fetchMock.mockImplementation(hanging())
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      timeoutMs: 5_000,
      retry: { codes: [503], maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    })
    const ac = new AbortController()
    const p = mail.send({ to: 'a@b.c', subject: 's', body: 'b' }, { signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toMatchObject({ code: ErrorCode.ABORTED })
  })

  it('invalid input → VALIDATION_FAILED (no network call)', async () => {
    const mail = new EmailPoster({ postUrl: 'https://x.com', preset: 'smtogo' })
    await expect(
      mail.send({ to: 'a@b.c', body: 'b' } as unknown as SendMailInput),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('runs beforeSend + afterSend hooks; beforeSend can mutate payload', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'm' }))
    const beforeSend = vi.fn(async (ctx: { payload: Record<string, unknown>; headers: Record<string, string> }) => ({
      payload: { ...ctx.payload, injected: true },
      headers: ctx.headers,
    }))
    const afterSend = vi.fn()
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'custom_example',
      hooks: { beforeSend, afterSend },
    })
    await mail.send({ to: 'a@b.c', subject: 's', body: 'b' })
    expect(beforeSend).toHaveBeenCalledTimes(1)
    expect(afterSend).toHaveBeenCalledTimes(1)
    expect(lastBody().injected).toBe(true)
  })

  it('runs onError hook on failure', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))
    const onError = vi.fn()
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      retry: { codes: [], maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
      hooks: { onError },
    })
    await expect(
      mail.send({ to: 'a@b.c', subject: 's', body: 'b' }),
    ).rejects.toBeDefined()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('successCodes override honors a non-2xx code as success', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'ok' }, { status: 202 }))
    const mail = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      successCodes: [202],
    })
    const res = await mail.send({ to: 'a@b.c', subject: 's', body: 'b' })
    expect(res.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
