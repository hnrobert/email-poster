/**
 * `receipt` preset — line-item table with hairline separators and an optional
 * emphasized total row (invoices, order confirmations, bookings).
 * @license Apache-2.0
 */
import { escapeHtml, renderTemplate, themedActionBlock, currentYear } from '../render'
import { composeShellTemplate, shellVars } from '../shell'
import { resolveTheme } from '../theme'
import type { EmailTheme } from '../theme'

/** One line item: label (left, muted) + value (right, bold). Both escaped. */
export interface ReceiptRow {
  label: string
  value: string
}

/** Content for a `receipt` email. */
export interface ReceiptEmailContent {
  /** Heading (escaped). */
  title: string
  /** Optional intro paragraph above the table (raw, trusted HTML). */
  bodyHtml?: string
  /** Line items, rendered top to bottom. */
  rows: ReceiptRow[]
  /** Emphasized closing row (e.g. `'Total paid'`); requires totalValue. */
  totalLabel?: string
  totalValue?: string
  /** Optional note under the table (raw, trusted HTML). */
  noteHtml?: string
  /** Optional CTA button; rendered only when both label and url are present. */
  actionLabel?: string
  actionUrl?: string
  /** Hidden inbox preview text (escaped). */
  preheader?: string
}

const CELL_FONT =
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5;"

const CONTENT = `<h1 class="ink" style="margin: 0 0 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; line-height: 1.3; color: #0a0a0a;">{{TITLE}}</h1>
                {{BODY_HTML}}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0 4px;">
                  {{ROWS_HTML}}
                </table>
                {{NOTE_HTML}}
                {{ACTION_BLOCK}}`

/** Full `receipt` document: {@link EMAIL_SHELL} with the receipt fragment spliced in. */
export const RECEIPT_TEMPLATE = composeShellTemplate(CONTENT)

/** Render a `receipt` email. See {@link ReceiptEmailContent} for the content model. */
export function renderReceiptEmail(
  c: ReceiptEmailContent,
  theme: EmailTheme = {},
  template: string = RECEIPT_TEMPLATE,
): string {
  const t = resolveTheme(theme, currentYear)
  const sv = shellVars(t)

  const rowsHtml = c.rows
    .map(
      (r) => `<tr>
  <td class="rule muted" style="padding: 10px 0; border-bottom: 1px solid #e5e5e5; ${CELL_FONT} color: #737373;">${escapeHtml(r.label)}</td>
  <td class="rule ink" style="padding: 10px 0; border-bottom: 1px solid #e5e5e5; text-align: right; ${CELL_FONT} font-weight: 600; color: #0a0a0a;">${escapeHtml(r.value)}</td>
</tr>`,
    )
    .join('\n')
  const totalHtml =
    c.totalLabel && c.totalValue
      ? `<tr>
  <td class="ink" style="padding: 12px 0 2px; border-top: 2px solid #0a0a0a; ${CELL_FONT} font-weight: 700; color: #0a0a0a;">${escapeHtml(c.totalLabel)}</td>
  <td class="ink" style="padding: 12px 0 2px; border-top: 2px solid #0a0a0a; text-align: right; ${CELL_FONT} font-weight: 700; color: #0a0a0a;">${escapeHtml(c.totalValue)}</td>
</tr>`
      : ''

  return renderTemplate(
    template,
    { ...sv.escaped, TITLE: c.title, PREHEADER: c.preheader ?? '' },
    {
      ...sv.raw,
      BODY_HTML: c.bodyHtml
        ? `<div class="body-ink" style="${CELL_FONT} color: #404040;">${c.bodyHtml}</div>`
        : '',
      ROWS_HTML: rowsHtml + totalHtml,
      NOTE_HTML: c.noteHtml
        ? `<p class="muted" style="margin: 16px 0 0; ${CELL_FONT} color: #737373;">${c.noteHtml}</p>`
        : '',
      ACTION_BLOCK: themedActionBlock(c.actionLabel ?? '', c.actionUrl ?? '', t.primaryColor),
    },
  )
}
