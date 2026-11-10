import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PASSI_SPOSTA, percentualeSposta, type FaseSposta } from '../../src/shared/sposta'
import { passiDa } from '../../src/shared/libera-spazio'
import { RECUPERO_DRIVE_PIENO_DEFAULT } from '../../src/shared/spazio-drive'
import { FRASE_GROSSO_FUORI } from '../../src/shared/libera-spazio'
import { ROTTE_LENTE } from '../../src/main/pc-remoto'

/**
 * L'app Android nativa mostra lo spostamento di un progetto fra PC (k-308) e
 * la procedura «Libera spazio sul Drive» (k-307) con gli stessi passi, le
 * stesse fasce e le stesse rotte del PC. Qui si leggono i sorgenti Kotlin e si
 * confrontano con le costanti vere: se il PC cambia, l'app non resta indietro
 * in silenzio.
 */
const cartella = join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck')
const leggi = (f: string): string => readFileSync(join(cartella, f), 'utf8')

describe('lo spostamento di un progetto, nell’app', () => {
  const kt = leggi('SpostaVista.kt')

  it('ha gli stessi sei passi, nello stesso ordine, con gli stessi titoli', () => {
    const blocco = /val PASSI = listOf\(([\s\S]*?)\n    \)/.exec(kt)?.[1] ?? ''
    const app = [...blocco.matchAll(/"([a-z-]+)" to "([^"]+)"/g)].map((m) => [m[1], m[2]])
    expect(app).toEqual(PASSI_SPOSTA.map((p) => [p.fase, p.titolo]))
  })

  it('ha le stesse fasce di percentuale del PC', () => {
    const blocco = /val FASCE = mapOf\(([\s\S]*?)\n    \)/.exec(kt)?.[1] ?? ''
    const fasce = [...blocco.matchAll(/"([a-z-]+)" to \((\d+) to (\d+)\)/g)]
    expect(fasce.length).toBeGreaterThanOrEqual(7)
    for (const [, fase, da, a] of fasce) {
      expect(percentualeSposta(fase as FaseSposta, 0)).toBe(Number(da))
      expect(percentualeSposta(fase as FaseSposta, 100)).toBe(Number(a))
    }
  })

  it('legge i campi di VistaSposta e usa le azioni del PC per «Riprova»', () => {
    for (const campo of ['percentuale', 'percentualePasso', 'ultimoContatto', 'attesa', 'puoRiprovare', 'fallitaIn', 'fileFatti', 'fileTotali', 'byteFatti', 'byteTotali']) {
      expect(kt).toContain(`val ${campo}`)
    }
    const pannello = leggi('PannelloDrive.kt')
    expect(pannello).toContain('azioneDrive("sposta-qui", sposta.progetto)')
    expect(pannello).toContain('val sposta: VistaSposta? = null')
  })
})

describe('«Libera spazio sul Drive», nell’app', () => {
  const kt = leggi('LiberaSpazio.kt')
  const api = leggi('Api.kt')

  it('fa i passi nell’ordine del PC', () => {
    const ordine = /val ORDINE = listOf\(([^)]*)\)/.exec(kt)?.[1] ?? ''
    expect([...ordine.matchAll(/"([a-z-]+)"/g)].map((m) => m[1])).toEqual(['versioni', 'chat-non-usate', 'doppie', 'doppioni-nome', 'recupero'])
  })

  it('usa la stessa scelta a Drive pieno e la stessa frase del PC', () => {
    expect(kt).toContain(`RECUPERO_PREDEFINITO = "${RECUPERO_DRIVE_PIENO_DEFAULT}"`)
    expect(kt).toContain(FRASE_GROSSO_FUORI)
  })

  it('ha le frasi dei passi uguali a quelle del PC (conferma, bottone, annullabile)', () => {
    const proposta = (tipo: string, byte: number): never => ({ tipo, titolo: 't', breve: 'b', spiega: 's', voci: [{ nome: 'x', byte: 1 }], byte }) as never
    for (const drivePieno of [false, true]) {
      const passi = passiDa(
        { proposte: [proposta('doppie', 10), proposta('doppioni-nome', 5)], chatNonUsate: proposta('chat-non-usate', 7), pulizie: [], misura: { inRecupero: { file: 1, byte: 3 } } as never },
        { contate: true, drivePieno, recupero: RECUPERO_DRIVE_PIENO_DEFAULT }
      )
      expect(passi.length).toBe(4)
      for (const p of passi) {
        expect(kt, p.conferma).toContain(p.conferma)
        expect(kt, p.bottone).toContain(p.bottone)
        // La spiegazione dietro il «?» è la stessa, tranne il pezzo aggiunto a Drive pieno.
        if (p.id === 'recupero' || p.id === 'chat-non-usate') expect(kt, p.id).toContain(p.spiega)
      }
    }
  })

  it('chiama le rotte della pagina del telefono, e sono tutte «lente»', () => {
    const rotte = ['/api/drive/spazio/stato', '/api/drive/spazio/quota', '/api/drive/spazio/in-sospeso', '/api/drive/spazio/riprendi', '/api/drive/azione']
    for (const r of rotte) {
      expect(api, r).toContain(`"${r}"`)
      expect(ROTTE_LENTE, r).toContain(r)
    }
    const blocco = (/val ROTTE_LENTE = setOf\(([\s\S]*?)\n\s*\)/.exec(api)?.[1] ?? '').replace(/\/\/.*$/gm, '')
    for (const r of rotte) expect(blocco, r).toContain(`"${r}"`)
  })

  it('manda al PC le azioni con i nomi del PC', () => {
    for (const a of ['spazio-versioni-conta', 'spazio-versioni-libera', 'spazio-pulisci', 'spazio-svuota']) expect(kt).toContain(`"${a}"`)
  })
})
