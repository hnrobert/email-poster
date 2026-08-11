import { randomBytes } from 'node:crypto'

/** Locally-synthesized message id, matching the three reference projects. */
export function synthMessageId(): string {
  return `<post-${randomBytes(8).toString('hex')}@webhook>`
}

function pickId(data: unknown): unknown {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    return o.id ?? o.messageId ?? o.messageID ?? o.message_id ?? o.requestId ?? o.request_id
  }
  return undefined
}

/**
 * Best-effort message id: parse from the downstream JSON response when enabled,
 * falling back to a synthesized id. Always returns a non-empty string.
 */
export async function extractMessageId(res: Response, enabled: boolean): Promise<string> {
  if (enabled) {
    const ct = res.headers.get('content-type') ?? ''
    if (ct.toLowerCase().includes('json')) {
      try {
        const data = await res.clone().json()
        const id = pickId(data)
        if (typeof id === 'string' && id.length > 0) return id
        if (typeof id === 'number') return String(id)
      } catch {
        // fall through to synthesis
      }
    }
  }
  return synthMessageId()
}
