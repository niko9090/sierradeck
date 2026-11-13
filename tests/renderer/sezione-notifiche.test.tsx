import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SceltaAvvisi, SezioneNotifiche } from '../../src/renderer/components/SezioneNotifiche'
import { IMPOSTAZIONI_AVVISI_PREDEFINITE, avvisoVisto, bozzaDomanda, type Avviso, type VistaAvvisi } from '../../src/shared/avvisi-telefono'
import { PREFERENZE_PREDEFINITE, normalizzaPreferenze } from '../../src/shared/preferenze'
import { sezioniDi } from '../../src/shared/impostazioni-struttura'

/**
 * k-47 (Nicholas, 06/11): «nelle impostazioni c'è la voce Notifiche ma non
 * c'è nulla come menu». Sul PC la sezione era vuota: le voci c'erano solo per
 * app e pagina. Adesso ha due interruttori veri.
 */

/** Cerca nell'albero degli elementi (il componente non ha hook: si chiama direttamente). */
type Spunta = ReactElement<{ type?: string; checked?: boolean; onChange?: (e: { target: { checked: boolean } }) => void }>
function trovaInput(n: ReactNode, trovati: Spunta[] = []): Spunta[] {
  if (Array.isArray(n)) n.forEach((x) => trovaInput(x, trovati))
  else if (n !== null && typeof n === 'object' && 'props' in n) {
    const el = n as ReactElement<{ type?: string; children?: ReactNode }>
    if (el.type === 'input') trovati.push(el as never)
    trovaInput(el.props.children, trovati)
  }
  return trovati
}

describe('la sezione «Notifiche» delle Impostazioni del PC (k-47)', () => {
  it('non è più vuota: la struttura ha le sue voci sul PC', () => {
    const g = sezioniDi('pc').find((x) => x.sezione.id === 'notifiche')
    expect(g?.voci.map((v) => v.id)).toEqual(['avvisi', 'avvisi-ultimi', 'fumetti-sincronia', 'avviso-windows-aggiornamento'])
  })

  it('mostra le due scelte con testi corti e un «?» ciascuna', () => {
    const html = renderToStaticMarkup(<SezioneNotifiche p={PREFERENZE_PREDEFINITE} cambia={() => undefined} />)
    // Le notifiche vere si leggono dal PC: finché non arrivano, solo «Leggo…».
    expect(html).toContain('Leggo le notifiche…')
    expect(html).toContain('Mostra la finestra degli aggiornamenti se l’attesa è lunga')
    expect(html).toContain('Mostra un fumetto anche per il salvataggio automatico sul Drive')
    expect(html.match(/type="checkbox"/g)?.length).toBe(2)
    expect(html.match(/aria-label="[^"]*"/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('le spunte seguono le preferenze', () => {
    const acceso = renderToStaticMarkup(<SezioneNotifiche p={{ ...PREFERENZE_PREDEFINITE, avvisoWindowsAggiornamento: true, fumettiSincroniaAutomatica: false }} cambia={() => undefined} />)
    const [windows, fumetti] = acceso.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []
    expect(windows).toContain('checked=""')
    expect(fumetti).not.toContain('checked=""')
  })

  it('un interruttore salva la sua preferenza', () => {
    const cambia = vi.fn()
    const input = trovaInput(SezioneNotifiche({ p: PREFERENZE_PREDEFINITE, cambia }))
    expect(input).toHaveLength(2)
    input[0]!.props.onChange!({ target: { checked: false } })
    input[1]!.props.onChange!({ target: { checked: true } })
    expect(cambia).toHaveBeenNthCalledWith(1, { avvisoWindowsAggiornamento: false })
    expect(cambia).toHaveBeenNthCalledWith(2, { fumettiSincroniaAutomatica: true })
  })

  it('la preferenza vale davvero: predefinita accesa, un valore storto non la spegne, il PC la legge prima di avvisare', () => {
    expect(PREFERENZE_PREDEFINITE.avvisoWindowsAggiornamento).toBe(true)
    expect(normalizzaPreferenze({}).avvisoWindowsAggiornamento).toBe(true)
    expect(normalizzaPreferenze({ avvisoWindowsAggiornamento: 'no' }).avvisoWindowsAggiornamento).toBe(true)
    expect(normalizzaPreferenze({ avvisoWindowsAggiornamento: false }).avvisoWindowsAggiornamento).toBe(false)
    const main = readFileSync('src/main/index.ts', 'utf8')
    expect(main).toMatch(/if \(impostazioni\.preferenze\(\)\.avvisoWindowsAggiornamento\) \{[\s\S]{0,400}mostraAttesaLunga\(\)/)
    // 13/11: niente più notifica di Windows per l'aggiornamento, passa tutto dalla sua finestra.
    expect(main).not.toContain("new Notification({ title: 'SierraDeck aspetta per aggiornarsi'")
  })

  it('il pannello la mostra dentro la sua sezione «Notifiche»', () => {
    const src = readFileSync('src/renderer/components/PannelloImpostazioni.tsx', 'utf8')
    expect(src).toContain('<Testa id="notifiche" />')
    expect(src).toContain('<SezioneNotifiche p={p} cambia={cambia} vede={vede} />')
  })
})

/** 11/11: le notifiche vere, uguali su PC, pagina e app. */
const vista = (x: Partial<VistaAvvisi> = {}): VistaAvvisi => ({ riga: 'Il telefono è in ascolto adesso.', inAscolto: true, impostazioni: IMPOSTAZIONI_AVVISI_PREDEFINITE, ultimi: [], ...x })
type ConProps = ReactElement<{ children?: ReactNode; value?: string; checked?: boolean; onChange?: (e: { target: { value?: string; checked?: boolean } }) => void; onClick?: () => void; type?: string }>
function tutti(n: ReactNode, trovati: ConProps[] = []): ConProps[] {
  if (Array.isArray(n)) n.forEach((x) => tutti(x, trovati))
  else if (n !== null && typeof n === 'object' && 'props' in n) {
    const el = n as ConProps
    trovati.push(el)
    tutti(el.props.children, trovati)
  }
  return trovati
}

describe('le notifiche vere nelle Impostazioni del PC (11/11)', () => {
  it('la riga di chi ascolta, «Prova notifica», i quattro tipi con Suona/Silenziosa/Spenta, chat ferma, silenzio', () => {
    const html = renderToStaticMarkup(<SceltaAvvisi v={vista()} imposta={() => undefined} prova={() => undefined} vede={() => true} />)
    expect(html).toContain('Il telefono è in ascolto adesso.')
    expect(html).toContain('Prova notifica')
    for (const t of ['Domande', 'Lavoro fermo', 'Fatto', 'Da sapere']) expect(html).toContain(t)
    expect(html.match(/<select/g)?.length).toBe(4)
    expect(html.match(/<option value="suona"/g)?.length).toBe(4)
    expect(html).toContain('Anche una chat mia ferma da tre minuti')
    expect(html).toContain('Ore di silenzio')
    expect(html).not.toContain('type="time"')
    expect(html).toContain('Ultime notifiche (0)')
  })

  it('le scelte vanno al PC: un tipo, la chat ferma, le ore di silenzio; e la prova', () => {
    const imposta = vi.fn()
    const prova = vi.fn()
    const el = tutti(SceltaAvvisi({ v: vista({ impostazioni: { ...IMPOSTAZIONI_AVVISI_PREDEFINITE, silenzio: { da: '22:00', a: '06:30' } } }), imposta, prova, vede: () => true }))
    const select = el.filter((x) => x.type === 'select')
    select[2]!.props.onChange!({ target: { value: 'spenta' } })
    expect(imposta).toHaveBeenLastCalledWith({ tipi: { ...IMPOSTAZIONI_AVVISI_PREDEFINITE.tipi, fatto: 'spenta' } })
    const spunte = el.filter((x) => x.type === 'input' && x.props.type === 'checkbox')
    spunte[0]!.props.onChange!({ target: { checked: true } })
    expect(imposta).toHaveBeenLastCalledWith({ chatFerma: true })
    spunte[1]!.props.onChange!({ target: { checked: false } })
    expect(imposta).toHaveBeenLastCalledWith({ silenzio: null })
    const ore = el.filter((x) => x.type === 'input' && x.props.type === 'time')
    expect(ore.map((x) => x.props.value)).toEqual(['22:00', '06:30'])
    ore[1]!.props.onChange!({ target: { value: '07:15' } })
    expect(imposta).toHaveBeenLastCalledWith({ silenzio: { da: '22:00', a: '07:15' } })
    el.find((x) => x.type === 'button')!.props.onClick!()
    expect(prova).toHaveBeenCalledTimes(1)
  })

  it('le ultime: ora, tipo, titolo, testo e com’è finita, con le parole del PC', () => {
    const a: Avviso = { ...bozzaDomanda({ cosa: 'domanda', id: 'd-1', workspace: 'Negozio', domanda: 'Tengo il vecchio elenco?' }), n: 2, quando: new Date(2026, 10, 11, 18, 40).toISOString(), suona: false, chiuso: { quando: '', come: 'programma', testo: 'Sì' } }
    const html = renderToStaticMarkup(<SceltaAvvisi v={vista({ ultimi: [avvisoVisto(a, new Date(2026, 10, 11, 19, 0))] })} imposta={() => undefined} prova={() => undefined} vede={(id) => id === 'avvisi-ultimi'} />)
    expect(html).toContain('Ultime notifiche (1)')
    expect(html).toContain('<b>18:40</b> · Domande · Negozio chiede: Tengo il vecchio elenco? <i>(Ho scelto io: Sì)</i>')
    expect(html).not.toContain('Prova notifica')
  })
})
