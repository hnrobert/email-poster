/**
 * email-poster — interface import / export / detection.
 *
 * The "interface" of a mail sender is the payload-shape-affecting subset of an
 * `EmailPosterConfig`: which logical field maps to which downstream JSON key
 * (the `FieldMap`), plus `fromAddress`, `extra`, and recipient serialization.
 * Transport/runtime concerns (postUrl, auth headers, retry, timeout, limits,
 * urlGuard, parseMessageId, hooks) are deliberately excluded — those belong to
 * the host application's own config.
 *
 * Round-trip consistency is the core guarantee:
 *   resolveFieldMap(parse(importInterface(exportInterface(cfg)))) === resolveFieldMap(cfg)
 *
 * It holds because `exportInterface` stores the FULL effective map
 * (`resolveFieldMap`) under `fields` with `preset: 'none'` (an empty preset
 * base), so no preset key can ever leak back in on re-import — even if PRESETS
 * grows new keys in a later version.
 *
 * @license Apache-2.0
 */
import { z } from 'zod'
import {
  FieldMapSchema,
  PRESETS,
  resolveFieldMap,
  type EmailPosterConfig,
  type EmailPosterConfigInput,
  type FieldMap,
} from './config'

/** Current interchange-format version. Bump on incompatible InterfaceDef changes. */
export const INTERFACE_DEF_VERSION = 1

/**
 * `$schema` meta URL identifying an email-poster InterfaceDef document. Points
 * at a static JSON Schema describing `InterfaceDefSchema` (for editor
 * autocomplete / validation in external tools).
 */
export const INTERFACE_DEF_SCHEMA_URL =
  'https://github.com/hnrobert/email-poster/raw/main/docs/interface-def.schema.json'

/**
 * Canonical, versioned interchange format for the interface-shape subset of a
 * config. `preset` is always `'none'` (fields is the authoritative map).
 */
export const InterfaceDefSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(INTERFACE_DEF_VERSION).default(INTERFACE_DEF_VERSION),
  /** Human-readable label; informational only. */
  name: z.string().optional(),
  /** Always `'none'` — the full effective map lives in `fields`. */
  preset: z.literal('none').default('none'),
  /** The complete effective field map (preset already merged on export). */
  fields: FieldMapSchema,
  fromAddress: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  recipients: z.object({ serialize: z.enum(['comma', 'array']) }).optional(),
})
export type InterfaceDef = z.infer<typeof InterfaceDefSchema>
export type InterfaceDefInput = z.input<typeof InterfaceDefSchema>

/**
 * Ranked candidate downstream-key names per logical field. First match in the
 * observed object wins. `body` (single-key) and `bodyHtml`/`bodyText` (split)
 * candidate lists are deliberately disjoint so detection never produces an
 * invalid (both body styles) map.
 */
const CANDIDATES = {
  from: ['from', 'sender', 'fromEmail', 'from_email', 'fromAddress'],
  to: ['to', 'recipient', 'recipients', 'email', 'toEmail', 'to_email'],
  cc: ['cc', 'carbonCopy', 'ccEmail'],
  bcc: ['bcc', 'blindCarbonCopy', 'bccEmail'],
  replyTo: ['replyTo', 'reply_to', 'replyToEmail', 'reply_address'],
  subject: ['subject', 'title', 'subj', 'topic', 'headline'],
  body: ['body', 'content', 'message', 'data', 'bodyContent'],
  bodyHtml: ['html', 'bodyHtml', 'body_html', 'htmlContent', 'htmlBody', 'html_body'],
  bodyText: ['text', 'bodyText', 'body_text', 'plainText', 'plain', 'textContent'],
  type: ['type', 'contentType', 'content_type', 'bodyType'],
  attachments: ['attachments', 'files', 'attachment', 'attachmentFiles'],
  headers: ['headers', 'emailHeaders', 'extraHeaders'],
  tagName: ['tagName', 'tag_name', 'tag', 'category', 'labels'],
} as const satisfies Record<keyof FieldMap, readonly string[]>

/** True when the input looks like a standard JSON Schema (draft-04 .. 2020-12). */
function looksLikeJsonSchema(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.$schema === 'string' && /json-schema/i.test(o.$schema)) return true
  return o.type === 'object' && typeof o.properties === 'object' && o.properties !== null
}

/**
 * Extract the effective interface from a (parsed or partial) config. `fields`
 * is set to the resolved map and `preset` forced to `'none'`, so re-importing
 * reproduces the exact same map regardless of future PRESETS changes.
 */
export function exportInterface(config: Partial<EmailPosterConfigInput>): InterfaceDef {
  const preset = config.preset
  const effective: FieldMap = {
    ...(preset ? PRESETS[preset] : PRESETS.smtogo),
    ...(config.fields ?? {}),
  }
  return {
    $schema: INTERFACE_DEF_SCHEMA_URL,
    version: INTERFACE_DEF_VERSION,
    preset: 'none',
    fields: effective,
    ...(config.fromAddress !== undefined ? { fromAddress: config.fromAddress } : {}),
    ...(config.extra !== undefined ? { extra: config.extra } : {}),
    ...(config.recipients?.serialize
      ? { recipients: { serialize: config.recipients.serialize } }
      : {}),
  }
}

/**
 * The config subset reconstructed from an interface def. `preset` is always
 * `'none'` and `fields` is the authoritative map. Spread this into a full
 * config (adding `postUrl`, `headers`, etc.) to instantiate a poster:
 *   `new EmailPoster({ postUrl, ...importInterface(def) })`
 */
export type ImportedInterface = {
  preset: 'none'
  fields: FieldMap
  fromAddress?: string
  extra?: Record<string, unknown>
  recipients?: { serialize: 'comma' | 'array' }
}

/**
 * Build a config input from an InterfaceDef. Accepts EITHER:
 *   - an email-poster InterfaceDef JSON (`{version, fields, …}`), or
 *   - a standard JSON Schema (`{$schema:"…json-schema…", type:"object", properties}`),
 *     in which case the property names are run through `detectInterface`.
 *
 * Lossless inverse of `exportInterface` for the field map.
 */
export function importInterface(json: unknown): ImportedInterface {
  if (looksLikeJsonSchema(json)) {
    const detected = detectInterface(json, { mode: 'schema' })
    return { preset: 'none', fields: detected.fields }
  }
  const def = InterfaceDefSchema.parse(json)
  const out: ImportedInterface = { preset: 'none', fields: def.fields }
  if (def.fromAddress !== undefined) out.fromAddress = def.fromAddress
  if (def.extra !== undefined) out.extra = def.extra
  if (def.recipients) out.recipients = { serialize: def.recipients.serialize }
  return out
}

export interface DetectOptions {
  /**
   * `'instance'` = sample is a raw payload object (keys are the observed
   * downstream keys). `'schema'` = sample is a JSON Schema (keys are read from
   * `properties`). Defaults to auto-detect via `looksLikeJsonSchema`.
   */
  mode?: 'instance' | 'schema'
}

/**
 * Reverse-engineer a field map from a sample downstream JSON. Best-effort: the
 * candidate table resolves common naming; ambiguous cases prefer the split
 * (html/text) body over a single `body` key. Always review the result.
 */
export function detectInterface(sample: unknown, opts: DetectOptions = {}): InterfaceDef {
  const mode = opts.mode ?? (looksLikeJsonSchema(sample) ? 'schema' : 'instance')
  const empty: InterfaceDef = {
    $schema: INTERFACE_DEF_SCHEMA_URL,
    version: INTERFACE_DEF_VERSION,
    preset: 'none',
    fields: {},
  }
  if (typeof sample !== 'object' || sample === null) return empty

  const obj = sample as Record<string, unknown>
  const observable: Record<string, unknown> =
    mode === 'schema' && obj.properties && typeof obj.properties === 'object'
      ? (obj.properties as Record<string, unknown>)
      : obj
  const present = new Set(Object.keys(observable))
  const pick = (candidates: readonly string[]): string | undefined =>
    candidates.find((k) => present.has(k))

  const from = pick(CANDIDATES.from)
  const to = pick(CANDIDATES.to)
  const cc = pick(CANDIDATES.cc)
  const bcc = pick(CANDIDATES.bcc)
  const replyTo = pick(CANDIDATES.replyTo)
  const subject = pick(CANDIDATES.subject)
  const typeKey = pick(CANDIDATES.type)
  const attachments = pick(CANDIDATES.attachments)
  const headers = pick(CANDIDATES.headers)
  const tagName = pick(CANDIDATES.tagName)

  // Body XOR: prefer split (html+text) when both present; else whichever split
  // key is alone; else a single `body` key. Never set body AND bodyHtml/bodyText.
  const htmlKey = pick(CANDIDATES.bodyHtml)
  const textKey = pick(CANDIDATES.bodyText)
  const bodyFields: Partial<Pick<FieldMap, 'body' | 'bodyHtml' | 'bodyText'>> =
    htmlKey && textKey
      ? { bodyHtml: htmlKey, bodyText: textKey }
      : htmlKey
        ? { bodyHtml: htmlKey }
        : textKey
          ? { bodyText: textKey }
          : pick(CANDIDATES.body)
            ? { body: pick(CANDIDATES.body) }
            : {}

  const fields: FieldMap = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(subject ? { subject } : {}),
    ...(typeKey ? { type: typeKey } : {}),
    ...(attachments ? { attachments } : {}),
    ...(headers ? { headers } : {}),
    ...(tagName ? { tagName } : {}),
    ...bodyFields,
  }

  return { ...empty, fields }
}

/**
 * DERIVED standard JSON Schema (draft-07) describing the downstream payload
 * shape for the given interface. One property per logical field actually
 * present in the (already XOR-resolved) field map. `required` includes the
 * always-present logical fields (to/subject and the active body key). Useful
 * for payload validation, live preview, mock servers, and form generation.
 */
export function exportPayloadSchema(
  def: InterfaceDef | EmailPosterConfig,
): Record<string, unknown> {
  // An InterfaceDef carries the full effective map directly (`version` marker);
  // a config must be resolved through its preset.
  const fm: FieldMap =
    def && typeof def === 'object' && 'version' in def
      ? (def as InterfaceDef).fields
      : resolveFieldMap(def as EmailPosterConfig)

  const properties: Record<string, unknown> = {}
  const required: string[] = []
  const add = (key: string | undefined, schema: unknown, req = false): void => {
    if (!key) return
    properties[key] = schema
    if (req) required.push(key)
  }

  add(fm.from, { type: 'string' })
  add(fm.to, { type: 'string' }, true)
  add(fm.cc, { type: 'string' })
  add(fm.bcc, { type: 'string' })
  add(fm.replyTo, { type: 'string' })
  add(fm.subject, { type: 'string' }, true)
  add(fm.body, { type: 'string' }, !!fm.body)
  add(fm.bodyHtml, { type: 'string' }, !!fm.bodyHtml)
  add(fm.bodyText, { type: 'string' })
  add(fm.type, { type: 'string', enum: ['html', 'text'] })
  add(fm.attachments, { type: 'array', items: { type: 'object' } })
  add(fm.headers, { type: 'object' })
  add(fm.tagName, { type: 'string' })

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: true,
  }
}
