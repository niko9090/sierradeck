import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SezioneAggiornamenti } from '../../src/renderer/components/SezioneAggiornamenti'
import { aggiornamentoInCorso } from '../../src/shared/finestra-novita'
import { PREFERENZE_PREDEFINITE } from '../../src/shared/preferenze'

/**
 * **Tutto l'aggiornamento passa dalla sua finestra** (Nicholas, 13/11). Ogni
 * ingresso di prima (spia nella fascia, sezione delle Impostazioni, tessera
 * «Versione», Salute, notifica di Windows) ora apre la finestra degli
 * aggiornamenti sulla vista giusta, e non ha più una sua interfaccia.
 */

type ConClic = ReactElement<{ onClick?: () => void; children?: ReactNode }>
function tasti(n: ReactNode, trovati: ConClic[] = []): ConClic[] {
  if (Array.isArray(n)) n.forEach((x) => tasti(x, trovati))
  else if (n !== null && typeof n === 'object' && 'props' in n) {
    const el = n as ConClic
    if (el.type === 'button') trovati.push(el)
    tasti(el.props.children, trovati)
  }
  return trovati
}
const testo = (n: ReactNode): string => (Array.isArray(n) ? n.map(testo).join('') : typeof n === 'string' ? n : '')

function conGestore(): ReturnType<typeof vi.fn> {
  const apri = vi.fn(() => Promise.resolve())
  ;(globalThis as unknown as { window: unknown }).window = { gestore: { finestraNovita: { apri } } }
  return apri
}
afterEach(() => { delete (globalThis as { window?: unknown }).window })

describe('Impostazioni → Aggiornamenti: solo tasti che aprono la finestra', () => {
  const albero = SezioneAggiornamenti({ p: PREFERENZE_PREDEFINITE, cambia: () => undefined, versione: '1.2.0' })
  it('«Novità di questa versione» → vista «novita»; «Aggiornamenti…» → vista dello stato', () => {
    const apri = conGestore()
    const b = tasti(albero)
    b.find((x) => testo(x.props.children) === 'Novità di questa versione')!.props.onClick!()
    b.find((x) => testo(x.props.children) === 'Aggiornamenti…')!.props.onClick!()
    expect(apri).toHaveBeenNthCalledWith(1, { tipo: 'novita' })
    expect(apri).toHaveBeenNthCalledWith(2, { tipo: 'aggiornamento' })
  })
  it('niente stato, «Scarica», «Cosa cambia e installa», «Aggiorna adesso», «Cerca ora» o «Ultimo tentativo» doppi', () => {
    const h = renderToStaticMarkup(albero)
    for (const t of ['Cerca ora', 'Cosa cambia e installa', 'Aggiorna adesso', 'Ultimo tentativo', '>Scarica<']) expect(h).not.toContain(t)
    expect(h).toContain('Scarica gli aggiornamenti da solo')
  })
})

describe('la fascia in alto: solo il numero di versione col pallino', () => {
  const src = readFileSync('src/renderer/components/Console.tsx', 'utf8')
  it('niente spia dell’aggiornamento; il numero apre lo stato se c’è qualcosa in corso', () => {
    expect(src).not.toContain('spia-agg')
    expect(src).toMatch(/if \(novitaNonLette \|\| aggiornamentoInCorso\(aggiornamento\)\) apriStatoAggiornamento\(\)/)
    expect(src).toContain("finestraNovita?.apri({ tipo: 'aggiornamento' })")
  })
  it('aggiornamentoInCorso: le fasi con qualcosa da dire, non la ricerca automatica', () => {
    for (const fase of ['disponibile', 'scarico', 'pronto', 'attendo', 'installo', 'errore']) expect(aggiornamentoInCorso({ fase })).toBe(true)
    for (const fase of ['fermo', 'aggiornato', 'cerco']) expect(aggiornamentoInCorso({ fase })).toBe(false)
    expect(aggiornamentoInCorso(undefined)).toBe(false)
  })
  it('il CSS della spia e delle strisce di prima non c’è più', () => {
    const css = readFileSync('src/renderer/console.css', 'utf8')
    for (const c of ['.spia-agg', '.avviso--aggiornamento', '.avviso__fasi', 'spia-respiro']) expect(css).not.toContain(c)
    expect(css).toContain('.versione--incorso::after')
  })
})

describe('gli altri ingressi del renderer portano alla finestra', () => {
  it('Impostazioni: la tessera «Versione» apre la finestra', () => {
    const src = readFileSync('src/renderer/components/PannelloImpostazioni.tsx', 'utf8')
    expect(src).toContain("tessera('Versione', stati.versione, () => apriFinestraAggiornamenti())")
  })
  it('Salute («Riprova Installa» di questo PC) e gli eventi delle Impostazioni aprono la finestra', () => {
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    expect(app).toContain('onInstalla={() => apriInstalla(aggiornamento.versione ?? \'\')}')
    expect(app).toContain("finestraNovita?.apri({ tipo: 'installa', versione })")
    expect(app).toContain("finestraNovita?.apri({ tipo: 'novita' })")
  })
  it('installare, scaricare e «Aggiorna adesso» si chiamano solo dalla finestra degli aggiornamenti', () => {
    const file = (d: string): string[] => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? file(f) : /\.tsx?$/.test(n) ? [f] : [] })
    const chi = file('src/renderer').filter((f) => /gestore\.aggiornamenti\.(installa|scarica|aggiornaAdesso)\(/.test(readFileSync(f, 'utf8')))
    expect(chi.map((f) => f.replace(/\\/g, '/'))).toEqual(['src/renderer/components/FinestraAggiornamenti.tsx'])
  })
})

describe('il main: niente notifica di Windows per l’aggiornamento, novità al primo avvio', () => {
  const main = readFileSync('src/main/index.ts', 'utf8')
  it('nessuna Notification che parla di aggiornamento', () => {
    const notifiche = main.match(/new Notification\(\{[^}]*\}/g) ?? []
    expect(notifiche.filter((n) => /aggiorn/i.test(n))).toEqual([])
  })
  it('il controllo del primo avvio viene prima di creaAggiornamenti (che toglie il segno dell’installazione)', () => {
    const i = main.indexOf('controllaInstallata({ cartellaDati: dati')
    expect(i).toBeGreaterThan(0)
    expect(main.indexOf('aggiornamenti = creaAggiornamenti(')).toBeGreaterThan(i)
  })
})
