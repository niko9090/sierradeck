import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SezioneNotifiche } from '../../src/renderer/components/SezioneNotifiche'
import { PREFERENZE_PREDEFINITE, normalizzaPreferenze } from '../../src/shared/preferenze'
import { sezioniDi } from '../../src/shared/impostazioni-struttura'

/**
 * k-47 (Nicholas, 06/11): «nelle impostazioni c'è la voce Notifiche ma non
 * c'è nulla come menu». Sul PC la sezione era vuota: le voci c'erano solo per
 * app e pagina. Adesso ha due interruttori veri.
 */

/** Cerca nell'albero degli elementi (il componente non ha hook: si chiama direttamente). */
function trovaInput(n: ReactNode, trovati: ReactElement<{ type?: string; checked?: boolean; onChange?: (e: { target: { checked: boolean } }) => void }>[] = []) {
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
    expect(g?.voci.map((v) => v.id)).toEqual(['fumetti-sincronia', 'avviso-windows-aggiornamento'])
  })

  it('mostra le due scelte con testi corti e un «?» ciascuna', () => {
    const html = renderToStaticMarkup(<SezioneNotifiche p={PREFERENZE_PREDEFINITE} cambia={() => undefined} />)
    expect(html).toContain('Avvisa con Windows se l’aggiornamento aspetta')
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
    expect(main).toMatch(/if \(impostazioni\.preferenze\(\)\.avvisoWindowsAggiornamento\) \{[\s\S]{0,400}new Notification\(\{ title: 'SierraDeck aspetta per aggiornarsi'/)
  })

  it('il pannello la mostra dentro la sua sezione «Notifiche»', () => {
    const src = readFileSync('src/renderer/components/PannelloImpostazioni.tsx', 'utf8')
    expect(src).toContain('<Testa id="notifiche" />')
    expect(src).toContain('<SezioneNotifiche p={p} cambia={cambia} vede={vede} />')
  })
})
