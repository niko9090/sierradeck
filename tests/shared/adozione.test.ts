import { describe, it, expect } from 'vitest'
import {
  adottateGuidabili, conChatAdottate, conMessaggiAdottate, conSoloMia, daScrivereAdesso, messaggiPerAdottate, righePromptAdottate,
  ruoloDaContenuto, senzaMessaggiAdottate
} from '@shared/adozione'
import { dormienteVivo, leggiStatoAdozione, pianoAdozione } from '@shared/migrazione-adozione'
import { nuovoAutopilota, parseAutopilota, type Autopilota } from '@shared/autopilota'
import type { Archivio } from '@shared/workspace'

/** 0.78.0: le chat già avviate adottate dall'autopilota del loro workspace (Nicholas, 16/10). */
const Q = '2026-10-16T15:00:00.000Z'
const ap = (x: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'o', cwd: 'C:\\p', criteri: [], iniziatoIl: Q, workspace: 'W' }),
  ...x
})

describe('ruoloDaContenuto', () => {
  it('un ruolo solo quando le parole lo dicono, se no «Chat» generica', () => {
    expect(ruoloDaContenuto('Collaudo · Notte')).toBe('collaudo')
    expect(ruoloDaContenuto('correggi il bug del login')).toBe('sviluppo')
    expect(ruoloDaContenuto('fai i test della pagina prezzi')).toBe('collaudo')
    expect(ruoloDaContenuto('sistema la grafica della pagina')).toBe('interfaccia')
    expect(ruoloDaContenuto('come dice il titolo facciamo un programma per dj')).toBe('sviluppo')
    expect(ruoloDaContenuto('ciao, che tempo fa?')).toBeUndefined()
  })
})

describe('conChatAdottate', () => {
  it('adotta le chat del workspace, mai le sue; idempotente; «solo mia» se segnata prima', () => {
    const a = ap({ sessionId: 's-sua' })
    const chat = [{ sessionId: 's-1', titolo: 'correggi il bug' }, { sessionId: 's-sua', titolo: 'la sua' }, { sessionId: 's-2', titolo: 'ciao' }]
    const r = conChatAdottate(a, chat, Q, new Set(['s-2']))
    expect(r.nuove.map((x) => x.sessionId)).toEqual(['s-1', 's-2'])
    expect(r.autopilota.adottate?.[0]).toMatchObject({ ruolo: 'sviluppo', adottataIl: Q })
    expect(r.autopilota.adottate?.[1]).toMatchObject({ soloMia: true })
    const di = conChatAdottate(r.autopilota, chat, '2026-10-17T00:00:00.000Z')
    expect(di.nuove).toEqual([])
    expect(di.autopilota).toBe(r.autopilota)
  })
  it('resta nel file: il parser le legge', () => {
    const a = conChatAdottate(ap(), [{ sessionId: 's-1', titolo: 't' }], Q).autopilota
    const letto = parseAutopilota({ ...JSON.parse(JSON.stringify(conMessaggiAdottate(a, [{ id: 'm1', quando: Q, sessionId: 's-1', testo: 'ciao' }]))), versione: 1 })
    expect(letto.autopilota?.adottate).toEqual(a.adottate)
    expect(letto.autopilota?.perAdottate).toHaveLength(1)
  })
})

describe('dialogo e consegna alle adottate', () => {
  const base = conChatAdottate(ap(), [{ sessionId: 's-1', titolo: 'correggi il bug' }, { sessionId: 's-2', titolo: 'ciao' }, { sessionId: 's-3', titolo: 'test' }], Q).autopilota
  it('«solo mia»: fuori dal prompt, niente messaggi, quelli in coda tolti', () => {
    const conCoda = conMessaggiAdottate(base, [{ id: 'm', quando: Q, sessionId: 's-2', testo: 'x' }])
    const a = conSoloMia(conCoda, 's-2', true)
    expect(adottateGuidabili(a).map((x) => x.chat.sessionId)).toEqual(['s-1', 's-3'])
    expect(a.perAdottate).toEqual([])
    expect(righePromptAdottate(a).join('\n')).not.toContain('ciao')
    expect(conSoloMia(a, 's-2', false).adottate?.find((x) => x.sessionId === 's-2')?.soloMia).toBeUndefined()
  })
  it('perLeChat: solo chiavi note e guidabili', () => {
    const a = conSoloMia(base, 's-2', true)
    let n = 0
    const m = messaggiPerAdottate(a, [{ chat: 'a2', testo: 'fai i test' }, { chat: 'A9', testo: 'x' }, { chat: 'A1', testo: '  ' }], Q, () => `m${++n}`)
    expect(m).toEqual([{ id: 'm1', quando: Q, sessionId: 's-3', testo: 'fai i test' }])
    expect(messaggiPerAdottate(a, 'niente', Q, () => 'x')).toEqual([])
  })
  it('si scrive solo a una chat viva e ferma, un messaggio per volta; mai a chi lavora o non c’è', () => {
    const a = conMessaggiAdottate(base, [
      { id: 'm1', quando: Q, sessionId: 's-1', testo: 'uno' },
      { id: 'm2', quando: Q, sessionId: 's-1', testo: 'due' },
      { id: 'm3', quando: Q, sessionId: 's-3', testo: 'tre' },
      { id: 'm4', quando: Q, sessionId: 's-9', testo: 'nessuno' }
    ])
    const chat = [{ id: 'p1', sessione: 's-1', aspetta: true }, { id: 'p3', sessione: 's-3', aspetta: false }]
    expect(daScrivereAdesso(a, chat)).toEqual([{ messaggio: a.perAdottate![0], chatId: 'p1' }])
    const dopo = senzaMessaggiAdottate(a, ['m1'])
    expect(dopo.perAdottate?.map((x) => x.id)).toEqual(['m2', 'm3', 'm4'])
    expect(daScrivereAdesso(conSoloMia(dopo, 's-1', true), chat)).toEqual([])
  })
})

describe('pianoAdozione', () => {
  const pane = (id: string, sessionUuid: string, title: string) => ({ id, sessionUuid, cwd: 'C:\\p', title })
  const arch = {
    versione: 1, attivo: 'S', finestre: {},
    workspace: [
      { nome: 'S', perSlot: { 1: { root: { type: 'pane', id: 'p1' }, panes: [pane('p1', 's-1', 'sua'), pane('p2', 's-2', 'correggi')] } } },
      { nome: 'Vuoto', perSlot: { 1: { panes: [pane('p3', 's-3', 'altro')] } } }
    ]
  } as unknown as Archivio
  const mig = { versione: 1 as const, stato: 'fatta' as const, iniziata: Q, prima: { workspaceElenco: [] }, aggiunti: ['S', 'Vuoto'], dormienti: [{ workspace: 'S', chat: 2 }, { workspace: 'Vuoto', chat: 1 }] }
  it('solo i workspace con un autopilota vero: il dormiente doppio si archivia, le chat si adottano', () => {
    const p = pianoAdozione(arch, mig, [{ id: 'ap-1', workspace: 'S', stato: 'finito' }, { id: 'ap-x', workspace: 'S', stato: 'lavoro', archiviato: true }])
    expect(p.dormientiArchiviati).toEqual([{ workspace: 'S', chat: 2 }])
    expect(p.adozioni).toEqual([{ autopilota: 'ap-1', workspace: 'S', chat: [{ sessionId: 's-1', titolo: 'sua' }, { sessionId: 's-2', titolo: 'correggi' }] }])
  })
  it('il dormiente archiviato non si mostra; «Torna come prima» (annullata) lo rimette', () => {
    const s = leggiStatoAdozione({ versione: 1, stato: 'fatta', iniziata: Q, dormientiArchiviati: [{ workspace: 'S', chat: 2 }], adozioni: [] })
    expect(dormienteVivo(mig.dormienti, s, 'S')).toBeUndefined()
    expect(dormienteVivo(mig.dormienti, s, 'Vuoto')).toEqual({ workspace: 'Vuoto', chat: 1 })
    expect(dormienteVivo(mig.dormienti, { ...s!, stato: 'annullata' }, 'S')).toEqual({ workspace: 'S', chat: 2 })
    expect(leggiStatoAdozione({ versione: 2 })).toBeUndefined()
  })
})
