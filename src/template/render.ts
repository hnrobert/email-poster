import { DEFAULT_TEMPLATE } from './default-template'
import { readableForeground, safeColor } from './theme'
import type { EmailCardContent, RenderEmailCardOptions, TemplateVars } from './types'

/** Escape the five significant HTML characters. */
export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Replace `{{KEY}}` tokens in a template.
 * - `escaped` values pass through {@link escapeHtml} (safe for text nodes / attributes).
 * - `raw` values are inserted verbatim (use for trusted HTML fragments, e.g. the body).
 * Tokens absent from either map are left untouched.
 */
export function renderTemplate(
  tpl: string,
  escaped: TemplateVars = {},
  raw: TemplateVars = {},
): string {
  let out = tpl
  for (const [k, v] of Object.entries(escaped)) {
    out = out.split(`{{${k}}}`).join(escapeHtml(v))
  }
  for (const [k, v] of Object.entries(raw)) {
    out = out.split(`{{${k}}}`).join(v)
  }
  return out
}

/** Build the optional CTA button block (empty string when incomplete). */
export function actionBlock(c: EmailCardContent): string {
  if (!c.actionLabel || !c.actionUrl) return ''
  const url = escapeHtml(c.actionUrl)
  const label = escapeHtml(c.actionLabel)
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0 4px;"><tr><td bgcolor="#F7D447" style="border-radius: 10px;"><a href="${url}" target="_blank" rel="noopener" style="display: inline-block; padding: 12px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #1c1917; text-decoration: none; border-radius: 10px;">${label}</a></td></tr></table>`
}

/**
 * Themed variant of {@link actionBlock} for the preset templates: the button
 * uses `primaryColor` (whitelisted via safeColor) with an auto-contrast
 * foreground. Empty string when label or url is missing.
 */
export function themedActionBlock(label: string, url: string, primaryColor: string): string {
  if (!label || !url) return ''
  const bg = safeColor(primaryColor)
  const ink = readableForeground(bg)
  const href = escapeHtml(url)
  const text = escapeHtml(label)
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0 4px;"><tr><td bgcolor="${bg}" style="border-radius: 10px;"><a href="${href}" target="_blank" rel="noopener" style="display: inline-block; padding: 12px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: ${ink}; text-decoration: none; border-radius: 10px;">${text}</a></td></tr></table>`
}

/**
 * High-level helper: render {@link EmailCardContent} into a themed HTML email
 * using {@link DEFAULT_TEMPLATE} (or a custom template). Mirrors the unnc
 * convention — TITLE/BRAND_TITLE/PREHEADER escaped, BODY/ACTION_BLOCK/YEAR/LOGO
 * raw (LOGO is a URL placed in `src`; the action URL inside the block is escaped).
 */
export function renderEmailCard(
  c: EmailCardContent,
  opts: RenderEmailCardOptions = {},
  template: string = DEFAULT_TEMPLATE,
): string {
  const year = opts.year ?? currentYear()
  return renderTemplate(
    template,
    {
      PREHEADER: c.preheader ?? '',
      TITLE: c.title,
      BRAND_TITLE: opts.brandTitle ?? 'email-poster',
    },
    {
      BODY: c.bodyHtml,
      ACTION_BLOCK: actionBlock(c),
      YEAR: String(year),
      LOGO: opts.logo ?? '',
      FOOTER_HTML: opts.footerHtml ?? `Sent via email-poster &middot; &copy; ${year}`,
    },
  )
}

/** Current UTC year. Factored out so tests can monkeypatch / pass `opts.year`. */
export function currentYear(): number {
  return new Date().getUTCFullYear()
}
