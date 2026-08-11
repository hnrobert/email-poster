# Reference — config, input, errors

## `EmailPosterConfig`

| Key | Type | Default | Notes |
|---|---|---|---|
| `postUrl` | `string (url)` | **required** | The downstream webhook URL. |
| `preset` | `'smtogo' \| 'generic' \| 'custom_example'` | `smtogo` | Chooses the base field map. |
| `fields` | `FieldMap` | — | Overrides/extends the preset's field map. |
| `fromAddress` | `string` | — | Default From; overridden by `input.from`. |
| `extra` | `Record<string, unknown>` | — | Static keys merged into every payload first. |
| `headers` | `Record<string, string>` | `{}` | HTTP/auth headers. `Content-Type` is forced to `application/json`. |
| `successCodes` | `number[]` | — | Override success (default = any 2xx). |
| `timeoutMs` | `number` | `15000` | Per-attempt timeout. |
| `retry` | `RetryConfig` | see below | Exponential backoff retry. |
| `urlGuard` | `UrlGuardConfig` | — | Opt-in SSRF guard (off by default). |
| `recipients` | `{ serialize: 'comma'\|'array', maxLength }` | `{ comma, 50 }` | Multi-recipient serialization + cap. |
| `limits` | `{ maxLenRecipientEmail, maxLenSubject, maxLenBody }` | `{ 320, 200, 50000 }` | Input length caps. |
| `hooks` | `{ beforeSend?, afterSend?, onError? }` | — | Instance-only (never loaded from env). |
| `parseMessageId` | `boolean` | `true` | Parse `id`/`messageId` from response JSON. |

### `RetryConfig` (default)
`{ codes: [408,425,429,500,502,503,504], maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 8000 }`
Backoff = full-jitter exponential: `random(0, min(maxDelayMs, baseDelayMs * 2^(attempt-1)))`.

### `UrlGuardConfig` (all optional; omitted = no guard)
- `httpsOnly: boolean` — block non-`https:` URLs.
- `blockPrivateNetworks: boolean` — block RFC1918/loopback/link-local/CGNAT/ULA IPs (literal IPs via `node:net.BlockList`; `localhost`/`*.local`/`*.internal` for names).
- `blockHosts: string[]` / `allowHosts: string[]` — hostname match, supports `*.suffix` globs.
- `resolver: (host) => Promise<string[]>` — optional DNS resolver (e.g. `dns/promises.lookup`) to catch hostnames resolving to private IPs.

### `FieldMap` (all optional)
`from`, `to`, `cc`, `bcc`, `replyTo`, `subject`, `body`, `bodyHtml`, `bodyText`, `type`, `attachments`, `headers`, `tagName`.
`body` is mutually exclusive with `bodyHtml`/`bodyText`.

## `SendMailInput`

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | `string \| string[]` | yes | Recipients (deduped, trimmed). |
| `cc` | `string \| string[]` | no | |
| `bcc` | `string \| string[]` | no | |
| `replyTo` | `string` | no | |
| `from` | `string` | no | Overrides `config.fromAddress`. |
| `subject` | `string` | yes | `min(1)`. |
| `body` | `string` | yes | |
| `type` | `'text' \| 'html'` | no (default `html`) | Selects `bodyHtml` vs `bodyText`. |
| `attachments` | `{ filename, content, contentType?, cid? }[]` | no | `content` = base64. |
| `headers` | `Record<string,string>` | no | Emitted only if `fields.headers` maps them. |
| `tagName` | `string` | no | Opaque tag; emitted only if `fields.tagName` maps it. |

## `SendResult`
`{ messageId: string, status: number, response: Response, requestId?: string }`

## `ErrorCode` enum
| Code | When |
|---|---|
| `CONFIG_INVALID` | Config failed Zod validation (or no default poster configured). |
| `VALIDATION_FAILED` | Input failed validation, or body key missing for the chosen `type`. |
| `REQUEST_FAILED` | Non-retryable HTTP status, or network error (single attempt). |
| `TIMEOUT` | Per-attempt timeout expired. |
| `ABORTED` | External `AbortSignal` aborted (never retried). |
| `RETRY_EXHAUSTED` | Retry budget spent without success. |
| `URL_BLOCKED` | URL guard rejected the URL. |
| `PARSE_FAILED` | Could not parse the response body for messageId (falls back to synth). |

`EmailPosterError` has `{ code, status?, detail?, requestId?, cause? }`. Guard with `isEmailPosterError(e)`.
