# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-11

### Added
- **Core:** schema-driven `EmailPoster` class — declare a field map (or pick a preset) and
  one `send()` validates → assembles → POSTs → parses messageId.
- **Presets:** `smtogo` (`{from,to,subject,html}`), `generic` (html/text split),
  `custom_example` (`{email,subject,content}`, the renamed Power Automate shape).
- **Reliability:** per-attempt timeout + external `AbortSignal` composition, exponential
  backoff retry (full-jitter) on configurable status codes, network errors, and timeouts.
- **Errors:** `EmailPosterError { code, status?, detail?, requestId? }` with the `ErrorCode`
  enum and `isEmailPosterError()` guard.
- **SSRF guard** (opt-in, off by default): `httpsOnly`, `blockPrivateNetworks`
  (`node:net.BlockList`), `blockHosts`/`allowHosts` (with `*.suffix` globs), optional `resolver`.
- **Rate-limit utilities:** `slidingWindow`, `tokenBucket` (opt-in).
- **Config sources:** instance constructor, `EMAIL_POSTER_*` env loader, process singleton
  (`configure`/`send`/`getDefaultPoster`).
- **Hooks:** `beforeSend` (can rewrite payload/headers), `afterSend`, `onError`.
- **HTML template** (`email-poster/template`): `renderEmailCard`, `renderTemplate`,
  `escapeHtml`, `DEFAULT_TEMPLATE` (light/dark via `prefers-color-scheme`).
- **CLI** (`email-poster send` / `validate`): zero-dependency argv, `--dry-run`, `--json`,
  stdin/attach/header support, `.email-posterrc.json` + env + `--config` layering.
- **Adapters:** `email-poster/adapters/{nuxt,nestjs,hono}` (dependency-free).
- **Claude Code skill** shipped under `skill/`.
- Dual ESM + CJS build via tsup, full `.d.ts`, sourcemaps; Zod as the only runtime dep.

[0.1.0]: https://github.com/hnrobert/email-poster/releases/tag/v0.1.0
