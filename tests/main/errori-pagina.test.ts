import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * La voce «Errori» sulla pagina del telefono (0.81.0): lo storico del PC, con
 * «Copia» e «Manda al PC di sviluppo», e gli errori della pagina che vanno al
 * PC con «pagina» come posto.
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

type Voce = { ultima: string; volte: number; messaggio: string }
function sezione(erroriPc: { voci: Voce[]; testo: string; pcSviluppo?: string } | null): string {
  const corpo = `
    var aiuto = function (id, t, di) { return '<button class="aiuto" data-aiuto="' + id + '">?</button>' }
    var esc = function (s) { return String(s).replace(/</g, '&lt;') }
    var notaErrori = ''
    ${estrai('function oraErrore(')}
    ${estrai('function sezioneErroriPagina(')}
    return sezioneErroriPagina()
  `
  return new Function('erroriPc', corpo)(erroriPc) as string
}

describe('la voce «Errori» sulla pagina', () => {
  it('sta in «Info e aiuto», sotto «Copia i dettagli»', () => {
    const i = html.indexOf('data-sezione="info"')
    expect(html.indexOf('sezioneErroriPagina()', i)).toBeGreaterThan(i)
  })

  it('prima si chiede di vederli; poi il conto, le ultime voci, «Copia» e «Manda», ognuno con il suo «?»', () => {
    expect(sezione(null)).toContain('Vedi gli errori')
    const s = sezione({ voci: [{ ultima: '2026-10-19T15:00:00.000Z', volte: 3, messaggio: '[drive] 403 <quota>' }], testo: 't', pcSviluppo: 'Portatile' })
    expect(s).toContain('1 errore, 3 volte')
    expect(s).toContain('3 volte · [drive] 403 &lt;quota>')
    expect(s).toContain('PC di sviluppo: Portatile')
    expect(s).toMatch(/onclick="mandaErrori\(\)">Manda al PC di sviluppo/)
    expect(s.match(/class="aiuto"/g)).toHaveLength(2)
  })

  it('senza PC di sviluppo «Manda» è spento e dice dove sceglierlo', () => {
    const s = sezione({ voci: [{ ultima: '2026-10-19T15:00:00.000Z', volte: 1, messaggio: 'boom' }], testo: 't' })
    expect(s).toMatch(/onclick="mandaErrori\(\)" disabled>/)
    expect(s).toContain('Impostazioni → Errori')
  })

  it('gli errori della pagina vanno al PC con «pagina» come posto, al massimo venti per volta', () => {
    expect(script).toContain("chiedi('/api/errori/aggiungi', { dove: 'pagina', errori: errori })")
    expect(estrai('function annotaErrore(')).toContain('erroriDaMandare.length < 20')
  })
})
