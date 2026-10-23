import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota, type ChatGovernata, type Criterio } from '@shared/autopilota'
import { indicatoreDi, segnaleVeroDa, versioneDelCriterio, leggiSegnaleVero, type SegnaleVero } from '@shared/indicatore-autopilota'
import { puntoDi } from '@shared/punto-autopilota'
import type { Segnale } from '@shared/segnali-chat'

// 0.85.0 (Nicholas, 23/10: «continuo a chiederti a che punto siamo cento volte
// perché non capisco»): tre righe a colpo d'occhio in cima all'autopilota.

const ORA = Date.parse('2026-10-23T09:00:00.000Z')
const fa = (min: number): string => new Date(ORA - min * 60_000).toISOString()

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({
  id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 2, dal: fa(90), ...extra
})

type Vivo = Autopilota & { segniChat?: Record<string, string>; segniDal?: string; segniVeri?: Record<string, SegnaleVero> }

function ap(chats: ChatGovernata[], extra: Partial<Vivo> = {}, criteri: Criterio[] = [{ descrizione: 'i test passano', soddisfatto: true }, { descrizione: 'compila', soddisfatto: false }]): Vivo {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Gestionale', obiettivo: 'Il gestionale', cwd: 'C:/progetto', criteri, iniziatoIl: fa(600) }),
    stato: 'lavoro',
    chats,
    segniDal: fa(600),
    ...extra
  }
}

const segnale = (evento: Segnale['evento'], min: number, extra: Partial<Segnale> = {}): Segnale => ({ sessione: 's-1', evento, quando: fa(min), ...extra })

describe('segnaleVeroDa: solo quello che la chat fa davvero', () => {
  it('commit, test, file cambiati, terminale; non i messaggi consegnati dal servizio', () => {
    expect(segnaleVeroDa([segnale('PostToolUse', 3, { strumento: 'Bash', comando: 'git commit -m "feat: x"' })])).toEqual({ tipo: 'commit', quando: fa(3) })
    expect(segnaleVeroDa([segnale('PreToolUse', 3, { strumento: 'Bash', comando: 'npx vitest run tests/shared' })])?.tipo).toBe('test')
    expect(segnaleVeroDa([segnale('PostToolUse', 3, { strumento: 'Edit', dettaglio: 'src/a.ts' })])?.tipo).toBe('file')
    expect(segnaleVeroDa([segnale('PostToolUse', 3, { strumento: 'Read' }), segnale('Stop', 2)])).toEqual({ tipo: 'terminale', quando: fa(2) })
    // Il servizio che consegna un turno non è un segnale della chat.
    expect(segnaleVeroDa([segnale('PostToolUse', 30, { strumento: 'Edit' }), segnale('UserPromptSubmit', 1), segnale('SessionStart', 1)])).toEqual({ tipo: 'file', quando: fa(30) })
    expect(segnaleVeroDa([segnale('UserPromptSubmit', 1)])).toBeUndefined()
  })
  it('legge dal JSON solo segni ben fatti', () => {
    expect(leggiSegnaleVero({ tipo: 'commit', quando: fa(1) })).toEqual({ tipo: 'commit', quando: fa(1) })
    expect(leggiSegnaleVero({ tipo: 'avanti', quando: fa(1) })).toBeUndefined()
    expect(leggiSegnaleVero({ tipo: 'test', quando: 'ieri' })).toBeUndefined()
  })
})

describe('riga 3: va / lento / fermo dai segnali veri', () => {
  it('verde con l’ultimo segnale e quanto tempo fa, senza sigle', () => {
    const a = ap([chat('c-3', { ruolo: 'sviluppo' }), chat('c-4', { ruolo: 'revisione' })], {
      segniVeri: { 'c-3': { tipo: 'commit', quando: fa(2) }, 'c-4': { tipo: 'test', quando: fa(6) } }
    })
    const i = indicatoreDi(a, ORA)
    expect(i.andamento).toMatchObject({ livello: 'va', colore: 'verde', testo: 'Va: Sviluppo, commit 2 min fa' })
    expect(i.dettaglio).toEqual([
      'Sviluppo («compito»): commit 2 min fa · ultimo passo: non ha ancora riferito niente',
      'Revisione («compito»): test 6 min fa · ultimo passo: non ha ancora riferito niente'
    ])
    expect(JSON.stringify([i.andamento.testo])).not.toMatch(/\bc-\d+/)
  })

  it('caso vero del 23/10: una chat muta 21 minuti è rossa anche se si dice «avanti» e il Gestore batte', () => {
    const a = ap([chat('c-118', { ruolo: 'sviluppo', segnale: { tipo: 'avanti', quando: fa(2), dichiarato: true, motivo: 'scrivo i test' } })], {
      segniChat: { 'c-118': fa(1) },
      segniVeri: { 'c-118': { tipo: 'file', quando: fa(21) } },
      decisioni: [{ quando: fa(4), cosa: 'giro mai fermo: riprendo c-118, muta da 17 min' }]
    })
    const i = indicatoreDi(a, ORA)
    expect(i.andamento.livello).toBe('fermo')
    expect(i.andamento.colore).toBe('rosso')
    expect(i.andamento.testo).toBe('Fermo: nessun segnale vero da 21 min · l’autopilota: giro mai fermo: riprendo, muta da 17 min (4 min fa)')
    // 0.85.1: con il quadro intero: l'ultimo passo detto («avanti», dedotto o no) accanto al segnale vero.
    expect(i.dettaglio).toEqual(['Sviluppo («compito»): file cambiati 21 min fa · ultimo passo: passo fatto: scrivo i test (2 min fa), dedotto dal segnale'])
  })

  it('la stessa chat muta 21 minuti accanto a una sorella che lavora: giallo, col suo nome', () => {
    const a = ap([chat('c-118', { ruolo: 'sviluppo' }), chat('c-119', { ruolo: 'collaudo' })], {
      segniVeri: { 'c-118': { tipo: 'file', quando: fa(21) }, 'c-119': { tipo: 'test', quando: fa(1) } }
    })
    expect(indicatoreDi(a, ORA).andamento).toMatchObject({ livello: 'lento', testo: expect.stringMatching(/^Lento: Sviluppo muta da 21 min · l’autopilota: /) })
  })

  it('caso vero: la notte ferma 7 ore con le chat scritte «al lavoro» è rossa', () => {
    const a = ap([
      chat('c-60', { ruolo: 'sviluppo', segnale: { tipo: 'avanti', quando: fa(400), dichiarato: true } }),
      chat('c-61', { ruolo: 'interfaccia', segnale: { tipo: 'avanti', quando: fa(400), dichiarato: true } })
    ], {
      segniChat: { 'c-60': fa(1), 'c-61': fa(1) },
      segniVeri: { 'c-60': { tipo: 'commit', quando: fa(420) }, 'c-61': { tipo: 'terminale', quando: fa(425) } },
      decisioni: [{ quando: fa(430), cosa: 'aperta c-61', traguardo: { chat: 'c-61', esito: 'aperta' } }]
    })
    const i = indicatoreDi(a, ORA)
    expect(i.andamento.livello).toBe('fermo')
    expect(i.andamento.testo).toMatch(/^Fermo: nessun segnale vero da 7 h · l’autopilota: /)
  })

  it('giallo oltre 10 minuti, con l’azione in corso dell’autopilota', () => {
    const a = ap([chat('c-3', { ruolo: 'sviluppo' })], {
      segniVeri: { 'c-3': { tipo: 'test', quando: fa(14) } },
      decisioni: [{ quando: fa(3), cosa: 'unisco il ramo di c-2 nel principale' }]
    })
    expect(indicatoreDi(a, ORA).andamento).toMatchObject({ livello: 'lento', colore: 'ambra', testo: 'Lento: nessun segnale vero da 14 min · l’autopilota: unisco il ramo nel principale (3 min fa)' })
  })

  it('un ramo unito dal programma è un segnale vero', () => {
    const a = ap([chat('c-3', { ruolo: 'sviluppo', stato: 'bloccata' })], {
      stato: 'lavoro',
      segniVeri: { 'c-3': { tipo: 'test', quando: fa(40) } },
      decisioni: [{ quando: fa(3), cosa: 'unito c-2', traguardo: { chat: 'c-2', esito: 'unito' } }]
    })
    expect(indicatoreDi(a, ORA).andamento.testo).toBe('Va: l’autopilota ha unito un ramo 3 min fa')
  })

  it('rosso con il motivo quando l’autopilota è fermo', () => {
    const a = ap([chat('c-3')], { stato: 'sospeso', motivoSospensione: 'la chat c-3 non risponde' })
    expect(indicatoreDi(a, ORA).andamento).toMatchObject({ livello: 'fermo', testo: 'Fermo: la chat non risponde · l’autopilota: aspetta che tu lo riprenda' })
  })

  it('dopo un riavvio senza segni non dà rosso subito', () => {
    const a = ap([chat('c-3')], { segniDal: fa(2) })
    expect(indicatoreDi(a, ORA).andamento.livello).toBe('va')
  })
})

describe('righe 1 e 2: prossima versione e fine del lavoro', () => {
  const criteri: Criterio[] = [
    { descrizione: 'Release 0.84.4 pubblicata: tag e gh release create', soddisfatto: true },
    { descrizione: '0.84.4 — La Revisione non respinge rami giusti', soddisfatto: true },
    { descrizione: '0.85.0 — Indicatore a colpo d’occhio in cima all’autopilota (c-132)', soddisfatto: false },
    { descrizione: '0.85.0 — Velocità misurata', soddisfatto: true },
    { descrizione: 'Release 0.85.0 (minor) pubblicata', soddisfatto: false },
    { descrizione: 'I test passano', soddisfatto: true }
  ]

  it('la versione del criterio', () => {
    expect(versioneDelCriterio('Release 0.85.0 (minor) pubblicata')).toBe('0.85.0')
    expect(versioneDelCriterio('0.84.4 — Mai più la domanda')).toBe('0.84.4')
    expect(versioneDelCriterio('I test passano')).toBeUndefined()
  })

  it('pezzi pronti su totale, cosa manca e il tempo dalla cadenza delle release', () => {
    const a = ap([chat('c-132', { ruolo: 'sviluppo' }), chat('c-133', { stato: 'pausa' })], {
      compitiDaFare: ['uno', 'due', 'tre'],
      releaseUscite: [{ versione: '0.84.2', quando: fa(600) }, { versione: '0.84.3', quando: fa(360) }, { versione: '0.84.4', quando: fa(120) }]
    }, criteri)
    const i = indicatoreDi(a, ORA)
    // 0.84.4 è uscita: la prossima è la 0.85.0; una release ogni 4 h, l'ultima 2 h fa.
    expect(i.versione).toBe('Prossima versione 0.85.0: 1 di 3 pezzi pronti · manca: Indicatore a colpo d’occhio in cima… e altri 1 · circa 2 h (una versione ogni 4 h)')
    expect(i.fine).toEqual({ testo: 'Fine del lavoro: 4 di 6 criteri · 3 compiti in coda · 1 chat al lavoro', percento: 67 })
  })

  it('il tempo dalla velocità misurata quando c’è', () => {
    const a = ap([chat('c-20', { ruolo: 'sviluppo', stato: 'finita', compito: 'Il menu' })], {
      dialogo: [{ quando: fa(300), da: 'tu', testo: 'Fammi il menu nuovo con le voci grandi' }],
      decisioni: [
        { quando: fa(290), cosa: 'aperta', traguardo: { chat: 'c-20', esito: 'aperta' } },
        { quando: fa(200), cosa: 'finito', traguardo: { chat: 'c-20', esito: 'finito' } },
        { quando: fa(170), cosa: 'unito', traguardo: { chat: 'c-20', esito: 'unito' } }
      ]
    }, criteri)
    // Lavoro misurato: dalla prima chat all'unione 2 h; due pezzi mancanti, nessuna chat al lavoro → due giri.
    expect(indicatoreDi(a, ORA).versione).toMatch(/ · circa 4 h$/)
  })

  it('senza versioni nei criteri conta i compiti del piano', () => {
    const a = ap([chat('c-1', { compito: 'Il menu', stato: 'finita' }), chat('c-2', { compito: 'La pagina' })])
    expect(indicatoreDi(a, ORA).versione).toBe('Prossima versione: 1 di 2 pezzi pronti · manca: La pagina · tempo non ancora misurato')
  })
})

describe('nel Punto', () => {
  it('l’indicatore sta nel Punto, così PC, pagina e app mostrano lo stesso', () => {
    const a = ap([chat('c-3', { ruolo: 'sviluppo' })], { segniVeri: { 'c-3': { tipo: 'commit', quando: fa(2) } } })
    const p = puntoDi(a, ORA)
    expect(p.indicatore.andamento.testo).toBe('Va: Sviluppo, commit 2 min fa')
    expect(p.indicatore.aiuto).toMatch(/segnali veri/)
  })
})
