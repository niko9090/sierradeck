import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { azioneTastoDomande, decidiColonnaDomande, quanteAspettano, type Conversazione } from '@shared/domande-conversazioni'
import { doveMostrareDomande } from '@shared/finestra-pannello'

/**
 * Nicholas (02/10, 0.39.1): «quando c'è l'autopilota non deve aprirsi la parte
 * domande a destra ma visualizzarsi nel tab domande sotto». La colonna si apre
 * da sola solo per le chat; per un autopilota si fa avanti la linguetta
 * «Domande» della sua scheda (o la sua finestra pannello).
 */
const ap = (id: string, domanda: string): Conversazione => ({
  chiave: `ap:${id}`, tipo: 'autopilota', autopilota: id, quante: 1, titolo: id, sotto: '', chiede: true,
  messaggi: [{ da: 'lui', testo: 'ok?', tono: 'domanda' }], risposta: { via: 'rispondi', domanda }, segnaposto: ''
})
const chat = (id: string): Conversazione => ({
  chiave: `chat:${id}`, tipo: 'chat', titolo: id, sotto: '', chiede: true,
  messaggi: [{ da: 'lui', testo: 'Vuoi procedere?', tono: 'domanda' }], risposta: { via: 'scrivi', chat: id },
  scelte: { chat: id, opzioni: [{ numero: 1, testo: 'Sì', scelta: true }] }, segnaposto: ''
})

describe('dove si vede una domanda nuova', () => {
  it('domanda di un autopilota: la colonna resta chiusa, si fa avanti la sua linguetta', () => {
    const d = decidiColonnaDomande({ conversazioni: [ap('ap-1', 'd1')], viste: new Set(), aperta: false, avvio: false })
    expect(d.apri).toBe(false)
    expect(d.evidenzia).toBeUndefined()
    expect(d.linguette).toEqual(['ap-1'])
    expect(d.nuove).toEqual(['d:d1'])
  })

  it('domanda di una chat senza autopilota: la colonna si apre e la evidenzia', () => {
    const d = decidiColonnaDomande({ conversazioni: [chat('c1')], viste: new Set(), aperta: false, avvio: false })
    expect(d).toMatchObject({ apri: true, evidenzia: 'chat:c1', linguette: [] })
  })

  it('tutte e due insieme: la colonna per la chat, la linguetta per l autopilota', () => {
    const d = decidiColonnaDomande({ conversazioni: [ap('ap-1', 'd1'), chat('c1')], viste: new Set(), aperta: false, avvio: false })
    expect(d).toMatchObject({ apri: true, evidenzia: 'chat:c1', linguette: ['ap-1'] })
  })

  it('all avvio nessuna domanda resta invisibile: anche gia viste, la linguetta si fa avanti', () => {
    const d = decidiColonnaDomande({ conversazioni: [ap('ap-1', 'd1'), ap('ap-2', 'd2')], viste: new Set(['d:d1', 'd:d2']), aperta: false, avvio: true })
    expect(d).toMatchObject({ apri: false, linguette: ['ap-1', 'ap-2'] })
    // Dopo l'avvio, la stessa domanda gia' vista non la rispinge avanti ogni tre secondi.
    expect(decidiColonnaDomande({ conversazioni: [ap('ap-1', 'd1')], viste: new Set(['d:d1']), aperta: false, avvio: false }).linguette).toEqual([])
  })

  it('il numerino conta tutto, autopiloti compresi', () => {
    expect(quanteAspettano([ap('ap-1', 'd1'), chat('c1')])).toBe(2)
  })
})

describe('il tasto «Domande»', () => {
  it('solo autopiloti in attesa: porta alla linguetta del primo, non apre la colonna', () => {
    expect(azioneTastoDomande([ap('ap-1', 'd1'), ap('ap-2', 'd2')], false)).toEqual({ tipo: 'linguetta', autopilota: 'ap-1' })
  })
  it('una chat in attesa, o niente: apre la colonna; aperta: la chiude', () => {
    expect(azioneTastoDomande([ap('ap-1', 'd1'), chat('c1')], false)).toEqual({ tipo: 'colonna' })
    expect(azioneTastoDomande([], false)).toEqual({ tipo: 'colonna' })
    expect(azioneTastoDomande([ap('ap-1', 'd1')], true)).toEqual({ tipo: 'colonna' })
  })
})

describe('dove si apre la linguetta «Domande» di un autopilota', () => {
  it('staccata: si porta avanti la sua finestra pannello', () => {
    expect(doveMostrareDomande({ staccata: true, finestreConScheda: [3] })).toEqual({ tipo: 'pannello' })
  })
  it('nella finestra di chat che ha la sua scheda, preferendo quella che ha chiesto', () => {
    expect(doveMostrareDomande({ staccata: false, finestreConScheda: [3, 5] })).toEqual({ tipo: 'scheda', finestra: 3 })
    expect(doveMostrareDomande({ staccata: false, finestreConScheda: [3, 5], chiedente: 5 })).toEqual({ tipo: 'scheda', finestra: 5 })
    expect(doveMostrareDomande({ staccata: false, finestreConScheda: [3], chiedente: 9 })).toEqual({ tipo: 'scheda', finestra: 3 })
  })
  it('nessuna scheda in vista: la linguetta in una finestra pannello, mai la colonna', () => {
    expect(doveMostrareDomande({ staccata: false, finestreConScheda: [] })).toEqual({ tipo: 'apri-pannello' })
  })
})

describe('come e collegato', () => {
  const leggi = (p: string): string => readFileSync(join(__dirname, '../../src', p), 'utf8')
  it('App: le linguette vanno al main, il tasto passa da azioneTastoDomande', () => {
    const app = leggi('renderer/App.tsx')
    expect(app).toContain('for (const id of d.linguette) void window.gestore.pannello.mostraDomande(id, true)')
    expect(app).toContain('azioneTastoDomande(ultimeConversazioni.current, colonnaDomande.aperta)')
  })
  it('la scheda si segna in vista e, con una domanda nuova, si apre anche se era chiusa', () => {
    const diario = leggi('renderer/components/DiarioAutopilota.tsx')
    expect(diario).toContain('segnaSchedaInVista(autopilota.id)')
    expect(diario).toMatch(/domandaArrivata\(viste\.current, schede\)[\s\S]{0,200}setAperto\(true\)/)
  })
  it('il main sceglie con doveMostrareDomande e non ruba la tastiera quando e automatico', () => {
    const main = leggi('main/index.ts')
    expect(main).toContain("ipcMain.handle('pannello:mostraDomande'")
    expect(main).toContain('doveMostrareDomande(')
    expect(main).toContain("apriPannello(id, 'domande', { inattiva: automatico })")
  })
})
