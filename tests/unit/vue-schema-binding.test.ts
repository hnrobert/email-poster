import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useSchemaEditorBinding } from '../../vue/useSchemaEditorBinding'
import { DEFAULT_SCHEMAS, useSchemaStore } from '../../vue/useSchemaStore'
import { PRESETS, type FieldMap } from 'email-poster/pure'

/**
 * Drive the binding the way the SFC does: `modelValue` is a ref the parent owns;
 * `onUpdateModelValue` writes back to it (v-model round-trip). Each test injects
 * a fresh in-memory store (storage:false) so it is hermetic and exercises the
 * `schemaStore` injection path.
 */
function setup(initial: FieldMap) {
  const modelValue = ref<FieldMap>(initial)
  const store = useSchemaStore({ defaults: DEFAULT_SCHEMAS, storage: false })
  const b = useSchemaEditorBinding(
    () => modelValue.value,
    (fm) => {
      modelValue.value = fm
    },
    { schemaStore: store },
  )
  return { modelValue, b }
}

describe('useSchemaEditorBinding', () => {
  it('derives activeSchemaId from the current field map', () => {
    const { b } = setup({ ...PRESETS.smtogo })
    expect(b.activeSchemaId.value).toBe('smtogo')
    const { b: b2 } = setup({ ...PRESETS.custom_example })
    expect(b2.activeSchemaId.value).toBe('custom_example')
  })

  it('activeSchemaId is null when the map matches no schema', () => {
    const { b } = setup({ to: 'recipient', subject: 'title' })
    expect(b.activeSchemaId.value).toBeNull()
  })

  it('selectSchema loads a schema and propagates to the parent (v-model)', async () => {
    const { modelValue, b } = setup({ ...PRESETS.smtogo })
    await b.selectSchema('custom_example')
    expect(modelValue.value).toEqual({ ...PRESETS.custom_example })
    expect(b.activeSchemaId.value).toBe('custom_example')
  })

  it('loading a schema does NOT clobber the previously-active one (regression)', async () => {
    // The auto write-back ("modify") must be suppressed during a load, else the
    // schema being left gets overwritten by the one being entered.
    const { b } = setup({ ...PRESETS.smtogo })
    await b.selectSchema('custom_example')
    // smtogo in the library is untouched
    const smtogo = b.schemas.value.find((t) => t.id === 'smtogo')!
    expect(smtogo.fields).toEqual({ ...PRESETS.smtogo })
    const custom = b.schemas.value.find((t) => t.id === 'custom_example')!
    expect(custom.fields).toEqual({ ...PRESETS.custom_example })
  })

  it('editing the active schema writes back to it (modify)', async () => {
    const { b } = setup({ ...PRESETS.smtogo })
    expect(b.activeSchemaId.value).toBe('smtogo')
    b.editor.setField('cc', 'cc_key')
    await nextTick()
    const smtogo = b.schemas.value.find((t) => t.id === 'smtogo')!
    expect(smtogo.fields.cc).toBe('cc_key')
  })

  it('editing a custom (unmatched) map does not modify any schema', () => {
    const { b } = setup({ to: 'recipient', subject: 'title' })
    expect(b.activeSchemaId.value).toBeNull()
    const before = b.schemas.value.map((t) => ({ ...t.fields }))
    b.editor.setField('cc', 'cc_key')
    expect(b.schemas.value.map((t) => ({ ...t.fields }))).toEqual(before)
  })

  it('does not echo an external resync as update:modelValue (discard stays clean)', async () => {
    // Parent resets modelValue externally (discard); the binding must not push it
    // back. We assert by observing onUpdateModelValue is NOT invoked redundantly.
    let pushCount = 0
    const modelValue = ref<FieldMap>({ ...PRESETS.smtogo })
    const store = useSchemaStore({ defaults: DEFAULT_SCHEMAS, storage: false })
    useSchemaEditorBinding(
      () => modelValue.value,
      (fm) => {
        pushCount++
        modelValue.value = fm
      },
      { schemaStore: store },
    )
    const before = pushCount
    modelValue.value = { ...PRESETS.generic } // external change
    await nextTick()
    expect(pushCount).toBe(before) // no outward echo of the resync
  })

  it('addSchema saves the current field map as a new schema and enters rename', () => {
    const { b } = setup({ to: 'recipient', subject: 'title', body: 'message' })
    b.addSchema()
    expect(b.schemas.value).toHaveLength(5)
    const added = b.schemas.value[4]!
    expect(added.fields).toEqual({ to: 'recipient', subject: 'title', body: 'message' })
    expect(b.editingId.value).toBe(added.id)
    expect(b.draftName.value).toBe('New schema')
  })

  it('rename + delete mutate the library', () => {
    const { b } = setup({ ...PRESETS.smtogo })
    const generic = b.schemas.value.find((t) => t.id === 'generic')!
    b.startRename(generic.id, generic.name)
    b.draftName.value = 'Resend'
    b.commitRename(generic.id)
    expect(b.schemas.value.find((t) => t.id === generic.id)!.name).toBe('Resend')
    b.removeSchema(generic.id)
    expect(b.schemas.value.find((t) => t.id === generic.id)).toBeUndefined()
  })

  it('commitRename clamps an empty draft to "Untitled"', () => {
    const { b } = setup({ ...PRESETS.smtogo })
    const t = b.schemas.value[0]!
    b.startRename(t.id, t.name)
    b.draftName.value = '   '
    b.commitRename(t.id)
    expect(b.schemas.value.find((x) => x.id === t.id)!.name).toBe('Untitled')
  })
})
