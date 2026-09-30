import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizzaPreferenze, PREFERENZE_PREDEFINITE, LARGHEZZA_DOMANDE } from '@shared/preferenze'
import { conversazioniDomande } from '@shared/domande-conversazioni'
import { nuovoAutopilota } from '@shared/autopilota'
import type { VoceDomanda } from '@shared/domande-telefono'
import { spiegaRisposta } from '../../src/renderer/components/PannelloDomande'

/**
 * Le Domande sul PC come colonna laterale fissa (0.36.0), come nell'app
 * Android: si apre e si chiude dalla console, ricorda stato e larghezza,
 * mostra il conteggio e contiene tutte le domande.
 */
describe('la colonna delle Domande sul PC', () => {
  it('ricorda aperta/chiusa e larghezza fra un avvio e l altro, con i limiti', () => {
    expect(PREFERENZE_PREDEFINITE).toMatchObject({ domandeLaterali: false, larghezzaDomande: 400 })
    expect(normalizzaPreferenze({ domandeLaterali: true, larghezzaDomande: 520 })).toMatchObject({ domandeLaterali: true, larghezzaDomande: 520 })
    expect(normalizzaPreferenze({ larghezzaDomande: 50 }).larghezzaDomande).toBe(LARGHEZZA_DOMANDE.min)
    expect(normalizzaPreferenze({ larghezzaDomande: 5000 }).larghezzaDomande).toBe(LARGHEZZA_DOMANDE.max)
    expect(normalizzaPreferenze({ domandeLaterali: 'si' }).domandeLaterali).toBe(false)
  })

  it('e una colonna accanto al mosaico, aperta dal tasto della console, non un pannello sopra', () => {
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    expect(app).toContain('colonnaDomande.aperta ? (')
    expect(app).toContain('domandeLaterali: cambio.aperta')
    expect(app).toContain('larghezzaDomande: cambio.larghezza')
    expect(app).not.toContain("aperto === 'domande'")
    const console_ = readFileSync('src/renderer/components/Console.tsx', 'utf8')
    expect(console_).toContain('onClick={() => onDomande?.()}')
    // Il conteggio sul tasto.
    expect(console_).toContain("Domande{domandeInAttesa > 0 ? ` ${domandeInAttesa}` : ''}")
    // La vecchia finestra modale resta com'era: su quella decide Nicholas.
    expect(app).toContain('<DomandaModale autopiloti={autopiloti} />')
    const css = readFileSync('src/renderer/console.css', 'utf8')
    expect(css).toMatch(/\.domande-lato\s*\{[^}]*flex:\s*0 0 auto/)
  })

  it('contiene tutte le domande, e per ognuna dice a chi rispondi e cosa succede quando mandi', () => {
    const base = nuovoAutopilota({ id: 'a1', nome: 'Sito', obiettivo: 'o', cwd: 'C:/s', criteri: [], iniziatoIl: '2026-09-30T08:00:00Z' })
    const voci: VoceDomanda[] = [
      { tipo: 'autopilota', id: 'd1', autopilotaId: 'a1', autopilota: 'Sito', origine: 'intervista', testo: 'Che formato?', opzioni: ['YAML'] },
      { tipo: 'autopilota', id: 'd2', autopilotaId: 'a2', autopilota: 'Rilascio', origine: 'lavoro', testo: 'Il lavoro «Rilascio» è finito e verificato. Pubblico adesso?', opzioni: ['sì, pubblica', 'no, lascia così'] },
      { tipo: 'scelta', chat: 'p-1', titolo: 'Permesso', cwd: 'D:/q', righe: ['Posso scrivere?'], opzioni: [{ numero: 1, testo: 'Yes', scelta: true }], corrente: 0 },
      { tipo: 'chat', chat: 'f-1', titolo: 'Ferma', cwd: 'C:/f', righe: ['Fatto.'] }
    ]
    const pronto = { ...base, id: 'a3', nome: 'Pronto', stato: 'pronto' as const }
    const cs = conversazioniDomande({ voci, autopiloti: [{ ...base, stato: 'intervista' as const }, pronto] })
    expect(cs.map((c) => c.chiave)).toEqual(['ap:a1', 'ap:a2', 'chat:p-1', 'ap:a3', 'chat:f-1'])
    const frasi = cs.map(spiegaRisposta)
    expect(frasi[0]).toContain('domande iniziali')
    expect(frasi[0]).toContain('la preparazione riparte')
    expect(frasi[1]).toContain('la risposta arriva subito')
    expect(frasi[2]).toContain('Tocca un’opzione')
    expect(frasi[3]).toContain('scrivigli «vai»')
    expect(frasi[4]).toContain('ha finito il turno')
  })
})
