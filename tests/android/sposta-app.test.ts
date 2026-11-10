import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PASSI_SPOSTA, percentualeSposta, statiPassiSposta, type FaseSposta } from '@shared/sposta'
import { vistaSposta, type GiornaleSposta } from '../../src/main/progetti/sposta'

/**
 * «Sposta su questo PC» nell'app Android (k-310): l'app legge `sposta` dal
 * pannello dei progetti (lo stesso canale della pagina) e mostra percentuale,
 * passi, errore e «Riprova». Qui: che i passi e la regola degli stati siano
 * gli stessi del PC, e che l'app legga ogni campo che il PC manda.
 */

const KT = join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck')
const kt = readFileSync(join(KT, 'Procedure.kt'), 'utf8')

const giornale = (x: Partial<GiornaleSposta>): GiornaleSposta => ({
  id: 'sp-1', progetto: 'p-1', nome: 'Alfa', da: 'pc-a', daNome: 'Ufficio', percorsoDa: 'cartella-a', percorso: 'cartella-b',
  fase: 'scarico', iniziataIl: '2026-11-10T10:00:00.000Z', aggiornataIl: '2026-11-10T10:01:00.000Z', messaggio: 'Scarico.', ...x
})

/** La regola dell'app (`SpostaRegole.stati`), riscritta qui dal Kotlin: gli stessi casi devono dare gli stessi stati. */
const casi: { fase: FaseSposta; fallitaIn?: FaseSposta; atteso: string[] }[] = [
  { fase: 'controlli', atteso: ['in-corso', 'da-fare', 'da-fare', 'da-fare', 'da-fare', 'da-fare'] },
  { fase: 'attesa-proprietario', atteso: ['fatto', 'in-corso', 'da-fare', 'da-fare', 'da-fare', 'da-fare'] },
  { fase: 'scarico', atteso: ['fatto', 'fatto', 'in-corso', 'da-fare', 'da-fare', 'da-fare'] },
  { fase: 'vecchia-copia', atteso: ['fatto', 'fatto', 'fatto', 'fatto', 'fatto', 'in-corso'] },
  { fase: 'fatta', atteso: ['fatto', 'fatto', 'fatto', 'fatto', 'fatto', 'fatto'] },
  { fase: 'fallita', fallitaIn: 'verifica', atteso: ['fatto', 'fatto', 'fatto', 'errore', 'da-fare', 'da-fare'] },
  { fase: 'fallita', fallitaIn: 'attesa-proprietario', atteso: ['fatto', 'errore', 'da-fare', 'da-fare', 'da-fare', 'da-fare'] },
  { fase: 'fallita', atteso: ['errore', 'da-fare', 'da-fare', 'da-fare', 'da-fare', 'da-fare'] }
]

describe('i passi dello spostamento, uguali su PC e app', () => {
  it('l’app ha gli stessi passi, con gli stessi titoli, nello stesso ordine', () => {
    const blocco = /val PASSI = listOf\(([\s\S]*?)\n\s*\)/.exec(kt)?.[1] ?? ''
    const app = [...blocco.matchAll(/"([^"]+)" to "([^"]+)"/g)].map((m) => ({ fase: m[1], titolo: m[2] }))
    expect(app).toEqual(PASSI_SPOSTA)
  })

  it('gli stati dei passi: fatto, in corso, da fare, errore dove si è fermata', () => {
    for (const c of casi) expect(statiPassiSposta(c), `${c.fase}/${c.fallitaIn ?? ''}`).toEqual(c.atteso)
  })

  it('la regola Kotlin ha gli stessi rami (attesa = chiesta, fermata senza passo = controlli)', () => {
    const corpo = kt.slice(kt.indexOf('fun stati(v: VistaSpostaDrive)'), kt.indexOf('fun percentuale(v: VistaSpostaDrive)'))
    expect(corpo).toContain('"attesa-proprietario") "chiesta"')
    expect(corpo).toContain('indice(v.fallitaIn).coerceAtLeast(0)')
    expect(corpo).toContain('"errore"')
    expect(corpo).toContain('"in-corso"')
  })
})

describe('il PC manda all’app quello che serve', () => {
  it('una fermata dice in quale passo, con «Riprova»', () => {
    const v = vistaSposta(giornale({ fase: 'fallita', fallitaIn: 'verifica', errore: 'un’impronta non torna', messaggio: 'Fermo.' }))
    expect(v).toMatchObject({ fase: 'fallita', fallitaIn: 'verifica', puoRiprovare: true, errore: 'un’impronta non torna', percentuale: 0 })
    // In corso niente `fallitaIn`, ma percentuale e numeri del passo.
    const c = vistaSposta(giornale({ fileFatti: 120, fileTotali: 300, byteFatti: 40 * 1024 ** 2, byteTotali: 1200 * 1024 ** 2, passoPerc: 40 }))
    expect(c?.fallitaIn).toBeUndefined()
    expect(c).toMatchObject({ percentuale: percentualeSposta('scarico', 40), percentualePasso: 40, fileFatti: 120, fileTotali: 300 })
  })

  it('ogni campo della vista ha il suo posto nell’app', () => {
    const corpo = /data class VistaSpostaDrive\(([\s\S]*?)\n\)/.exec(kt)?.[1] ?? ''
    const campiApp = new Set([...corpo.matchAll(/val (\w+):/g)].map((m) => m[1]))
    const piena = vistaSposta(giornale({
      fase: 'fallita', fallitaIn: 'scarico', errore: 'x', avvisi: ['a'], fileFatti: 1, fileTotali: 2, byteFatti: 1, byteTotali: 2, passoPerc: 50,
      ultimoContatto: '2026-11-10T10:00:00.000Z', attesa: 'il PC di prima è spento'
    }))
    const inCorso = vistaSposta(giornale({ passoPerc: 50, attesa: 'aspetto' }))
    const chiavi = new Set([...Object.keys(piena ?? {}), ...Object.keys(inCorso ?? {})])
    expect([...chiavi].filter((k) => !campiApp.has(k))).toEqual([])
  })

  it('l’app lo legge dal pannello dei progetti e «Riprova» rifà «Sposta su questo PC»', () => {
    const pannello = readFileSync(join(KT, 'PannelloDrive.kt'), 'utf8')
    expect(pannello).toMatch(/val sposta: VistaSpostaDrive\? = null/)
    expect(pannello).toContain('AvanzamentoSpostaVista(s')
    expect(pannello).toContain('api.azioneDrive("sposta-qui", s.progetto)')
    expect(pannello).toContain('api.azioneDrive("sposta-chiudi", "")')
    // Mentre lavora si rilegge da solo.
    expect(pannello).toMatch(/LaunchedEffect\(spostaInCorso\)/)
  })
})
