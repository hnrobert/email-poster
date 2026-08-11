/**
 * email-poster/template — HTML email template rendering (optional subpath).
 * Import via `import { renderEmailCard } from 'email-poster/template'`.
 * @license Apache-2.0
 */

export { escapeHtml, renderTemplate, actionBlock, renderEmailCard, currentYear } from './render'
export { DEFAULT_TEMPLATE } from './default-template'
export type {
  TemplateVars,
  EmailCardContent,
  RenderEmailCardOptions,
} from './types'
