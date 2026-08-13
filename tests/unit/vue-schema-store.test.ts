import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  DEFAULT_SCHEMAS,
  useSchemaStore,
  type PostSchema,
  type SchemaStorage,
} from '../../vue/useSchemaStore'
import type { FieldMap } from 'email-poster/pure'

/** In-memory storage spy. `load()` returns undefined until something is saved
 *  (or an initial value is given), mirroring "never stored yet". */
function memoryStorage(initial?: PostSchema[]): SchemaStorage & { items: PostSchema[] } {
  let items: PostSchema[] | undefined = initial ? [...initial] : undefined
  return {
    get items() {
      return items ?? []
    },
    load() {
      return items
    },
    save(t: PostSchema[]) {
      items = [...t]
    },
  }
}

describe('useSchemaStore', () => {
  it('ships four default schemas with stable ids and correct branding', () => {
    expect(DEFAULT_SCHEMAS.map((t) => t.id)).toEqual([
      'smtogo',
      'generic',
      'custom_example',
      'blank',
    ])
    const find = (id: string) => DEFAULT_SCHEMAS.find((t) => t.id === id)!
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
    const s = useSchemaStore({ storage, defaults: DEFAULT_SCHEMAS })
    expect(s.schemas.value).toHaveLength(4)
    expect(s.activeId.value).toBe('smtogo') // first schema active by default
    // seed is persisted as the editable baseline
    expect(storage.items).toHaveLength(4)
  })

  it('does NOT auto-inject defaults when none are passed (opt-in)', () => {
    const s = useSchemaStore({ storage: false })
    expect(s.schemas.value).toEqual([])
    expect(s.activeId.value).toBeNull()
    expect(s.hasSchemas.value).toBe(false)
  })

  it('treats an explicitly-empty stored array as "cleared" (no re-seed)', () => {
    const storage: SchemaStorage = { load: () => [], save: () => {} }
    const s = useSchemaStore({ storage, defaults: DEFAULT_SCHEMAS })
    expect(s.schemas.value).toEqual([])
  })

  it('loads stored schemas and ignores defaults', () => {
    const mine: PostSchema[] = [
      { id: 'x', name: 'X', fields: { to: 'email' } },
      { id: 'y', name: 'Y', fields: { to: 'email2' } },
    ]
    const s = useSchemaStore({ storage: memoryStorage(mine), defaults: DEFAULT_SCHEMAS })
    expect(s.schemas.value.map((t) => t.id)).toEqual(['x', 'y'])
    expect(s.activeId.value).toBe('x')
  })

  it('addSchema selects the new schema and persists', async () => {
    const storage = memoryStorage()
    const s = useSchemaStore({ storage, defaults: DEFAULT_SCHEMAS })
    const id = s.addSchema('Mine', { to: 'email', subject: 'subject' })
    await nextTick()
    expect(s.schemas.value).toHaveLength(5)
    expect(s.activeId.value).toBe(id)
    expect(s.activeFields.value).toEqual({ to: 'email', subject: 'subject' })
    expect(storage.items.find((t) => t.id === id)!.name).toBe('Mine')
  })

  it('addSchema trims an empty name to "Untitled"', () => {
    const s = useSchemaStore({ storage: false })
    s.addSchema('   ')
    expect(s.schemas.value[0]!.name).toBe('Untitled')
  })

  it('renameSchema updates the name', () => {
    const s = useSchemaStore({ storage: false, defaults: DEFAULT_SCHEMAS })
    s.renameSchema('smtogo', 'Primary')
    expect(s.activeSchema.value?.name).toBe('Primary')
  })

  it('deleteSchema re-selects a neighbor when the active one is deleted', () => {
    const s = useSchemaStore({ storage: false, defaults: DEFAULT_SCHEMAS })
    // active is 'smtogo' (index 0); deleting it should pick 'generic' (the new index 0)
    s.deleteSchema('smtogo')
    expect(s.schemas.value.map((t) => t.id)).toEqual(['generic', 'custom_example', 'blank'])
    expect(s.activeId.value).toBe('generic')
  })

  it('deleteSchema leaves activeId null when the last schema is removed', () => {
    const s = useSchemaStore({ storage: false })
    const id = s.addSchema('only')
    s.deleteSchema(id)
    expect(s.schemas.value).toEqual([])
    expect(s.activeId.value).toBeNull()
    expect(s.activeFields.value).toEqual({})
  })

  it('updateSchemaFields + setActiveFields write back to the right schema', () => {
    const s = useSchemaStore({ storage: false, defaults: DEFAULT_SCHEMAS })
    s.selectSchema('custom_example')
    const next: FieldMap = { to: 'email', subject: 'subject', body: 'content', from: 'from' }
    s.setActiveFields(next)
    expect(s.activeFields.value).toEqual(next)
    // updating a non-active schema does not disturb activeFields
    s.updateSchemaFields('smtogo', { to: 'zzz' })
    expect(s.activeFields.value).toEqual(next)
  })

  it('mutating fields does not leak references into the store (defensive clone)', () => {
    const s = useSchemaStore({ storage: false })
    const fields: FieldMap = { to: 'email' }
    s.addSchema('Mine', fields)
    fields.to = 'changed'
    expect(s.activeFields.value.to).toBe('email')
  })

  it('duplicateSchema clones fields under a new id and selects it', () => {
    const s = useSchemaStore({ storage: false, defaults: DEFAULT_SCHEMAS })
    const newId = s.duplicateSchema('custom_example', 'Custom (copy)')
    expect(newId).not.toBeNull()
    expect(s.activeId.value).toBe(newId)
    expect(s.activeFields.value).toEqual(DEFAULT_SCHEMAS[2]!.fields)
    expect(s.schemas.value).toHaveLength(5)
  })

  it('resetToDefaults replaces the list with fresh copies', () => {
    const s = useSchemaStore({ storage: false, defaults: DEFAULT_SCHEMAS })
    s.addSchema('extra')
    expect(s.schemas.value).toHaveLength(5)
    s.resetToDefaults()
    expect(s.schemas.value).toHaveLength(4)
    expect(s.activeId.value).toBe('smtogo')
  })

  it('selectSchema ignores an unknown id', () => {
    const s = useSchemaStore({ storage: false, defaults: DEFAULT_SCHEMAS })
    s.selectSchema('nope')
    expect(s.activeId.value).toBe('smtogo')
  })

  it('persists on every mutation through the default watch', async () => {
    const storage = memoryStorage()
    const s = useSchemaStore({ storage, defaults: DEFAULT_SCHEMAS })
    // seed already persisted 4; observe that later mutations land in storage too
    s.renameSchema('smtogo', 'Primary')
    await nextTick()
    expect(storage.items.find((t) => t.id === 'smtogo')!.name).toBe('Primary')
    s.deleteSchema('generic')
    await nextTick()
    expect(storage.items).toHaveLength(3)
  })

  it('initialActiveId selects a valid schema but falls back for a stale id', () => {
    const s1 = useSchemaStore({
      storage: false,
      defaults: DEFAULT_SCHEMAS,
      initialActiveId: 'custom_example',
    })
    expect(s1.activeId.value).toBe('custom_example')
    const s2 = useSchemaStore({
      storage: false,
      defaults: DEFAULT_SCHEMAS,
      initialActiveId: 'gone',
    })
    expect(s2.activeId.value).toBe('smtogo') // stale → first schema
  })
})
