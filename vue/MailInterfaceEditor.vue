<script setup lang="ts">
/**
 * Visual editor for an email-poster FieldMap (logical field → downstream JSON
 * key). Dependency-free, restyle-able SFC. `v-model` is the FieldMap object.
 *
 * This file is only the render layer. All state/logic lives in two composables:
 *  - `useSchemaEditorBinding` — wires the field-map editor to a schema
 *    library (switch / add / rename / delete; edits modify the active schema;
 *    highlight derived from `modelValue`). See that module for the exact
 *    semantics, which are unit-tested.
 *  - `useMailInterfaceEditor` — the field-map editor itself (field rows, body
 *    XOR, live preview, detect, import/export).
 *
 * Notifications are emitted as events (`detected` / `imported` / `error` /
 * `success`) so consumers wire their own toast.
 *
 * ## Multi-schema manager
 * When `manageSchemas` is on (default), a schema library replaces the fixed
 * preset buttons. The consuming application owns schema storage: persistence
 * goes through a `storage` adapter, and the built-in default is a localStorage
 * adapter keyed by `storageKey`. For a server app, pass your own `schemaStore`
 * whose adapter loads/saves against your backend (so schemas are shared and
 * durable, not per-browser). The library seeds from `defaultSchemas` (defaults
 * to the package's `DEFAULT_SCHEMAS`) the first time only — pass
 * `:default-schemas="[]"` to start empty, or your own list. `v-model` keeps
 * its parent-driven semantics: it always reflects the active field map and is
 * never clobbered on mount. Set `manageSchemas` to `false` for the legacy
 * fixed-preset behavior.
 *
 * Styling: plain HTML + `.ep-*` classes + `--ep-*` CSS custom properties. See
 * the two `<style>` blocks below. Override via CSS vars on `.ep-editor`, by
 * targeting `.ep-*` classes, or by replacing whole sections via named slots.
 *
 * @license Apache-2.0
 */
import { watch } from 'vue'
import { useSchemaEditorBinding } from './useSchemaEditorBinding'
import { DEFAULT_SCHEMAS, type PostSchema, type UseSchemaStoreResult } from './useSchemaStore'
import type { FieldMap } from 'email-poster/pure'

const props = withDefaults(
  defineProps<{
    modelValue: FieldMap
    disabled?: boolean
    /** Render the schema manager (switch/add/rename/delete/modify). Default `true`. */
    manageSchemas?: boolean
    /** Seed schemas used when the store's storage is empty. Default `DEFAULT_SCHEMAS`. */
    defaultSchemas?: PostSchema[]
    /** localStorage key for the built-in adapter. Default `'ep-mail-schemas'`. */
    storageKey?: string
    /** Inject your own store (e.g. one whose adapter backs it with your backend). */
    schemaStore?: UseSchemaStoreResult
  }>(),
  {
    disabled: false,
    manageSchemas: true,
    defaultSchemas: () => DEFAULT_SCHEMAS,
    storageKey: 'ep-mail-schemas',
  },
)
const emit = defineEmits<{
  'update:modelValue': [FieldMap]
  detected: [{ message: string; count: number; fields: FieldMap }]
  imported: [{ message: string; count: number; fields: FieldMap }]
  error: [{ message: string }]
  success: [{ message: string; count?: number }]
  /** The active field map no longer matches any saved schema (or now matches one). */
  'schema-active': [{ id: string | null; name: string | null }]
  /** The schema library changed (add/rename/delete/modify). */
  'schemas-change': [{ schemas: PostSchema[] }]
}>()

const b = useSchemaEditorBinding(
  () => props.modelValue,
  (fm) => emit('update:modelValue', fm),
  {
    defaultSchemas: props.defaultSchemas,
    storageKey: props.storageKey,
    schemaStore: props.schemaStore,
    disabled: () => props.disabled,
  },
)
const {
  editor: c,
  schemas,
  activeSchemaId,
  editingId,
  draftName,
  selectSchema,
  addSchema,
  startRename,
  commitRename,
  removeSchema,
} = b
const {
  fields,
  sampleText,
  detectError,
  payloadPreview,
  activePreset,
  isDisabled,
  fileInput,
  groups,
  presetButtons,
  setField,
  applyPreset,
  exportDef,
  exportSchema,
  triggerImport,
  onImportFile,
} = c

// Surface schema-library changes as events for consumers that sync elsewhere.
watch(activeSchemaId, (id) => {
  const t = schemas.value.find((x) => x.id === id)
  emit('schema-active', { id, name: t?.name ?? null })
})
watch(
  schemas,
  (next) => emit('schemas-change', { schemas: next }),
  { deep: true },
)

function onDetect(): void {
  const r = c.runDetect()
  if (r.ok) {
    const message = `Detected ${r.count} field(s) — review before saving`
    emit('detected', { message, count: r.count, fields: { ...fields.value } })
    emit('success', { message: `Detected ${r.count} field(s)`, count: r.count })
  } else {
    emit('error', { message: r.error })
  }
}
async function onImport(e: Event): Promise<void> {
  const r = await onImportFile(e)
  if (r.ok) {
    const message = `Imported ${r.count} field(s)`
    emit('imported', { message, count: r.count, fields: { ...fields.value } })
    emit('success', { message, count: r.count })
  } else {
    emit('error', { message: 'Import failed: ' + r.error })
  }
}
</script>

<template>
  <div class="ep-editor">
    <!-- Header + presets (legacy single-map mode) -->
    <slot
      name="header"
      :active-preset="activePreset"
      :apply-preset="applyPreset"
      :preset-buttons="presetButtons"
      :disabled="isDisabled"
    >
      <section class="ep-header">
        <div class="ep-header__main">
          <h3 class="ep-title">Payload interface</h3>
          <slot
            v-if="!manageSchemas"
            name="presets"
            :active-preset="activePreset"
            :apply-preset="applyPreset"
            :preset-buttons="presetButtons"
            :disabled="isDisabled"
          >
            <div class="ep-presets">
              <button
                v-for="p in presetButtons"
                :key="p.key"
                type="button"
                class="ep-btn ep-btn--sm"
                :class="activePreset === p.key ? 'ep-btn--primary' : 'ep-btn--outline'"
                :aria-pressed="activePreset === p.key ? 'true' : 'false'"
                :disabled="isDisabled"
                :title="p.desc"
                @click="applyPreset(p.key)"
              >
                {{ p.label }}
              </button>
            </div>
          </slot>
        </div>
        <slot name="help">
          <p class="ep-help">
            Map each logical field to the downstream JSON key your webhook expects. Pick a schema to
            load a preset, or map every key yourself; <code>body</code> and
            <code>bodyHtml</code>/<code>bodyText</code> are mutually exclusive.
          </p>
        </slot>
      </section>
    </slot>

    <!-- Schema manager (switch / add / rename / delete; edits modify the active one) -->
    <slot
      v-if="manageSchemas"
      name="schemas"
      :schemas="schemas"
      :active-id="activeSchemaId"
      :editing-id="editingId"
      :draft-name="draftName"
      :select="selectSchema"
      :add="addSchema"
      :start-rename="startRename"
      :commit-rename="commitRename"
      :remove="removeSchema"
      :disabled="isDisabled"
    >
      <section class="ep-schemas">
        <div class="ep-schemas__head">
          <h4 class="ep-group__title">Schemas</h4>
          <button
            type="button"
            class="ep-btn ep-btn--sm ep-btn--outline"
            :disabled="isDisabled"
            @click="addSchema"
          >
            + New
          </button>
        </div>
        <ul v-if="schemas.length" class="ep-schemas__list">
          <li
            v-for="t in schemas"
            :key="t.id"
            class="ep-schema"
            :class="{ 'ep-schema--active': activeSchemaId === t.id }"
          >
            <button
              v-if="editingId !== t.id"
              type="button"
              class="ep-schema__select"
              :aria-pressed="activeSchemaId === t.id ? 'true' : 'false'"
              :disabled="isDisabled"
              :title="`Load “${t.name}”`"
              @click="selectSchema(t.id)"
            >
              <span class="ep-schema__dot" aria-hidden="true"></span>
              <span class="ep-schema__name">{{ t.name }}</span>
            </button>
            <input
              v-else
              v-model="draftName"
              class="ep-schema__rename"
              type="text"
              :disabled="isDisabled"
              @keyup.enter="commitRename(t.id)"
              @blur="commitRename(t.id)"
            />
            <span v-if="editingId !== t.id" class="ep-schema__actions">
              <button
                type="button"
                class="ep-btn ep-btn--sm ep-btn--ghost"
                :disabled="isDisabled"
                title="Rename"
                aria-label="Rename"
                @click="startRename(t.id, t.name)"
              >
                ✎
              </button>
              <button
                type="button"
                class="ep-btn ep-btn--sm ep-btn--ghost"
                :disabled="isDisabled"
                title="Delete"
                aria-label="Delete"
                @click="removeSchema(t.id)"
              >
                ✕
              </button>
            </span>
          </li>
        </ul>
        <p v-else class="ep-help">
          No schemas yet — click “+ New” to save the current field map as a schema.
        </p>
      </section>
    </slot>

    <!-- Field groups -->
    <slot name="fields" :groups="groups" :fields="fields" :set-field="setField" :disabled="isDisabled">
      <section v-for="g in groups" :key="g.title" class="ep-group">
        <slot name="group-label" :title="g.title">
          <h4 class="ep-group__title">{{ g.title }}</h4>
        </slot>
        <div class="ep-fields">
          <div v-for="f in g.fields" :key="f.key" class="ep-field">
            <slot
              name="field"
              :field="f"
              :value="fields[f.key] ?? ''"
              :set-field="setField"
              :disabled="isDisabled"
              :input-id="`ep-${f.key}`"
            >
              <label class="ep-field__label" :for="`ep-${f.key}`">
                <span class="ep-field__label-text">{{ f.label }}</span>
                <span class="ep-field__key">{{ f.key }}</span>
              </label>
              <input
                :id="`ep-${f.key}`"
                class="ep-input"
                type="text"
                :value="fields[f.key] ?? ''"
                :placeholder="f.placeholder"
                :disabled="isDisabled"
                @input="setField(f.key, ($event.target as HTMLInputElement).value)"
              />
            </slot>
          </div>
        </div>
      </section>
    </slot>

    <!-- Live preview -->
    <slot name="preview" :payload="payloadPreview">
      <section class="ep-preview">
        <span class="ep-preview__label"
          >Live payload preview <span class="ep-preview__hint">(sample input)</span></span
        >
        <pre class="ep-preview__code">{{ payloadPreview }}</pre>
      </section>
    </slot>

    <!-- Detect from sample -->
    <slot
      name="detect"
      :sample-text="sampleText"
      :run-detect="onDetect"
      :detect-error="detectError"
      :disabled="isDisabled"
    >
      <section class="ep-detect">
        <details>
          <summary class="ep-detect__summary">Detect from sample JSON</summary>
          <div class="ep-detect__body">
            <p class="ep-help">
              Paste a real downstream request body; the editor infers the field map. Always review
              before saving.
            </p>
            <textarea
              v-model="sampleText"
              class="ep-detect__textarea"
              rows="4"
              :disabled="isDisabled"
              placeholder='{ "email": "a@b.c", "subject": "Hi", "content": "..." }'
            ></textarea>
            <div class="ep-detect__actions">
              <button
                type="button"
                class="ep-btn ep-btn--sm ep-btn--outline"
                :disabled="isDisabled"
                @click="onDetect"
              >
                Detect &amp; apply
              </button>
              <span v-if="detectError" class="ep-detect__error">{{ detectError }}</span>
            </div>
          </div>
        </details>
      </section>
    </slot>

    <!-- Import / Export -->
    <slot
      name="actions"
      :export-def="exportDef"
      :export-schema="exportSchema"
      :trigger-import="triggerImport"
      :disabled="isDisabled"
    >
      <section class="ep-actions">
        <button type="button" class="ep-btn ep-btn--sm ep-btn--outline" :disabled="isDisabled" @click="exportDef">
          Export interface
        </button>
        <button
          type="button"
          class="ep-btn ep-btn--sm ep-btn--outline"
          :disabled="isDisabled"
          @click="exportSchema"
        >
          Export JSON Schema
        </button>
        <button
          type="button"
          class="ep-btn ep-btn--sm ep-btn--outline"
          :disabled="isDisabled"
          @click="triggerImport"
        >
          Import
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="ep-file-input"
          @change="onImport"
        />
      </section>
    </slot>
  </div>
</template>

<!-- Non-scoped: theme defaults on the component root via :where() (zero specificity,
     so any consumer `.ep-editor { --ep-*: … }` wins) without polluting :root. -->
<style>
/* `:where()` = zero specificity: these defaults apply to every `.ep-editor`
   instance without polluting :root, and any consumer `.ep-editor { --ep-*: … }`
   rule (specificity 0,1,0) cleanly overrides them. */
:where(.ep-editor) {
  --ep-color-bg: transparent;
  --ep-color-fg: #0f172a;
  --ep-color-muted-fg: #64748b;
  --ep-color-subtle-fg: #94a3b8;
  --ep-color-border: #cbd5e1;
  --ep-color-muted-bg: #f1f5f9;
  --ep-color-primary: #0f172a;
  --ep-color-primary-fg: #ffffff;
  --ep-color-primary-border: #0f172a;
  --ep-color-ring: #94a3b8;
  --ep-color-destructive: #dc2626;
  --ep-radius-sm: 0.375rem;
  --ep-radius: 0.5rem;
  --ep-space-pad: 1rem;
  --ep-space-section: 1.25rem;
  --ep-space-group: 0.5rem;
  --ep-space-row: 0.375rem;
  --ep-gap-btn: 0.25rem;
  --ep-gap-field: 0.75rem;
  --ep-font-size: 0.875rem;
  --ep-font-size-sm: 0.75rem;
  --ep-font-size-xs: 0.625rem;
  --ep-line-height: 1.5;
  --ep-font-sans: inherit;
  --ep-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>

<style scoped>
.ep-editor {
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-section);
  padding: var(--ep-space-pad);
  background: var(--ep-color-bg);
  border: 1px solid var(--ep-color-border);
  border-radius: var(--ep-radius);
  font-family: var(--ep-font-sans);
  font-size: var(--ep-font-size);
  line-height: var(--ep-line-height);
  color: var(--ep-color-fg);
}

/* Header */
.ep-header {
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-group);
}
.ep-header__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ep-gap-field);
}
.ep-title {
  margin: 0;
  font-size: var(--ep-font-size);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ep-color-muted-fg);
}
.ep-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ep-gap-btn);
}
.ep-help {
  margin: 0;
  font-size: var(--ep-font-size-sm);
  color: var(--ep-color-muted-fg);
}
.ep-help code {
  font-family: var(--ep-font-mono);
}

/* Schema manager */
.ep-schemas {
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-group);
}
.ep-schemas__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ep-gap-field);
}
.ep-schemas__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-row);
}
.ep-schema {
  display: flex;
  align-items: center;
  gap: var(--ep-gap-field);
  padding: 0.25rem 0.375rem;
  border: 1px solid var(--ep-color-border);
  border-radius: var(--ep-radius-sm);
  background: var(--ep-color-bg);
}
.ep-schema--active {
  border-color: var(--ep-color-primary-border);
  background: var(--ep-color-muted-bg);
}
.ep-schema__select {
  display: flex;
  align-items: center;
  gap: var(--ep-gap-btn);
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  color: var(--ep-color-fg);
  background: transparent;
  border: 0;
  padding: 0.25rem 0 0.25rem 0.5rem;
  cursor: pointer;
  text-align: left;
}
.ep-schema__dot {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border-radius: 50%;
  border: 1px solid var(--ep-color-border);
  background: transparent;
}
.ep-schema--active .ep-schema__dot {
  background: var(--ep-color-primary);
  border-color: var(--ep-color-primary-border);
}
.ep-schema__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-schema__rename {
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  color: var(--ep-color-fg);
  background: var(--ep-color-bg);
  border: 1px solid var(--ep-color-border);
  border-radius: var(--ep-radius-sm);
  padding: 0.25rem 0.5rem;
}
.ep-schema__rename:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ep-color-ring);
}
.ep-schema__actions {
  display: flex;
  gap: var(--ep-gap-btn);
  flex: none;
}

/* Buttons (reset Tailwind preflight on <button>) */
.ep-btn {
  font: inherit;
  color: var(--ep-color-fg);
  background: var(--ep-color-bg);
  border: 1px solid var(--ep-color-border);
  border-radius: var(--ep-radius-sm);
  padding: 0.375rem 0.75rem;
  cursor: pointer;
  line-height: var(--ep-line-height);
}
.ep-btn--sm {
  padding: 0.25rem 0.625rem;
  font-size: var(--ep-font-size-sm);
}
.ep-btn--ghost {
  border-color: transparent;
  background: transparent;
  padding: 0.25rem 0.5rem;
}
.ep-btn--outline {
  background: var(--ep-color-bg);
  color: var(--ep-color-fg);
  border-color: var(--ep-color-border);
}
.ep-btn--primary,
.ep-btn[aria-pressed='true'] {
  background: var(--ep-color-primary);
  color: var(--ep-color-primary-fg);
  border-color: var(--ep-color-primary-border);
}
.ep-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ep-color-ring);
}
.ep-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Field groups */
.ep-group {
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-group);
}
.ep-group__title {
  margin: 0;
  font-size: var(--ep-font-size-sm);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ep-color-muted-fg);
}
.ep-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ep-gap-field);
}
@media (max-width: 40rem) {
  .ep-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
.ep-field {
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-row);
}
.ep-field__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--ep-font-size-sm);
  color: var(--ep-color-fg);
}
.ep-field__key {
  font-family: var(--ep-font-mono);
  font-size: var(--ep-font-size-xs);
  color: var(--ep-color-subtle-fg);
}
.ep-input {
  width: 100%;
  font: inherit;
  color: var(--ep-color-fg);
  background: transparent;
  border: 1px solid var(--ep-color-border);
  border-radius: var(--ep-radius-sm);
  padding: 0.25rem 0.625rem;
  line-height: var(--ep-line-height);
}
.ep-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ep-color-ring);
}
.ep-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Preview */
.ep-preview {
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-row);
}
.ep-preview__label {
  font-size: var(--ep-font-size-sm);
  color: var(--ep-color-fg);
}
.ep-preview__hint {
  color: var(--ep-color-muted-fg);
}
.ep-preview__code {
  margin: 0;
  overflow-x: auto;
  padding: 0.75rem;
  background: var(--ep-color-muted-bg);
  border-radius: var(--ep-radius);
  font-family: var(--ep-font-mono);
  font-size: var(--ep-font-size-sm);
  line-height: 1.625;
  white-space: pre;
}

/* Detect */
.ep-detect__summary {
  cursor: pointer;
  font-size: var(--ep-font-size);
  font-weight: 500;
}
.ep-detect__body {
  display: flex;
  flex-direction: column;
  gap: var(--ep-space-group);
  margin-top: var(--ep-space-group);
}
.ep-detect__textarea {
  width: 100%;
  font-family: var(--ep-font-mono);
  font-size: var(--ep-font-size-sm);
  color: var(--ep-color-fg);
  background: transparent;
  border: 1px solid var(--ep-color-border);
  border-radius: var(--ep-radius-sm);
  padding: 0.5rem;
  resize: vertical;
}
.ep-detect__textarea:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ep-color-ring);
}
.ep-detect__textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ep-detect__actions {
  display: flex;
  align-items: center;
  gap: var(--ep-gap-field);
}
.ep-detect__error {
  font-size: var(--ep-font-size-sm);
  color: var(--ep-color-destructive);
}

/* Actions */
.ep-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ep-gap-btn);
  padding-top: var(--ep-space-pad);
  border-top: 1px solid var(--ep-color-border);
}
.ep-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
