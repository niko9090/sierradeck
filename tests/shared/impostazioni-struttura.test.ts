import { describe, it, expect } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cercaImpostazioni, normalizza, SEZIONI, sezioniDi, VOCI } from '../../src/shared/impostazioni-struttura'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * Le impostazioni rifatte (0.56.0): la struttura è una sola. L'app la legge
 * da `android/app/src/main/assets/impostazioni.json`, scritto da qui con
 * `AGGIORNA=1`; la ricerca dell'app (`ImpostazioniVoci.kt`) è controllata da
 * `ImpostazioniVociTest` sugli stessi casi (`casi` nel file).
 */
const CASI = ['', 'aggiorn', 'novita', 'NOVITÀ', 'pin', 'porta', 'drive salva', 'tailscale', 'non esiste per niente', 'colore', 'notifiche']

describe('la struttura delle impostazioni', () => {
  it('«Aggiornamenti» è la prima sezione, poi Computer, Chat e autopiloti, Drive e salvataggi, Aspetto, Notifiche, Info e aiuto', () => {
    expect(SEZIONI.map((s) => s.titolo)).toEqual(['Aggiornamenti', 'Computer', 'Chat e autopiloti', 'Drive e salvataggi', 'Aspetto', 'Notifiche', 'Info e aiuto'])
    for (const d of ['pc', 'app', 'pagina'] as const) expect(sezioniDi(d)[0]?.sezione.id).toBe('aggiornamenti')
  })
  it('ogni voce ha una spiegazione vera (cosa fa, cosa succede se la cambi), un id unico, una sezione che esiste', () => {
    const id = new Set<string>()
    for (const v of VOCI) {
      expect(id.has(v.id), v.id).toBe(false)
      id.add(v.id)
      expect(SEZIONI.some((s) => s.id === v.sezione), v.id).toBe(true)
      expect(v.spiega.length, v.id).toBeGreaterThan(60)
      expect(v.dove.length, v.id).toBeGreaterThan(0)
    }
  })
  it('le voci tolte perché morte o doppie non tornano', () => {
    // salvaAllaChiusura non la legge nessuno; Domande e Consumi a lato si accendono dalla barra; «riparti al login» sta nel pannello Autopiloti.
    for (const via of ['salva-chiusura', 'domande-laterali', 'consumi-laterali', 'autopiloti-login']) expect(VOCI.some((v) => v.id === via), via).toBe(false)
  })
  it('la ricerca: senza accenti né maiuscole, tutte le parole, nell’ordine delle sezioni', () => {
    expect(normalizza('Novità È')).toBe('novita e')
    expect(cercaImpostazioni('NOVITÀ', 'pc').map((v) => v.id)).toEqual(['aggiorna-pc'])
    expect(cercaImpostazioni('drive salva', 'pc').map((v) => v.id)).toEqual(['drive', 'torna-indietro', 'fumetti-sincronia'])
    expect(cercaImpostazioni('non esiste per niente', 'app')).toEqual([])
    expect(cercaImpostazioni('', 'pagina').length).toBe(VOCI.filter((v) => v.dove.includes('pagina')).length)
    // Una sezione vuota per quel posto non si mostra (il PC non ha Notifiche).
    expect(sezioniDi('pc').some((g) => g.sezione.id === 'notifiche')).toBe(false)
    expect(sezioniDi('app').some((g) => g.sezione.id === 'notifiche')).toBe(true)
  })
  it('la pagina ha la ricerca e «Aggiornamenti» in cima', () => {
    const html = paginaClient()
    expect(html).toContain('id="cerca-impostazioni"')
    const i = html.indexOf('data-sezione="aggiornamenti"')
    const j = html.indexOf('data-sezione="aspetto"')
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)
  })
  it('l’app legge la stessa struttura (assets/impostazioni.json) e ha gli stessi casi di ricerca', () => {
    const fatto = {
      sezioni: SEZIONI,
      voci: VOCI,
      casi: CASI.flatMap((q) => (['pc', 'app', 'pagina'] as const).map((d) => ({ q, dove: d, trovate: cercaImpostazioni(q, d).map((v) => v.id) })))
    }
    const file = join('android', 'app', 'src', 'main', 'assets', 'impostazioni.json')
    if (process.env.AGGIORNA === '1') {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, `${JSON.stringify(fatto, null, 2)}\n`)
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fatto)
  })
})
