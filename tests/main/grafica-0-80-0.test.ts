import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { vistaAutopilota } from '@shared/autopiloti-vista'
import { COLORE_DAL_VIVO } from '@shared/stato-dal-vivo'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * La rifinitura grafica della 0.80.0 (`grafica-prima-0-80-0.md`): le stesse
 * parole con lo stesso colore e gli stessi numeri su PC, pagina e app.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (inizio: string): string => {
  const i = script.indexOf(inizio)
  if (i < 0) throw new Error(`manca ${inizio}`)
  let profondita = 0
  for (let j = script.indexOf('{', i); j < script.length; j++) {
    if (script[j] === '{') profondita++
    else if (script[j] === '}' && --profondita === 0) return script.slice(i, j + 1)
  }
  throw new Error('non si chiude')
}
const esc = 'function esc(s) { return String(s) }'

const ORA = Date.parse('2026-10-19T12:00:00Z')
function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'o', cwd: 'C:/prova', criteri: [{ descrizione: 'a', soddisfatto: false }], iniziatoIl: '2026-10-19T10:00:00.000Z' }),
    ultimoEvento: '2026-10-19T11:58:00.000Z',
    ...over
  }
}

describe('1. «fermo» ha un colore solo', () => {
  it('nella vista calcolata dal PC è rosso, come il LED; «guasto» resta rosso e «finito» si spegne', () => {
    expect(vistaAutopilota(ap({ stato: 'sospeso', motivoSospensione: 'fermato da te' }), ORA).stato).toMatchObject({ parola: 'fermo', colore: 'rosso' })
    expect(vistaAutopilota(ap({ stato: 'fallito' }), ORA).stato.colore).toBe('rosso')
    expect(COLORE_DAL_VIVO).toEqual({ 'al lavoro': 'verde', 'aspetta te': 'ambra', fermo: 'rosso', finito: 'quieto' })
  })

  it('la riga dal vivo della pagina usa gli stessi colori', () => {
    const dalVivoHtml = new Function(`${esc}; ${estrai('function dalVivoHtml(')}; return dalVivoHtml`)() as (v: unknown) => string
    expect(dalVivoHtml({ etichetta: 'fermo', da: '1 g' })).toContain('var(--rosso')
    expect(dalVivoHtml({ etichetta: 'finito' })).toContain('var(--testo-quieto')
    expect(dalVivoHtml({ etichetta: 'al lavoro' })).toContain('var(--verde')
  })
})

describe('2. «aspettano te» è un numero solo, come sul PC', () => {
  it('una chat che ha finito il turno è «ferma» e non entra nei conti di chi aspetta te', () => {
    const p = new Function(`${estrai('function statoChat(')}; ${estrai('function riassuntoChat(')}; return { statoChat, riassuntoChat }`)() as {
      statoChat: (c: object) => { tono: string; parola: string }
      riassuntoChat: (c: object[]) => string
    }
    // Le due chat della foto «prima»: ferme a fine turno. Sul PC «Aspettano te 0».
    const finite = [{ aspetta: true, viva: true }, { aspetta: true, viva: true }]
    expect(finite.filter((c) => p.statoChat(c).tono === 'attesa')).toHaveLength(0)
    expect(p.riassuntoChat(finite)).toBe('2 ferme')
    // Una scelta aperta invece aspetta te, ovunque.
    expect(p.statoChat({ chiede: true }).tono).toBe('attesa')
  })
})

describe('3. un autopilota fermo non ha chat «al lavoro»', () => {
  it('la tabella, l albero (pagina e app) e i LED usano la stessa regola', async () => {
    const { chatAlLavoro } = await import('@shared/autopilota')
    const { alberoChat } = await import('@shared/harness')
    const chats = [
      { id: 'c-1', compito: 'Spiega', stato: 'finita' as const, cicli: 1 },
      { id: 'c-2', compito: 'Scrivi', stato: 'lavoro' as const, cicli: 2 }
    ]
    const fermo = ap({ stato: 'sospeso', chats })
    expect(vistaAutopilota(fermo, ORA).chat).toMatchObject({ totali: 2, alLavoro: 0, testo: '2' })
    expect(alberoChat(fermo).figli[1]).toMatchObject({ stato: 'ferma', parola: 'ferma: l’autopilota è fermo' })
    expect(chatAlLavoro(fermo, chats[1])).toBe(false)
    const inMoto = ap({ stato: 'lavoro', chats })
    expect(vistaAutopilota(inMoto, ORA).chat.testo).toBe('2 · 1 al lavoro')
    expect(alberoChat(inMoto).figli[1]).toMatchObject({ stato: 'lavoro', parola: 'al lavoro' })
  })
})
