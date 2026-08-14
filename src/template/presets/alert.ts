/**
 * `alert` preset — status banner email (success / warning / error / info):
 * a color-tinted panel with heading, body, and optional detail list.
 * @license Apache-2.0
 */
import { escapeHtml, renderTemplate, themedActionBlock, currentYear } from '../render'
import { composeShellTemplate, shellVars } from '../shell'
import { resolveTheme } from '../theme'
import type { EmailTheme } from '../theme'

/** Severity of an `alert` email. */
export type AlertLevel = 'success' | 'warning' | 'error' | 'info'

/** Content for an `alert` email. */
export interface AlertEmailContent {
  /** Severity — picks the panel palette. Defaults to `'info'`. */
  level?: AlertLevel
  /** Heading inside the panel (escaped). */
  title: string
  /** Body inside the panel (raw, trusted HTML). */
  bodyHtml: string
  /** Extra bullet lines under the body (each escaped). */
  details?: string[]
  /** Optional CTA button; rendered only when both label and url are present. */
  actionLabel?: string
  actionUrl?: string
  /** Hidden inbox preview text (escaped). */
  preheader?: string
}

/** Per-level panel palette: panel background, accent border, accent heading. */
export const ALERT_PALETTES: Record<AlertLevel, { bg: string; border: string; accent: string }> = {
  success: { bg: '#f0fdf4', border: '#16a34a', accent: '#15803d' },
  warning: { bg: '#fffbeb', border: '#d97706', accent: '#b45309' },
  error: { bg: '#fef2f2', border: '#dc2626', accent: '#b91c1c' },
  info: { bg: '#eff6ff', border: '#2563eb', accent: '#1d4ed8' },
}

const CONTENT = `<div class="alert" style="margin: 0 0 16px; padding: 16px 18px; background-color: {{ALERT_BG}}; border-left: 4px solid {{ALERT_BORDER}}; border-radius: 8px;">
                  <h1 class="ink" style="margin: 0 0 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; line-height: 1.3; color: {{ALERT_ACCENT}};">{{TITLE}}</h1>
                  <div class="body-ink" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #404040;">{{BODY}}</div>
                </div>
                {{DETAILS_HTML}}
                {{ACTION_BLOCK}}`

/** Full `alert` document: {@link EMAIL_SHELL} with the alert fragment spliced in. */
export const ALERT_TEMPLATE = composeShellTemplate(CONTENT)

/** Render an `alert` email. See {@link AlertEmailContent} for the content model. */
export function renderAlertEmail(
  c: AlertEmailContent,
  theme: EmailTheme = {},
  template: string = ALERT_TEMPLATE,
): string {
  const t = resolveTheme(theme, currentYear)
  const sv = shellVars(t)
  const palette = ALERT_PALETTES[c.level ?? 'info'] ?? ALERT_PALETTES.info
  return renderTemplate(
    template,
    { ...sv.escaped, TITLE: c.title, PREHEADER: c.preheader ?? '' },
    {
      ...sv.raw,
      BODY: c.bodyHtml,
      ALERT_BG: palette.bg,
      ALERT_BORDER: palette.border,
      ALERT_ACCENT: palette.accent,
      DETAILS_HTML: c.details?.length
        ? `<ul class="body-ink" style="margin: 0 0 16px; padding-left: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.8; color: #404040;">${c.details
            .map((d) => `<li>${escapeHtml(d)}</li>`)
            .join('')}</ul>`
        : '',
      ACTION_BLOCK: themedActionBlock(c.actionLabel ?? '', c.actionUrl ?? '', t.primaryColor),
    },
  )
}
