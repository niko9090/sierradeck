import { describe, it, expect } from 'vitest'
import { raccogliDomande, idChatAltroPc, leggiIdChatAltroPc, type ChatPerDomande } from '@shared/domande-telefono'
import { conversazioniDomande, quanteAspettano, domandeNuove, identitaDomanda } from '@shared/domande-conversazioni'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * «Non vedo tutte le domande» (Nicholas, 01/10). Uno stato con **una domanda
 * per ogni tipo** che il programma conosce, e nessuna deve mancare nelle
 * conversazioni della colonna Domande (che sono le stesse di pagina e app).
 */
const base = (id: string, nome: string, stato: Autopilota['stato']): Autopilota => ({
  ...nuovoAutopilota({ id, nome, obiettivo: 'o', cwd: `C:/${id}`, criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-01T08:00:00Z' }),
  stato
})
const autopiloti: Autopilota[] = [
  base('prep', 'Preparazione', 'intervista'),
  base('flotta', 'Flotta', 'lavoro'),
  base('pronto', 'Pronto', 'pronto')
]
const domande = [
  // La preparazione: una domanda iniziale, con le opzioni.
  { id: 'd-prep', autopilotaId: 'prep', testo: 'Che formato uso per i dati?', apertaIl: 1, opzioni: ['YAML', 'JSON'] },
  // Il supervisore che chiede («chiedi») durante il lavoro.
  { id: 'd-chiedi', autopilotaId: 'flotta', testo: 'Serve la chiave dell’API di pagamento: dove la trovo?', apertaIl: 2 },
  // «Pubblico adesso?» dello stesso autopilota, mentre l'altra e' aperta.
  { id: 'd-pubblica', autopilotaId: 'flotta', testo: 'Il lavoro «Flotta» è finito e verificato. Pubblico adesso?', apertaIl: 3, opzioni: ['sì, pubblica', 'no, lascia così'] }
]
const ESC = String.fromCharCode(27)
const chat: ChatPerDomande[] = [
  // Una chat ferma su un permesso (le opzioni in video inverso).
  { id: 'p-1', titolo: 'Permesso', cwd: 'D:/q', aspetta: true, coda: ['Posso scrivere il file?', '', '1. Yes', '2. No'], codaGrezza: ['Posso scrivere il file?', '', `${ESC}[7m1. Yes${ESC}[0m`, '2. No'] },
  // Una chat che ha finito il turno.
  { id: 'f-1', titolo: 'Finita', cwd: 'C:/f', aspetta: true, coda: ['Fatto: test verdi.'] },
  // Una chat governata che ha finito: parla l'autopilota, non e' una domanda.
  { id: 'g-1', titolo: 'Governata', cwd: 'C:/g', aspetta: true, governata: true, coda: ['ok'] }
]
const altriPc = [
  { pcId: 'portatile', nome: 'Portatile', vivo: true, chat: [{ sessione: 's-9', titolo: 'Sito', cwd: 'E:/sito', aspetta: true }, { sessione: 's-8', titolo: 'Lavora', cwd: 'E:/x', aspetta: false }] },
  // Un PC spento: le sue chat non si possono raggiungere, non compaiono.
  { pcId: 'vecchio', nome: 'Vecchio', vivo: false, chat: [{ sessione: 's-7', titolo: 'Ferma', cwd: 'F:/y', aspetta: true }] }
]
const scelteDi = (id: string): { opzioni: { numero: number; testo: string; scelta: boolean }[]; corrente: number } | undefined =>
  id === 'p-1' ? { opzioni: [{ numero: 1, testo: 'Yes', scelta: true }, { numero: 2, testo: 'No', scelta: false }], corrente: 0 } : undefined

const voci = raccogliDomande({
  domande,
  autopiloti: autopiloti.map((a) => ({ id: a.id, nome: a.nome, obiettivo: a.obiettivo, stato: a.stato })),
  chat,
  scelteDi,
  altriPc
})
const cs = conversazioniDomande({ voci, autopiloti })

describe('tutte le domande arrivano nella colonna Domande (0.37.2)', () => {
  it('una conversazione per ogni tipo di domanda, nessuna persa', () => {
    const chiavi = cs.map((c) => c.chiave)
    expect(chiavi).toContain('ap:prep') // domanda iniziale della preparazione
    expect(chiavi).toContain('ap:flotta') // il supervisore che chiede
    // «Pubblico adesso?» dello stesso autopilota: non una voce a parte (0.37.4,
    // Nicholas: «non serve mettere le domande divise»), ma nella sua conversazione.
    expect(chiavi.some((k) => k.startsWith('ap:flotta:'))).toBe(false)
    expect(cs.find((c) => c.chiave === 'ap:flotta')?.messaggi.some((m) => m.testo.includes('Pubblico adesso?'))).toBe(true)
    expect(chiavi).toContain('ap:pronto') // aspetta il via
    expect(chiavi).toContain('chat:p-1') // permesso
    expect(chiavi).toContain('chat:f-1') // ha finito il turno
    expect(chiavi).toContain(`chat:${idChatAltroPc('portatile', 's-9')}`) // chat di un altro PC acceso: prima mancava
    expect(chiavi).not.toContain('chat:g-1') // governata: parla l'autopilota
    expect(chiavi.some((k) => k.includes('s-7'))).toBe(false) // PC spento
    expect(chiavi.some((k) => k.includes('s-8'))).toBe(false) // al lavoro, non aspetta
  })

  it('ogni domanda si risponde da dove compare, con le sue opzioni', () => {
    // Una conversazione per l'autopilota: la casella risponde alla prima
    // domanda, che resta in fondo; l'altra sta in coda subito sopra.
    const flotta = cs.find((c) => c.chiave === 'ap:flotta')
    expect(flotta?.risposta).toEqual({ via: 'rispondi', domanda: 'd-chiedi' })
    expect(flotta?.messaggi.at(-1)?.testo).toContain('chiave dell’API')
    expect(flotta?.messaggi.at(-2)?.testo).toBe('In coda, dopo quella qui sotto: Il lavoro «Flotta» è finito e verificato. Pubblico adesso?')
    expect(flotta?.sotto).toContain('2 domande')
    // Risposta la prima, la seconda diventa l'attiva, con le sue opzioni.
    const dopo = conversazioniDomande({
      voci: raccogliDomande({ domande: domande.filter((d) => d.id === 'd-pubblica'), autopiloti: autopiloti.map((a) => ({ id: a.id, nome: a.nome, obiettivo: a.obiettivo, stato: a.stato })), chat: [], scelteDi: () => undefined }),
      autopiloti
    }).find((c) => c.chiave === 'ap:flotta')
    expect(dopo?.risposta).toEqual({ via: 'rispondi', domanda: 'd-pubblica' })
    expect(dopo?.messaggi.at(-1)?.opzioni?.map((o) => o.testo)).toEqual(['sì, pubblica', 'no, lascia così'])
    const altroPc = cs.find((c) => c.chiave.includes('portatile'))
    expect(altroPc?.titolo).toBe('Sito · su Portatile')
    expect(altroPc?.risposta).toEqual({ via: 'scrivi', chat: 'pc:portatile:s-9' })
    expect(leggiIdChatAltroPc('pc:portatile:s-9')).toEqual({ pcId: 'portatile', sessione: 's-9' })
  })

  it('il conteggio è uno solo: tutte le domande che chiedono, compreso chi aspetta il via', () => {
    // preparazione, flotta (chiedi + pubblica in una conversazione), pronto, permesso
    expect(quanteAspettano(cs)).toBe(4)
  })

  it('la colonna si apre per una domanda nuova, non per la stessa già vista', () => {
    const viste = new Set<string>()
    const prime = domandeNuove(cs, viste)
    expect(prime.map((n) => n.chiave)).toEqual(cs.filter((c) => c.chiede).map((c) => c.chiave))
    for (const n of prime) viste.add(n.identita)
    expect(domandeNuove(cs, viste)).toEqual([])
    // Un'altra domanda dello stesso autopilota è nuova.
    const dopo = conversazioniDomande({
      voci: raccogliDomande({ domande: [{ id: 'd-altra', autopilotaId: 'prep', testo: 'E la cartella dei dati?' }], autopiloti, chat: [], scelteDi: () => undefined }),
      autopiloti
    })
    expect(domandeNuove(dopo, viste).map((n) => n.identita)).toEqual(['d:d-altra'])
    // Le chat che hanno solo finito il turno non aprono la colonna.
    expect(identitaDomanda(cs.find((c) => c.chiave === 'chat:f-1')!)).toBeUndefined()
  })
})
