import { describe, it, expect } from 'vitest'
import { checkUrl } from '../../src/url-guard'
import { ErrorCode } from '../../src/errors'

function blocked(p: Promise<unknown>): Promise<unknown> {
  return expect(p).rejects.toMatchObject({ code: ErrorCode.URL_BLOCKED })
}

describe('checkUrl', () => {
  it('no-op when guard undefined', async () => {
    await expect(checkUrl('http://127.0.0.1', undefined)).resolves.toBeUndefined()
  })

  it('httpsOnly blocks http', async () => {
    await blocked(checkUrl('http://x.com', { httpsOnly: true }))
    await expect(checkUrl('https://x.com', { httpsOnly: true })).resolves.toBeUndefined()
  })

  it('blocks private/loopback IPs', async () => {
    await blocked(checkUrl('https://127.0.0.1', { blockPrivateNetworks: true }))
    await blocked(checkUrl('https://10.0.0.1', { blockPrivateNetworks: true }))
    await blocked(checkUrl('https://192.168.1.1', { blockPrivateNetworks: true }))
    await blocked(checkUrl('https://172.16.5.5', { blockPrivateNetworks: true }))
    await blocked(checkUrl('https://[::1]', { blockPrivateNetworks: true }))
  })

  it('allows public IP', async () => {
    await expect(checkUrl('https://8.8.8.8', { blockPrivateNetworks: true })).resolves.toBeUndefined()
  })

  it('blocks obvious private hostnames', async () => {
    await blocked(checkUrl('https://localhost', { blockPrivateNetworks: true }))
    await blocked(checkUrl('https://svc.local', { blockPrivateNetworks: true }))
  })

  it('allowHosts enforces allowlist', async () => {
    await blocked(checkUrl('https://evil.com', { allowHosts: ['good.com'] }))
    await expect(checkUrl('https://good.com', { allowHosts: ['good.com'] })).resolves.toBeUndefined()
  })

  it('blockHosts supports *.suffix glob', async () => {
    await blocked(checkUrl('https://sub.evil.com', { blockHosts: ['*.evil.com'] }))
    await expect(
      checkUrl('https://good.com', { blockHosts: ['*.evil.com'] }),
    ).resolves.toBeUndefined()
  })
})
