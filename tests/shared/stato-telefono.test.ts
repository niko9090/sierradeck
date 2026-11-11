import { describe, it, expect } from 'vitest'
import { fraseStatoOrchestratore, type VistaOrchestratore } from '@shared/piano-orchestratore'
import { COLORI } from '@shared/colori-attivita'
import { haSigle } from '@shared/titoli-in-parole'
import { adessoDaVista, fraseAdesso, leggiAttesa, ruoloTelefono, statoTelefono, RUOLI_MAX } from '@shared/stato-telefono'
import type { VistaAttesa } from '@shared/attesa-specialisti'

type Spec = VistaOrchestratore['specialisti'][number]
const vista = (o: Partial<VistaOrchestratore> = {}): VistaOrchestratore => ({
  workspace: 'lavoro', autopilota: 'ap-1', modello: 'm', tettoSpecialisti: 3, pensa: false, vivo: true,
  specialisti: [], registro: [], costo: { oggiUsd: 0, turniOggi: 0 }, piano: { totale: 0, uniti: 0 },
  richieste: { aperte: 0, daPianificare: 0 }, domandeAperte: 0, ...o
})
const spec = (ruolo: string, stato = 'lavoro', compito = 'k-3: rifare il polso', compitoId?: string): Spec => ({ id: `s-${ruolo}`, ruolo, compito, stato, ...(compitoId !== undefined ? { compitoId } : {}) })
const fermo = { stato: { id: 'fermo', parola: 'fermo', colore: 'rosso' as const } }

describe('il ruolo in una parola, con il suo colore', () => {
  it('i tipi degli specialisti e i nomi dei ruoli delle chat adottate', () => {
    expect(ruoloTelefono('sviluppatore')).toEqual({ ruolo: 'Sviluppo', colore: COLORI.blu })
    expect(ruoloTelefono('Sviluppo')).toEqual({ ruolo: 'Sviluppo', colore: COLORI.blu })
    expect(ruoloTelefono('verificatore')).toEqual({ ruolo: 'Collaudo', colore: COLORI.acqua })
    expect(ruoloTelefono('revisore')).toEqual({ ruolo: 'Revisione', colore: COLORI.rosa })
    expect(ruoloTelefono('interfaccia')).toEqual({ ruolo: 'Interfaccia', colore: COLORI.viola })
    expect(ruoloTelefono('android').ruolo).toBe('Android')
    expect(ruoloTelefono('esploratore').ruolo).toBe('Analisi')
    expect(ruoloTelefono('rilascio')).toEqual({ ruolo: 'Rilascio', colore: COLORI.lime })
  })
  it('un nome che non si conosce resta, in grigio; niente nome = «Specialista»', () => {
    expect(ruoloTelefono('traduttore')).toEqual({ ruolo: 'Traduttore', colore: COLORI.quieto })
    expect(ruoloTelefono(undefined)).toEqual({ ruolo: 'Specialista', colore: COLORI.quieto })
  })
  it('i colori sono #rrggbb', () => {
    for (const r of ['sviluppatore', 'verificatore', 'revisore', 'interfaccia', 'android', 'esploratore', 'rilascio', 'x']) expect(ruoloTelefono(r).colore).toMatch(/^#[0-9a-f]{6}$/u)
  })
})

describe('la frase di adesso', () => {
  const casi: VistaOrchestratore[] = [
    vista({ specialisti: [spec('sviluppatore', 'lavoro', 'k-3: a', 'k-3'), spec('revisore', 'avviato', 'k-4: b', 'k-4')] }),
    vista({ specialisti: [spec('sviluppatore')], pensa: true }),
    vista({ pensa: true }),
    vista({ domandeAperte: 1 }),
    vista({ domandeAperte: 3 }),
    vista({ richieste: { aperte: 2, daPianificare: 0 }, piano: { totale: 5, uniti: 2 } }),
    vista({ richieste: { aperte: 1, daPianificare: 1 }, piano: { totale: 0, uniti: 0 } }),
    vista({ specialisti: [spec('sviluppatore', 'finito')] }),
    vista()
  ]
  it('il tono è sempre quello della riga del PC', () => {
    for (const v of casi) expect(fraseAdesso(v).tono).toBe(fraseStatoOrchestratore(v).tono)
  })
  it('niente sigle e niente «(nelle Domande)»', () => {
    for (const v of casi) {
      const t = fraseAdesso(v).testo
      expect(haSigle(t), t).toBe(false)
      expect(t).not.toContain('nelle Domande')
      expect(t.length).toBeLessThanOrEqual(80)
    }
  })
  it('le parole', () => {
    expect(fraseAdesso(casi[0]!).testo).toBe('Al lavoro: Sviluppo e Revisione')
    expect(fraseAdesso(casi[1]!).testo).toBe('Al lavoro: Sviluppo · l’autopilota pensa')
    expect(fraseAdesso(casi[2]!).testo).toBe('L’autopilota sta pensando')
    expect(fraseAdesso(casi[3]!).testo).toBe('Fermo: aspetta una tua risposta')
    expect(fraseAdesso(casi[4]!).testo).toBe('Fermo: aspetta 3 tue risposte')
    expect(fraseAdesso(casi[5]!).testo).toBe('Fermo: 3 compiti da fare e nessuno al lavoro')
    expect(fraseAdesso(casi[6]!).testo).toBe('Fermo: 2 richieste senza piano')
    expect(fraseAdesso(casi[8]!).testo).toBe('A riposo: tutto fatto')
  })
  it('lo stesso ruolo due volte si dice una volta', () => {
    expect(fraseAdesso(vista({ specialisti: [spec('sviluppatore'), { ...spec('sviluppatore'), id: 's-2' }, spec('verificatore'), spec('revisore')] })).testo).toBe('Al lavoro: Sviluppo, Collaudo e Revisione')
  })
  it('senza la vista dell’orchestratore: dalla vista in una parola', () => {
    expect(adessoDaVista({ stato: { id: 'al-lavoro', parola: 'al lavoro', colore: 'verde' } }, 0)).toEqual({ testo: 'Al lavoro', tono: 'lavora' })
    expect(adessoDaVista({ stato: { id: 'aspetta', parola: 'aspetta te', colore: 'ambra' } }, 2)).toEqual({ testo: 'Fermo: aspetta 2 tue risposte', tono: 'aspetta' })
    expect(adessoDaVista({ stato: { id: 'guasto', parola: 'guasto', colore: 'rosso' } }, 0).tono).toBe('fermo')
    expect(adessoDaVista({ stato: { id: 'finito', parola: 'finito', colore: 'verde' } }, 0).tono).toBe('riposo')
    expect(adessoDaVista(fermo, 0)).toEqual({ testo: 'Fermo', tono: 'fermo' })
  })
})

describe('i quattro campi di un autopilota', () => {
  const attesa: VistaAttesa = {
    posti: { usati: 1, tetto: 3 },
    alLavoro: [
      { posto: 1, id: 'a1', workspace: 'lavoro', compito: 'k-3', descrizione: 'k-3: rifare il polso', tipo: 'sviluppatore', dal: '2026-11-11T10:00:00Z', titolo: 'Rifare il polso', minutiStimati: 12.4 },
      { posto: 2, id: 'a2', workspace: 'altro', descrizione: 'altro lavoro', tipo: 'revisore', dal: '2026-11-11T10:00:00Z', minutiStimati: 90 }
    ],
    inFila: [{ id: 'f1', posizione: 1, workspace: 'lavoro', descrizione: 'k-5: la pagina', tipo: 'interfaccia', dal: '2026-11-11T10:00:00Z', priorita: 0, prenotata: false, minutiStimati: 25 }]
  }
  it('dalla vista dell’orchestratore: percentuale, minuti, ruoli con la cosa in parole, domande', () => {
    const s = statoTelefono({
      workspace: 'lavoro', autopilota: 'ap-1', vista: fermo, domande: 0, attesa,
      orchestratore: vista({ percento: 41.6, domandeAperte: 1, specialisti: [spec('sviluppatore', 'lavoro', 'k-3: rifare il polso (r-12)', 'k-3'), spec('revisore', 'finito')] })
    })
    expect(s.avanzamento).toEqual({ percento: 42, mancaMin: 25 })
    expect(s.ruoli).toEqual([{ ruolo: 'Sviluppo', colore: COLORI.blu, cosa: 'Rifare il polso' }])
    expect(s.domande).toBe(1)
    expect(s.adesso).toEqual({ testo: 'Al lavoro: Sviluppo', tono: 'lavora' })
  })
  it('la vista di un altro autopilota dello stesso workspace non vale: si ripiega', () => {
    const s = statoTelefono({ workspace: 'lavoro', autopilota: 'ap-vecchio', vista: fermo, domande: 2, orchestratore: vista({ percento: 80 }) })
    expect(s.avanzamento).toEqual({})
    expect(s.domande).toBe(2)
    expect(s.adesso.tono).toBe('fermo')
  })
  it('senza orchestratore ma con la lista d’attesa: i ruoli da lì', () => {
    const s = statoTelefono({ workspace: 'lavoro', autopilota: 'ap-1', vista: fermo, domande: 0, attesa })
    expect(s.ruoli).toEqual([{ ruolo: 'Sviluppo', colore: COLORI.blu, cosa: 'Rifare il polso' }])
    expect(s.adesso).toEqual({ testo: 'Al lavoro: Sviluppo', tono: 'lavora' })
    expect(s.avanzamento).toEqual({ mancaMin: 25 })
  })
  it('niente di niente: i campi ci sono lo stesso', () => {
    const s = statoTelefono({ workspace: 'lavoro', autopilota: 'ap-1', vista: fermo, domande: 0 })
    expect(s).toEqual({ adesso: { testo: 'Fermo', tono: 'fermo' }, avanzamento: {}, ruoli: [], domande: 0 })
  })
  it('al più RUOLI_MAX ruoli', () => {
    const tanti = Array.from({ length: 9 }, (_, i) => ({ ...spec('sviluppatore'), id: `s-${i}` }))
    expect(statoTelefono({ workspace: 'lavoro', autopilota: 'ap-1', vista: fermo, domande: 0, orchestratore: vista({ specialisti: tanti }) }).ruoli).toHaveLength(RUOLI_MAX)
  })
  it('leggiAttesa scarta le forme storte', () => {
    expect(leggiAttesa(undefined)).toBeUndefined()
    expect(leggiAttesa({ alLavoro: 'x', inFila: [] })).toBeUndefined()
    expect(leggiAttesa(attesa)).toBe(attesa)
  })
})
