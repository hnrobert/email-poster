/** A flat map of `{{KEY}}` → replacement string. */
export interface TemplateVars {
  [key: string]: string
}

/** Logical content for a themed HTML email card. */
export interface EmailCardContent {
  /** Big heading inside the card (escaped). */
  title: string
  /** Inner HTML for the message body — caller-supplied, NOT escaped. */
  bodyHtml: string
  /** Optional CTA button; rendered only when both label and url are present. */
  actionLabel?: string
  actionUrl?: string
  /** Hidden preview text shown after the subject in inbox lists. */
  preheader?: string
}

/** Optional rendering tweaks for {@link renderEmailCard}. */
export interface RenderEmailCardOptions {
  /** Brand title in the header (escaped). Defaults to `'email-poster'`. */
  brandTitle?: string
  /** Logo URL placed in the header `<img src>`. Raw (not escaped). */
  logo?: string
  /** Footer inner HTML (raw). Defaults to a generic `Sent via email-poster · © {year}`. */
  footerHtml?: string
  /** Override the footer year (defaults to the current UTC year). */
  year?: number
}
