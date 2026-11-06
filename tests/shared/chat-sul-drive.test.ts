import { describe, it, expect } from 'vitest'
import {
  CHAT_SUL_DRIVE_GIORNI, CHAT_SUL_DRIVE_MS, SOGLIA_SPAZIO_POCO, cambiaSoloQui, chatDiWorkspaceSoloQui, chatNonSale, proposteChatSulDrive, sessioniDelleVoci, spazioPoco
} from '@shared/chat-sul-drive'
import { restaFuori, type IndiceDrive } from '@shared/spazio-drive'

const GIORNO = 86_400_000
const ADESSO = Date.parse('2026-11-06T12:00:00.000Z')

function indice(chat: { slug: string; id: string; size: number; giorni: number }[]): IndiceDrive {
  return Object.fromEntries(chat.map((c) => [`chat/${c.slug}/${c.id}.jsonl`, { nome: `f_${c.id}`, size: c.size, mtime: ADESSO - c.giorni * GIORNO }]))
}
/** Ogni chat ha la sua copia intera su un PC, tranne quelle elencate in `senza`. */
const copie = (idx: IndiceDrive, senza: string[] = []): Map<string, { nome: string; size: number }[]> =>
  new Map(Object.entries(idx).filter(([p]) => !senza.some((s) => p.includes(s))).map(([p, v]) => [p.split('/')[2]!.replace('.jsonl', ''), [{ nome: 'PC', size: v.size }]]))
const base = (idx: IndiceDrive, extra: Partial<Parameters<typeof proposteChatSulDrive>[0]> = {}): ReturnType<typeof proposteChatSulDrive> =>
  proposteChatSulDrive({ file: [], indice: idx, copieSuiPc: copie(idx), adesso: ADESSO, soloQui: () => false, ...extra })

describe('chat sul Drive: solo quelle usate di recente', () => {
  it('la soglia e\' esportata e vale 30 giorni', () => {
    expect(CHAT_SUL_DRIVE_GIORNI).toBe(30)
    expect(CHAT_SUL_DRIVE_MS).toBe(30 * GIORNO)
  })

  it('toglie dal Drive le chat ferme da piu\' di 30 giorni e tiene le altre', () => {
    const idx = indice([{ slug: 'a', id: 'uno', size: 100, giorni: 5 }, { slug: 'a', id: 'due', size: 100, giorni: 45 }])
    const p = base(idx)
    expect(p.map((x) => x.tipo)).toEqual(['chat-non-usate'])
    expect(p[0]!.voci.map((v) => v.percorso)).toEqual(['chat/a/due.jsonl'])
  })

  it('una chat senza copia intera su un PC non si toglie mai dal Drive (e\' l\'unica copia)', () => {
    const idx = indice([{ slug: 'a', id: 'due', size: 100, giorni: 90 }])
    expect(base(idx, { copieSuiPc: copie(idx, ['due']) })).toEqual([])
    expect(base(idx, { copieSuiPc: new Map([['due', [{ nome: 'PC', size: 50 }]]]) })).toEqual([])
  })

  it('i sotto-agenti vanno con la chat', () => {
    const idx = { ...indice([{ slug: 'a', id: 'due', size: 100, giorni: 90 }]), 'chat/a/due/subagents/x.jsonl': { nome: 'f_x', size: 10, mtime: ADESSO } }
    const p = base(idx)
    expect(p[0]!.voci).toHaveLength(2)
  })

  it('la regola di salita: una chat ferma non sale, una usata sale; torna a salire quando viene usata', () => {
    const nonSale = chatNonSale({ adesso: () => ADESSO, soloQui: () => false, sessioniSoloLocali: () => new Set() })
    expect(nonSale('chat/a/uno.jsonl', { mtime: ADESSO - 40 * GIORNO })).toBe(true)
    expect(nonSale('chat/a/uno.jsonl', { mtime: ADESSO - 1 * GIORNO })).toBe(false)
    expect(nonSale('progetto-x/file.ts', { mtime: ADESSO - 400 * GIORNO })).toBe(false)
    expect(nonSale('sierradeck/workspaces.json', {})).toBe(false)
  })

  it('le chat diventate solo locali per lo spazio non salgono piu\'', () => {
    const nonSale = chatNonSale({ adesso: () => ADESSO, soloQui: () => false, sessioniSoloLocali: () => new Set(['uno']) })
    expect(nonSale('chat/a/Uno.jsonl', { mtime: ADESSO })).toBe(true)
    expect(nonSale('chat/a/altra.jsonl', { mtime: ADESSO })).toBe(false)
  })

  it('le pulizie delle chat non le blocca restaFuori: la regola di salita decide', () => {
    const r = { versione: 1 as const, pulizie: [{ id: 'p', tipo: 'chat-non-usate' as const, titolo: 't', quando: '', chi: '', scadeIl: '', byte: 1, voci: [{ nome: 'f', byte: 1, percorso: 'chat/a/uno.jsonl', voce: { nome: 'f', size: 100, mtime: 0 } }] }] }
    expect(restaFuori(r, 'chat/a/uno.jsonl', 100)).toBe(false)
  })
})

describe('workspace «solo su questo PC»', () => {
  const ws = [
    { nome: 'Uno', perSlot: { '1': { panes: [{ sessionUuid: 'AAA-1', cwd: 'C:\\Lavoro\\Prog' }] } } },
    { nome: 'Due', perSlot: { '1': { panes: [{ sessionUuid: 'bbb-2', cwd: 'C:\\Altro' }] } } }
  ]
  it('le chat del workspace segnato non salgono, nemmeno quelle delle copie degli autopiloti', () => {
    const q = chatDiWorkspaceSoloQui({ soloQui: ['Uno'], workspace: ws })
    expect(q('chat/zzz/aaa-1.jsonl')).toBe(true)
    expect(q('chat/C--Lavoro-Prog/nuova.jsonl')).toBe(true)
    expect(q('chat/C--Lavoro-Prog-sierradeck-wt-ap1-c2/x.jsonl')).toBe(true)
    expect(q('chat/C--Altro/bbb-2.jsonl')).toBe(false)
    expect(q('chat/C--Lavoro-ProgrammaDiversa/x.jsonl')).toBe(false)
    expect(q('progetto-x/a.ts')).toBe(false)
  })
  it('senza workspace segnati niente e\' solo-qui', () => {
    expect(chatDiWorkspaceSoloQui({ soloQui: [], workspace: ws })('chat/C--Lavoro-Prog/x.jsonl')).toBe(false)
  })
  it('le chat gia\' sul Drive di un workspace solo-qui vengono tolte, ma solo con una copia intera', () => {
    const idx = indice([{ slug: 'S', id: 'aaa-1', size: 100, giorni: 1 }, { slug: 'S', id: 'ccc', size: 100, giorni: 1 }, { slug: 'S', id: 'ddd', size: 100, giorni: 1 }])
    const q = chatDiWorkspaceSoloQui({ soloQui: ['Uno'], workspace: [{ nome: 'Uno', perSlot: { '1': { panes: [{ sessionUuid: 'aaa-1', cwd: 'x' }, { sessionUuid: 'ddd', cwd: 'x' }] } } }] })
    const p = base(idx, { soloQui: q, copieSuiPc: copie(idx, ['ddd']) })
    expect(p.map((x) => x.tipo)).toEqual(['chat-solo-qui'])
    expect(sessioniDelleVoci(p[0]!.voci)).toEqual(['aaa-1'])
  })
  it('cambiaSoloQui aggiunge e toglie senza doppioni', () => {
    expect(cambiaSoloQui(['A'], 'B', true)).toEqual(['A', 'B'])
    expect(cambiaSoloQui(['A', 'B'], 'A', false)).toEqual(['B'])
    expect(cambiaSoloQui(['A'], 'A', true)).toEqual(['A'])
  })
})

describe('poco spazio: le piu\' grosse restano solo locali', () => {
  const GB = 1024 ** 3
  const idx = indice([
    { slug: 'a', id: 'piccola', size: 1 * GB, giorni: 1 },
    { slug: 'a', id: 'grossa', size: 5 * GB, giorni: 1 },
    { slug: 'a', id: 'media', size: 3 * GB, giorni: 1 }
  ])
  it('soglia 90%', () => {
    expect(SOGLIA_SPAZIO_POCO).toBe(0.9)
    expect(spazioPoco({ limite: 100, usato: 89 })).toBe(false)
    expect(spazioPoco({ limite: 100, usato: 90 })).toBe(true)
    expect(spazioPoco({ usato: 999 })).toBe(false)
  })
  it('sotto la soglia non si toglie niente', () => {
    expect(base(idx, { quota: { limite: 100 * GB, usato: 50 * GB } })).toEqual([])
  })
  it('sopra la soglia comincia dalla piu\' grossa e si ferma quando si torna sotto', () => {
    // 95 GB su 100: serve scendere a 90 -> basta la piu' grossa (5 GB).
    const p = base(idx, { quota: { limite: 100 * GB, usato: 95 * GB } })
    expect(p.map((x) => x.tipo)).toEqual(['chat-spazio-poco'])
    expect(p[0]!.voci.map((v) => v.percorso)).toEqual(['chat/a/grossa.jsonl'])
    // 99 GB: 5 + 3 = 8 -> 91, ancora sopra: servono tutte e tre (9 -> 90).
    const q = base(idx, { quota: { limite: 100 * GB, usato: 99 * GB } })
    expect(q[0]!.voci.map((v) => v.percorso)).toEqual(['chat/a/grossa.jsonl', 'chat/a/media.jsonl', 'chat/a/piccola.jsonl'])
  })
  it('Drive pieno senza quota nota: almeno la piu\' grossa', () => {
    const p = base(idx, { pieno: true })
    expect(p[0]!.voci.map((v) => v.percorso)).toEqual(['chat/a/grossa.jsonl'])
  })
  it('una chat senza copia su un PC non si tocca nemmeno con poco spazio', () => {
    const p = base(idx, { quota: { limite: 100 * GB, usato: 95 * GB }, copieSuiPc: copie(idx, ['grossa']) })
    expect(p[0]!.voci.map((v) => v.percorso)).toEqual(['chat/a/media.jsonl', 'chat/a/piccola.jsonl'])
  })
})
