import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  SCHEDE_AUTOPILOTI, BarraSchede, TabellaAutopiloti, etichettaScheda, gruppiAltriPc, nomeAutopilota, quantiAutopiloti, righeQuestoPc, rigaScelta, tuttiIGruppi
} from '../../src/renderer/components/AutopilotiUnificata'
import { FUNZIONI } from '../../src/shared/menu-principale'
import { vocePc } from '../../src/shared/vocabolario-stati-pc'
import type { Autopilota } from '../../src/shared/autopilota'
import type { AutopilotiDiPc } from '../../src/shared/autopiloti-altri'

/**
 * k-u3: la pagina Autopiloti è una sola, con tre schede (Chat · Specialisti ·
 * Fila). Niente DOM: markup statico e funzioni pure.
 */
const ORA = Date.parse('2026-11-20T12:00:00.000Z')
const leggi = (p: string): string => readFileSync(p, 'utf8')

const locale = { id: 'a1', nome: 'Alfa', cwd: 'C:\\Lavori\\Alfa', workspace: 'Alfa', stato: 'fermo' } as unknown as Autopilota
const altri: AutopilotiDiPc[] = [
  { pcId: 'pc-b', nome: 'Studio', autopiloti: [{ id: 'b1', nome: 'Beta', stato: 'fermo', cwd: 'C:\\Lavori\\Beta', workspace: 'Beta' }] },
  { pcId: 'pc-c', nome: 'Garage', autopiloti: [], errore: 'Garage non risponde: timeout' }
]

describe('le tre schede', () => {
  it('sono Chat · Specialisti · Fila, in quest’ordine', () => {
    expect(SCHEDE_AUTOPILOTI.map((s) => s.nome)).toEqual(['Chat', 'Specialisti', 'Fila'])
  })

  it('la barra le disegna tutte, con la scelta evidenziata e un solo «?»', () => {
    const h = renderToStaticMarkup(<BarraSchede scheda="specialisti" onScheda={() => undefined} />)
    for (const n of ['Chat', 'Specialisti', 'Fila']) expect(h).toContain(`>${n}<`)
    expect(h.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(h).toMatch(/aria-selected="true"[^>]*>Specialisti</)
    expect(h.match(/aria-label="le schede"/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('il numero accanto compare solo se c’è qualcosa', () => {
    expect(etichettaScheda('fila', { fila: 3 })).toBe('Fila (3)')
    expect(etichettaScheda('fila', { fila: 0 })).toBe('Fila')
    expect(etichettaScheda('chat', { fila: 3 })).toBe('Chat')
  })
})

describe('una tabella sola, di qui e degli altri PC', () => {
  const gruppi = tuttiIGruppi([locale], altri, ORA)

  it('prima questo PC, poi gli altri; tutte le righe contate', () => {
    expect(gruppi.map((g) => g.pc?.nome)).toEqual([undefined, 'Studio', 'Garage'])
    expect(quantiAutopiloti(gruppi)).toBe(2)
  })

  it('stessi stati e stesse parole: «fermo» è «fermo» ovunque', () => {
    const qui = gruppi[0]!.righe[0]!.vista.stato
    const la = gruppi[1]!.righe[0]!.vista.stato
    expect(la.parola).toBe(qui.parola)
    expect(la.colore).toBe(qui.colore)
  })

  it('i PC dicono come stanno con le parole di Computer', () => {
    expect(gruppi[1]!.stato).toEqual(vocePc('acceso'))
    expect(gruppi[2]!.stato).toEqual(vocePc('irraggiungibile'))
    expect(gruppi[2]!.errore).toContain('non risponde')
  })

  it('il markup ha le stesse colonne per tutti e il perché dietro il «?»', () => {
    const h = renderToStaticMarkup(<TabellaAutopiloti gruppi={gruppi} onScegli={() => undefined} />)
    for (const c of ['Workspace', 'Chat', 'Ultima azione', 'Da', 'Stato']) expect(h).toContain(`>${c}<`)
    for (const n of ['Alfa', 'Beta', 'Studio', 'Garage']) expect(h).toContain(n)
    expect(h).toContain('acceso, ma non risponde')
    expect(h).toContain('Garage non risponde: timeout')
    expect(h).not.toContain('Nessun autopilota ancora')
  })

  it('senza autopiloti dice una frase sola', () => {
    const h = renderToStaticMarkup(<TabellaAutopiloti gruppi={tuttiIGruppi([], [], ORA)} onScegli={() => undefined} />)
    expect(h).toContain('Nessun autopilota ancora')
  })

  it('la riga scelta è una sola e porta la chiave del suo PC', () => {
    const h = renderToStaticMarkup(<TabellaAutopiloti gruppi={gruppi} scelta="pc-b:b1" onScegli={() => undefined} />)
    expect(h.match(/progetti__riga--scelta/g)).toHaveLength(1)
    expect(rigaScelta(gruppi, 'pc-b:b1', 'Alfa')?.pc?.nome).toBe('Studio')
    // Di partenza: l’autopilota del workspace davanti, di questo PC.
    expect(rigaScelta(gruppi, undefined, 'Alfa')?.id).toBe('a1')
    expect(rigaScelta(gruppi, '', 'Alfa')).toBeUndefined()
  })

  it('una riga storta di un altro PC non fa cadere la pagina', () => {
    const storto: AutopilotiDiPc[] = [{ pcId: 'pc-x', nome: 'X', autopiloti: [{ id: 'x1', nome: '', stato: '' }] }]
    expect(() => renderToStaticMarkup(<TabellaAutopiloti gruppi={gruppiAltriPc(storto, ORA)} onScegli={() => undefined} />)).not.toThrow()
  })

  it('il nome: workspace, poi nome, poi l’ultima cartella', () => {
    expect(nomeAutopilota({ workspace: 'W', nome: 'N', cwd: 'C:\\a\\b' })).toBe('W')
    expect(nomeAutopilota({ nome: 'N', cwd: 'C:\\a\\b' })).toBe('N')
    expect(nomeAutopilota({ nome: ' ', cwd: 'C:\\a\\b' })).toBe('b')
    expect(righeQuestoPc([locale], ORA)).toHaveLength(1)
  })
})

describe('una sola lista di specialisti, i comandi in un posto solo', () => {
  const pannello = leggi('src/renderer/components/PannelloAutopiloti.tsx')

  it('la pagina usa la lista degli specialisti e la fila, una volta ciascuna', () => {
    expect(pannello.match(/<SpecialistiVista /g)).toHaveLength(1)
    expect(pannello.match(/<FilaSpecialisti /g)).toHaveLength(1)
    expect(pannello.match(/<TabellaAutopiloti/g)).toHaveLength(1)
    // La chat non porta più la lista degli specialisti sotto di sé: sta nella sua scheda.
    expect(pannello).toContain("scheda === 'chat'")
  })

  it('la fila ha un solo posto dove si legge e si muove: FilaSpecialisti', () => {
    const f = leggi('src/renderer/components/PannelloSpecialisti.tsx')
    expect(f.match(/prioritaAttesa\(/g)).toHaveLength(1)
    expect(f.match(/togliAttesa\(/g)).toHaveLength(1)
    expect(f.match(/<ListaSpecialisti /g)).toHaveLength(1)
    expect(f).toContain('<FilaSpecialisti />')
  })

  it('i comandi stanno solo nella pagina: Aggiorna, Riparti al login, il primo messaggio', () => {
    expect(pannello).toContain('Riparti al login')
    expect(pannello).toContain('<PrimoMessaggio')
    expect(pannello.match(/avvioAlLogin\(/g)).toHaveLength(1)
  })

  it('nessuna funzione di «autopiloti» è sparita dall’inventario', () => {
    const f = FUNZIONI.filter((x) => x.dove === 'autopiloti').map((x) => x.funzione)
    expect(f).toContain('Autopiloti di questo PC e degli altri PC')
    expect(f).toContain('Specialisti: chi lavora e chi è in fila, ordine della fila')
  })
})
