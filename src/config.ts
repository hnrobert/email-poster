import { z } from 'zod'

/**
 * Declarative field map: logical input field → downstream JSON key.
 * Either `body` (single body key) OR `bodyHtml`/`bodyText` (split keys) — not both.
 */
export const FieldMapSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    replyTo: z.string().optional(),
    subject: z.string().optional(),
    /** Single body key (downstream has one body field). */
    body: z.string().optional(),
    /** Separate html body key (resend-like). Mutually exclusive with `body`. */
    bodyHtml: z.string().optional(),
    /** Separate text body key (resend-like). Mutually exclusive with `body`. */
    bodyText: z.string().optional(),
    /** Emit the type discriminator ('html'|'text') under this key. */
    type: z.string().optional(),
    attachments: z.string().optional(),
    headers: z.string().optional(),
    tagName: z.string().optional(),
  })
  .superRefine((m, ctx) => {
    if (m.body && (m.bodyHtml || m.bodyText)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Specify either 'body' OR bodyHtml/bodyText — not both",
        path: ['body'],
      })
    }
  })
export type FieldMap = z.infer<typeof FieldMapSchema>

/** Built-in payload presets. `custom_example` is the legacy Power Automate shape. */
export const PRESETS = {
  /**
   * No preset base — `fields` is the complete, authoritative map. Used by
   * `exportInterface`/`importInterface` for provably-lossless round-trips:
   * with an empty base, no preset key can ever leak into a re-imported map.
   */
  none: {},
  /** SMTGo-style gateway: { from, to, subject, html }. */
  smtogo: { from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html' },
  /** Resend-like relay: { from, to, subject, html, text }. */
  generic: { from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html', bodyText: 'text' },
  /** Minimal trigger shape: { email, subject, content }. (was 'powerautomate') */
  custom_example: { to: 'email', subject: 'subject', body: 'content' },
} as const satisfies Record<string, FieldMap>

export type PresetName = keyof typeof PRESETS

export const RetryConfigSchema = z.object({
  /** Status codes that trigger a retry. Network errors and timeouts are always retried. */
  codes: z.array(z.number().int()).default([408, 425, 429, 500, 502, 503, 504]),
  maxAttempts: z.number().int().min(1).max(10).default(3),
  baseDelayMs: z.number().int().min(0).default(500),
  maxDelayMs: z.number().int().min(0).default(8_000),
})
export type RetryConfig = z.infer<typeof RetryConfigSchema>

/**
 * Opt-in SSRF guard. Default is `undefined` (no restriction). When provided,
 * `httpsOnly`, host allow/block lists and private-network blocking are applied.
 */
export const UrlGuardSchema = z
  .object({
    httpsOnly: z.boolean().optional(),
    blockPrivateNetworks: z.boolean().optional(),
    blockHosts: z.array(z.string()).optional(),
    allowHosts: z.array(z.string()).optional(),
    /** Plug in `node:dns/promises.lookup` to mitigate DNS rebinding for hostnames. */
    resolver: z.any().optional(),
  })
  .optional()
export type UrlGuardConfig = z.infer<typeof UrlGuardSchema>

export const EmailPosterConfigSchema = z.object({
  /** Downstream webhook URL. */
  postUrl: z.string().url(),
  /** Select a built-in field-map preset. Overridden/extended by `fields`. */
  preset: z.enum(['none', 'smtogo', 'generic', 'custom_example']).optional(),
  /** Override or extend the chosen preset's field map. */
  fields: FieldMapSchema.optional(),
  /** Default From address; `input.from` overrides per message. */
  fromAddress: z.string().optional(),
  /** Static fields merged into every payload (mapped fields win on collision). */
  extra: z.record(z.string(), z.unknown()).optional(),
  /** Raw request headers. Auth goes here (e.g. Authorization: Bearer …). Content-Type is forced. */
  headers: z.record(z.string(), z.string()).default({}),
  /** Override success status codes. Default: any 2xx. */
  successCodes: z.array(z.number().int()).optional(),
  /** Per-request timeout. */
  timeoutMs: z.number().int().min(0).default(15_000),
  retry: RetryConfigSchema.default({}),
  /** Opt-in URL/SSRF guard. Default undefined = no restriction. */
  urlGuard: UrlGuardSchema,
  recipients: z
    .object({
      /** How multi-recipient fields are serialized into the payload. */
      serialize: z.enum(['comma', 'array']).default('comma'),
      /** Max total recipients across to/cc/bcc. */
      maxLength: z.number().int().min(1).default(50),
    })
    .default({}),
  limits: z
    .object({
      maxLenRecipientEmail: z.number().int().min(1).default(320),
      maxLenSubject: z.number().int().min(1).default(200),
      maxLenBody: z.number().int().min(1).default(50_000),
    })
    .default({}),
  /** Instance-only. NOT loaded from env (functions are not serializable). */
  hooks: z
    .object({
      beforeSend: z.any().optional(),
      afterSend: z.any().optional(),
      onError: z.any().optional(),
    })
    .optional(),
  /** Try to parse id/messageId from the downstream JSON response before synthesizing. */
  parseMessageId: z.boolean().default(true),
})
/** The fully-parsed config (defaults applied) — what `EmailPoster.config` holds. */
export type EmailPosterConfig = z.infer<typeof EmailPosterConfigSchema>
/** The user-facing/partial form: fields with defaults are optional here. */
export type EmailPosterConfigInput = z.input<typeof EmailPosterConfigSchema>

/** Resolve the effective field map: preset (default smtogo) merged with `fields`. */
export function resolveFieldMap(config: EmailPosterConfig): FieldMap {
  const base = config.preset ? PRESETS[config.preset] : PRESETS.smtogo
  return { ...base, ...(config.fields ?? {}) }
}
