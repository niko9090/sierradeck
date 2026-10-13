import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { destinazioniSposta, riassuntoSposta } from '../../src/shared/sposta-su'

/** «Sposta su» nella pagina del telefono (0.71.0): elenco dei PC e conferma scritti dal computer. */
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
const crea = (verso: string): ((r: unknown, v: unknown) => string) => new Function(`${riga('const esc =')}\nvar aiutiAperti = {}\n${estrai('aiuto')}\nvar pdSpostaVerso = ${JSON.stringify(verso)}\n${estrai('pdSpostaHtml')}\nreturn pdSpostaHtml`)() as (r: unknown, v: unknown) => string

const adesso = Date.parse('2026-10-13T12:00:00Z')
const io = { id: 'pc-c', nome: 'PC-C' }
const pc = [{ id: 'pc-a', nome: 'PC-A', battito: new Date(adesso - 1000).toISOString() }, { id: 'pc-b', nome: 'PC-B' }]
const base = { id: 'p1', nome: 'prova', residente: { pc: 'pc-a', nome: 'PC-A', qui: false }, chat: 2, cartelle: [] }
const r = { ...base, spostaSu: destinazioniSposta(base, io, pc, adesso).map((x) => ({ ...x, riassunto: riassuntoSposta(base, x) })) }

describe('«Sposta su» nella pagina', () => {
  it('mostra dove vive e l’elenco dei PC, con quello attuale non sceglibile', () => {
    const h = crea('')(r, { dove: 'PC-A' })
    expect(h).toContain('Dove vive: <b>PC-A</b>')
    expect(h).toContain('onchange="pdSpostaScegli(this.value)"')
    expect(h).toContain('<option value="pc-a" disabled>● PC-A · acceso · dove vive adesso</option>')
    expect(h).toContain('<option value="pc-b">○ PC-B · spento</option>')
    expect(h).not.toContain('alertdialog')
  })
  it('dopo la scelta chiede conferma con il riassunto del computer', () => {
    const h = crea('pc-b')(r, { dove: 'PC-A' })
    expect(h).toContain('Sposta «prova» su PC-B?')
    expect(h).toContain('Da: PC-A')
    expect(h).toContain('onclick="pdSpostaConferma()"')
    expect(h).toContain('Conferma: sposta su PC-B')
    expect(h).toContain('PC-B adesso risulta spento')
  })
  it('l’azione va al computer come «sposta-su» con il PC di arrivo', () => {
    expect(script).toContain("chiedi('/api/drive/azione', { azione: 'sposta-su', progetto: pdScelto, pc: verso })")
  })
})
