/**
 * email-poster — browser-safe, node-free subset.
 *
 * Re-exports ONLY the pure modules: the config/preset schemas, the interface
 * import/export/detection helpers, payload building, and input normalization.
 * None of the transport code (`EmailPoster`, `doPost`, retry, url-guard,
 * message-id) is reachable from here — those import `node:net` / `node:crypto` /
 * `node:fs` and need a server. This entry therefore bundles without node-builtin
 * polyfills and is safe to import in a browser/client (e.g. a visual interface
 * editor that previews payloads live).
 *
 * Use the package root (`email-poster`) for the `EmailPoster` sending class
 * (server-side); use `email-poster/pure` for client-side schema/preview work.
 *
 * @license Apache-2.0
 */
export {
  EmailPosterConfigSchema,
  FieldMapSchema,
  PRESETS,
  resolveFieldMap,
  type EmailPosterConfig,
  type EmailPosterConfigInput,
  type FieldMap,
  type PresetName,
} from './config'
export {
  INTERFACE_DEF_VERSION,
  INTERFACE_DEF_SCHEMA_URL,
  InterfaceDefSchema,
  exportInterface,
  importInterface,
  detectInterface,
  exportPayloadSchema,
  type InterfaceDef,
  type InterfaceDefInput,
  type ImportedInterface,
  type DetectOptions,
} from './interface'
export { SendMailInputSchema, normalizeRecipients, type SendMailInput } from './input'
export { buildPayload } from './payload'
