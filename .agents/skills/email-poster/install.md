# Install & framework wiring

## Install

```bash
pnpm add email-poster
# or: npm i email-poster / yarn add email-poster
```

Requires Node >= 18 (uses global `fetch`). Peer dependency: none (runtime dep is `zod`).

## CLI (ships with the package)

```bash
# Preview the resolved field map + payload without sending:
npx email-poster send --dry-run --preset custom_example --url https://x.com \
  --to a@b.c --subject Hi --body Hello --header "Authorization: Bearer tok"

# Send from stdin:
echo "Hello" | npx email-poster send --preset smtogo --url https://x.com \
  --to a@b.c --subject Hi --body-stdin

# Validate a config file (exit 0 = valid):
npx email-poster validate --config .email-posterrc.json
```

Config precedence (`send`): `.email-posterrc.json` < `EMAIL_POSTER_*` env < `--config <file>` < CLI flags.

## Env-only (no code config)

```ts
import { send } from 'email-poster' // uses EMAIL_POSTER_* env, lazily
await send({ to: 'a@b.c', subject: 'Hi', body: 'b' })
```

Env vars: `EMAIL_POSTER_POST_URL`, `EMAIL_POSTER_PRESET`, `EMAIL_POSTER_FROM_ADDRESS`,
`EMAIL_POSTER_HEADERS` (JSON), `EMAIL_POSTER_EXTRA` (JSON), `EMAIL_POSTER_TIMEOUT_MS`,
`EMAIL_POSTER_SUCCESS_CODES` (csv), `EMAIL_POSTER_RETRY_CODES`, `EMAIL_POSTER_RETRY_MAX_ATTEMPTS`,
`EMAIL_POSTER_RETRY_BASE_DELAY_MS`, `EMAIL_POSTER_RETRY_MAX_DELAY_MS`, `EMAIL_POSTER_PARSE_MESSAGE_ID`.

Or build explicitly: `import { EmailPoster } from 'email-poster'`; singleton: `import { configure, send } from 'email-poster'`.

## Nuxt 3

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    emailPoster: {
      postUrl: process.env.MAIL_WEBHOOK_URL,
      preset: 'smtogo',
      fromAddress: 'noreply@example.com',
      headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` },
    },
  },
})
```

In a server route / plugin:

```ts
import { useEmailPoster } from 'email-poster/adapters/nuxt'
const mail = await useEmailPoster()      // cached by postUrl
await mail.send({ to: 'a@b.c', subject: 'Hi', body: '<b>x</b>' })
```

## NestJS

```ts
import { Module } from '@nestjs/common'
import { EmailPosterService, emailPosterProviders } from 'email-poster/adapters/nestjs'

const providers = emailPosterProviders({
  postUrl: process.env.MAIL_WEBHOOK_URL!,
  preset: 'custom_example',
  headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` },
})

@Module({ providers: [...providers, MailService], exports: [EmailPosterService] })
export class MailModule {}

@Injectable()
export class MailService {
  constructor(private readonly mailer: EmailPosterService) {}
  send(to: string, subject: string, body: string) {
    return this.mailer.send({ to, subject, body })
  }
}
```

## Hono

```ts
import { Hono } from 'hono'
import { EmailPoster, createMailRoute } from 'email-poster/adapters/hono'

const poster = new EmailPoster({
  postUrl: process.env.MAIL_WEBHOOK_URL!,
  preset: 'smtogo',
  headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` },
})
const app = new Hono()
app.post('/mail', createMailRoute(poster))
// POST /mail { "to": "a@b.c", "subject": "Hi", "body": "<b>x</b>" }
// → 200 { "ok": true, "messageId": "...", "status": 200 }
```

## HTML template (optional subpath)

```ts
import { renderEmailCard } from 'email-poster/template'
const html = renderEmailCard(
  { title: 'Welcome', bodyHtml: '<p>Hi there</p>', actionLabel: 'Verify', actionUrl: 'https://x/v' },
  { brandTitle: 'Acme', logo: 'https://x/logo.png' },
)
// pass `html` as the `body` with type:'html'
```

## Visual editor (Vue 3) subpath

```ts
import { MailInterfaceEditor, useMailInterfaceEditor } from 'email-poster/vue'
```

A restyle-able `<MailInterfaceEditor>` SFC — field-map editor with live payload preview,
detect-from-sample, import/export, and a saved **post-schemas** library (switch/add/rename/delete)
— plus a headless `useMailInterfaceEditor()` composable for fully custom UI. Browser-safe: it
depends only on `vue` (peer, `^3.4`) and `email-poster/pure`. The SFC ships as source, so add this
one line to your Vite/Nuxt config so Vite's `optimizeDeps` doesn't skip compiling it:

```ts
vite: { optimizeDeps: { exclude: ['email-poster'] } }
```

> A "post schema" here is a saved `FieldMap` (the webhook *payload structure*) — not an email body
> template (the HTML rendering lives in `email-poster/template`). Full props/emits/slots/API →
> `reference.md`, "Visual editor: `email-poster/vue`".
