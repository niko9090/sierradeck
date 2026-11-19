import { describe, it, expect } from 'vitest'
import { alberoRete } from '../../src/shared/albero-rete'
import { statoPc } from '../../src/shared/stato-pc'
import type { BattitoPc } from '../../src/shared/posta'
import type { AvanzamentoInstallaLa } from '../../src/shared/installa-la'

const ADESSO = Date.parse('2026-11-16T16:00:00Z')
const fa = (min: number): string => new Date(ADESSO - min * 60_000).toISOString()

const pc = (p: Partial<BattitoPc> & { pcId: string; nome: string }): BattitoPc => ({
  versione: '0.108.0', battito: fa(1), cartelle: [], chat: [], ...p
})

describe('alberoRete', () => {
  const dati = {
    io: { id: 'io', nome: 'Ufficio', versione: '0.108.0', aggiornamento: { fase: 'scarico', versione: '0.109.0', percento: 41.6 } },
    pc: [
      pc({ pcId: 'b', nome: 'Portatile', versione: '0.107.0', chat: [{ titolo: 'x', cwd: 'c', aspetta: true }, { titolo: 'y', cwd: 'c', aspetta: false }] }),
      pc({ pcId: 'a', nome: 'Casa', battito: fa(600) }),
      pc({ pcId: 'h', nome: 'Muletto', aiutante: true, versione: '1.1.0' }),
      pc({ pcId: 'k', nome: 'Vecchio', aiutante: true, versione: '1.0.3', bloccoAiutante: 'accesso a Claude scaduto' }),
      pc({ pcId: 'io', nome: 'Ufficio' })
    ],
    mappa: { nodi: [], linee: [{ a: 'b', strada: 'Tailscale', stato: 'ok' as const, colore: '', testo: '' }] },
    adesso: ADESSO
  }

  it('questo PC in cima, poi i PC completi e gli Aiutanti, accesi prima', () => {
    const a = alberoRete(dati)
    expect(a.radice.nome).toBe('Ufficio')
    expect(a.radice.aggiornamento).toEqual({ testo: 'scarica la versione nuova 0.109.0', tono: 'lavoro', percento: 42 })
    const [completi, aiutanti] = a.rami
    expect(completi!.nodi.map((n) => n.nome)).toEqual(['Portatile', 'Casa'])
    expect(completi!.accesi).toBe(1)
    expect(aiutanti!.nodi.map((n) => n.nome)).toEqual(['Muletto', 'Vecchio'])
  })

  it('dice versione indietro, chat che aspettano e collegamento', () => {
    const portatile = alberoRete(dati).rami[0]!.nodi[0]!
    expect(portatile.righe.find((r) => r.etichetta === 'Versione')).toEqual({ etichetta: 'Versione', valore: 'v0.107.0', tono: 'attenzione' })
    expect(portatile.righe.find((r) => r.etichetta === 'Chat')?.valore).toBe('2 aperte, 1 aspettano te')
    expect(portatile.righe.find((r) => r.etichetta === 'Collegamento')?.valore).toBe('diretto (Tailscale)')
    expect(portatile.aggiornabile).toBe(true)
  })

  it('un PC spento non si aggiorna da remoto e dice da quando tace', () => {
    const casa = alberoRete(dati).rami[0]!.nodi[1]!
    expect(casa.acceso).toBe(false)
    expect(casa.targhette).toContain(statoPc(fa(600), ADESSO).frase)
    expect(casa.aggiornabile).toBe(false)
    expect(casa.righe.find((r) => r.etichetta === 'Ultimo segno')?.valore).toBe('10 ore fa')
  })

  it('un PC da rimuovere (oltre 30 giorni) non compare, né fra i PC né fra gli Aiutanti', () => {
    const trenta = 31 * 24 * 60
    const a = alberoRete({ ...dati, pc: [...dati.pc, pc({ pcId: 'x', nome: 'Dimenticato', battito: fa(trenta) }), pc({ pcId: 'y', nome: 'Dimenticato2', aiutante: true, battito: fa(trenta) })] })
    expect(a.rami[0]!.nodi.map((n) => n.nome)).toEqual(['Portatile', 'Casa'])
    expect(a.rami[1]!.nodi.map((n) => n.nome)).toEqual(['Muletto', 'Vecchio'])
  })

  it('i PC spenti portano la frase di statoPc con i giorni alla rimozione', () => {
    const a = alberoRete({ ...dati, pc: [pc({ pcId: 'z', nome: 'Fermo', battito: fa(5 * 24 * 60) })] })
    expect(a.rami[0]!.nodi[0]!.targhette).toEqual(['spento da 5 giorni · si toglie fra 25 giorni'])
  })

  it('un Aiutante fermo lo dice in rosso e non è mai «aggiornabile» da qui', () => {
    const vecchio = alberoRete(dati).rami[1]!.nodi[1]!
    expect(vecchio.righe.find((r) => r.etichetta === 'Lavori')).toEqual({ etichetta: 'Lavori', valore: 'fermo: accesso a Claude scaduto', tono: 'errore' })
    expect(vecchio.aggiornabile).toBe(false)
  })

  it('mostra l aggiornamento a distanza in corso e nasconde il tasto', () => {
    const inst: AvanzamentoInstallaLa = { pcId: 'b', nome: 'Portatile', fase: 'scarico', da: '0.107.0', a: '0.108.0', messaggio: 'Scarica la 0.108.0', iniziato: fa(2), aggiornato: fa(1) }
    const n = alberoRete({ ...dati, installazioni: [inst] }).rami[0]!.nodi[0]!
    expect(n.aggiornamento).toEqual({ testo: 'Scarica la 0.108.0 (0.107.0 → 0.108.0)', tono: 'lavoro' })
    expect(n.aggiornabile).toBe(false)
  })

  it('un aggiornamento a distanza finito da più di un ora non si mostra più', () => {
    const inst: AvanzamentoInstallaLa = { pcId: 'b', nome: 'Portatile', fase: 'fatto', da: '0.107.0', a: '0.108.0', messaggio: 'Fatto', iniziato: fa(200), aggiornato: fa(120) }
    expect(alberoRete({ ...dati, installazioni: [inst] }).rami[0]!.nodi[0]!.aggiornamento).toBeUndefined()
  })

  it('la versione viva vale più di quella del battito', () => {
    const n = alberoRete({ ...dati, vive: { b: '0.108.0' } }).rami[0]!.nodi[0]!
    expect(n.aggiornabile).toBe(false)
    expect(n.righe.find((r) => r.etichetta === 'Versione')?.tono).toBeUndefined()
  })
})
