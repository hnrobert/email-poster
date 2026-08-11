# email-poster

> Schema-driven transactional email over HTTP POST webhooks — Power Automate, smtogo, or any JSON gateway.

[![CI](https://github.com/hnrobert/email-poster/actions/workflows/ci.yml/badge.svg)](https://github.com/hnrobert/email-poster/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/email-poster.svg)](https://www.npmjs.com/package/email-poster)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Declare how logical fields `{ to, subject, body, type }` map onto the JSON keys your
downstream expects (or pick a preset), then **one `send()` call** validates → assembles →
POSTs → parses the messageId. Built-in timeout, exponential-backoff retry, abort support,
an opt-in SSRF guard, lifecycle hooks, HTML template rendering, a CLI, and thin framework
adapters (Nuxt / NestJS / Hono).

This consolidates the duplicated `sendViaPost` `fetch(...)` block found across services that
relay mail through a webhook instead of speaking SMTP directly.

- **Framework-agnostic core** (pure `fetch`, Node ≥ 18, no native deps).
- **Schema-driven** with [Zod](https://zod.dev) — the only runtime dependency.
- **Dual ESM + CJS**, fully typed, tree-shakeable (`sideEffects: false`).

## Install

```bash
pnpm add email-poster
# or: npm i email-poster · yarn add email-poster
```

## Quick start

```ts
import { EmailPoster } from 'email-poster'

const mail = new EmailPoster({
  postUrl: process.env.MAIL_WEBHOOK_URL!,   // your webhook
  preset: 'smtogo',                          // 'smtogo' | 'generic' | 'custom_example'
  fromAddress: 'noreply@example.com',
  headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` },
})

const res = await mail.send({ to: 'a@b.c', subject: 'Hi', body: '<b>Hello</b>' })
console.log(res.messageId, res.status)
```

## Presets

| Preset | Output JSON (for `to:'a@b.c', subject:'Hi', body:'<b>X</b>'`) | Use when |
|---|---|---|
| `smtogo` *(default)* | `{ from, to, subject, html }` | smtogo gateway / Resend-html shape |
| `generic` | `{ from, to, subject, html \| text }` | resend-like dual-body (html/text split by `type`) |
| `custom_example` | `{ email, subject, content }` | Power Automate shape (renamed from `powerautomate`) |

## Custom field mapping

If no preset fits, declare your own map. Use a single `body` key **or** split
`bodyHtml`/`bodyText` (picked by `input.type`) — never both.

```ts
new EmailPoster({
  postUrl,
  fields: {
    to: 'recipient',
    subject: 'title',
    bodyHtml: 'html_content',
    bodyText: 'text_content',
    type: 'format',
  },
})
await mail.send({ to: 'a@b.c', subject: 'Hi', body: 'plain', type: 'text' })
// → { recipient: 'a@b.c', title: 'Hi', text_content: 'plain', format: 'text' }
```

Static keys via `extra` are merged into every payload first; mapped fields override on collision.

## Configuration

```ts
new EmailPoster({
  postUrl,                       // required (url)
  preset: 'smtogo',              // optional, default smtogo
  fields: { /* ... */ },         // optional, extends/overrides preset
  fromAddress: 'noreply@x.com',  // optional default From (input.from overrides)
  extra: { source: 'app' },      // optional static payload keys
  headers: { Authorization: 'Bearer …' }, // auth + custom HTTP headers
  successCodes: [200, 202],      // optional; default = any 2xx
  timeoutMs: 15_000,             // per-attempt timeout
  retry: {
    codes: [408, 425, 429, 500, 502, 503, 504],
    maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 8_000, // full-jitter exponential
  },
  urlGuard: { httpsOnly: true, blockPrivateNetworks: true, allowHosts: ['*.example.com'] },
  recipients: { serialize: 'comma', maxLength: 50 },   // or 'array'
  limits: { maxLenRecipientEmail: 320, maxLenSubject: 200, maxLenBody: 50_000 },
  hooks: { beforeSend, afterSend, onError },
  parseMessageId: true,          // parse id/messageId from response JSON
})
```

> `Content-Type` is **always forced** to `application/json`, even if set in `headers`.

## Reliability

- **Timeout** per attempt (`timeoutMs`), composable with an external `AbortSignal`:
  ```ts
  await mail.send(input, { signal: ctrl.signal, timeoutMs: 5_000 })
  ```
- **Retry** with full-jitter exponential backoff on configurable status codes + network errors.
  External abort → `ABORTED` (never retried); internal timeout → `TIMEOUT` (retried).
- **Errors** are `EmailPosterError { code, status?, detail?, requestId? }`:
  ```ts
  enum ErrorCode {
    CONFIG_INVALID, VALIDATION_FAILED, REQUEST_FAILED, TIMEOUT,
    ABORTED, RETRY_EXHAUSTED, URL_BLOCKED, PARSE_FAILED,
  }
  ```
  Guard with `isEmailPosterError(e)`.

## SSRF guard (opt-in, off by default)

Only enable if `postUrl` may be influenced by user input. Literal private IPs are blocked
via `node:net.BlockList` (RFC1918/loopback/link-local/CGNAT/ULA); pass a `resolver`
(`dns/promises.lookup`-style) to also catch hostnames that resolve to private IPs.

```ts
import { lookup } from 'node:dns/promises'
new EmailPoster({ postUrl, urlGuard: {
  httpsOnly: true,
  blockPrivateNetworks: true,
  blockHosts: ['*.internal'],
  resolver: async (h) => (await lookup(h)).map((r) => r.address),
} })
```

## Rate limiting (opt-in utilities)

```ts
import { slidingWindow, tokenBucket } from 'email-poster'
const limiter = slidingWindow({ windowMs: 60_000, max: 30 })
if (limiter.take('a@b.c')) await mail.send(input)
```

## Config sources & singleton

```ts
import { configure, send, getDefaultPoster } from 'email-poster'
configure({ postUrl: process.env.MAIL_WEBHOOK_URL!, preset: 'smtogo' }) // wins over env
await send({ to: 'a@b.c', subject: 'Hi', body: 'b' })                    // uses default poster
```
Without `configure()`, the default poster is built lazily from `EMAIL_POSTER_*` env vars.

## Hooks

```ts
new EmailPoster({
  postUrl, preset: 'smtogo',
  hooks: {
    beforeSend: async ({ payload, headers }) => ({ payload: { ...payload, ts: Date.now() }, headers }),
    afterSend: ({ result }) => console.log('sent', result.messageId),
    onError: ({ error }) => console.error(error),
  },
})
```
`beforeSend` may return a rewritten `{ payload, headers }` (applied once before the first
attempt). `afterSend`/`onError` are fire-and-forget; hook errors are warned, never thrown.

## HTML template (optional subpath)

```ts
import { renderEmailCard } from 'email-poster/template'
const html = renderEmailCard(
  { title: 'Welcome', bodyHtml: '<p>Hi</p>', actionLabel: 'Verify', actionUrl: 'https://x/v' },
  { brandTitle: 'Acme', logo: 'https://x/logo.png' },
)
await mail.send({ to: 'a@b.c', subject: 'Welcome', body: html })
```
Light by default, dark via `prefers-color-scheme`. Bring your own template string if needed.

## CLI

```bash
npx email-poster send --dry-run --json --preset custom_example --url https://x.com \
  --to a@b.c --subject Hi --body Hello --header "Authorization: Bearer tok"

echo "Hello" | npx email-poster send --preset smtogo --url https://x.com \
  --to a@b.c --subject Hi --body-stdin

npx email-poster validate --config .email-posterrc.json
```
Run `npx email-poster --help` for the full flag list.
Config precedence: `.email-posterrc.json` < `EMAIL_POSTER_*` env < `--config <file>` < flags.

## Framework adapters

```ts
// Nuxt (reads runtimeConfig.emailPoster, cached by postUrl)
import { useEmailPoster } from 'email-poster/adapters/nuxt'
const mail = await useEmailPoster()

// NestJS (spread into @Module providers, inject EmailPosterService)
import { emailPosterProviders } from 'email-poster/adapters/nestjs'

// Hono (POST handler → { ok, messageId, status })
import { createMailRoute } from 'email-poster/adapters/hono'
app.post('/mail', createMailRoute(poster))
```

See the [`skills/email-poster/`](./skills/email-poster) directory for a Claude Code skill
with a preset decision tree, full reference, and copy-paste framework wiring.

### Install the skill for your AI agent

The skill ships inside the package under `skills/email-poster/` (the
[`skills-npm`](https://github.com/antfu/skills-npm) convention), so agents can discover it.
After installing the package, sync it into your agent(s):

```bash
npx skills-npm setup     # one-time: wires the `prepare` hook + first sync
# thereafter every `pnpm install` / `npm install` re-links skills automatically
```

Or copy it manually: `cp -R node_modules/email-poster/skills/email-poster ~/.claude/skills/`

## License

[Apache-2.0](LICENSE) © Robert He
