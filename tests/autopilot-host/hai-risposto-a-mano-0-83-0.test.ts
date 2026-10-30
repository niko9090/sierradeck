import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { conversazione } from '@shared/chat-autopilota'
import { TESTO_VIA, domandaInSospeso } from '@shared/domande-autopilota'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * «Hai risposto: …» anche quando Nicholas scrive a mano (0.83.0).
 *
 * Il difetto (Nicholas, dal 20/10): una risposta scritta nella casella a una
 * domanda dell'autopilota («gli dai il via?», o una domanda del registro)
 * compariva come un messaggio qualunque e la domanda spariva. Adesso il testo
 * scritto a mano è la risposta a quella domanda, e nella conversazione — la
 * stessa per PC, pagina e app — c'è la domanda intera e sotto «Hai risposto: …».
 */

function ap(stato: Autopilota['stato'], dialogo: Autopilota['dialogo'] = []): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-mano',
      nome: 'Prova',
      obiettivo: 'Prepara la prova sul server',
      cwd: process.cwd(),
      iniziatoIl: '2026-10-21T06:00:00.000Z'
    }),
    stato,
    dialogo,
    chats: stato === 'lavoro' ? ['c-1', 'c-2'].map((id) => ({ id, compito: `compito di ${id}`, stato: 'lavoro' as const, cicli: 1, sessionId: id })) : []
  }
}

describe('domandaInSospeso e la conversazione (pure)', () => {
  const lui = (testo: string): Autopilota['dialogo'][number] => ({ quando: '2026-10-21T07:00:00.000Z', da: 'lui', testo })

  it('la sua ultima battuta con «?», altrimenti il via, altrimenti niente', () => {
    expect(domandaInSospeso(ap('lavoro', [lui('Uso la chiave nuova o quella vecchia?')]))).toBe('Uso la chiave nuova o quella vecchia?')
    expect(domandaInSospeso(ap('pronto', [lui('Ho cambiato il criterio.')]))).toBe(TESTO_VIA)
    expect(domandaInSospeso(ap('lavoro', [lui('Ho cambiato il criterio.')]))).toBeUndefined()
    expect(domandaInSospeso(ap('lavoro', [lui('Va bene?'), { quando: '2026-10-21T07:01:00.000Z', da: 'tu', testo: 'sì' }]))).toBeUndefined()
  })

  it('la domanda già scritta appena sopra non si ripete', () => {
    const a = ap('lavoro', [
      lui('Uso la chiave nuova o quella vecchia?'),
      { quando: '2026-10-21T07:01:00.000Z', da: 'tu', testo: 'la nuova', risponde: 'Uso la chiave nuova o quella vecchia?' }
    ])
    const righe = conversazione(a)
    expect(righe.map((b) => [b.da, b.testo])).toEqual([
      ['lui', 'Uso la chiave nuova o quella vecchia?'],
      ['tu', 'Hai risposto: la nuova']
    ])
  })

  it('«risponde» resta dopo il salvataggio su disco', () => {
    const a = ap('pronto', [{ quando: '2026-10-21T07:01:00.000Z', da: 'tu', testo: 'aspetta', risponde: TESTO_VIA }])
    const disco = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-mano-disco-')))
    disco.scrivi(a)
    const riletto = disco.leggi('ap-mano')
    expect(riletto?.dialogo[0]).toMatchObject({ risponde: TESTO_VIA })
  })
})
