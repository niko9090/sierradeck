import { describe, it, expect } from 'vitest'
import { ATTESA_ERRORI_VICINI_MS, decidiLavoroErrori, lavoroPerErrori, type ArrivoErrori } from '@shared/errori-lavoro'
import type { VoceErrore } from '@shared/storico-errori'

const voce = (messaggio: string, altro: Partial<VoceErrore> = {}): VoceErrore => ({ quando: 'q', ultima: 'u', dove: 'pagina', volte: 1, messaggio, ...altro })
const T = Date.parse('2026-10-20T10:00:00.000Z')
const arrivo = (file: string, minutiFa: number, voci = [voce('boom')]): ArrivoErrori => ({ file, da: 'Portatile', arrivato: T - minutiFa * 60_000, voci })
const libero = { livello: 'pieno', motivo: 'finestra di 5 ore al 10%: via libera' }
const base = { radice: 'C:\\Progetti\\SierraDeck', autopiloti: [], freno: libero, adesso: T, stato: { lavori: [] } }

describe('Errori arrivati: quando parte il lavoro', () => {
  it('niente da fare senza arrivi nuovi, e un arrivo già avviato non riparte', () => {
    expect(decidiLavoroErrori({ ...base, arrivi: [] }).azione).toBe('niente')
    expect(decidiLavoroErrori({ ...base, arrivi: [arrivo('a.json', 60)], stato: { lavori: [{ autopilota: 'ap-1', file: ['a.json'], avviatoIl: 'x' }] } }).azione).toBe('niente')
  })

  it('aspetta che smettano di arrivare: gli errori vicini vanno in un lavoro solo', () => {
    const d = decidiLavoroErrori({ ...base, arrivi: [arrivo('a.json', 30), arrivo('b.json', 2)] })
    expect(d).toEqual({ azione: 'aspetta', finoA: T - 2 * 60_000 + ATTESA_ERRORI_VICINI_MS })
    const dopo = decidiLavoroErrori({ ...base, arrivi: [arrivo('a.json', 30), arrivo('b.json', 11)] })
    expect(dopo.azione).toBe('avvia')
    if (dopo.azione === 'avvia') expect(dopo.arrivi.map((a) => a.file)).toEqual(['a.json', 'b.json'])
  })

  it('non parte se c’è già un lavoro su SierraDeck, e lo dice una volta sola', () => {
    const autopiloti = [
      { id: 'ap-x', nome: 'Altro progetto', stato: 'lavoro', cwd: 'C:\\Progetti\\Clienti' },
      { id: 'ap-y', nome: 'Vecchio', stato: 'finito', cwd: 'C:\\Progetti\\SierraDeck' },
      { id: 'ap-z', nome: 'Archiviato', stato: 'sospeso', cwd: 'C:\\Progetti\\SierraDeck', archiviato: true },
      { id: 'ap-1', nome: 'Notifiche', stato: 'sospeso', cwd: 'c:/progetti/sierradeck/' }
    ]
    const d = decidiLavoroErrori({ ...base, autopiloti, arrivi: [arrivo('a.json', 20)] })
    expect(d.azione).toBe('non-parte')
    if (d.azione !== 'non-parte') return
    expect(d.motivo).toContain('«Notifiche»')
    expect(d.giaDetto).toBe(false)
    const ancora = decidiLavoroErrori({ ...base, autopiloti, arrivi: [arrivo('a.json', 20)], stato: { lavori: [], nonPartiti: { file: d.file, motivo: d.motivo } } })
    expect(ancora.azione === 'non-parte' && ancora.giaDetto).toBe(true)
    // Un arrivo in più: si dice di nuovo.
    const altro = decidiLavoroErrori({ ...base, autopiloti, arrivi: [arrivo('a.json', 20), arrivo('b.json', 15)], stato: { lavori: [], nonPartiti: { file: d.file, motivo: d.motivo } } })
    expect(altro.azione === 'non-parte' && altro.giaDetto).toBe(false)
  })

  it('non parte con i limiti del piano quasi finiti (una chat sola o fermo), parte con «niente chat nuove»', () => {
    for (const livello of ['una', 'fermo']) {
      const d = decidiLavoroErrori({ ...base, freno: { livello, motivo: 'finestra di 5 ore al 90%' }, arrivi: [arrivo('a.json', 20)] })
      expect(d.azione).toBe('non-parte')
      if (d.azione === 'non-parte') expect(d.motivo).toContain('limiti del piano sono quasi finiti (finestra di 5 ore al 90%)')
    }
    expect(decidiLavoroErrori({ ...base, freno: { livello: 'niente-nuove', motivo: 'x' }, arrivi: [arrivo('a.json', 20)] }).azione).toBe('avvia')
  })
})

describe('Errori arrivati: cosa si chiede all’autopilota', () => {
  it('il riepilogo a Nicholas prima di toccare il codice, una domanda sola, poi test, Revisione e release mai installata', () => {
    const l = lavoroPerErrori([
      arrivo('E:\\SierraDeck\\.sierradeck\\errori-arrivati\\Portatile\\a.json', 20, [voce('TypeError: x is undefined\n  at f', { dove: 'app', volte: 3, versione: '2.81.0', punto: 'Computer.kt:12', cosa: 'aprivo le Impostazioni' })])
    ], new Date(T))
    expect(l.nome).toMatch(/^Errori arrivati \d{2}\/10$/)
    expect(l.obiettivo).toContain('- da «Portatile», app Android 2.81.0, 3 volte: TypeError: x is undefined (Computer.kt:12) — mentre: aprivo le Impostazioni')
    expect(l.obiettivo).toContain('PRIMA di modificare il codice')
    expect(l.obiettivo).toContain('AskUserQuestion (una domanda sola')
    expect(l.obiettivo).toContain('Mai installarla')
    expect(l.obiettivo).toContain('a.json')
    expect(l.criteri.map((c) => c.descrizione)).toContain('Riepilogo mandato a Nicholas prima di toccare il codice, e lui ha detto «Procedi»')
    expect(l.criteri.filter((c) => c.comando !== undefined).map((c) => c.comando)).toEqual(['npx vitest run --maxWorkers=2', 'npm run typecheck'])
  })

  it('tanti errori: l’elenco si ferma e rimanda ai file', () => {
    const voci = Array.from({ length: 40 }, (_, i) => voce(`errore ${i}`))
    const l = lavoroPerErrori([arrivo('a.json', 20, voci)], new Date(T))
    expect(l.obiettivo).toContain('- … e altri 10: sono nei file')
  })
})
