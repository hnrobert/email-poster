/**
 * email-poster/vue — coordination layer that binds the field-map editor
 * (`useMailInterfaceEditor`) to a template library
 * (`useTemplateStore`).
 *
 * This is the logic `<MailInterfaceEditor>` uses to power its template manager,
 * factored out so it is unit-testable without a DOM. It owns:
 *  - the active-template highlight (derived from `modelValue`, so it stays
 *    accurate even after an external resync such as "discard")
 *  - switch (load a template's fields), add, rename, delete
 *  - automatic write-back of field edits to the active template ("modify"),
 *    guarded so LOADING a template never clobbers the one being left
 *
 * `v-model` semantics are unchanged from the single-map editor: `modelValue`
 * always reflects the active field map and is pushed outward via
 * `onUpdateModelValue` only on genuine user edits (skip-when-equal).
 *
 * Browser-safe: imports only `vue` and the node-free `email-poster/pure`.
 *
 * @license Apache-2.0
 */
import { computed, nextTick, ref, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import {
  useMailInterfaceEditor,
  type MailInterfaceEditorResult,
} from './useMailInterfaceEditor'
import {
  DEFAULT_TEMPLATES,
  useTemplateStore,
  type MailTemplate,
  type UseTemplateStoreResult,
} from './useTemplateStore'
import { toValue } from 'vue'
import type { FieldMap } from 'email-poster/pure'

export interface UseTemplateEditorBindingOptions {
  /** Seed templates when the store's storage is empty. Default `DEFAULT_TEMPLATES`. */
  defaultTemplates?: MailTemplate[]
  /** localStorage key for the built-in adapter. Default `'ep-mail-templates'`. */
  storageKey?: string
  /** Inject your own store (shared, or with a custom storage adapter such as a backend). */
  templateStore?: UseTemplateStoreResult
  /** Disable all controls (ref / getter / static). Default `false`. */
  disabled?: MaybeRefOrGetter<boolean>
}

export interface UseTemplateEditorBindingResult {
  /** The underlying field-map editor (field rows, presets, detect, import/export). */
  editor: MailInterfaceEditorResult
  /** The template library (CRUD + persistence). */
  store: UseTemplateStoreResult
  /** All templates (reactive). */
  templates: Ref<MailTemplate[]>
  /** Id of the template the active field map matches exactly, or null. */
  activeTemplateId: ComputedRef<string | null>
  /** Inline-rename state: the id currently being renamed, or null. */
  editingId: Ref<string | null>
  /** Inline-rename draft text. */
  draftName: Ref<string>
  /** Load a template's fields into the editor (switch). Returns when propagated. */
  selectTemplate: (id: string) => Promise<void>
  /** Save the current field map as a new template and enter rename mode. */
  addTemplate: () => void
  /** Begin inline rename of a template. */
  startRename: (id: string, name: string) => void
  /** Commit the rename draft (Enter / blur). */
  commitRename: (id: string) => void
  /** Delete a template by id. */
  removeTemplate: (id: string) => void
}

/**
 * Wire the editor to a template library.
 *
 * ```ts
 * const b = useTemplateEditorBinding(
 *   () => props.modelValue,
 *   (fm) => emit('update:modelValue', fm),
 *   { disabled: () => props.disabled },
 * )
 * ```
 */
export function useTemplateEditorBinding(
  modelValue: MaybeRefOrGetter<FieldMap>,
  onUpdateModelValue: (fm: FieldMap) => void,
  options: UseTemplateEditorBindingOptions = {},
): UseTemplateEditorBindingResult {
  const editor = useMailInterfaceEditor(modelValue, { disabled: options.disabled })
  const store: UseTemplateStoreResult =
    options.templateStore ??
    useTemplateStore({
      defaults: options.defaultTemplates ?? DEFAULT_TEMPLATES,
      storageKey: options.storageKey,
    })
  const { fields } = editor
  const { templates } = store

  // Which template (if any) the active field map matches exactly. Derived from
  // the source of truth (modelValue) so the highlight is correct even after an
  // external resync — no manual bookkeeping, no stale state after "discard".
  const activeTemplateId = computed<string | null>(() => {
    const cur = JSON.stringify(toValue(modelValue))
    return templates.value.find((t) => JSON.stringify(t.fields) === cur)?.id ?? null
  })

  const editingId = ref<string | null>(null)
  const draftName = ref('')

  // True while a template load is propagating through the outward watch, so the
  // auto write-back (modify) does not clobber the previously-active template
  // with the just-loaded one's fields.
  let suppressWriteback = false

  async function selectTemplate(id: string): Promise<void> {
    const t = templates.value.find((x) => x.id === id)
    if (!t) return
    suppressWriteback = true
    fields.value = { ...t.fields }
    await nextTick()
    suppressWriteback = false
  }

  function addTemplate(): void {
    const id = store.addTemplate('New template', { ...fields.value })
    editingId.value = id
    draftName.value = 'New template'
  }

  function startRename(id: string, name: string): void {
    editingId.value = id
    draftName.value = name
  }
  function commitRename(id: string): void {
    if (editingId.value !== id) return
    store.renameTemplate(id, draftName.value.trim() || 'Untitled')
    editingId.value = null
  }
  function removeTemplate(id: string): void {
    store.deleteTemplate(id)
    if (editingId.value === id) editingId.value = null
  }

  // Push the working copy outward on genuine user edits (skip-when-equal, so an
  // external resync is not echoed back — the symmetric guard that keeps actions
  // like "discard" from needing two clicks). On an edit to the active template,
  // also write the fields back to that template (modify) — but NOT during a
  // template load (suppressWriteback), which would otherwise overwrite the
  // template being left with the one being entered.
  watch(
    fields,
    (next) => {
      if (JSON.stringify(next) === JSON.stringify(toValue(modelValue))) return
      // Capture the active id BEFORE pushing outward: once modelValue updates to
      // the edited fields, no template matches yet (the write-back below is what
      // makes the active template match again), so reading it after would yield
      // null and the modify write-back would never fire.
      const activeId = activeTemplateId.value
      onUpdateModelValue({ ...next })
      if (!suppressWriteback && activeId) {
        store.updateTemplateFields(activeId, next)
      }
    },
    { deep: true },
  )

  return {
    editor,
    store,
    templates,
    activeTemplateId,
    editingId,
    draftName,
    selectTemplate,
    addTemplate,
    startRename,
    commitRename,
    removeTemplate,
  }
}
