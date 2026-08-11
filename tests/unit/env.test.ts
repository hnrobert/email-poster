import { describe, it, expect } from 'vitest'
import { loadEnvConfig } from '../../src/env'

describe('loadEnvConfig', () => {
  it('reads core scalar fields', () => {
    const c = loadEnvConfig({
      EMAIL_POSTER_POST_URL: 'https://x.com',
      EMAIL_POSTER_PRESET: 'smtogo',
      EMAIL_POSTER_FROM_ADDRESS: 'f@x.com',
      EMAIL_POSTER_TIMEOUT_MS: '5000',
    })
    expect(c).toMatchObject({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'f@x.com',
      timeoutMs: 5_000,
    })
  })

  it('parses JSON headers and extra', () => {
    const c = loadEnvConfig({
      EMAIL_POSTER_HEADERS: '{"Authorization":"Bearer x"}',
      EMAIL_POSTER_EXTRA: '{"source":"app"}',
    })
    expect(c.headers).toEqual({ Authorization: 'Bearer x' })
    expect(c.extra).toEqual({ source: 'app' })
  })

  it('parses csv success codes', () => {
    const c = loadEnvConfig({ EMAIL_POSTER_SUCCESS_CODES: '200, 202' })
    expect(c.successCodes).toEqual([200, 202])
  })

  it('parses retry overrides', () => {
    const c = loadEnvConfig({
      EMAIL_POSTER_RETRY_MAX_ATTEMPTS: '5',
      EMAIL_POSTER_RETRY_CODES: '502,503',
    })
    expect(c.retry).toEqual({ maxAttempts: 5, codes: [502, 503] })
  })

  it('empty env → empty object', () => {
    expect(loadEnvConfig({})).toEqual({})
  })
})
