# Presets — exact JSON each emits

For `send({ to: 'a@b.c', subject: 'Hi', body: '<b>X</b>', from: 'f@x.com' })`.

## `smtogo` (default)
Field map: `{ from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html' }`
```json
{ "from": "f@x.com", "to": "a@b.c", "subject": "Hi", "html": "<b>X</b>" }
```
> Matches the smtogo gateway and the `sendViaPost` "smtogo" branch. Single HTML body; a `type:'text'` send throws `VALIDATION_FAILED` (no `bodyText` key).

## `generic`
Field map: `{ from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html', bodyText: 'text' }`
```json
{ "from": "f@x.com", "to": "a@b.c", "subject": "Hi", "html": "<b>X</b>" }
```
With `type: 'text'` it instead emits `{ ..., "text": "<body>" }` (no `html` key). Resend-like dual-body gateways.

## `custom_example` (Custom Example trigger shape)
Field map: `{ to: 'email', subject: 'subject', body: 'content' }`
```json
{ "email": "a@b.c", "subject": "Hi", "content": "<b>X</b>" }
```
> Single `body` key, so both `text` and `html` go into `content`; no `from` by default.

## Custom (no preset)
```ts
new EmailPoster({
  postUrl,
  fields: { to: 'recipient', subject: 'title', body: 'message', type: 'format' },
})
// → { "recipient": "a@b.c", "title": "Hi", "message": "<b>X</b>", "format": "html" }
```
With `extra: { source: 'app' }`, every payload starts with `{ "source": "app", ... }`.
