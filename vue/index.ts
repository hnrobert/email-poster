/**
 * email-poster/vue — a restyle-able visual editor for an email-poster FieldMap.
 *
 * Import the ready-to-use component, or the headless composable for a fully
 * custom UI. Both are browser-safe (depend only on `vue` and `email-poster/pure`).
 *
 * @license Apache-2.0
 */
export { default as MailInterfaceEditor } from './MailInterfaceEditor.vue'
export {
  GROUPS,
  PRESET_BUTTONS,
  useMailInterfaceEditor,
  type DetectOutcome,
  type FieldDef,
  type ImportOutcome,
  type MailInterfaceEditorOptions,
  type MailInterfaceEditorResult,
} from './useMailInterfaceEditor'
export {
  DEFAULT_TEMPLATES,
  useTemplateStore,
  type MailTemplate,
  type TemplateStorage,
  type UseTemplateStoreOptions,
  type UseTemplateStoreResult,
} from './useTemplateStore'
export {
  useTemplateEditorBinding,
  type UseTemplateEditorBindingOptions,
  type UseTemplateEditorBindingResult,
} from './useTemplateEditorBinding'
// Re-export the types consumers need to annotate their v-model.
export type { FieldMap, PresetName } from 'email-poster/pure'
