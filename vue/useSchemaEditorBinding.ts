/**
 * email-poster/vue — coordination layer that binds the field-map editor
 * (`useMailInterfaceEditor`) to a schema library
 * (`useSchemaStore`).
 *
 * This is the logic `<MailInterfaceEditor>` uses to power its schema manager,
 * factored out so it is unit-testable without a DOM. It owns:
 *  - the active-schema highlight (derived from `modelValue`, so it stays
 *    accurate even after an external resync such as "discard")
 *  - switch (load a schema's fields), add, rename, delete
 *  - automatic write-back of field edits to the active schema ("modify"),
 *    guarded so LOADING a schema never clobbers the one being left
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
  DEFAULT_SCHEMAS,
  useSchemaStore,
  type PostSchema,
  type UseSchemaStoreResult,
} from './useSchemaStore'
import { toValue } from 'vue'
import type { FieldMap } from 'email-poster/pure'

export interface UseSchemaEditorBindingOptions {
  /** Seed schemas when the store's storage is empty. Default `DEFAULT_SCHEMAS`. */
  defaultSchemas?: PostSchema[]
  /** localStorage key for the built-in adapter. Default `'ep-mail-schemas'`. */
  storageKey?: string
  /** Inject your own store (shared, or with a custom storage adapter such as a backend). */
  schemaStore?: UseSchemaStoreResult
  /** Disable all controls (ref / getter / static). Default `false`. */
  disabled?: MaybeRefOrGetter<boolean>
}

export interface UseSchemaEditorBindingResult {
  /** The underlying field-map editor (field rows, presets, detect, import/export). */
  editor: MailInterfaceEditorResult
  /** The schema library (CRUD + persistence). */
  store: UseSchemaStoreResult
  /** All schemas (reactive). */
  schemas: Ref<PostSchema[]>
  /** Id of the schema the active field map matches exactly, or null. */
  activeSchemaId: ComputedRef<string | null>
  /** Inline-rename state: the id currently being renamed, or null. */
  editingId: Ref<string | null>
  /** Inline-rename draft text. */
  draftName: Ref<string>
  /** Load a schema's fields into the editor (switch). Returns when propagated. */
  selectSchema: (id: string) => Promise<void>
  /** Save the current field map as a new schema and enter rename mode. */
  addSchema: () => void
  /** Begin inline rename of a schema. */
  startRename: (id: string, name: string) => void
  /** Commit the rename draft (Enter / blur). */
  commitRename: (id: string) => void
  /** Delete a schema by id. */
  removeSchema: (id: string) => void
}

/**
 * Wire the editor to a schema library.
 *
 * ```ts
 * const b = useSchemaEditorBinding(
 *   () => props.modelValue,
 *   (fm) => emit('update:modelValue', fm),
 *   { disabled: () => props.disabled },
 * )
 * ```
 */
export function useSchemaEditorBinding(
  modelValue: MaybeRefOrGetter<FieldMap>,
  onUpdateModelValue: (fm: FieldMap) => void,
  options: UseSchemaEditorBindingOptions = {},
): UseSchemaEditorBindingResult {
  const editor = useMailInterfaceEditor(modelValue, { disabled: options.disabled })
  const store: UseSchemaStoreResult =
    options.schemaStore ??
    useSchemaStore({
      defaults: options.defaultSchemas ?? DEFAULT_SCHEMAS,
      storageKey: options.storageKey,
    })
  const { fields } = editor
  const { schemas } = store

  // Which schema (if any) the active field map matches exactly. Derived from
  // the source of truth (modelValue) so the highlight is correct even after an
  // external resync — no manual bookkeeping, no stale state after "discard".
  const activeSchemaId = computed<string | null>(() => {
    const cur = JSON.stringify(toValue(modelValue))
    return schemas.value.find((t) => JSON.stringify(t.fields) === cur)?.id ?? null
  })

  const editingId = ref<string | null>(null)
  const draftName = ref('')

  // True while a schema load is propagating through the outward watch, so the
  // auto write-back (modify) does not clobber the previously-active schema
  // with the just-loaded one's fields.
  let suppressWriteback = false

  async function selectSchema(id: string): Promise<void> {
    const t = schemas.value.find((x) => x.id === id)
    if (!t) return
    suppressWriteback = true
    fields.value = { ...t.fields }
    await nextTick()
    suppressWriteback = false
  }

  function addSchema(): void {
    const id = store.addSchema('New schema', { ...fields.value })
    editingId.value = id
    draftName.value = 'New schema'
  }

  function startRename(id: string, name: string): void {
    editingId.value = id
    draftName.value = name
  }
  function commitRename(id: string): void {
    if (editingId.value !== id) return
    store.renameSchema(id, draftName.value.trim() || 'Untitled')
    editingId.value = null
  }
  function removeSchema(id: string): void {
    store.deleteSchema(id)
    if (editingId.value === id) editingId.value = null
  }

  // Push the working copy outward on genuine user edits (skip-when-equal, so an
  // external resync is not echoed back — the symmetric guard that keeps actions
  // like "discard" from needing two clicks). On an edit to the active schema,
  // also write the fields back to that schema (modify) — but NOT during a
  // schema load (suppressWriteback), which would otherwise overwrite the
  // schema being left with the one being entered.
  watch(
    fields,
    (next) => {
      if (JSON.stringify(next) === JSON.stringify(toValue(modelValue))) return
      // Capture the active id BEFORE pushing outward: once modelValue updates to
      // the edited fields, no schema matches yet (the write-back below is what
      // makes the active schema match again), so reading it after would yield
      // null and the modify write-back would never fire.
      const activeId = activeSchemaId.value
      onUpdateModelValue({ ...next })
      if (!suppressWriteback && activeId) {
        store.updateSchemaFields(activeId, next)
      }
    },
    { deep: true },
  )

  return {
    editor,
    store,
    schemas,
    activeSchemaId,
    editingId,
    draftName,
    selectSchema,
    addSchema,
    startRename,
    commitRename,
    removeSchema,
  }
}
