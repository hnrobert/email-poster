---
name: email-poster
description: Send transactional email by POSTing a small JSON payload to an HTTP webhook (Microsoft Power Automate flow, a custom "smtogo" gateway, or any JSON-accepting endpoint). Use when the user wants to send mail over an HTTP POST webhook, consolidate duplicated sendViaPost logic across services, or map logical email fields (to/subject/body/type) onto a downstream's custom JSON keys. Not for SMTP-only sending (use nodemailer) or single-vendor SaaS SDKs (Resend/SendGrid).
---

# email-poster

Schema-driven email sending over HTTP POST webhooks. Declare how logical fields
`{to, subject, body, type}` map onto the JSON keys your downstream expects (or
pick a preset), then one `send()` call validates → assembles → POSTs → parses
the messageId. Built-in timeout, exponential-backoff retry, abort support, an
opt-in SSRF guard, hooks, and HTML template rendering.

## Install this skill

This skill ships inside the `email-poster` npm package under `skills/email-poster/`
(the [`skills-npm`](https://github.com/antfu/skills-npm) convention), so agent tooling
can discover and link it automatically.

```bash
# 1. install the package in your project
pnpm add email-poster   # or: npm i email-poster

# 2. one-time setup — wires the `prepare` hook and links the skill into whatever
#    coding agents it auto-detects (Claude Code, Cursor, …)
npx skills-npm setup

# thereafter every `pnpm install` / `npm install` re-links skills automatically
```

No `skills-npm`? Copy it manually:
```bash
cp -R node_modules/email-poster/skills/email-poster ~/.claude/skills/   # Claude Code
```

## When to use this skill

- The user is POSTing JSON to Power Automate / a smtogo gateway / any webhook to send mail.
- Multiple services copy-paste the same `sendViaPost` `fetch(...)` block — consolidate it.
- The downstream wants non-standard keys (`email` instead of `to`, `content` instead of `body`, …).

**Don't use it for:** direct SMTP (nodemailer), or a single managed vendor SDK (Resend/SendGrid/Courier) where you'd rather use their first-party client.

## 1. Pick a preset (decision tree)

| Downstream expects… | Preset | Output JSON |
|---|---|---|
| `{ from, to, subject, html }` | `smtogo` | the smtogo / Resend-html shape |
| `{ from, to, subject, html, text }` (html+text split) | `generic` | resend-like dual-body |
| `{ email, subject, content }` | `custom_example` | the Power Automate shape (renamed from `powerautomate`) |
| Anything else | omit `preset`, declare `fields` | fully custom |

If none fit, declare a custom field map — see `presets.md` for the exact JSON each preset emits.

## 2. Minimal usage

```ts
import { EmailPoster } from 'email-poster'

const mail = new EmailPoster({
  postUrl: process.env.MAIL_WEBHOOK_URL!,     // the webhook
  preset: 'smtogo',                            // or 'generic' | 'custom_example'
  fromAddress: 'noreply@example.com',          // default From
  headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` }, // auth
})

const res = await mail.send({ to: 'a@b.c', subject: 'Hi', body: '<b>Hello</b>' })
// res.messageId — parsed from the response if possible, else synthesized
```

## 3. Custom field mapping

```ts
new EmailPoster({
  postUrl,
  fields: {
    to: 'recipient', subject: 'title',
    bodyHtml: 'html_content', bodyText: 'text_content', // picked by input.type
  },
})
// send({ to, subject, body, type: 'text' }) → { recipient, title, text_content }
```

Rules: use `body` (single key) **or** `bodyHtml`+`bodyText` (split by `type`) — never both.
With split keys, sending `type:'html'` when only `bodyText` is mapped throws `VALIDATION_FAILED`.

## 4. Wiring into frameworks

- **Nuxt:** `useEmailPoster()` reads `runtimeConfig.emailPoster` (cached by `postUrl`). See `install.md`.
- **NestJS:** `emailPosterProviders(config)` → spread into `@Module({ providers })`, inject `EmailPosterService`. See `install.md`.
- **Hono:** `createMailRoute(poster)` → `app.post('/mail', route)` returns `{ok,messageId,status}`. See `install.md`.

## 5. Reliability defaults (already on)

- Timeout 15s per attempt; external `AbortSignal` via `send(input, { signal })`.
- Retry: exponential backoff (full-jitter) on `{408,425,429,500,502,503,504}`, 3 attempts, 0.5s→8s.
- Errors are `EmailPosterError { code, status?, detail?, requestId? }` — see `reference.md` for the `ErrorCode` enum.

## Common pitfalls

- **`Content-Type` is always forced to `application/json`** — even if you set it in `headers`.
- **Auth goes in `config.headers`**, not in a field (e.g. `Authorization: Bearer …`).
- **SSRF guard is OFF by default.** Set `urlGuard: { httpsOnly: true, blockPrivateNetworks: true }` if `postUrl` comes from user input.
- **messageId is best-effort:** parsed from the downstream JSON (`id`/`messageId`) only when `parseMessageId` is true (default); else synthesized as `<post-<hex>@webhook>`.
- **Attachments are opaque:** pass `{ filename, content }` where `content` is already base64; the package never reads files at runtime (only the CLI `--attach` base64-encodes).

See `reference.md` (full config/input/error reference), `presets.md` (preset JSON examples), and `install.md` (framework wiring).
