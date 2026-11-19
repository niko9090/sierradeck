import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dettaglio } from '../../src/renderer/components/VistaProgetti'
import { catalogoDiProgetto, doppioni, parolaProprietario, SEZIONI_DETTAGLIO, vociStrumenti } from '../../src/shared/progetti-unificata'
import { FUNZIONI } from '../../src/shared/menu-principale'
import { statoPc } from '../../src/shared/stato-pc'
import type { Pannello, RigaProgetto } from '../../src/shared/pannello-drive'

/**
 * k-u2: la pagina «Progetti» è una sola. Il Drive (contenuto, salvataggio,
 * stato della sincronizzazione) sta nel dettaglio di ogni progetto, e niente
 * si mostra in due posti.
 */

const riga = {
  id: 'p1', ids: ['p1'], nome: 'Prova', voluto: true, cartellaQui: true, workspace: [], daUnire: 0, azioni: [],
  chat: 0, chatSenzaNome: 0, problemi: [], stato: 'ok',
  residente: { pc: 'pc-a', nome: 'PC uno', qui: false },
  proprietarioAcceso: true,
  cartelle: [{ pc: 'pc-a', nome: 'PC uno', percorso: 'C:\\prova' }]
} as unknown as RigaProgetto
const pannello = { io: { id: 'pc-b', nome: 'PC due' }, pc: [], chat: [], progetti: [riga], letto: '', pcDaAggiornare: [] } as unknown as Pannello

function disegna(r: RigaProgetto = riga): string {
  return renderToStaticMarkup(
    <Dettaglio r={r} d={pannello} rim={{ stati: [] }} occupato={false} tutteLeChat={false} setTutteLeChat={() => undefined}
      onChiudi={() => undefined} onChiudiPagina={() => undefined} onAzione={() => undefined} onApriChat={() => undefined} onQuaderno={() => undefined} adesso={0} />
  )
}

describe('Progetti unificata: il Drive dentro il dettaglio', () => {
  const html = disegna()

  it('il dettaglio ha le sezioni del Drive e del salvataggio', () => {
    for (const s of SEZIONI_DETTAGLIO) {
      if (s.id === 'problemi') continue // c’è solo se il progetto ha problemi
      expect(html, s.titolo).toContain(s.titolo === 'Chat' ? 'Chat (' : s.titolo)
    }
    expect(html).toContain('Leggi il Drive')
    expect(html).toContain('Mostra il salvataggio')
    expect(html).toContain('quaderno')
  })

  it('ogni sezione compare una volta sola', () => {
    for (const s of SEZIONI_DETTAGLIO) {
      const n = html.split(`>${s.titolo === 'Chat' ? 'Chat (0)' : s.titolo}<`).length - 1
      if (s.id === 'problemi') { expect(n).toBe(0); continue }
      expect(n, s.titolo).toBe(1)
    }
    expect(doppioni(SEZIONI_DETTAGLIO.map((s) => s.id))).toEqual([])
    expect(doppioni(SEZIONI_DETTAGLIO.map((s) => s.titolo))).toEqual([])
  })

  it('lo stato del PC proprietario usa le parole di statoPc', () => {
    expect(html).toContain(`PC uno: ${statoPc(new Date(0).toISOString(), 0).frase}`)
    expect(parolaProprietario(false, 0)).toBe(statoPc(undefined, 0).frase)
    expect(html).not.toContain('acceso adesso')
  })
})

describe('Progetti unificata: Strumenti senza doppioni', () => {
  it('nessuna voce ripetuta, e non ripete ciò che sta nel dettaglio o in alto', () => {
    const v = vociStrumenti(2)
    expect(doppioni(v.map((x) => x.id))).toEqual([])
    expect(doppioni(v.map((x) => x.testo))).toEqual([])
    const testi = v.map((x) => x.testo).join('|')
    expect(testi).not.toMatch(/Salvataggio|Gestione progetti|Spazio sul Drive|contenuto del Drive/)
    expect(vociStrumenti(0).some((x) => x.id === 'recupero')).toBe(false)
  })

  it('il sorgente non ha «Gestione progetti» due volte come tasto', () => {
    const src = readFileSync('src/renderer/components/VistaProgetti.tsx', 'utf8')
    expect(src.split('>Gestione progetti<').length - 1).toBe(1)
    expect(src).not.toContain("foglio === 'salvataggio'")
  })
})

describe('Progetti unificata: nessuna funzione sparisce', () => {
  it('le funzioni di «progetti» restano tutte in questa pagina', () => {
    const funzioni = FUNZIONI.filter((f) => f.dove === 'progetti')
    expect(funzioni.length).toBeGreaterThan(0)
    const src = ['VistaProgetti', 'ContenutoDrive', 'PannelloAccount'].map((n) => readFileSync(`src/renderer/components/${n}.tsx`, 'utf8')).join('\n')
    for (const parola of ['Porta qui', 'Sposta su questo PC', 'Salva ora', 'Ripristina', 'Quaderno del progetto', 'Togli dal Drive', 'Rimetti sul Drive', 'Gestione progetti']) {
      expect(src, parola).toContain(parola)
    }
  })
})

describe('catalogoDiProgetto', () => {
  it('abbina per id, o per nome se manca l’id', () => {
    expect(catalogoDiProgetto({ id: 'p1', nome: 'X' }, riga)).toBe(true)
    expect(catalogoDiProgetto({ id: 'p9', nome: 'Prova' }, riga)).toBe(false)
    expect(catalogoDiProgetto({ nome: ' prova ' }, riga)).toBe(true)
  })
})
