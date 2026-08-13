/**
 * email-poster/vue — store for a managed collection of mail interface templates
 * (named FieldMaps).
 *
 * The engine behind the template switcher / add / rename / delete UI in
 * `<MailInterfaceEditor>`, and usable headless by consumers that build their
 * own UI. The consuming application (the package's user, NOT "the browser")
 * owns the storage: persistence goes through a `storage` adapter the consumer
 * provides. A localStorage adapter is supplied as a ready-made default, but the
 * intended pattern for a server app is to pass a custom adapter that loads/saves
 * against its own backend (so templates are shared and durable, not per-browser).
 * Pass `false` to disable persistence entirely (e.g. in-memory for tests).
 *
 * The package ships `DEFAULT_TEMPLATES` (the built-in presets, relabeled:
 * SMToGo / Resend-like / Custom Example / Blank). Importing them is **opt-in**:
 * the store never auto-injects defaults. A consumer that wants them as the
 * starting baseline passes `defaults: DEFAULT_TEMPLATES`; one that wants to
 * start empty (or supply its own) does not.
 *
 * Browser-safe: imports only `vue` and the type-only `FieldMap`.
 *
 * @license Apache-2.0
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { FieldMap } from 'email-poster/pure'

export interface MailTemplate {
  /** Stable unique id. Built-in defaults reuse the preset key (stable across versions). */
  id: string
  /** User-editable display name. */
  name: string
  /** The field map this template carries. */
  fields: FieldMap
}

/**
 * The package's built-in templates — the presets, relabeled. Import and pass as
 * `useTemplateStore({ defaults: DEFAULT_TEMPLATES })` to seed an empty store.
 */
export const DEFAULT_TEMPLATES: MailTemplate[] = [
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
export interface TemplateStorage {
  load(): MailTemplate[] | undefined
  save(templates: MailTemplate[]): void
}

export interface UseTemplateStoreOptions {
  /**
   * Where templates persist. Default: a localStorage adapter keyed by
   * `storageKey`. Pass `false` for an in-memory store (no persistence), or a
   * custom adapter (server-synced, or a test spy).
   */
  storage?: TemplateStorage | false
  /** localStorage key for the default adapter. Default `'ep-mail-templates'`. */
  storageKey?: string
  /**
   * Templates used to seed the store when storage is empty (never stored yet).
   * Opt-in — pass `DEFAULT_TEMPLATES` (or your own) to use them. Default: none.
   */
  defaults?: MailTemplate[]
  /** Initially-active template id. Default: the first template, or null. */
  initialActiveId?: string | null
}

export interface UseTemplateStoreResult {
  /** All templates (reactive; replacing the array triggers persistence). */
  templates: Ref<MailTemplate[]>
  /** Id of the active template, or null. */
  activeId: Ref<string | null>
  /** The active template object, or null. */
  activeTemplate: ComputedRef<MailTemplate | null>
  /** The active template's field map (empty object when none active). */
  activeFields: ComputedRef<FieldMap>
  /** True when at least one template exists. */
  hasTemplates: ComputedRef<boolean>
  /** Make a template active by id (no-op if absent). */
  selectTemplate: (id: string) => void
  /** Create a template; selects it. Returns the new id. */
  addTemplate: (name: string, fields?: FieldMap) => string
  /** Rename a template by id. */
  renameTemplate: (id: string, name: string) => void
  /** Delete a template by id; re-selects a neighbor if it was active. */
  deleteTemplate: (id: string) => void
  /** Overwrite one template's field map by id. */
  updateTemplateFields: (id: string, fields: FieldMap) => void
  /** Shorthand: update the active template's field map (no-op if none active). */
  setActiveFields: (fields: FieldMap) => void
  /** Clone a template (and its fields) under a new name/id; selects it. Returns the new id, or null if absent. */
  duplicateTemplate: (id: string, name?: string) => string | null
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
 * Defensive deep clone. Templates/field maps are always JSON-safe data (strings
 * + plain objects), so a JSON round-trip is sufficient — and crucially it
 * transparently unwraps Vue reactive proxies, which `structuredClone` chokes on.
 */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Default localStorage-backed adapter. Lazily touches `localStorage`. */
function localStorageAdapter(key: string): TemplateStorage {
  return {
    load(): MailTemplate[] | undefined {
      try {
        const raw = globalThis.localStorage?.getItem(key)
        if (raw == null) return undefined
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as MailTemplate[]) : undefined
      } catch {
        return undefined
      }
    },
    save(templates: MailTemplate[]): void {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(templates))
      } catch {
        /* quota / private mode — swallow; store stays in-memory */
      }
    },
  }
}

/**
 * Create a template store. Persistence and default-seeding are both opt-in.
 *
 * ```ts
 * import { useTemplateStore, DEFAULT_TEMPLATES } from 'email-poster/vue'
 * const store = useTemplateStore({ defaults: DEFAULT_TEMPLATES })
 * store.activeFields.value // the active template's FieldMap
 * store.addTemplate('My gateway', { to: 'email', subject: 'subject', body: 'content' })
 * ```
 */
export function useTemplateStore(options: UseTemplateStoreOptions = {}): UseTemplateStoreResult {
  const storage: TemplateStorage | null =
    options.storage === false
      ? null
      : options.storage ?? localStorageAdapter(options.storageKey ?? 'ep-mail-templates')
  const defaults = options.defaults

  // Init: prefer stored data; only seed from `defaults` when nothing is stored
  // yet (undefined). An explicit empty array means "user cleared it" → stay empty.
  const stored = storage?.load()
  let seeded = false
  const initial: MailTemplate[] =
    stored !== undefined
      ? stored.map(clone)
      : (() => {
          seeded = true
          return defaults ? defaults.map(clone) : []
        })()
  if (seeded) storage?.save(initial) // persist the seed as the editable baseline

  const templates = ref<MailTemplate[]>(initial)

  // Resolve the initial active id: explicit → first → null. Guard against a
  // stale id that no longer exists.
  const initialActiveId =
    options.initialActiveId != null && templates.value.some((t) => t.id === options.initialActiveId)
      ? options.initialActiveId
      : (templates.value[0]?.id ?? null)
  const activeId = ref<string | null>(initialActiveId)

  // Persist on any change (Vue coalesces within a tick, so rapid edits batch).
  watch(templates, () => storage?.save(templates.value), { deep: true })

  const activeTemplate = computed<MailTemplate | null>(
    () => templates.value.find((t) => t.id === activeId.value) ?? null,
  )
  const activeFields = computed<FieldMap>(() => activeTemplate.value?.fields ?? {})
  const hasTemplates = computed<boolean>(() => templates.value.length > 0)

  function selectTemplate(id: string): void {
    if (templates.value.some((t) => t.id === id)) activeId.value = id
  }

  function addTemplate(name: string, fields: FieldMap = {}): string {
    const id = makeId()
    templates.value = [
      ...templates.value,
      { id, name: name.trim() || 'Untitled', fields: clone(fields) },
    ]
    activeId.value = id
    return id
  }

  function renameTemplate(id: string, name: string): void {
    templates.value = templates.value.map((t) => (t.id === id ? { ...t, name } : t))
  }

  function deleteTemplate(id: string): void {
    const idx = templates.value.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = templates.value.filter((t) => t.id !== id)
    templates.value = next
    if (activeId.value === id) {
      // Re-select the neighbor that slides into this slot, else the previous,
      // else the first remaining, else none.
      activeId.value = next[idx]?.id ?? next[idx - 1]?.id ?? next[0]?.id ?? null
    }
  }

  function updateTemplateFields(id: string, fields: FieldMap): void {
    templates.value = templates.value.map((t) => (t.id === id ? { ...t, fields: clone(fields) } : t))
  }

  function setActiveFields(fields: FieldMap): void {
    if (activeId.value) updateTemplateFields(activeId.value, fields)
  }

  function duplicateTemplate(id: string, name?: string): string | null {
    const src = templates.value.find((t) => t.id === id)
    if (!src) return null
    const newId = makeId()
    templates.value = [
      ...templates.value,
      { id: newId, name: name ?? `${src.name} copy`, fields: clone(src.fields) },
    ]
    activeId.value = newId
    return newId
  }

  function resetToDefaults(): void {
    if (!defaults) return
    templates.value = defaults.map(clone)
    activeId.value = templates.value[0]?.id ?? null
  }

  return {
    templates,
    activeId,
    activeTemplate,
    activeFields,
    hasTemplates,
    selectTemplate,
    addTemplate,
    renameTemplate,
    deleteTemplate,
    updateTemplateFields,
    setActiveFields,
    duplicateTemplate,
    resetToDefaults,
  }
}
