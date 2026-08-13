/**
 * email-poster/vue — headless composable powering `<MailInterfaceEditor>`.
 *
 * Owns all reactive state + logic for editing an email-poster FieldMap:
 *  - field-by-field mapping (logical field → downstream JSON key) with live
 *    body-XOR enforcement (`body` vs `bodyHtml`/`bodyText`)
 *  - preset application + active-preset detection
 *  - live downstream-payload preview from a sample input
 *  - field-map detection from a pasted sample JSON instance
 *  - interface import/export (email-poster InterfaceDef JSON OR standard
 *    JSON Schema), lossless for the field map
 *
 * Framework-neutral: no `toast`, no Vue `emit`. It returns reactive state and
 * result descriptors; a component (the bundled `<MailInterfaceEditor>` or your
 * own custom UI) renders it and translates outcomes into events/notifications.
 *
 * Browser-safe: imports only `vue` and the node-free `email-poster/pure`.
 *
 * @license Apache-2.0
 */
import {
  computed,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import {
  PRESETS,
  EmailPosterConfigSchema,
  buildPayload,
  detectInterface,
  exportInterface,
  exportPayloadSchema,
  importInterface,
  type FieldMap,
  type PresetName,
} from 'email-poster/pure'

export interface FieldDef {
  key: keyof FieldMap
  label: string
  placeholder?: string
}

/** Field rows, grouped by purpose — reused by the SFC and headless consumers. */
export const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Recipients',
    fields: [
      { key: 'to', label: 'To', placeholder: 'to' },
      { key: 'cc', label: 'Cc', placeholder: 'cc' },
      { key: 'bcc', label: 'Bcc', placeholder: 'bcc' },
      { key: 'replyTo', label: 'Reply-To', placeholder: 'replyTo' },
    ],
  },
  {
    title: 'Sender',
    fields: [{ key: 'from', label: 'From', placeholder: 'from' }],
  },
  {
    title: 'Content',
    fields: [
      { key: 'subject', label: 'Subject', placeholder: 'subject' },
      { key: 'body', label: 'Body (single)', placeholder: 'content' },
      { key: 'bodyHtml', label: 'Body — HTML', placeholder: 'html' },
      { key: 'bodyText', label: 'Body — text', placeholder: 'text' },
      { key: 'type', label: 'Type key', placeholder: 'type' },
    ],
  },
  {
    title: 'Metadata',
    fields: [
      { key: 'attachments', label: 'Attachments', placeholder: 'attachments' },
      { key: 'headers', label: 'Headers', placeholder: 'headers' },
      { key: 'tagName', label: 'Tag name', placeholder: 'tagName' },
    ],
  },
]

/** Preset quick-load buttons (SMToGo / Resend-like / Custom Example / Blank). */
export const PRESET_BUTTONS: { key: PresetName; label: string; desc: string }[] = [
  { key: 'smtogo', label: 'SMToGo', desc: '{ from, to, subject, html }' },
  { key: 'generic', label: 'Resend-like', desc: '{ from, to, subject, html, text }' },
  { key: 'custom_example', label: 'Custom Example', desc: '{ email, subject, content }' },
  { key: 'none', label: 'Blank', desc: 'empty — map every key yourself' },
]

const PRESET_ORDER: PresetName[] = ['smtogo', 'generic', 'custom_example', 'none']

/** Default browser download (Blob + anchor click). Lazily touches `document`. */
function defaultDownloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export interface MailInterfaceEditorOptions {
  /** Disable all controls (ref / getter / static). Default `false`. */
  disabled?: MaybeRefOrGetter<boolean>
  /** Override the download sink (tests inject a spy). Defaults to the browser. */
  dom?: { downloadJson: (filename: string, data: unknown) => void }
}

export type DetectOutcome =
  | { ok: true; count: number; fields: FieldMap }
  | { ok: false; error: string }

export type ImportOutcome =
  | { ok: true; count: number; fields: FieldMap }
  | { ok: false; error: string }

export interface MailInterfaceEditorResult {
  /** Working copy of the field map. */
  fields: Ref<FieldMap>
  /** Set one logical field. Empty string unsets the key. Enforces body XOR. */
  setField: (key: keyof FieldMap, value: string) => void
  /** Replace the whole map with a preset. */
  applyPreset: (name: PresetName) => void
  /** Which preset (if any) the current map matches exactly — for highlight. */
  activePreset: ComputedRef<PresetName | null>
  /** Payload body type inferred from the map, so split-key maps preview cleanly. */
  previewType: ComputedRef<'html' | 'text'>
  /** JSON-stringified downstream payload from a sample input (or `// <error>`). */
  payloadPreview: ComputedRef<string>
  /** Paste area for detect-from-sample. */
  sampleText: Ref<string>
  /** Last detect error message (empty when none). */
  detectError: Ref<string>
  /** Parse `sampleText` and infer the field map. Returns a result descriptor. */
  runDetect: () => DetectOutcome
  /** Download the interface as email-poster InterfaceDef JSON. */
  exportDef: () => void
  /** Download a derived standard JSON Schema (draft-07) of the payload. */
  exportSchema: () => void
  /** Template-ref handle the SFC binds to the hidden `<input type="file">`. */
  fileInput: Ref<HTMLInputElement | null>
  /** Open the file picker. */
  triggerImport: () => void
  /** Read the picked file (InterfaceDef JSON or JSON Schema) and apply `fields`. */
  onImportFile: (e: Event) => Promise<ImportOutcome>
  /** Field-group taxonomy (see `GROUPS`). */
  groups: typeof GROUPS
  /** Preset-button taxonomy (see `PRESET_BUTTONS`). */
  presetButtons: typeof PRESET_BUTTONS
  /** Normalized disabled flag for binding to controls. */
  isDisabled: ComputedRef<boolean>
}

/**
 * Create editor state for a FieldMap. Pass a ref/getter to `modelValue` so the
 * editor resyncs when the parent's value changes externally (v-model).
 */
export function useMailInterfaceEditor(
  modelValue: MaybeRefOrGetter<FieldMap>,
  options: MailInterfaceEditorOptions = {},
): MailInterfaceEditorResult {
  const downloadJson = options.dom?.downloadJson ?? defaultDownloadJson

  // Working copy, re-synced when the source changes externally. JSON-compared
  // to avoid feedback loops (parent ← our emit ← resync of the same value).
  const fields = ref<FieldMap>({ ...toValue(modelValue) })
  watch(
    () => toValue(modelValue),
    (v) => {
      if (JSON.stringify(v) !== JSON.stringify(fields.value)) fields.value = { ...v }
    },
    { deep: true },
  )

  const isDisabled = computed(() => !!toValue(options.disabled))

  function setField(key: keyof FieldMap, value: string): void {
    const next: FieldMap = { ...fields.value }
    if (value === '') delete next[key]
    else next[key] = value
    // body XOR: a single `body` key excludes split keys, and vice-versa.
    if (key === 'body') {
      delete next.bodyHtml
      delete next.bodyText
    } else if (key === 'bodyHtml' || key === 'bodyText') {
      delete next.body
    }
    fields.value = next
  }

  function applyPreset(name: PresetName): void {
    fields.value = { ...PRESETS[name] }
  }

  const activePreset = computed<PresetName | null>(() => {
    const cur = JSON.stringify(fields.value)
    for (const k of PRESET_ORDER) {
      if (JSON.stringify(PRESETS[k]) === cur) return k
    }
    return null
  })

  const previewType = computed<'html' | 'text'>(() => {
    if (fields.value.bodyText && !fields.value.bodyHtml) return 'text'
    return 'html'
  })

  const payloadPreview = computed<string>(() => {
    try {
      const cfg = EmailPosterConfigSchema.parse({
        postUrl: 'https://preview.local',
        preset: 'none',
        fields: fields.value,
        fromAddress: 'sender@example.com',
      })
      // Sample carries an example value for EVERY mappable logical field, so
      // mapping any of them (cc / bcc / replyTo / tagName / headers /
      // attachments) is immediately reflected in the preview. buildPayload only
      // emits a field when both the map key and the input value exist, so fields
      // the user hasn't mapped simply stay absent. (`from` is covered by the
      // config's fromAddress below.)
      const payload = buildPayload(
        {
          to: 'recipient@example.com',
          cc: 'cc@example.com',
          bcc: 'bcc@example.com',
          replyTo: 'reply@example.com',
          subject: 'Welcome',
          body: '<p>Hello</p>',
          type: previewType.value,
          tagName: 'welcome',
          headers: { 'X-Demo': 'true' },
          attachments: [{ filename: 'invite.pdf', content: '<base64>' }],
        },
        cfg,
      )
      return JSON.stringify(payload, null, 2)
    } catch (e) {
      return '// ' + (e instanceof Error ? e.message : 'invalid field map')
    }
  })

  const sampleText = ref('')
  const detectError = ref('')

  function runDetect(): DetectOutcome {
    detectError.value = ''
    let parsed: unknown
    try {
      parsed = JSON.parse(sampleText.value)
    } catch {
      detectError.value = 'Not valid JSON'
      return { ok: false, error: 'Not valid JSON' }
    }
    const detected = detectInterface(parsed, { mode: 'instance' })
    fields.value = { ...detected.fields }
    return { ok: true, count: Object.keys(detected.fields).length, fields: { ...detected.fields } }
  }

  function exportDef(): void {
    // exportInterface stores the full effective map under `fields` with preset 'none'.
    downloadJson('mail-interface.json', exportInterface({ preset: 'none', fields: fields.value }))
  }

  function exportSchema(): void {
    const def = exportInterface({ preset: 'none', fields: fields.value })
    downloadJson('mail-payload.schema.json', exportPayloadSchema(def))
  }

  const fileInput = ref<HTMLInputElement | null>(null)
  function triggerImport(): void {
    fileInput.value?.click()
  }

  async function onImportFile(e: Event): Promise<ImportOutcome> {
    const target = e.target as HTMLInputElement | null
    const file = target?.files?.[0]
    if (!file) return { ok: false, error: 'No file selected' }
    try {
      const text = await file.text()
      // importInterface accepts InterfaceDef JSON or a standard JSON Schema.
      const imported = importInterface(JSON.parse(text))
      fields.value = { ...imported.fields }
      return { ok: true, count: Object.keys(imported.fields).length, fields: { ...imported.fields } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'invalid file' }
    } finally {
      if (fileInput.value) fileInput.value.value = '' // allow re-selecting the same file
    }
  }

  return {
    fields,
    setField,
    applyPreset,
    activePreset,
    previewType,
    payloadPreview,
    sampleText,
    detectError,
    runDetect,
    exportDef,
    exportSchema,
    fileInput,
    triggerImport,
    onImportFile,
    groups: GROUPS,
    presetButtons: PRESET_BUTTONS,
    isDisabled,
  }
}
