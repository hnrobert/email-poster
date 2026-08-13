import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  DEFAULT_TEMPLATES,
  useTemplateStore,
  type MailTemplate,
  type TemplateStorage,
} from '../../vue/useTemplateStore'
import type { FieldMap } from 'email-poster/pure'

/** In-memory storage spy. `load()` returns undefined until something is saved
 *  (or an initial value is given), mirroring "never stored yet". */
function memoryStorage(initial?: MailTemplate[]): TemplateStorage & { items: MailTemplate[] } {
  let items: MailTemplate[] | undefined = initial ? [...initial] : undefined
  return {
    get items() {
      return items ?? []
    },
    load() {
      return items
    },
    save(t: MailTemplate[]) {
      items = [...t]
    },
  }
}

describe('useTemplateStore', () => {
  it('ships four default templates with stable ids and correct branding', () => {
    expect(DEFAULT_TEMPLATES.map((t) => t.id)).toEqual([
      'smtogo',
      'generic',
      'custom_example',
      'blank',
    ])
    const find = (id: string) => DEFAULT_TEMPLATES.find((t) => t.id === id)!
    expect(find('smtogo').name).toBe('SMToGo')
    expect(find('smtogo').fields).toEqual({
      from: 'from',
      to: 'to',
      subject: 'subject',
      bodyHtml: 'html',
    })
    expect(find('custom_example').fields).toEqual({ to: 'email', subject: 'subject', body: 'content' })
    expect(find('blank').fields).toEqual({})
  })

  it('seeds from defaults when storage is empty (undefined)', () => {
    const storage = memoryStorage() // load() → undefined
    const s = useTemplateStore({ storage, defaults: DEFAULT_TEMPLATES })
    expect(s.templates.value).toHaveLength(4)
    expect(s.activeId.value).toBe('smtogo') // first template active by default
    // seed is persisted as the editable baseline
    expect(storage.items).toHaveLength(4)
  })

  it('does NOT auto-inject defaults when none are passed (opt-in)', () => {
    const s = useTemplateStore({ storage: false })
    expect(s.templates.value).toEqual([])
    expect(s.activeId.value).toBeNull()
    expect(s.hasTemplates.value).toBe(false)
  })

  it('treats an explicitly-empty stored array as "cleared" (no re-seed)', () => {
    const storage: TemplateStorage = { load: () => [], save: () => {} }
    const s = useTemplateStore({ storage, defaults: DEFAULT_TEMPLATES })
    expect(s.templates.value).toEqual([])
  })

  it('loads stored templates and ignores defaults', () => {
    const mine: MailTemplate[] = [
      { id: 'x', name: 'X', fields: { to: 'email' } },
      { id: 'y', name: 'Y', fields: { to: 'email2' } },
    ]
    const s = useTemplateStore({ storage: memoryStorage(mine), defaults: DEFAULT_TEMPLATES })
    expect(s.templates.value.map((t) => t.id)).toEqual(['x', 'y'])
    expect(s.activeId.value).toBe('x')
  })

  it('addTemplate selects the new template and persists', async () => {
    const storage = memoryStorage()
    const s = useTemplateStore({ storage, defaults: DEFAULT_TEMPLATES })
    const id = s.addTemplate('Mine', { to: 'email', subject: 'subject' })
    await nextTick()
    expect(s.templates.value).toHaveLength(5)
    expect(s.activeId.value).toBe(id)
    expect(s.activeFields.value).toEqual({ to: 'email', subject: 'subject' })
    expect(storage.items.find((t) => t.id === id)!.name).toBe('Mine')
  })

  it('addTemplate trims an empty name to "Untitled"', () => {
    const s = useTemplateStore({ storage: false })
    s.addTemplate('   ')
    expect(s.templates.value[0]!.name).toBe('Untitled')
  })

  it('renameTemplate updates the name', () => {
    const s = useTemplateStore({ storage: false, defaults: DEFAULT_TEMPLATES })
    s.renameTemplate('smtogo', 'Primary')
    expect(s.activeTemplate.value?.name).toBe('Primary')
  })

  it('deleteTemplate re-selects a neighbor when the active one is deleted', () => {
    const s = useTemplateStore({ storage: false, defaults: DEFAULT_TEMPLATES })
    // active is 'smtogo' (index 0); deleting it should pick 'generic' (the new index 0)
    s.deleteTemplate('smtogo')
    expect(s.templates.value.map((t) => t.id)).toEqual(['generic', 'custom_example', 'blank'])
    expect(s.activeId.value).toBe('generic')
  })

  it('deleteTemplate leaves activeId null when the last template is removed', () => {
    const s = useTemplateStore({ storage: false })
    const id = s.addTemplate('only')
    s.deleteTemplate(id)
    expect(s.templates.value).toEqual([])
    expect(s.activeId.value).toBeNull()
    expect(s.activeFields.value).toEqual({})
  })

  it('updateTemplateFields + setActiveFields write back to the right template', () => {
    const s = useTemplateStore({ storage: false, defaults: DEFAULT_TEMPLATES })
    s.selectTemplate('custom_example')
    const next: FieldMap = { to: 'email', subject: 'subject', body: 'content', from: 'from' }
    s.setActiveFields(next)
    expect(s.activeFields.value).toEqual(next)
    // updating a non-active template does not disturb activeFields
    s.updateTemplateFields('smtogo', { to: 'zzz' })
    expect(s.activeFields.value).toEqual(next)
  })

  it('mutating fields does not leak references into the store (defensive clone)', () => {
    const s = useTemplateStore({ storage: false })
    const fields: FieldMap = { to: 'email' }
    s.addTemplate('Mine', fields)
    fields.to = 'changed'
    expect(s.activeFields.value.to).toBe('email')
  })

  it('duplicateTemplate clones fields under a new id and selects it', () => {
    const s = useTemplateStore({ storage: false, defaults: DEFAULT_TEMPLATES })
    const newId = s.duplicateTemplate('custom_example', 'Custom (copy)')
    expect(newId).not.toBeNull()
    expect(s.activeId.value).toBe(newId)
    expect(s.activeFields.value).toEqual(DEFAULT_TEMPLATES[2]!.fields)
    expect(s.templates.value).toHaveLength(5)
  })

  it('resetToDefaults replaces the list with fresh copies', () => {
    const s = useTemplateStore({ storage: false, defaults: DEFAULT_TEMPLATES })
    s.addTemplate('extra')
    expect(s.templates.value).toHaveLength(5)
    s.resetToDefaults()
    expect(s.templates.value).toHaveLength(4)
    expect(s.activeId.value).toBe('smtogo')
  })

  it('selectTemplate ignores an unknown id', () => {
    const s = useTemplateStore({ storage: false, defaults: DEFAULT_TEMPLATES })
    s.selectTemplate('nope')
    expect(s.activeId.value).toBe('smtogo')
  })

  it('persists on every mutation through the default watch', async () => {
    const storage = memoryStorage()
    const s = useTemplateStore({ storage, defaults: DEFAULT_TEMPLATES })
    // seed already persisted 4; observe that later mutations land in storage too
    s.renameTemplate('smtogo', 'Primary')
    await nextTick()
    expect(storage.items.find((t) => t.id === 'smtogo')!.name).toBe('Primary')
    s.deleteTemplate('generic')
    await nextTick()
    expect(storage.items).toHaveLength(3)
  })

  it('initialActiveId selects a valid template but falls back for a stale id', () => {
    const s1 = useTemplateStore({
      storage: false,
      defaults: DEFAULT_TEMPLATES,
      initialActiveId: 'custom_example',
    })
    expect(s1.activeId.value).toBe('custom_example')
    const s2 = useTemplateStore({
      storage: false,
      defaults: DEFAULT_TEMPLATES,
      initialActiveId: 'gone',
    })
    expect(s2.activeId.value).toBe('smtogo') // stale → first template
  })
})
