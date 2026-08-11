import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmailPoster } from '../../src/poster'
import { createMailRoute, createMailApp, type MailContext } from '../../adapters/hono'
import {
  EmailPosterService,
  emailPosterProviders,
  EMAIL_POSTER_CONFIG,
} from '../../adapters/nestjs'
import {
  useEmailPoster,
  defineEmailPosterConfig,
  resetNuxtCache,
} from '../../adapters/nuxt'

function jsonRes(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

/** Build a minimal fake Hono-style context that records the json() response. */
function fakeCtx(body: unknown): { c: MailContext; captured: () => { data: unknown; status: number } } {
  let cap: { data: unknown; status: number } | undefined
  return {
    c: {
      req: { json: async () => body },
      json: (data, status = 200) => {
        cap = { data, status }
        return new Response('ok', { status })
      },
    },
    captured: () => cap!,
  }
}

describe('hono adapter', () => {
  type FetchMock = ReturnType<typeof vi.fn>
  let fetchMock: FetchMock
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch') as unknown as FetchMock
  })
  afterEach(() => vi.restoreAllMocks())

  it('createMailRoute sends and returns 200 with messageId', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'h1' }))
    const poster = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
    })
    const { c, captured } = fakeCtx({ to: 'a@b.c', subject: 's', body: 'b' })
    await createMailRoute(poster)(c)
    expect(captured()).toEqual({ data: { ok: true, messageId: 'h1', status: 200 }, status: 200 })
  })

  it('createMailRoute → 400 on invalid input', async () => {
    const poster = new EmailPoster({ postUrl: 'https://x.com', preset: 'smtogo' })
    const { c, captured } = fakeCtx({ to: 'not-an-email', subject: 's', body: 'b' })
    await createMailRoute(poster)(c)
    expect(captured().status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('createMailRoute → 502 on downstream failure', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    const poster = new EmailPoster({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      retry: { codes: [503], maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    })
    const { c, captured } = fakeCtx({ to: 'a@b.c', subject: 's', body: 'b' })
    await createMailRoute(poster)(c)
    expect(captured().status).toBe(502)
    expect((captured().data as { ok: boolean }).ok).toBe(false)
  })

  it('createMailRoute → 400 on invalid JSON body', async () => {
    const poster = new EmailPoster({ postUrl: 'https://x.com', preset: 'smtogo' })
    const { c, captured } = fakeCtx(undefined)
    // Force req.json to throw
    c.req.json = async () => {
      throw new SyntaxError('bad json')
    }
    await createMailRoute(poster)(c)
    expect(captured().status).toBe(400)
  })

  it('createMailApp wires poster + route together', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'a1' }))
    const app = createMailApp({ postUrl: 'https://x.com', preset: 'custom_example' })
    const { c, captured } = fakeCtx({ to: 'a@b.c', subject: 's', body: 'b' })
    await app.route(c)
    expect(captured().data).toMatchObject({ ok: true, messageId: 'a1' })
  })
})

describe('nestjs adapter', () => {
  it('emailPosterProviders returns config token + service factory entries', () => {
    const providers = emailPosterProviders({
      postUrl: 'https://x.com',
      preset: 'smtogo',
    })
    expect(providers).toHaveLength(2)
    expect(providers[0]!.provide).toBe(EMAIL_POSTER_CONFIG)
    expect(providers[0]!.useValue).toMatchObject({ postUrl: 'https://x.com' })
    expect(providers[1]!.provide).toBe(EmailPosterService)
    expect(typeof providers[1]!.useFactory).toBe('function')
    expect(providers[1]!.inject).toEqual([EMAIL_POSTER_CONFIG])
  })

  it('service.send delegates to a poster', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes({ id: 'n1' }))
    const service = new EmailPosterService({ postUrl: 'https://x.com', preset: 'smtogo' })
    const res = await service.send({ to: 'a@b.c', subject: 's', body: 'b' })
    expect(res.messageId).toBe('n1')
    fetchMock.mockRestore()
  })
})

describe('nuxt adapter', () => {
  beforeEach(() => resetNuxtCache())
  afterEach(() => resetNuxtCache())

  it('defineEmailPosterConfig is an identity', () => {
    const cfg = { postUrl: 'https://x.com', preset: 'smtogo' } as const
    expect(defineEmailPosterConfig(cfg)).toBe(cfg)
  })

  it('useEmailPoster caches by postUrl', async () => {
    const a = await useEmailPoster({ emailPoster: { postUrl: 'https://a.com', preset: 'smtogo' } })
    const a2 = await useEmailPoster({ emailPoster: { postUrl: 'https://a.com', preset: 'smtogo' } })
    const b = await useEmailPoster({ emailPoster: { postUrl: 'https://b.com', preset: 'smtogo' } })
    expect(a).toBe(a2)
    expect(a).not.toBe(b)
  })

  it('useEmailPoster throws when postUrl missing', async () => {
    await expect(useEmailPoster({ emailPoster: {} })).rejects.toThrow(/postUrl is required/)
  })
})
