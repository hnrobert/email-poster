import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useTemplateEditorBinding } from '../../vue/useTemplateEditorBinding'
import { DEFAULT_TEMPLATES, useTemplateStore } from '../../vue/useTemplateStore'
import { PRESETS, type FieldMap } from 'email-poster/pure'

/**
 * Drive the binding the way the SFC does: `modelValue` is a ref the parent owns;
 * `onUpdateModelValue` writes back to it (v-model round-trip). Each test injects
 * a fresh in-memory store (storage:false) so it is hermetic and exercises the
 * `templateStore` injection path.
 */
function setup(initial: FieldMap) {
  const modelValue = ref<FieldMap>(initial)
  const store = useTemplateStore({ defaults: DEFAULT_TEMPLATES, storage: false })
  const b = useTemplateEditorBinding(
    () => modelValue.value,
    (fm) => {
      modelValue.value = fm
    },
    { templateStore: store },
  )
  return { modelValue, b }
}

describe('useTemplateEditorBinding', () => {
  it('derives activeTemplateId from the current field map', () => {
    const { b } = setup({ ...PRESETS.smtogo })
    expect(b.activeTemplateId.value).toBe('smtogo')
    const { b: b2 } = setup({ ...PRESETS.custom_example })
    expect(b2.activeTemplateId.value).toBe('custom_example')
  })

  it('activeTemplateId is null when the map matches no template', () => {
    const { b } = setup({ to: 'recipient', subject: 'title' })
    expect(b.activeTemplateId.value).toBeNull()
  })

  it('selectTemplate loads a template and propagates to the parent (v-model)', async () => {
    const { modelValue, b } = setup({ ...PRESETS.smtogo })
    await b.selectTemplate('custom_example')
    expect(modelValue.value).toEqual({ ...PRESETS.custom_example })
    expect(b.activeTemplateId.value).toBe('custom_example')
  })

  it('loading a template does NOT clobber the previously-active one (regression)', async () => {
    // The auto write-back ("modify") must be suppressed during a load, else the
    // template being left gets overwritten by the one being entered.
    const { b } = setup({ ...PRESETS.smtogo })
    await b.selectTemplate('custom_example')
    // smtogo in the library is untouched
    const smtogo = b.templates.value.find((t) => t.id === 'smtogo')!
    expect(smtogo.fields).toEqual({ ...PRESETS.smtogo })
    const custom = b.templates.value.find((t) => t.id === 'custom_example')!
    expect(custom.fields).toEqual({ ...PRESETS.custom_example })
  })

  it('editing the active template writes back to it (modify)', async () => {
    const { b } = setup({ ...PRESETS.smtogo })
    expect(b.activeTemplateId.value).toBe('smtogo')
    b.editor.setField('cc', 'cc_key')
    await nextTick()
    const smtogo = b.templates.value.find((t) => t.id === 'smtogo')!
    expect(smtogo.fields.cc).toBe('cc_key')
  })

  it('editing a custom (unmatched) map does not modify any template', () => {
    const { b } = setup({ to: 'recipient', subject: 'title' })
    expect(b.activeTemplateId.value).toBeNull()
    const before = b.templates.value.map((t) => ({ ...t.fields }))
    b.editor.setField('cc', 'cc_key')
    expect(b.templates.value.map((t) => ({ ...t.fields }))).toEqual(before)
  })

  it('does not echo an external resync as update:modelValue (discard stays clean)', async () => {
    // Parent resets modelValue externally (discard); the binding must not push it
    // back. We assert by observing onUpdateModelValue is NOT invoked redundantly.
    let pushCount = 0
    const modelValue = ref<FieldMap>({ ...PRESETS.smtogo })
    const store = useTemplateStore({ defaults: DEFAULT_TEMPLATES, storage: false })
    useTemplateEditorBinding(
      () => modelValue.value,
      (fm) => {
        pushCount++
        modelValue.value = fm
      },
      { templateStore: store },
    )
    const before = pushCount
    modelValue.value = { ...PRESETS.generic } // external change
    await nextTick()
    expect(pushCount).toBe(before) // no outward echo of the resync
  })

  it('addTemplate saves the current field map as a new template and enters rename', () => {
    const { b } = setup({ to: 'recipient', subject: 'title', body: 'message' })
    b.addTemplate()
    expect(b.templates.value).toHaveLength(5)
    const added = b.templates.value[4]!
    expect(added.fields).toEqual({ to: 'recipient', subject: 'title', body: 'message' })
    expect(b.editingId.value).toBe(added.id)
    expect(b.draftName.value).toBe('New template')
  })

  it('rename + delete mutate the library', () => {
    const { b } = setup({ ...PRESETS.smtogo })
    const generic = b.templates.value.find((t) => t.id === 'generic')!
    b.startRename(generic.id, generic.name)
    b.draftName.value = 'Resend'
    b.commitRename(generic.id)
    expect(b.templates.value.find((t) => t.id === generic.id)!.name).toBe('Resend')
    b.removeTemplate(generic.id)
    expect(b.templates.value.find((t) => t.id === generic.id)).toBeUndefined()
  })

  it('commitRename clamps an empty draft to "Untitled"', () => {
    const { b } = setup({ ...PRESETS.smtogo })
    const t = b.templates.value[0]!
    b.startRename(t.id, t.name)
    b.draftName.value = '   '
    b.commitRename(t.id)
    expect(b.templates.value.find((x) => x.id === t.id)!.name).toBe('Untitled')
  })
})
