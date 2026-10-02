import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { raccogliNote, type NoteAggiornamento } from '@shared/note-aggiornamento'

/**
 * «Installa» dalla pagina del telefono (0.39.0): prima le note di cosa cambia,
 * le stesse del PC, poi «Installa e riavvia» o «Più tardi».
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (nome: string): string => {
  const inizio = script.indexOf(`function ${nome}(`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i++) {
    if (script[i] === '{') profondita++
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error('non si chiude')
}
const riga = (inizio: string): string => script.split('\n').find((r) => r.startsWith(inizio)) ?? ''
const noteAggHtml = new Function(
  // `fallitoHtml` e `aggiornamentoVisto` (0.39.2): l'installazione non riuscita sta in testa alle note.
  `${riga('const esc =')}\nvar aggiornamentoVisto = null\n${estrai('fallitoHtml')}\n${estrai('pezzoNoteHtml')}\n${estrai('bloccoNoteHtml')}\n${estrai('noteAggHtml')}\nreturn noteAggHtml`
)() as (n: unknown) => string
/** Dal computer al telefono le note passano come JSON. */
const viaRete = (n: NoteAggiornamento): unknown => JSON.parse(JSON.stringify(n))

describe('le note di «Installa» nella pagina del telefono', () => {
  it('mostra la nuova e le saltate, poi i due tasti', async () => {
    const n = await raccogliNote({
      installata: '0.38.1',
      nuova: '0.39.0',
      rilasci: async () => [
        { tag_name: 'v0.39.0', body: '- **Installa apre le note.** Prima di installare vedi cosa cambia.' },
        { tag_name: 'v0.38.2', body: '- **Consegne mai mute.**' }
      ]
    })
    const h = noteAggHtml(viaRete(n))
    expect(h).toContain('Cosa cambia con la 0.39.0')
    expect(h).toContain('LA NUOVA')
    expect(h).toContain('SALTATA')
    expect(h).toContain('<b>Installa apre le note.</b>')
    expect(h).toContain('onclick="confermaInstalla()">Installa e riavvia')
    expect(h).toContain('onclick="piuTardiAggiornamento()"')
  })

  it('niente HTML dalle note: uno script resta fuori, solo i link a github.com si aprono', async () => {
    const n = await raccogliNote({
      installata: '0.38.2',
      nuova: '0.39.0',
      rilasci: async () => [{ tag_name: 'v0.39.0', body: '- <script>alert(1)</script> [qui](https://github.com/niko9090/sierradeck) e [là](https://esempio.it)\n- "virgolette" & <img src=x onerror=alert(2)>' }]
    })
    const h = noteAggHtml(viaRete(n))
    expect(h).not.toMatch(/<script|<img|onerror/)
    expect(h).toContain('href="https://github.com/niko9090/sierradeck"')
    expect(h).not.toContain('esempio.it')
    expect(h).toContain('&quot;virgolette&quot; &amp;')
    // Anche se un link non ammesso arrivasse lo stesso, qui non diventa cliccabile.
    const falso = { versione: '0.39.0', note: [{ versione: '0.39.0', blocchi: [{ tipo: 'paragrafo', pezzi: [{ testo: 'x', link: 'javascript:alert(1)' }] }] }] }
    expect(noteAggHtml(falso)).not.toContain('javascript')
  })

  it('senza note lo dice per esteso e lascia installare', () => {
    const h = noteAggHtml({ versione: '0.39.0', note: [], avviso: 'Non sono riuscito a leggere le note della 0.39.0.' })
    expect(h).toContain('Non sono riuscito a leggere le note')
    expect(h).toContain('Installa e riavvia')
  })

  it('il tasto «Installa» chiede le note, non installa', () => {
    const inizio = script.indexOf('window.installaAggiornamento = async')
    const corpo = script.slice(inizio, script.indexOf('\n}', inizio))
    expect(corpo).toContain('/api/aggiornamento/note')
    expect(corpo).not.toContain('/api/aggiornamento/installa')
    const conferma = script.slice(script.indexOf('window.confermaInstalla'), script.indexOf('\n}', script.indexOf('window.confermaInstalla')))
    expect(conferma).toContain('/api/aggiornamento/installa')
  })
})
