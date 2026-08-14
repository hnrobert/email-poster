/**
 * Theming for the preset HTML email templates.
 *
 * An {@link EmailTheme} carries everything site-specific (brand, logo, primary
 * color, footer) so callers supply only content + theme — no hand-rolled HTML.
 * @license Apache-2.0
 */

/** Resolved (fully defaulted) theme — what renderers actually consume. */
export interface ResolvedEmailTheme {
  brandTitle: string
  brandSubtitle: string
  logo: string
  primaryColor: string
  primaryInk: string
  footerHtml: string
  extraCss: string
  year: number
}

/** Site-specific theming for preset emails. All fields optional. */
export interface EmailTheme {
  /** Brand title in the header (escaped). */
  brandTitle?: string
  /** Small muted line under the brand title (escaped). */
  brandSubtitle?: string
  /**
   * Logo URL. Rendered as a header icon when present; when absent the whole
   * `<img>` block is omitted (escaped in attribute context).
   */
  logo?: string
  /**
   * Primary/CTA color — `#rgb`, `#rrggbb`, or `#rrggbbaa` only; anything else
   * falls back to {@link DEFAULT_PRIMARY_COLOR} (guards against CSS injection).
   */
  primaryColor?: string
  /** Footer inner HTML — raw (trusted), like `RenderEmailCardOptions.footerHtml`. */
  footerHtml?: string
  /** Extra CSS appended inside the template's `<style>` block (raw, trusted). */
  extraCss?: string
  /** Override the footer year (defaults to the current UTC year). */
  year?: number
}

/** The email-poster house primary color (matches the classic CTA yellow). */
export const DEFAULT_PRIMARY_COLOR = '#F7D447'

/** Dark ink used on light/colored surfaces. */
export const DARK_INK = '#1c1917'
/** Light ink used on dark surfaces. */
export const LIGHT_INK = '#fafafa'

/**
 * Pick a readable foreground for a background color via perceived luminance.
 * Accepts `#rgb` / `#rrggbb` / `#rrggbbaa`; anything unparseable gets the dark
 * ink (matches the historical behavior of light email surfaces).
 */
export function readableForeground(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hex.trim())
  if (!m) return DARK_INK
  const h = m[1]!
  let r: number, g: number, b: number
  if (h.length === 3) {
    r = parseInt(h[0]! + h[0]!, 16)
    g = parseInt(h[1]! + h[1]!, 16)
    b = parseInt(h[2]! + h[2]!, 16)
  } else {
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  }
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luma > 0.55 ? DARK_INK : LIGHT_INK
}

/**
 * Whitelist a caller-supplied color for safe interpolation into inline CSS:
 * only `#rgb`, `#rrggbb`, `#rrggbbaa` pass; everything else becomes
 * {@link DEFAULT_PRIMARY_COLOR}. Use for every color token in a template.
 */
export function safeColor(color: string | undefined, fallback: string = DEFAULT_PRIMARY_COLOR): string {
  return /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test((color ?? '').trim())
    ? color!.trim()
    : fallback
}

/** Resolve a partial {@link EmailTheme} into fully-defaulted values. */
export function resolveTheme(
  theme: EmailTheme = {},
  currentYear: () => number,
): ResolvedEmailTheme {
  const primaryColor = safeColor(theme.primaryColor)
  const year = theme.year ?? currentYear()
  return {
    brandTitle: theme.brandTitle ?? 'email-poster',
    brandSubtitle: theme.brandSubtitle ?? '',
    logo: theme.logo ?? '',
    primaryColor,
    primaryInk: readableForeground(primaryColor),
    footerHtml: theme.footerHtml ?? `Sent via email-poster &middot; &copy; ${year}`,
    extraCss: theme.extraCss ?? '',
    year,
  }
}
