import { describe, expect, it } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'
import { useMailInterfaceEditor } from '../../vue/useMailInterfaceEditor'
import { PRESETS, exportInterface, type FieldMap } from 'email-poster/pure'

describe('useMailInterfaceEditor', () => {
  it('setField sets a key', () => {
    const c = useMailInterfaceEditor({})
    c.setField('to', 'recipient')
    expect(c.fields.value.to).toBe('recipient')
  })

  it('setField empty string unsets the key', () => {
    const c = useMailInterfaceEditor({ subject: 'subject' })
    c.setField('subject', '')
    expect(c.fields.value.subject).toBeUndefined()
  })

  it('enforces body XOR: setting body clears split keys', () => {
    const c = useMailInterfaceEditor({ subject: 'subject', bodyHtml: 'html', bodyText: 'text' })
    c.setField('body', 'content')
    expect(c.fields.value.body).toBe('content')
    expect(c.fields.value.bodyHtml).toBeUndefined()
    expect(c.fields.value.bodyText).toBeUndefined()
  })

  it('enforces body XOR: setting a split key clears body', () => {
    const c = useMailInterfaceEditor({ body: 'content' })
    c.setField('bodyHtml', 'html')
    expect(c.fields.value.bodyHtml).toBe('html')
    expect(c.fields.value.body).toBeUndefined()
  })

  it('applyPreset loads the exact map and activePreset matches; edits break the match', () => {
    const c = useMailInterfaceEditor({})
    c.applyPreset('smtogo')
    expect(c.fields.value).toEqual({ from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html' })
    expect(c.activePreset.value).toBe('smtogo')
    c.setField('to', 'recipient')
    expect(c.activePreset.value).toBeNull()
  })

  it('applyPreset covers none / generic / custom_example', () => {
    const c = useMailInterfaceEditor({})
    c.applyPreset('none')
    expect(c.fields.value).toEqual({})
    expect(c.activePreset.value).toBe('none')
    c.applyPreset('generic')
    expect(c.activePreset.value).toBe('generic')
    c.applyPreset('custom_example')
    expect(c.activePreset.value).toBe('custom_example')
  })

  it('resyncs the working copy when the source ref changes externally', async () => {
    const src = ref<FieldMap>({ subject: 'subject' })
    const c = useMailInterfaceEditor(src)
    src.value = { to: 'to' }
    await nextTick()
    expect(c.fields.value).toEqual({ to: 'to' })
  })

  it('payloadPreview builds the sample payload for a valid map', () => {
    const c = useMailInterfaceEditor({ ...PRESETS.smtogo })
    expect(JSON.parse(c.payloadPreview.value)).toEqual({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    })
  })

  it('payloadPreview is an error comment when no body key is mapped', () => {
    const c = useMailInterfaceEditor({ to: 'to', subject: 'subject' })
    expect(c.payloadPreview.value.startsWith('//')).toBe(true)
  })

  it('payloadPreview reflects cc/bcc/replyTo/tagName/headers once mapped (regression)', () => {
    // The preview's sample input must carry a value for every mappable field so
    // that mapping a previously-absent field (cc, replyTo, …) shows up live.
    const c = useMailInterfaceEditor({
      to: 'to',
      subject: 'subject',
      body: 'content',
      cc: 'cc_key',
      bcc: 'bcc_key',
      replyTo: 'reply_key',
      tagName: 'tag',
      headers: 'hdrs',
    })
    const payload = JSON.parse(c.payloadPreview.value) as Record<string, unknown>
    expect(payload.cc_key).toBe('cc@example.com')
    expect(payload.bcc_key).toBe('bcc@example.com')
    expect(payload.reply_key).toBe('reply@example.com')
    expect(payload.tag).toBe('welcome')
    expect(payload.hdrs).toEqual({ 'X-Demo': 'true' })
  })

  it('does not echo an external resync as update:modelValue (discard reaches clean in one step)', async () => {
    // Reproduce the gateway's v-model computed: getter parses a JSON string,
    // falling back to PRESETS.smtogo when empty; setter stringifies. The
    // round-trip is non-idempotent, so a child that re-emits on resync makes
    // discard leave the string dirty (the "two-click discard" bug).
    const postFieldMap = ref('')
    const fieldMap = computed<FieldMap>({
      get: () => {
        const raw = postFieldMap.value.trim()
        if (raw) {
          try {
            return JSON.parse(raw) as FieldMap
          } catch {
            /* fall through */
          }
        }
        return PRESETS.smtogo
      },
      set: (fm: FieldMap) => {
        postFieldMap.value = JSON.stringify(fm)
      },
    })
    const c = useMailInterfaceEditor(() => fieldMap.value)
    // Mirror the SFC's outward watch WITH the skip-when-equal guard.
    watch(
      c.fields,
      (next) => {
        if (JSON.stringify(next) === JSON.stringify(fieldMap.value)) return
        fieldMap.value = { ...next }
      },
      { deep: true },
    )

    c.setField('cc', 'cc') // user edit propagates outward
    await nextTick()
    expect(postFieldMap.value).not.toBe('')

    postFieldMap.value = '' // discard
    await nextTick()

    // With the guard, the editor resyncs without echoing, so the serialized
    // form stays clean — no second discard needed.
    expect(postFieldMap.value).toBe('')
    expect(c.fields.value).toEqual({ ...PRESETS.smtogo })
  })

  it('runDetect infers a field map from a sample instance and applies it', () => {
    const c = useMailInterfaceEditor({})
    c.sampleText.value = '{"email":"a@b.c","subject":"Hi","content":"x"}'
    const r = c.runDetect()
    expect(r).toEqual({ ok: true, count: 3, fields: { to: 'email', subject: 'subject', body: 'content' } })
    expect(c.fields.value).toEqual({ to: 'email', subject: 'subject', body: 'content' })
  })

  it('runDetect reports invalid JSON', () => {
    const c = useMailInterfaceEditor({})
    c.sampleText.value = 'not json'
    const r = c.runDetect()
    expect(r.ok).toBe(false)
    expect(c.detectError.value).toBe('Not valid JSON')
  })

  it('onImportFile imports fields from an InterfaceDef-shaped file', async () => {
    const c = useMailInterfaceEditor({})
    const def = exportInterface({ preset: 'smtogo' })
    const fakeFile = { text: async () => JSON.stringify(def) }
    const e = { target: { files: [fakeFile] } } as unknown as Event
    const r = await c.onImportFile(e)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.count).toBe(4)
      expect(c.fields.value).toEqual({ from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html' })
    }
  })

  it('disabled option surfaces through isDisabled and stays reactive', () => {
    const d = ref(false)
    const c = useMailInterfaceEditor({}, { disabled: d })
    expect(c.isDisabled.value).toBe(false)
    d.value = true
    expect(c.isDisabled.value).toBe(true)
  })

  it('exportDef / exportSchema call the injected dom.downloadJson with the right files', () => {
    const downloaded: { filename: string; data: unknown }[] = []
    const c = useMailInterfaceEditor(
      { ...PRESETS.smtogo },
      { dom: { downloadJson: (filename, data) => downloaded.push({ filename, data }) } },
    )
    c.exportDef()
    c.exportSchema()
    expect(downloaded.map((d) => d.filename)).toEqual([
      'mail-interface.json',
      'mail-payload.schema.json',
    ])
    const iface = downloaded[0]!.data as { fields: FieldMap }
    expect(iface.fields).toEqual({ from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html' })
    const schema = downloaded[1]!.data as { $schema: string; required: string[] }
    expect(schema.$schema).toContain('draft-07')
    expect(schema.required).toContain('to')
  })
})
