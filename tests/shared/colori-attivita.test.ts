import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ATTIVITA, ATTIVITA_ORDINE, COLORI, TITOLO_LEGENDA, attivitaDi, coloreDi, contrasto, eAttivita, etichettaAttivita, legendaAttivita, parolaStato
} from '../../src/shared/colori-attivita'
import { RUOLI, RUOLI_ORDINE } from '../../src/shared/ruoli-agenti'
import { PREFERENZE_PREDEFINITE, tavolozza } from '../../src/shared/preferenze'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * 0.82.0: un colore fisso per cosa fa una chat, uguale su PC, pagina e app.
 * Una sola tabella (`src/shared/colori-attivita.ts`); l'app ne ha una copia
 * generata, che questo test confronta (`AGGIORNA=1` la riscrive).
 */

const KT = join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck', 'ColoriAttivita.kt')

const stringaKt = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`

/** Il file Kotlin che l'app compila: la tabella, nient'altro. */
function kotlinDellaTabella(): string {
  const colori = (Object.keys(COLORI) as (keyof typeof COLORI)[]).map((n) => `        ${stringaKt(n)} to 0xFF${COLORI[n].slice(1).toUpperCase()},`).join('\n')
  const attivita = ATTIVITA_ORDINE.map((id) => {
    const a = ATTIVITA[id]
    return `        ${stringaKt(id)} to SchedaAttivita(${[a.id, a.nome, a.parola, a.icona, a.colore, a.spiega].map(stringaKt).join(', ')}),`
  }).join('\n')
  return [
    '// GENERATO da src/shared/colori-attivita.ts: non modificare a mano.',
    '// Lo controlla tests/shared/colori-attivita.test.ts; `AGGIORNA=1` lo riscrive.',
    'package it.ferrariconsulenze.sierradeck',
    '',
    '/** Un\'attività di una chat (PC 0.82.0): nome, parola, simbolo, colore, spiegazione. */',
    'data class SchedaAttivita(val id: String, val nome: String, val parola: String, val icona: String, val colore: String, val spiega: String)',
    '',
    '/** La tabella unica dei colori di cosa fa una chat, la stessa del PC e della pagina. */',
    'object TabellaAttivita {',
    `    const val TITOLO_LEGENDA = ${stringaKt(TITOLO_LEGENDA)}`,
    '',
    '    val colori: Map<String, Long> = mapOf(',
    colori,
    '    )',
    '',
    `    val ordine: List<String> = listOf(${ATTIVITA_ORDINE.map(stringaKt).join(', ')})`,
    '',
    '    val attivita: Map<String, SchedaAttivita> = mapOf(',
    attivita,
    '    )',
    '}',
    ''
  ].join('\n')
}

describe('colori delle attività (0.82.0)', () => {
  it('otto attività, ognuna con colore, simbolo e parola sue', () => {
    expect(ATTIVITA_ORDINE).toEqual(['sviluppo', 'interfaccia', 'collaudo', 'revisione', 'rilascio', 'aspetta', 'ferma', 'finita'])
    const colori = ATTIVITA_ORDINE.map((a) => COLORI[ATTIVITA[a].colore])
    const icone = ATTIVITA_ORDINE.map((a) => ATTIVITA[a].icona)
    const parole = ATTIVITA_ORDINE.map((a) => ATTIVITA[a].parola)
    expect(new Set(colori).size).toBe(8)
    expect(new Set(icone).size).toBe(8)
    expect(new Set(parole).size).toBe(8)
    for (const a of ATTIVITA_ORDINE) {
      expect(ATTIVITA[a].id).toBe(a)
      expect(ATTIVITA[a].spiega.length).toBeGreaterThan(5)
    }
    expect(etichettaAttivita('aspetta')).toBe('◆ aspetta te')
  })

  it('i ruoli prendono il colore dalla stessa tabella: Revisione e Rilascio non sono più ambra e rosso', () => {
    for (const r of RUOLI_ORDINE) expect(RUOLI[r].colore).toBe(ATTIVITA[r].colore)
    expect(RUOLI.revisione.colore).not.toBe(ATTIVITA.aspetta.colore)
    expect(RUOLI.rilascio.colore).not.toBe(ATTIVITA.ferma.colore)
  })

  it('leggibile sul fondo scuro: contrasto almeno 4,5:1 su ogni superficie, a ogni chiarore, in tutti e due gli stili', () => {
    const peggiore: { colore: string; fondo: string; rapporto: number }[] = []
    for (const stile of ['banco', 'foglio'] as const) {
      for (let chiarore = 0; chiarore <= 100; chiarore += 10) {
        const t = tavolozza({ ...PREFERENZE_PREDEFINITE, stile, chiarore })
        for (const fondo of ['--fondo-cupo', '--fondo', '--chassis-premuto', '--chassis', '--chassis-alto']) {
          for (const a of ATTIVITA_ORDINE) {
            const rapporto = contrasto(COLORI[ATTIVITA[a].colore], t[fondo]!)
            if (rapporto < 4.5) peggiore.push({ colore: a, fondo: `${stile} ${chiarore} ${fondo} ${t[fondo]}`, rapporto })
          }
        }
      }
    }
    // E i fondi fissi dell'app prima che arrivi la tavolozza del PC (Tema.kt).
    for (const fondo of ['#0b0c0e', '#1d2023', '#262a2e']) {
      for (const a of ATTIVITA_ORDINE) {
        const rapporto = contrasto(COLORI[ATTIVITA[a].colore], fondo)
        if (rapporto < 4.5) peggiore.push({ colore: a, fondo: `app ${fondo}`, rapporto })
      }
    }
    expect(peggiore).toEqual([])
  })

  it('lo stato vince sul ruolo; al lavoro conta il ruolo; senza ruolo è sviluppo', () => {
    expect(attivitaDi('revisione', 'lavora')).toBe('revisione')
    expect(attivitaDi('revisione', 'lavoro')).toBe('revisione')
    expect(attivitaDi(undefined, 'lavora')).toBe('sviluppo')
    for (const s of ['chiede', 'bloccata', 'attesa']) expect(attivitaDi('collaudo', s)).toBe('aspetta')
    for (const s of ['ferma', 'pausa', 'sospeso', 'fallito']) expect(attivitaDi('rilascio', s)).toBe('ferma')
    for (const s of ['finita', 'finito']) expect(attivitaDi('interfaccia', s)).toBe('finita')
    expect(parolaStato('collaudo')).toBe('al lavoro')
    expect(parolaStato('aspetta')).toBe('aspetta te')
    expect(eAttivita('rilascio')).toBe(true)
    expect(eAttivita('rosa')).toBe(false)
  })

  it('un nome di colore sconosciuto (un PC più nuovo) resta grigio', () => {
    expect(coloreDi('acqua')).toBe(COLORI.acqua)
    expect(coloreDi('arcobaleno')).toBe(COLORI.quieto)
    expect(coloreDi(undefined)).toBe(COLORI.quieto)
  })

  it('la legenda dietro «?» ha una voce per attività, nell’ordine fisso', () => {
    const l = legendaAttivita()
    expect(l.map((v) => v.id)).toEqual([...ATTIVITA_ORDINE])
    expect(l[5]).toEqual({ id: 'aspetta', icona: '◆', nome: 'Aspetta te', spiega: ATTIVITA.aspetta.spiega, colore: COLORI.ambra })
  })

  it('la pagina riceve la stessa tabella dentro il suo script', () => {
    const html = paginaClient()
    const riga = html.split('\n').find((r) => r.startsWith('var ATT = '))
    expect(riga).toBeDefined()
    expect(JSON.parse(riga!.slice('var ATT = '.length))).toEqual({ attivita: ATTIVITA, ordine: ATTIVITA_ORDINE, colori: COLORI, titolo: TITOLO_LEGENDA })
  })

  it('l’app ha la stessa tabella (ColoriAttivita.kt generato)', () => {
    const atteso = kotlinDellaTabella()
    if (process.env.AGGIORNA === '1') writeFileSync(KT, atteso, 'utf8')
    expect(readFileSync(KT, 'utf8').replace(/\r\n/g, '\n')).toBe(atteso)
  })
})
