import { z } from 'zod'

/** Pragmatic email regex (not RFC 5322, but good enough for gateway input). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** An attachment. `content` is base64-encoded; the package never reads files at runtime. */
export const AttachmentSchema = z.object({
  filename: z.string().min(1),
  content: z.string(),
  contentType: z.string().optional(),
  /** Content-id for inline embedded images. */
  cid: z.string().optional(),
})
export type Attachment = z.infer<typeof AttachmentSchema>

const Recipients = z.union([z.string(), z.array(z.string())])

/**
 * The canonical email input contract. Logical fields are mapped onto the
 * downstream webhook's JSON keys via `config.fields` (or a preset).
 */
export const SendMailInputSchema = z.object({
  to: Recipients,
  cc: Recipients.optional(),
  bcc: Recipients.optional(),
  replyTo: z.string().optional(),
  /** Overrides `config.fromAddress` for this message only. */
  from: z.string().optional(),
  subject: z.string().min(1),
  body: z.string(),
  /** Selects bodyHtml vs bodyText key resolution. Defaults to `html`. */
  type: z.enum(['text', 'html']).default('html'),
  attachments: z.array(AttachmentSchema).optional(),
  /** Extra email headers — emitted only if `fields.headers` maps them. */
  headers: z.record(z.string(), z.string()).optional(),
  /** Opaque business tag — emitted only if `fields.tagName` maps it. */
  tagName: z.string().optional(),
})
/**
 * What callers pass to `send()`/`validate()`. Mirrors the schema's INPUT shape, so
 * fields with a default (e.g. `type`) are optional here — `send({to,subject,body})`
 * is valid. Internals that consume a *parsed* value get `type` filled in by Zod.
 */
export type SendMailInput = z.input<typeof SendMailInputSchema>
/** The fully-parsed form (defaults applied). Used where every field is guaranteed. */
export type ParsedSendMail = z.output<typeof SendMailInputSchema>

export type RecipientInput = string | string[]

/** Normalize a recipient field to a trimmed, de-duplicated address array. */
export function normalizeRecipients(v: RecipientInput | undefined): string[] {
  if (v === undefined) return []
  const arr = Array.isArray(v) ? v : [v]
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    const addr = (raw ?? '').trim()
    if (!addr) continue
    const key = addr.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(addr)
  }
  return out
}
