import { isIP, BlockList } from 'node:net'
import type { UrlGuardConfig } from './config'
import { EmailPosterError, ErrorCode } from './errors'

const PRIVATE_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'ip-ranges.amazonaws.com'])
const PRIVATE_SUFFIXES = ['.local', '.internal', '.localhost', '.home', '.lan', '.arpa']

let _blockList: BlockList | undefined

function blockList(): BlockList {
  if (_blockList) return _blockList
  const bl = new BlockList()
  // IPv4 private / special ranges.
  bl.addRange('10.0.0.0', '10.255.255.255')
  bl.addRange('172.16.0.0', '172.31.255.255')
  bl.addRange('192.168.0.0', '192.168.255.255')
  bl.addRange('127.0.0.0', '127.255.255.255') // loopback
  bl.addRange('169.254.0.0', '169.254.255.255') // link-local
  bl.addRange('100.64.0.0', '100.127.255.255') // CGNAT
  bl.addRange('0.0.0.0', '0.255.255.255') // "this network"
  // IPv6 private / special.
  bl.addAddress('::1', 'ipv6') // loopback
  bl.addRange('fc00::', 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ipv6') // ULA
  bl.addRange('fe80::', 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ipv6') // link-local
  _blockList = bl
  return bl
}

function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase()
  const p = pattern.toLowerCase()
  if (p.startsWith('*.')) {
    const suffix = p.slice(1) // ".example.com"
    return h.endsWith(suffix) || h === p.slice(2)
  }
  return h === p
}

/**
 * Opt-in SSRF / URL guard. No-op when `guard` is undefined (the default).
 * NOTE: without a `resolver`, hostnames that resolve to private IPs cannot be
 * caught — only obvious private names/literal IPs are blocked. Pass a
 * `node:dns/promises.lookup`-style resolver to mitigate DNS rebinding.
 */
export async function checkUrl(rawUrl: string, guard?: UrlGuardConfig): Promise<void> {
  if (!guard) return

  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new EmailPosterError(`Invalid URL: ${rawUrl}`, {
      code: ErrorCode.URL_BLOCKED,
      detail: 'malformed url',
    })
  }

  const host = u.hostname

  if (guard.httpsOnly && u.protocol !== 'https:') {
    throw new EmailPosterError(`Non-https URL blocked: ${rawUrl}`, {
      code: ErrorCode.URL_BLOCKED,
      detail: 'httpsOnly',
    })
  }
  if (guard.allowHosts && !guard.allowHosts.some((p) => hostMatches(host, p))) {
    throw new EmailPosterError(`Host not in allowlist: ${host}`, {
      code: ErrorCode.URL_BLOCKED,
      detail: 'allowHosts',
    })
  }
  if (guard.blockHosts?.some((p) => hostMatches(host, p))) {
    throw new EmailPosterError(`Blocked host: ${host}`, {
      code: ErrorCode.URL_BLOCKED,
      detail: 'blockHosts',
    })
  }

  if (guard.blockPrivateNetworks) {
    const lower = host.toLowerCase()
    if (PRIVATE_HOSTNAMES.has(lower) || PRIVATE_SUFFIXES.some((s) => lower.endsWith(s))) {
      throw new EmailPosterError(`Private/local hostname blocked: ${host}`, {
        code: ErrorCode.URL_BLOCKED,
        detail: 'privateNetwork',
      })
    }
    // WHATWG URL wraps IPv6 literals in brackets; strip them for isIP/BlockList.
    const hostForIp = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
    const v = isIP(hostForIp)
    if (v > 0) {
      if (blockList().check(hostForIp, v === 6 ? 'ipv6' : 'ipv4')) {
        throw new EmailPosterError(`Private/loopback IP blocked: ${host}`, {
          code: ErrorCode.URL_BLOCKED,
          detail: 'privateNetwork',
        })
      }
    } else if (guard.resolver) {
      const addrs = await guard.resolver(host)
      for (const a of addrs) {
        const av = isIP(a)
        if (av > 0 && blockList().check(a, av === 6 ? 'ipv6' : 'ipv4')) {
          throw new EmailPosterError(`Host ${host} resolves to private IP ${a}`, {
            code: ErrorCode.URL_BLOCKED,
            detail: 'privateNetwork(dns)',
          })
        }
      }
    }
    // else: cannot resolve hostname; allow (documented limitation).
  }
}
