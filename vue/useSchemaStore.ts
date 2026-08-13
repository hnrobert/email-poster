/**
 * email-poster/vue — store for a managed collection of post schemas (named
 * FieldMaps): saved mappings of logical email field → downstream JSON key that
 * define the shape of the POST-webhook payload.
 *
 * NOTE: a "post schema" is NOT an email body template. email-poster's HTML/text
 * email rendering lives in `email-poster/template` (body content/layout). These
 * schemas only describe the *payload structure* of the webhook (which JSON keys
 * carry `to` / `subject` / `body`, etc.), so the two must never be conflated.
 *
 * The engine behind the schema switcher / add / rename / delete UI in
 * `<MailInterfaceEditor>`, and usable headless by consumers that build their
 * own UI. The consuming application (the package's user, NOT "the browser")
 * owns the storage: persistence goes through a `storage` adapter the consumer
 * provides. A localStorage adapter is supplied as a ready-made default, but the
 * intended pattern for a server app is to pass a custom adapter that loads/saves
 * against its own backend (so schemas are shared and durable, not per-browser).
 * Pass `false` to disable persistence entirely (e.g. in-memory for tests).
 *
 * The package ships `DEFAULT_SCHEMAS` (the built-in presets, relabeled:
 * SMToGo / Resend-like / Custom Example / Blank). Importing them is **opt-in**:
 * the store never auto-injects defaults. A consumer that wants them as the
 * starting baseline passes `defaults: DEFAULT_SCHEMAS`; one that wants to
 * start empty (or supply its own) does not.
 *
 * Browser-safe: imports only `vue` and the type-only `FieldMap`.
 *
 * @license Apache-2.0
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { FieldMap } from 'email-poster/pure'

export interface PostSchema {
  /** Stable unique id. Built-in defaults reuse the preset key (stable across versions). */
  id: string
  /** User-editable display name. */
  name: string
  /** The field map this schema carries. */
  fields: FieldMap
}

/**
 * The package's built-in schemas — the presets, relabeled. Import and pass as
 * `useSchemaStore({ defaults: DEFAULT_SCHEMAS })` to seed an empty store.
 */
export const DEFAULT_SCHEMAS: PostSchema[] = [
  { id: 'smtogo', name: 'SMToGo', fields: { from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html' } },
  { id: 'generic', name: 'Resend-like', fields: { from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html', bodyText: 'text' } },
  { id: 'custom_example', name: 'Custom Example', fields: { to: 'email', subject: 'subject', body: 'content' } },
  { id: 'blank', name: 'Blank', fields: {} },
]

/**
 * Persistence adapter. Return `undefined` when nothing is stored yet (so the
 * store knows it may seed from `defaults`); return `[]` to mean "explicitly
 * empty" (do NOT re-seed). Implementations should swallow per-environment
 * failures (SSR, disabled storage) by returning `undefined`.
 */
export interface SchemaStorage {
  load(): PostSchema[] | undefined
  save(schemas: PostSchema[]): void
}

export interface UseSchemaStoreOptions {
  /**
   * Where schemas persist. Default: a localStorage adapter keyed by
   * `storageKey`. Pass `false` for an in-memory store (no persistence), or a
   * custom adapter (server-synced, or a test spy).
   */
  storage?: SchemaStorage | false
  /** localStorage key for the default adapter. Default `'ep-mail-schemas'`. */
  storageKey?: string
  /**
   * Schemas used to seed the store when storage is empty (never stored yet).
   * Opt-in — pass `DEFAULT_SCHEMAS` (or your own) to use them. Default: none.
   */
  defaults?: PostSchema[]
  /** Initially-active schema id. Default: the first schema, or null. */
  initialActiveId?: string | null
}

export interface UseSchemaStoreResult {
  /** All schemas (reactive; replacing the array triggers persistence). */
  schemas: Ref<PostSchema[]>
  /** Id of the active schema, or null. */
  activeId: Ref<string | null>
  /** The active schema object, or null. */
  activeSchema: ComputedRef<PostSchema | null>
  /** The active schema's field map (empty object when none active). */
  activeFields: ComputedRef<FieldMap>
  /** True when at least one schema exists. */
  hasSchemas: ComputedRef<boolean>
  /** Make a schema active by id (no-op if absent). */
  selectSchema: (id: string) => void
  /** Create a schema; selects it. Returns the new id. */
  addSchema: (name: string, fields?: FieldMap) => string
  /** Rename a schema by id. */
  renameSchema: (id: string, name: string) => void
  /** Delete a schema by id; re-selects a neighbor if it was active. */
  deleteSchema: (id: string) => void
  /** Overwrite one schema's field map by id. */
  updateSchemaFields: (id: string, fields: FieldMap) => void
  /** Shorthand: update the active schema's field map (no-op if none active). */
  setActiveFields: (fields: FieldMap) => void
  /** Clone a schema (and its fields) under a new name/id; selects it. Returns the new id, or null if absent. */
  duplicateSchema: (id: string, name?: string) => string | null
  /** Replace the whole list with fresh copies of `defaults` (no-op if none were provided). */
  resetToDefaults: () => void
}

/** Prefer `crypto.randomUUID`; fall back for older runtimes. */
function makeId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'ep_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Defensive deep clone. Schemas/field maps are always JSON-safe data (strings
 * + plain objects), so a JSON round-trip is sufficient — and crucially it
 * transparently unwraps Vue reactive proxies, which `structuredClone` chokes on.
 */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Default localStorage-backed adapter. Lazily touches `localStorage`. */
function localStorageAdapter(key: string): SchemaStorage {
  return {
    load(): PostSchema[] | undefined {
      try {
        const raw = globalThis.localStorage?.getItem(key)
        if (raw == null) return undefined
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as PostSchema[]) : undefined
      } catch {
        return undefined
      }
    },
    save(schemas: PostSchema[]): void {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(schemas))
      } catch {
        /* quota / private mode — swallow; store stays in-memory */
      }
    },
  }
}

/**
 * Create a schema store. Persistence and default-seeding are both opt-in.
 *
 * ```ts
 * import { useSchemaStore, DEFAULT_SCHEMAS } from 'email-poster/vue'
 * const store = useSchemaStore({ defaults: DEFAULT_SCHEMAS })
 * store.activeFields.value // the active schema's FieldMap
 * store.addSchema('My gateway', { to: 'email', subject: 'subject', body: 'content' })
 * ```
 */
export function useSchemaStore(options: UseSchemaStoreOptions = {}): UseSchemaStoreResult {
  const storage: SchemaStorage | null =
    options.storage === false
      ? null
      : options.storage ?? localStorageAdapter(options.storageKey ?? 'ep-mail-schemas')
  const defaults = options.defaults

  // Init: prefer stored data; only seed from `defaults` when nothing is stored
  // yet (undefined). An explicit empty array means "user cleared it" → stay empty.
  const stored = storage?.load()
  let seeded = false
  const initial: PostSchema[] =
    stored !== undefined
      ? stored.map(clone)
      : (() => {
          seeded = true
          return defaults ? defaults.map(clone) : []
        })()
  if (seeded) storage?.save(initial) // persist the seed as the editable baseline

  const schemas = ref<PostSchema[]>(initial)

  // Resolve the initial active id: explicit → first → null. Guard against a
  // stale id that no longer exists.
  const initialActiveId =
    options.initialActiveId != null && schemas.value.some((t) => t.id === options.initialActiveId)
      ? options.initialActiveId
      : (schemas.value[0]?.id ?? null)
  const activeId = ref<string | null>(initialActiveId)

  // Persist on any change (Vue coalesces within a tick, so rapid edits batch).
  watch(schemas, () => storage?.save(schemas.value), { deep: true })

  const activeSchema = computed<PostSchema | null>(
    () => schemas.value.find((t) => t.id === activeId.value) ?? null,
  )
  const activeFields = computed<FieldMap>(() => activeSchema.value?.fields ?? {})
  const hasSchemas = computed<boolean>(() => schemas.value.length > 0)

  function selectSchema(id: string): void {
    if (schemas.value.some((t) => t.id === id)) activeId.value = id
  }

  function addSchema(name: string, fields: FieldMap = {}): string {
    const id = makeId()
    schemas.value = [
      ...schemas.value,
      { id, name: name.trim() || 'Untitled', fields: clone(fields) },
    ]
    activeId.value = id
    return id
  }

  function renameSchema(id: string, name: string): void {
    schemas.value = schemas.value.map((t) => (t.id === id ? { ...t, name } : t))
  }

  function deleteSchema(id: string): void {
    const idx = schemas.value.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = schemas.value.filter((t) => t.id !== id)
    schemas.value = next
    if (activeId.value === id) {
      // Re-select the neighbor that slides into this slot, else the previous,
      // else the first remaining, else none.
      activeId.value = next[idx]?.id ?? next[idx - 1]?.id ?? next[0]?.id ?? null
    }
  }

  function updateSchemaFields(id: string, fields: FieldMap): void {
    schemas.value = schemas.value.map((t) => (t.id === id ? { ...t, fields: clone(fields) } : t))
  }

  function setActiveFields(fields: FieldMap): void {
    if (activeId.value) updateSchemaFields(activeId.value, fields)
  }

  function duplicateSchema(id: string, name?: string): string | null {
    const src = schemas.value.find((t) => t.id === id)
    if (!src) return null
    const newId = makeId()
    schemas.value = [
      ...schemas.value,
      { id: newId, name: name ?? `${src.name} copy`, fields: clone(src.fields) },
    ]
    activeId.value = newId
    return newId
  }

  function resetToDefaults(): void {
    if (!defaults) return
    schemas.value = defaults.map(clone)
    activeId.value = schemas.value[0]?.id ?? null
  }

  return {
    schemas,
    activeId,
    activeSchema,
    activeFields,
    hasSchemas,
    selectSchema,
    addSchema,
    renameSchema,
    deleteSchema,
    updateSchemaFields,
    setActiveFields,
    duplicateSchema,
    resetToDefaults,
  }
}
