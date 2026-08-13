# Reference — config, input, errors

## `EmailPosterConfig`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
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
| --- | --- | --- | --- |
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
| --- | --- |
| `CONFIG_INVALID` | Config failed Zod validation (or no default poster configured). |
| `VALIDATION_FAILED` | Input failed validation, or body key missing for the chosen `type`. |
| `REQUEST_FAILED` | Non-retryable HTTP status, or network error (single attempt). |
| `TIMEOUT` | Per-attempt timeout expired. |
| `ABORTED` | External `AbortSignal` aborted (never retried). |
| `RETRY_EXHAUSTED` | Retry budget spent without success. |
| `URL_BLOCKED` | URL guard rejected the URL. |
| `PARSE_FAILED` | Could not parse the response body for messageId (falls back to synth). |

`EmailPosterError` has `{ code, status?, detail?, requestId?, cause? }`. Guard with `isEmailPosterError(e)`.

## Browser-safe subset: `email-poster/pure`

The entire field-mapping / payload / interface layer with **zero `node:` imports** — no `fetch`,
no transport, no `EmailPoster` class. Safe to import from a browser bundle or edge worker, and
the foundation `email-poster/vue` is built on. Use it directly when you only need the schema helpers:

```ts
import {
  PRESETS, EmailPosterConfigSchema, buildPayload,
  detectInterface, exportInterface, importInterface, exportPayloadSchema,
  type FieldMap, type PresetName,
} from 'email-poster/pure'
```

| Export | Purpose |
| --- | --- |
| `PRESETS` | The four built-in field maps (`none` / `smtogo` / `generic` / `custom_example`). |
| `EmailPosterConfigSchema` | Zod schema for a `{ postUrl, preset, fields, … }` config. |
| `buildPayload(input, config)` | Resolve a logical input + field map into the downstream JSON. |
| `detectInterface(sample, { mode })` | Infer a `FieldMap` from a sample JSON instance or schema. |
| `exportInterface(config)` | Serialize the effective map as an `InterfaceDef`. |
| `importInterface(json)` | Load an `InterfaceDef` **or** a standard JSON Schema → `InterfaceDef`. |
| `exportPayloadSchema(def)` | Derive a draft-07 JSON Schema of the downstream payload. |

## Visual editor: `email-poster/vue`

A restyle-able editor for a `FieldMap` — a ready SFC plus a headless composable. Browser-safe
(depends only on `vue` + `email-poster/pure`). Requires Vue ≥ 3.4 and
`vite.optimizeDeps.exclude: ['email-poster']` (the SFC ships as source).

### `<MailInterfaceEditor>` SFC

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `modelValue` | `FieldMap` | — | **v-model** — the active field map (the selected schema's fields). |
| `disabled` | `boolean` | `false` | Disables every control. |
| `manageSchemas` | `boolean` | `true` | Render the client-side schema manager (switch/add/rename/delete/modify). `false` = legacy fixed-preset buttons. |
| `defaultSchemas` | `PostSchema[]` | `DEFAULT_SCHEMAS` | Seed used when the store's storage is empty. Pass `[]` to start blank. |
| `storageKey` | `string` | `'ep-mail-schemas'` | `localStorage` key for the internal schema store. |
| `schemaStore` | `UseSchemaStoreResult` | *(internal)* | Inject your own `useSchemaStore()` — share across components or swap storage. |

| Emit | Payload | When |
| --- | --- | --- |
| `update:modelValue` | `FieldMap` | The working copy changed (genuine user edit only — never echoes a resync). |
| `detected` | `{ message, count, fields }` | Detect-from-sample succeeded. |
| `imported` | `{ message, count, fields }` | Import succeeded. |
| `success` | `{ message, count? }` | Detect **or** import succeeded (fires alongside `detected`/`imported`). |
| `error` | `{ message }` | Detect / import failed. |
| `schema-active` | `{ id, name }` | The active field map now matches a schema (`id`/`name`), or none (`null`). |
| `schemas-change` | `{ schemas }` | The schema library changed (add/rename/delete/modify). |

> `detected`/`imported` and `success` fire **together** on success — toast on one of them, not
> both, or you'll get duplicate notifications.

Named slots (each receives scoped props bound to the composable handles): `#header`, `#presets`,
`#schemas` (`{ schemas, activeId, editingId, draftName, select, add, startRename, commitRename, remove, disabled }`),
`#help`, `#fields`, `#field` (per-row: `{ field, value, setField, disabled, inputId }`),
`#group-label` (`{ title }`), `#preview` (`{ payload }`),
`#detect` (`{ sampleText, runDetect, detectError, disabled }`),
`#actions` (`{ exportDef, exportSchema, triggerImport, disabled }`).

### `useMailInterfaceEditor(modelValue, options?)`

Headless: all state + logic, no markup. `modelValue` is a `MaybeRefOrGetter<FieldMap>` (pass a
ref/getter so it resyncs on external changes). Returns:

| Field | Type | Notes |
| --- | --- | --- |
| `fields` | `Ref<FieldMap>` | Working copy. |
| `setField(key, value)` | `(keyof FieldMap, string) => void` | Empty string unsets; enforces body XOR. |
| `applyPreset(name)` | `(PresetName) => void` | Replace the whole map. |
| `activePreset` | `ComputedRef<PresetName \| null>` | Exact-match preset, for highlight. |
| `previewType` | `ComputedRef<'html' \| 'text'>` | Body type inferred from the map. |
| `payloadPreview` | `ComputedRef<string>` | Sample downstream payload as JSON (`// <error>` on failure). |
| `sampleText` / `detectError` | `Ref<string>` | Detect input / last error message. |
| `runDetect()` | `() => DetectOutcome` | Parse + infer; mutates `fields`. |
| `exportDef()` / `exportSchema()` | `() => void` | Download InterfaceDef JSON / draft-07 schema. |
| `fileInput` / `triggerImport()` | `Ref<HTMLInputElement \| null>` / `() => void` | Hidden file input + opener. |
| `onImportFile(e)` | `(Event) => Promise<ImportOutcome>` | Read + apply an imported map. |
| `groups` / `presetButtons` | `GROUPS` / `PRESET_BUTTONS` | Field-group + preset-button taxonomies. |
| `isDisabled` | `ComputedRef<boolean>` | Normalized disabled flag. |

`options`: `{ disabled?: MaybeRefOrGetter<boolean>; dom?: { downloadJson } }` (`dom.downloadJson`
overrides the download sink, e.g. for tests). `DetectOutcome` / `ImportOutcome` are
`{ ok: true; count; fields } | { ok: false; error }`. Also exported: `GROUPS`, `PRESET_BUTTONS`,
and types `FieldDef`, `MailInterfaceEditorOptions`, `MailInterfaceEditorResult`.

### `useSchemaStore(options?)` — client-side schema library

A managed collection of named field maps with CRUD + persistence. The engine behind the SFC's
schema manager; usable headless. `PostSchema = { id, name, fields: FieldMap }`.

| Option | Default | Notes |
| --- | --- | --- |
| `storage` | localStorage adapter | `false` = in-memory only; or pass a custom `{ load(), save() }` adapter (server API, test spy). |
| `storageKey` | `'ep-mail-schemas'` | Key for the default localStorage adapter. |
| `defaults` | *(none)* | Seed used **only** when storage has never been written. Opt-in — pass `DEFAULT_SCHEMAS` to use the built-ins, or your own. The package never auto-injects. |
| `initialActiveId` | first schema | Resolved against the loaded list (stale ids fall back to the first). |

Returns `{ schemas, activeId, activeSchema, activeFields, hasSchemas, selectSchema,
addSchema, renameSchema, deleteSchema, updateSchemaFields, setActiveFields,
duplicateSchema, resetToDefaults }`. An explicit empty stored array means "cleared" (not
re-seeded); `undefined` means "never stored" (seed from `defaults`). Also exports `DEFAULT_SCHEMAS`
(the four built-in schemas: `SMToGo` / `Resend-like` / `Custom Example` / `Blank`) and types
`PostSchema`, `SchemaStorage`, `UseSchemaStoreOptions`, `UseSchemaStoreResult`.

### `useSchemaEditorBinding(modelValue, onUpdateModelValue, options?)` — editor ↔ store

Wires `useMailInterfaceEditor` to a `useSchemaStore`: powers switch / add / rename / delete, with
edits to the active schema written back automatically (modify), and a load-vs-edit guard so
loading a schema never clobbers the one being left. The active-schema highlight is derived
from `modelValue`, so it stays correct after an external resync (e.g. discard). `v-model`
semantics are unchanged: `onUpdateModelValue(fm)` fires only on genuine user edits. Returns
`{ editor, store, schemas, activeSchemaId, editingId, draftName, selectSchema, addSchema,
startRename, commitRename, removeSchema }`. `options`: `{ defaultSchemas?, storageKey?,
schemaStore?, disabled? }`.

### `--ep-*` theme variables

Defaults are set on `:where(.ep-editor)` (zero specificity) — override on `.ep-editor`.

| Variable | Default | Use |
| --- | --- | --- |
| `--ep-color-bg` | `transparent` | Editor background. |
| `--ep-color-fg` / `--ep-color-muted-fg` / `--ep-color-subtle-fg` | `#0f172a` / `#64748b` / `#94a3b8` | Text tones. |
| `--ep-color-border` / `--ep-color-muted-bg` | `#cbd5e1` / `#f1f5f9` | Borders / `<pre>` background. |
| `--ep-color-primary` / `-fg` / `-border` | `#0f172a` / `#fff` / `#0f172a` | Active preset button. |
| `--ep-color-ring` / `--ep-color-destructive` | `#94a3b8` / `#dc2626` | Focus ring / error text. |
| `--ep-radius` / `--ep-radius-sm` | `0.5rem` / `0.375rem` | Corner radii. |
| `--ep-space-pad` / `-section` / `-group` / `-row` | `1rem` / `1.25rem` / `0.5rem` / `0.375rem` | Layout spacing. |
| `--ep-gap-btn` / `--ep-gap-field` | `0.25rem` / `0.75rem` | Button / field gutters. |
| `--ep-font-size` / `-sm` / `-xs` | `0.875rem` / `0.75rem` / `0.625rem` | Type scale. |
| `--ep-line-height` / `--ep-font-sans` / `--ep-font-mono` | `1.5` / `inherit` / `ui-monospace,…` | Typography. |
