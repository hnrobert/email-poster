# email-poster

> Schema-driven transactional email over HTTP POST webhooks — SMToGo, custom JSON, or any webhook gateway.

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
| --- | --- | --- |
| `smtogo` *(default)* | `{ from, to, subject, html }` | smtogo gateway / Resend-html shape |
| `generic` | `{ from, to, subject, html \| text }` | resend-like dual-body (html/text split by `type`) |
| `custom_example` | `{ email, subject, content }` | Custom Example trigger shape |

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

Browser-safe rendering (no `node:` imports) for the email **body** — the HTML the recipient
sees. Supply content + an [`EmailTheme`](#theming); the presets handle all markup, inline
styles, and dark mode. (These are email *body templates* — unrelated to the *post-schema
presets* in `email-poster/pure`, which describe the webhook JSON payload.)

```ts
import { renderEmail } from 'email-poster/template'
const html = renderEmail('code', { code: '123456', hintHtml: '<p>Expires in 10 minutes.</p>' }, {
  brandTitle: 'Acme', logo: 'https://x/logo.png', primaryColor: '#2563eb',
})
await mail.send({ to: 'a@b.c', subject: 'Your verification code', body: html })
```

The original single-template helper is still exported (`renderEmailCard`, byte-identical):

```ts
import { renderEmailCard } from 'email-poster/template'
const html = renderEmailCard(
  { title: 'Welcome', bodyHtml: '<p>Hi</p>', actionLabel: 'Verify', actionUrl: 'https://x/v' },
  { brandTitle: 'Acme', logo: 'https://x/logo.png' },
)
```

### Theming

Every preset renderer takes `(content, theme?)`. One theme object brands them all:

```ts
import type { EmailTheme } from 'email-poster/template'

const theme: EmailTheme = {
  brandTitle: 'Acme',            // header brand name (default 'email-poster')
  brandSubtitle: 'Freshmen 2026',// muted line under the brand
  logo: 'https://x/logo.png',    // header icon URL — the <img> is omitted entirely when unset
  primaryColor: '#2563eb',       // CTA/badge color; #rgb/#rrggbb/#rrggbbaa only (default '#F7D447')
  footerHtml: 'Acme · no-reply@example.com', // raw HTML (default 'Sent via email-poster · © year')
  extraCss: '.brand-title { letter-spacing: .5px; }', // appended inside the <style> block
  year: 2026,                    // override the footer year
}
```

The CTA button (and the `welcome` badge) automatically pick a readable foreground for
`primaryColor` via perceived-luminance contrast (`readableForeground`), and `primaryColor` is
whitelisted through `safeColor` — anything that isn't a plain hex falls back to the default
yellow, so a hostile color string can never inject CSS.

### Presets

| Name | Renderer | Content model |
| --- | --- | --- |
| `card` | `renderCardEmail` | `{ title, bodyHtml, actionLabel?, actionUrl?, preheader? }` |
| `code` | `renderCodeEmail` | `{ code, title?, leadHtml?, hintHtml?, action…, preheader? }` — 36px letter-spaced mono hero |
| `welcome` | `renderWelcomeEmail` | `{ title?, badgeText?, titleIconUrl?, heroImageUrl?, bodyHtml, action…, preheader? }` |
| `receipt` | `renderReceiptEmail` | `{ title, bodyHtml?, rows: {label, value}[], totalLabel?, totalValue?, noteHtml?, action…, preheader? }` |
| `alert` | `renderAlertEmail` | `{ level?: 'success'\|'warning'\|'error'\|'info', title, bodyHtml, details?: string[], action…, preheader? }` |
| `plain` | `renderPlainEmail` | `{ bodyHtml, preheader? }` — no card chrome at all |

`actionLabel`/`actionUrl` render a primary-color CTA when **both** are present; `preheader`
is the hidden inbox preview text. `renderEmail(name, content, theme?)` dispatches by name
(unknown name → `TypeError`); each renderer is also exported directly, and `EMAIL_TEMPLATES`
maps name → template string.

```ts
import { renderAlertEmail, renderReceiptEmail } from 'email-poster/template'

renderAlertEmail({ level: 'error', title: 'Sync failed', bodyHtml: '<p>3 items rejected.</p>',
                  details: ['row 12: bad email', 'row 18: duplicate'], actionLabel: 'View report',
                  actionUrl: 'https://x/r' }, theme)

renderReceiptEmail({ title: 'Your order', rows: [{ label: 'Ticket', value: '¥120' }],
                     totalLabel: 'Total', totalValue: '¥120' }, theme)
```

### Custom templates

Every renderer accepts a trailing `template` string — the escape hatch. Start from an exported
`*_TEMPLATE` (or compose a whole shell with `EMAIL_SHELL` + `composeShellTemplate(fragment)`)
and edit:

```ts
import { renderCodeEmail, CODE_TEMPLATE, escapeHtml } from 'email-poster/template'

const mine = CODE_TEMPLATE.replace('letter-spacing: 10px', 'letter-spacing: 6px')
const html = renderCodeEmail({ code: '123456' }, theme, mine)
```

`EMAIL_SHELL` tokens: `{{PREHEADER}}` `{{TITLE}}` `{{BRAND_TITLE}}` `{{BRAND_SUBTITLE}}`
`{{LOGO_BLOCK}}` `{{CONTENT}}` `{{FOOTER_HTML}}` `{{EXTRA_CSS}}` — plus `{{PRIMARY_COLOR}}` /
`{{PRIMARY_INK}}` provided via `shellVars()` for shells that want theme-colored chrome. The
primitives are exported too: `renderTemplate(tpl, escapedVars, rawVars)` and `escapeHtml`.

### Escaping & dark mode

**Escaped automatically** (safe for text/attributes): `title`, `brandTitle`, `brandSubtitle`,
`badgeText`, `code`, `preheader`, receipt labels/values, alert `details[]`, `actionLabel`, and
all URLs (`actionUrl`, `logo`, `titleIconUrl`, `heroImageUrl`).
**Raw — trusted HTML you supply:** `bodyHtml`, `leadHtml`, `hintHtml`, `noteHtml`,
`footerHtml`, `extraCss`.
**Dark mode:** light by default, dark via `prefers-color-scheme` (`!important` class
overrides; all critical styling stays inline). Clients without media-query support —
notably Outlook desktop — show the light version.

## Visual field-map editor (Vue, optional subpath)

`email-poster/vue` ships a dependency-free, fully restyle-able **visual editor** for the
`fields` map — the JSON you'd otherwise hand-write. Drop it into an admin UI so operators can
pick a preset, map each logical field to a downstream key, watch a live payload preview, detect a
map from a pasted sample request, or **import one from a JSON Schema** (an email-poster
InterfaceDef, a standard draft-07 schema, or a webhook trigger schema — including Power
Automate-style ones). It also manages a **post-schemas library** (switch / add / rename /
delete; editing the active schema updates it) so common field maps are one click away. Built on
the browser-safe `email-poster/pure` subset (no `node:` builtins, no transport) — safe for the
client bundle. Requires **Vue ≥ 3.4**.

> **One bit of config required.** The editor ships as `.vue` source (your Vite/Nuxt compiles
> it), and esbuild can't pre-bundle `.vue` — so exclude the package from dep optimization:
>
> ```ts
> // nuxt.config.ts / vite.config.ts
> vite: { optimizeDeps: { exclude: ['email-poster'] } }
> ```

### Ready-to-use component

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { MailInterfaceEditor, type FieldMap } from 'email-poster/vue'

// v-model is the FieldMap your server validates / persists as the mail config.
const fieldMap = ref<FieldMap>({ to: 'to', subject: 'subject', body: 'html' })
const saving = ref(false)
</script>

<template>
  <MailInterfaceEditor
    v-model="fieldMap"
    :disabled="saving"
    @detected="(e) => toast.success(e.message)"
    @imported="(e) => toast.success(e.message)"
    @error="(e) => toast.error(e.message)"
  />
</template>
```

Events (wire to **your own** toast — the editor ships no UI framework): `detected`, `imported`,
`success` each carry `{ message, count?, fields? }`; `error` carries `{ message }`;
`schema-active` carries `{ id, name }`; `schemas-change` carries `{ schemas }`.

### Post-schemas library

A **post schema** is a named `FieldMap` — a saved mapping of logical email field → downstream JSON
key that defines the *payload structure* of the POST webhook. It is **not** an email body template
(the HTML/text rendering lives in `email-poster/template`); these schemas only describe the webhook
payload, so the two are kept separate.

By default the editor shows a **schema manager** above the field rows — a list of named field
maps the operator can switch between, add to, rename, and delete. Editing the fields of the active
schema writes back to it automatically (so a schema stays in sync with what you last edited).

**The consuming application owns schema storage** — not the browser. Persistence goes through a
`storage` adapter the consumer provides, and the package ships a localStorage adapter as a
ready-made default. For a server app the intended pattern is a **custom adapter that loads/saves
against your own backend** (database / API), so schemas are shared across operators and survive
a browser switch rather than living in one browser's `localStorage`. The library seeds, the first
time only, from the package's built-ins (`SMToGo` / `Resend-like` / `Custom Example` / `Blank`) —
the same shapes as the presets — unless the consumer opts out.

```vue
<MailInterfaceEditor v-model="fieldMap" :disabled="saving" />
<!-- schema manager on by default; v-model still reflects the active field map -->
```

| Prop | Default | Purpose |
| --- | --- | --- |
| `manageSchemas` | `true` | Render the schema manager. Set `false` for the legacy fixed-preset buttons. |
| `defaultSchemas` | `DEFAULT_SCHEMAS` | Seed used when storage is empty. Pass `[]` to start blank, or your own list. |
| `storageKey` | `'ep-mail-schemas'` | `localStorage` key for the built-in adapter. |
| `schemaStore` | *(internal)* | Inject your own `useSchemaStore()` — to share one store across components or swap the storage adapter (e.g. a server-backed one). |

The store is the consumer's storage for schemas; `v-model` is the active field map your server
persists. They're decoupled by design: the library is a palette of field maps, and the selected
one's fields flow out through `v-model`. To persist schemas somewhere other than `localStorage`
— your own backend, an in-memory spy for tests, or not at all — build the store yourself and pass
it in:

```ts
import { MailInterfaceEditor, useSchemaStore, DEFAULT_SCHEMAS } from 'email-poster/vue'

// Back the library with your own backend: load() returns the saved list (or
// undefined the first time, so it seeds DEFAULT_SCHEMAS), save() persists.
const store = useSchemaStore({
  defaults: DEFAULT_SCHEMAS,
  storage: {
    load: () => props.schemas,                  // fetched from your API
    save: (t) => debouncePut('/api/post-schemas', t), // persisted to your DB
  },
})
// in-memory only (e.g. tests): storage: false
```

> **SSR (Nuxt):** the editor touches the DOM (file inputs, focus), so wrap it in `<ClientOnly>`.
> When you back the store with your own backend, guard the adapter's load/save with
> `import.meta.client` so no backend I/O fires during server-side render.

### Styling — works with or without Tailwind / shadcn

Plain HTML + `.ep-*` classes, themed by `--ep-*` CSS variables. Defaults live under
`:where(.ep-editor)` (zero specificity), so any override wins. Four ways to restyle:

1. **Remap `--ep-*` to your tokens** — also gives you dark mode for free (example below).
2. Target `.ep-*` classes directly (scoped styles may need higher specificity).
3. Replace whole sections via named slots: `#header`, `#presets`, `#schemas`, `#fields`,
   `#field` (per row), `#group-label`, `#preview`, `#detect`, `#actions`.
4. Pass a root `class` through to `.ep-editor`.

For a shadcn / Tailwind theme, point the variables at your tokens:

```css
.ep-editor {
  --ep-color-primary: var(--primary);
  --ep-color-primary-fg: var(--primary-foreground);
  --ep-color-border: var(--border);
  --ep-color-fg: var(--foreground);
  --ep-color-muted-fg: var(--muted-foreground);
  --ep-color-muted-bg: var(--muted);
  --ep-color-destructive: var(--destructive);
  --ep-radius: var(--radius);
}
```

### Headless — build your own UI

All logic, zero markup:

- `useMailInterfaceEditor(modelValue)` — the field-map editor: returns `{ fields, setField,
  applyPreset, activePreset, payloadPreview, runDetect, exportDef, exportSchema, onImportFile, … }`.
- `useSchemaStore({ defaults?, storage?, storageKey? })` — the post-schemas library (CRUD +
  persistence). The consumer owns storage via the `storage` adapter (localStorage by default; pass
  your own to back it with a backend). Returns `{ schemas, activeId, addSchema, renameSchema,
  deleteSchema, updateSchemaFields, duplicateSchema, resetToDefaults, … }`. Importing the
  built-in seed is opt-in: pass `defaults: DEFAULT_SCHEMAS` to use it, or omit to start empty.
- `useSchemaEditorBinding(modelValue, onUpdateModelValue, options?)` — wires the editor to a
  schema store (the logic the SFC's schema manager uses), so a fully custom UI gets
  switch/add/rename/delete/modify for free.

Full return shapes, the SFC's props/emits/slots, and the complete `--ep-*` variable list are in the
[Agent Skill reference](./.agents/skills/email-poster/reference.md).

## CLI

```bash
npx email-poster send --dry-run --json --preset custom_example --url https://x.com \
  --to a@b.c --subject Hi --body Hello --header "Authorization: Bearer tok"

echo "Hello" | npx email-poster send --preset smtogo --url https://x.com \
  --to a@b.c --subject Hi --body-stdin

npx email-poster validate --config .email-posterrc.json

npx email-poster install-skill all   # install the bundled Agent Skill for every agent
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

See the [`.agents/skills/email-poster/`](./.agents/skills/email-poster) directory for an
[Agent Skill](https://agentskills.io) with a preset decision tree, full reference, and
copy-paste framework wiring.

### Install the skill for your AI agent

The skill ships at `.agents/skills/email-poster/` — a directory convention the open
[`npx skills`](https://github.com/vercel-labs/skills) CLI (skills.sh) recognizes and scans.
Install it three ways, pick whichever fits your setup:

```bash
# 1. From the GitHub repo (recommended — `npx skills` pulls from git, not node_modules):
npx skills add hnrobert/email-poster
#    → finds .agents/skills/email-poster/SKILL.md and installs it into your project
#      (`.agents/skills/`) or your local agent, detected automatically

# 2. From the npm package you already installed (local path):
npx skills add ./node_modules/email-poster/.agents/skills/email-poster

# 3. Bundled installer — copies straight into each agent's native dir (no extra tooling):
npx email-poster install-skill            # auto-detect (fallback: claude)
npx email-poster install-skill all        # claude + codex + gemini + cursor + opencode
```

## License

[Apache-2.0](LICENSE) © Robert He
